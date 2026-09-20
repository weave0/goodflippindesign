#!/usr/bin/env node
// TI-012: bounded Cloudflare estate configuration acquisition + completeness
// validation. Replaces ~100 lines of untestable bash that used to live inline
// in .github/workflows/traffic-intelligence-deploy.yml.
//
// Credential architecture (see gfd-traffic-intelligence docs/ESTATE_CONFIG.md):
//   analytics_credential (CF_ZONE_API_TOKEN) — zones + DNS. Intentionally has
//     no Pages configuration authority.
//   deploy_credential — proved the Pages project inventory, which the caller
//     acquired with scripts/cf-pages-projects.sh and hands over as a file.
//
// Every fact in the artifact carries the authority that proved it. An expected
// governed zone is *never* silently dropped: it is either observed, or carries
// an explicit, safe reason its evidence is unavailable. Anything that would
// make the inventory itself incomplete (a rejected page, inconsistent
// pagination, a malformed response) terminates fail-closed instead.
//
// Diagnostics are an exfiltration surface: every message that leaves this
// process goes through redact().
//
// Usage:
//   node scripts/cf-estate-config.mjs build --pages-projects <file> --out <file> [--summary <file>]
//   node scripts/cf-estate-config.mjs validate --artifact <file>
// Env: CF_ACCOUNT_ID, CF_ZONE_API_TOKEN, CF_EXPECTED_ZONES
//      CLOUDFLARE_API_TOKEN (deploy credential; redaction only), CF_API_BASE (optional)
import { readFile, writeFile, rename, appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const ESTATE_SCHEMA_VERSION = "1.1.0";
export const ESTATE_CONTRACT_NAME = "gfd-estate-config";
export const AUTHORITY_ANALYTICS = "analytics_credential";
export const AUTHORITY_DEPLOY = "deploy_credential";

const DEFAULT_API_BASE = "https://api.cloudflare.com/client/v4";
const MAX_PAGES = 500;
const MAX_MESSAGE_LENGTH = 240;
const MIN_SECRET_LENGTH = 6;

export class EstateAcquisitionError extends Error {
  constructor(message, { reason } = {}) {
    super(message);
    this.name = "EstateAcquisitionError";
    // Short, already-redacted explanation reusable as an evidence `reason`.
    this.reason = reason ?? message;
  }
}

export class EstateValidationError extends Error {
  constructor(problems) {
    super(`estate artifact failed completeness validation (${problems.length} problem${problems.length === 1 ? "" : "s"}): ${problems.slice(0, 20).join("; ")}`);
    this.name = "EstateValidationError";
    this.problems = problems;
  }
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

function secretVariants(secret) {
  const variants = new Set([secret]);
  try {
    variants.add(encodeURIComponent(secret));
    variants.add(JSON.stringify(secret).slice(1, -1));
    variants.add(Buffer.from(secret, "utf8").toString("base64"));
    variants.add(Buffer.from(secret, "utf8").toString("base64url"));
    variants.add(Buffer.from(secret, "utf8").toString("hex"));
  } catch {
    // Redaction must never itself throw.
  }
  return [...variants].filter((variant) => variant.length >= MIN_SECRET_LENGTH);
}

/**
 * Scrub anything credential-shaped from a message before it is echoed.
 * Over-redaction is intentional and safe; under-redaction is a leak.
 */
export function redact(input, secrets = []) {
  let text = String(input ?? "");
  // Flatten first: a regex `.` never matches a newline, so a hostile value that
  // starts a "header" on one line must not let the next line dodge the rules.
  text = text.replace(/[\r\n\u2028\u2029]+/g, " ");
  // Drop remaining control characters (terminal escapes, log-command injection).
  text = text.replace(/[\u0000-\u001f\u007f]/g, " ");

  for (const secret of secrets) {
    if (typeof secret !== "string" || secret.length < MIN_SECRET_LENGTH) continue;
    for (const variant of secretVariants(secret)) {
      text = text.split(variant).join("[REDACTED]");
    }
  }

  // Structural shapes. Redact to end-of-string: a comma-delimited or quoted
  // scheme value must not leave a suffix behind.
  text = text
    .replace(/(authorization["']?\s*[:=]\s*["']?).*/gi, "$1[REDACTED]")
    .replace(/(cookie["']?\s*[:=]\s*["']?).*/gi, "$1[REDACTED]")
    .replace(/(x-auth-[a-z-]+["']?\s*[:=]\s*["']?).*/gi, "$1[REDACTED]")
    .replace(/(api[-_ ]?(?:key|token|secret)["']?\s*[:=]\s*["']?).*/gi, "$1[REDACTED]")
    .replace(/bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    // Credentials that are not *our* token but must not be echoed either.
    .replace(/\bgh[pousr]_[A-Za-z0-9]{16,}/g, "[REDACTED]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{16,}/g, "[REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{16,}/g, "[REDACTED]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[REDACTED]")
    // Cloudflare Global API keys are 37 hex characters.
    .replace(/\b[a-f0-9]{37}\b/gi, "[REDACTED]");
  return text;
}

/** A short, single-line, redacted label for interpolation into diagnostics. */
function label(value, secrets) {
  return bounded(redact(String(value ?? ""), secrets));
}

function bounded(text) {
  return text.length > MAX_MESSAGE_LENGTH ? `${text.slice(0, MAX_MESSAGE_LENGTH)}…` : text;
}

function safeCode(value) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  if (typeof value === "string" && /^[A-Za-z0-9._-]{1,40}$/.test(value)) return value;
  return "unknown";
}

// ---------------------------------------------------------------------------
// Cloudflare request
// ---------------------------------------------------------------------------

function describeRejection({ operation, status, body, rawText, secrets }) {
  const detail = Array.isArray(body?.errors) && body.errors.length > 0 ? body.errors[0] : null;
  let tail;
  if (detail && typeof detail === "object") {
    const code = safeCode(detail.code);
    const message = typeof detail.message === "string" && detail.message.trim() ? detail.message : "no error detail provided";
    tail = `Cloudflare error ${code}: ${bounded(redact(message, secrets))}`;
  } else if (body === undefined) {
    const snippet = bounded(redact(rawText ?? "", secrets)).trim();
    tail = snippet ? `response body was not JSON: ${snippet}` : "response body was empty or not JSON";
  } else if (body?.success !== true && status >= 200 && status < 300) {
    tail = "Cloudflare reported success=false without error detail";
  } else {
    tail = "no error detail provided";
  }
  return { status, tail };
}

const RETRYABLE = (status) => status === 429 || status >= 500;

/**
 * GET a Cloudflare list endpoint. Fails closed, with a redacted, operator-
 * readable diagnostic, on: network failure, non-2xx, `success !== true`
 * (strict boolean — a string "true" is hostile), or a non-array `result`.
 */
export async function cfGet({
  fetchImpl = globalThis.fetch,
  base = DEFAULT_API_BASE,
  path,
  query = {},
  token,
  operation,
  endpointClass,
  secrets = [],
  retries = 2,
  retryDelayMs = 750,
  timeoutMs = 30_000,
}) {
  const allSecrets = [token, ...secrets];
  // Labels can carry externally supplied text (a governed zone name from
  // CF_EXPECTED_ZONES is part of the DNS operation): sanitize before interpolation.
  const op = label(operation, allSecrets);
  const endpoint = label(endpointClass, allSecrets);
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0 && retryDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
    let response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      // Deliberately does not include the underlying error text or cause.
      lastError = new EstateAcquisitionError(
        `${op} request failed: unable to reach Cloudflare API (endpoint class: ${endpoint})`,
        { reason: "unable to reach Cloudflare API" },
      );
      continue;
    }

    let rawText = "";
    try {
      rawText = await response.text();
    } catch {
      rawText = "";
    }
    let body;
    try {
      body = JSON.parse(rawText);
    } catch {
      body = undefined;
    }

    const httpOk = response.status >= 200 && response.status < 300;
    if (!httpOk || body?.success !== true) {
      const { status, tail } = describeRejection({ operation, status: response.status, body, rawText, secrets: allSecrets });
      lastError = new EstateAcquisitionError(
        `${op} request rejected: HTTP ${status} — ${tail} (endpoint class: ${endpoint})`,
        { reason: `HTTP ${status} — ${tail}` },
      );
      if (RETRYABLE(response.status)) continue;
      throw lastError;
    }

    // A 2xx/success body is still untrusted.
    if (!Array.isArray(body.result)) {
      throw new EstateAcquisitionError(
        `${op} response did not contain a result array (endpoint class: ${endpoint})`,
        { reason: "response did not contain a result array" },
      );
    }
    return body;
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

function positiveInteger(value, max = 9_999_999) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= max;
}

/**
 * Aggregate every page of a list endpoint, or fail closed. Never returns a
 * partial inventory.
 */
export async function fetchAllPages({ operation, endpointClass, path, query = {}, idKey = "id", ...context }) {
  const secretsForLabels = [context.token, ...(context.secrets ?? [])];
  const op = label(operation, secretsForLabels);
  const endpoint = label(endpointClass, secretsForLabels);
  const fail = (message) => {
    throw new EstateAcquisitionError(`${op} ${message} (endpoint class: ${endpoint})`, { reason: message });
  };
  const items = [];
  let page = 1;
  let totalPages = 1;
  let advertisedTotal;

  while (page <= totalPages) {
    const body = await cfGet({ ...context, operation, endpointClass, path, query: { ...query, page } });

    let info = body.result_info;
    const hasInfo = Object.prototype.hasOwnProperty.call(body, "result_info");
    // Distinguish "absent" (legitimately a single page) from "present but
    // malformed" (must fail closed): `?? {}` would treat null/false as absent.
    if (hasInfo && (info === null || typeof info !== "object" || Array.isArray(info))) {
      fail(`returned a non-object result_info on page ${page}`);
    }
    info = hasInfo ? info : {};

    if (Object.prototype.hasOwnProperty.call(info, "page")) {
      if (!positiveInteger(info.page)) fail(`returned a non-positive-integer result_info.page on page ${page}`);
      if (info.page !== page) fail(`page mismatch: requested page ${page}, Cloudflare reported page ${info.page}`);
    }

    // total_pages: 0 alongside real results is self-contradictory; accepting it
    // would silently truncate a multi-page inventory to its first page.
    let reportedTotal = 1;
    if (Object.prototype.hasOwnProperty.call(info, "total_pages")) {
      if (!positiveInteger(info.total_pages)) fail(`returned a non-positive-integer result_info.total_pages on page ${page}`);
      reportedTotal = info.total_pages;
    }
    if (reportedTotal > MAX_PAGES) fail(`advertised ${reportedTotal} pages, exceeding the safety bound of ${MAX_PAGES}`);

    // Pin total_pages to page 1's value; a later page may not raise or lower it.
    if (page === 1) {
      totalPages = reportedTotal;
      if (Object.prototype.hasOwnProperty.call(info, "total_count")) {
        if (!Number.isSafeInteger(info.total_count) || info.total_count < 0) fail("returned an invalid result_info.total_count");
        advertisedTotal = info.total_count;
      }
    } else if (reportedTotal !== totalPages) {
      fail(`pagination became inconsistent: total_pages changed from ${totalPages} to ${reportedTotal} while reading page ${page}`);
    }

    for (const item of body.result) {
      if (item === null || typeof item !== "object" || Array.isArray(item)) fail(`returned a non-object result entry on page ${page}`);
      items.push(item);
    }
    page += 1;
  }

  const ids = items.map((item) => item[idKey]).filter((value) => value !== undefined);
  if (new Set(ids).size !== ids.length) fail("contained duplicate entries across pages");
  if (advertisedTotal !== undefined && advertisedTotal !== items.length) {
    fail(`returned ${items.length} entries but Cloudflare advertised total_count=${advertisedTotal}`);
  }
  return items;
}

// ---------------------------------------------------------------------------
// Pages inventory (deploy authority) — acquired by scripts/cf-pages-projects.sh
// ---------------------------------------------------------------------------

export function parsePagesInventory(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new EstateAcquisitionError("Pages project inventory file is not valid JSON");
  }
  if (parsed?.success !== true || !Array.isArray(parsed.result)) {
    throw new EstateAcquisitionError("Pages project inventory file is not a successful {success:true,result:[...]} document");
  }
  const seenIds = new Set();
  const seenNames = new Set();
  for (const project of parsed.result) {
    if (!project || typeof project !== "object" || typeof project.id !== "string" || typeof project.name !== "string") {
      throw new EstateAcquisitionError("Pages project inventory contains a malformed project entry");
    }
    if (project.domains !== undefined && !(Array.isArray(project.domains) && project.domains.every((d) => typeof d === "string"))) {
      throw new EstateAcquisitionError(`Pages project ${project.name} has a malformed domains list`);
    }
    if (seenIds.has(project.id) || seenNames.has(project.name)) {
      throw new EstateAcquisitionError("Pages project inventory contains duplicate projects");
    }
    seenIds.add(project.id);
    seenNames.add(project.name);
  }
  return parsed.result;
}

function pagesEvidenceFor(zoneName, projects) {
  const claimed = new Set([zoneName, `www.${zoneName}`]);
  const claiming = projects.filter((project) => (project.domains ?? []).some((domain) => claimed.has(domain)));
  if (claiming.length === 0) {
    return {
      pages: {},
      evidence: {
        status: "no_project",
        authority: AUTHORITY_DEPLOY,
        reason: `The complete Pages inventory (${projects.length} projects) contains no project claiming ${zoneName}`,
      },
    };
  }
  if (claiming.length > 1) {
    return {
      pages: {},
      evidence: {
        status: "unavailable",
        authority: AUTHORITY_DEPLOY,
        reason: `Ambiguous: ${claiming.length} Pages projects claim ${zoneName} (${claiming.map((p) => p.name).join(", ")})`,
      },
    };
  }
  const [project] = claiming;
  const source = project.source && typeof project.source === "object" ? project.source : {};
  const config = source.config && typeof source.config === "object" ? source.config : {};
  const sourceType = typeof source.type === "string" ? source.type : null;
  return {
    pages: {
      project_name: project.name,
      source_type: sourceType,
      source_repository: sourceType === "github" ? `${config.owner ?? ""}/${config.repo_name ?? ""}` : null,
      latest_production_deployment: project.latest_deployment?.created_on ?? null,
    },
    evidence: { status: "observed", authority: AUTHORITY_DEPLOY },
  };
}

// ---------------------------------------------------------------------------
// Acquisition
// ---------------------------------------------------------------------------

const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

/**
 * Governed zone names flow into request paths, operation labels, evidence reasons,
 * warnings and property ids. The one choke point: anything that is not a plain
 * hostname is refused outright and never echoed, so hostile text cannot reach any
 * sink. Applied on parse, on acquisition and on validation.
 */
export function assertGovernedZoneNames(zones) {
  if (!Array.isArray(zones) || !zones.every((zone) => typeof zone === "string" && HOSTNAME.test(zone))) {
    throw new EstateAcquisitionError("governed zones contain an entry that is not a valid hostname");
  }
}

export function parseExpectedZones(text) {
  const zones = String(text ?? "")
    .split(",")
    .map((zone) => zone.trim())
    .filter(Boolean);
  if (zones.length === 0) throw new EstateAcquisitionError("CF_EXPECTED_ZONES is empty: there is no governed estate to account for");
  assertGovernedZoneNames(zones);
  if (new Set(zones).size !== zones.length) throw new EstateAcquisitionError("CF_EXPECTED_ZONES contains duplicate zones");
  return zones;
}

const dnsShape = (record) => ({ name: record.name, type: record.type, content: record.content, proxied: record.proxied });

export async function acquireEstate({
  fetchImpl,
  base = DEFAULT_API_BASE,
  accountId,
  zoneToken,
  secrets = [],
  expectedZones,
  pagesProjects,
  now = () => new Date(),
  retries,
  retryDelayMs,
  onWarning = () => {},
}) {
  assertGovernedZoneNames(expectedZones);
  const context = { fetchImpl, base, token: zoneToken, secrets, retries, retryDelayMs };

  const zones = await fetchAllPages({
    ...context,
    operation: "zone-list",
    endpointClass: "zones",
    path: "/zones",
    query: { "account.id": accountId, per_page: 50 },
  });
  const zonesByName = new Map();
  for (const zone of zones) {
    if (typeof zone.name !== "string" || typeof zone.id !== "string") {
      throw new EstateAcquisitionError("zone-list returned a zone without a string name/id (endpoint class: zones)");
    }
    if (zonesByName.has(zone.name)) {
      throw new EstateAcquisitionError("zone-list returned duplicate zone names (endpoint class: zones)");
    }
    zonesByName.set(zone.name, zone);
  }

  const properties = [];
  for (const zoneName of expectedZones) {
    const zone = zonesByName.get(zoneName);
    const pages = pagesEvidenceFor(zoneName, pagesProjects);
    const record = {
      property_id: zoneName,
      zone_status: null,
      dns_apex: [],
      dns_www: [],
      pages: pages.pages,
      evidence: {
        zone: { status: "observed", authority: AUTHORITY_ANALYTICS },
        dns: { status: "observed", authority: AUTHORITY_ANALYTICS },
        pages: pages.evidence,
      },
    };

    if (!zone) {
      // Explicit and truthful, never a silent drop. (The estate-access step
      // normally fails the run before this can happen.)
      const reason = "Governed zone is absent from the complete zone list visible to the analytics credential";
      record.evidence.zone = { status: "unavailable", authority: AUTHORITY_ANALYTICS, reason };
      record.evidence.dns = { status: "unavailable", authority: AUTHORITY_ANALYTICS, reason: "No zone, so no DNS records could be read" };
      onWarning(`${zoneName}: ${reason}`);
    } else {
      record.zone_status = typeof zone.status === "string" ? zone.status : null;
      try {
        const dns = await fetchAllPages({
          ...context,
          operation: `dns-records:${zoneName}`,
          endpointClass: "zones/dns_records",
          path: `/zones/${zone.id}/dns_records`,
          query: { per_page: 100 },
        });
        record.dns_apex = dns.filter((r) => r.name === zoneName).map(dnsShape);
        record.dns_www = dns.filter((r) => r.name === `www.${zoneName}`).map(dnsShape);
      } catch (error) {
        if (!(error instanceof EstateAcquisitionError)) throw error;
        // One zone's DNS being unreadable is per-zone, explicit evidence loss;
        // it is accounted for, not silently absent. A *systemic* failure is
        // caught by validateEstateArtifact.
        record.evidence.dns = { status: "unavailable", authority: AUTHORITY_ANALYTICS, reason: error.reason };
        onWarning(`${zoneName}: DNS evidence unavailable — ${error.reason}`);
      }
    }
    properties.push(record);
  }

  return {
    schema_version: ESTATE_SCHEMA_VERSION,
    contract_name: ESTATE_CONTRACT_NAME,
    fixture: false,
    generated_at: now().toISOString(),
    governed_zones: [...expectedZones],
    inventory: {
      zones: { authority: AUTHORITY_ANALYTICS, complete: true, count: zones.length },
      pages: { authority: AUTHORITY_DEPLOY, complete: true, count: pagesProjects.length },
    },
    properties,
  };
}

// ---------------------------------------------------------------------------
// Completeness validation
// ---------------------------------------------------------------------------

const STATUSES = {
  zone: new Set(["observed", "unavailable"]),
  dns: new Set(["observed", "unavailable"]),
  pages: new Set(["observed", "no_project", "unavailable"]),
};
const EXPECTED_AUTHORITY = { zone: AUTHORITY_ANALYTICS, dns: AUTHORITY_ANALYTICS, pages: AUTHORITY_DEPLOY };

/**
 * Reconcile the artifact against the governed estate. A valid artifact cannot
 * simply have "some properties": each expected zone is exactly one of
 *   observed        — evidence present, or
 *   accounted-for   — evidence unavailable WITH an explicit reason, or
 *   silently absent — FAILURE.
 * Throws EstateValidationError listing every problem; returns the accounting.
 */
export function validateEstateArtifact(artifact, { expectedZones, secrets = [] }) {
  assertGovernedZoneNames(expectedZones);
  const problems = [];
  const add = (message) => problems.push(message);

  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    throw new EstateValidationError(["artifact is not an object"]);
  }
  if (artifact.contract_name !== ESTATE_CONTRACT_NAME) add(`unexpected contract_name ${JSON.stringify(String(artifact.contract_name))}`);
  if (artifact.schema_version !== ESTATE_SCHEMA_VERSION) add(`unsupported schema_version ${JSON.stringify(String(artifact.schema_version))}`);
  if (artifact.fixture !== false) add("artifact must declare fixture=false");
  if (typeof artifact.generated_at !== "string" || Number.isNaN(Date.parse(artifact.generated_at))) add("generated_at is not a valid timestamp");

  const governed = artifact.governed_zones;
  if (!Array.isArray(governed) || !governed.every((z) => typeof z === "string")) {
    add("governed_zones must be a string list");
  } else {
    const expected = new Set(expectedZones);
    if (new Set(governed).size !== governed.length) add("governed_zones contains duplicates");
    for (const zone of expected) if (!governed.includes(zone)) add(`governed_zones omits expected zone ${zone}`);
    for (const zone of governed) if (!expected.has(zone)) add(`governed_zones contains unexpected zone ${zone}`);
  }

  const inventory = artifact.inventory;
  for (const name of ["zones", "pages"]) {
    const entry = inventory?.[name];
    if (!entry || typeof entry !== "object") {
      add(`inventory.${name} is missing`);
      continue;
    }
    if (entry.complete !== true) add(`${name} inventory is not declared complete`);
    // Provenance must be declared, never defaulted downstream.
    const inventoryAuthority = name === "zones" ? AUTHORITY_ANALYTICS : AUTHORITY_DEPLOY;
    if (entry.authority !== inventoryAuthority) add(`${name} inventory must declare authority ${inventoryAuthority}`);
    if (!Number.isSafeInteger(entry.count) || entry.count < 0) add(`${name} inventory count must be a non-negative integer`);
  }

  const counts = { observed: 0, accounted_unavailable: 0 };
  const properties = artifact.properties;
  if (!Array.isArray(properties)) {
    add("properties must be a list");
  } else {
    const ids = properties.map((p) => p?.property_id);
    if (new Set(ids).size !== ids.length) add("properties contains duplicate property_id values");
    for (const zone of expectedZones) {
      if (!ids.includes(zone)) add(`governed zone ${zone} is silently absent from the estate artifact`);
    }
    for (const id of ids) {
      if (!expectedZones.includes(id)) add(`estate artifact contains ungoverned property ${String(id)}`);
    }

    for (const property of properties) {
      const id = String(property?.property_id);
      const evidence = property?.evidence;
      if (!evidence || typeof evidence !== "object") {
        add(`property ${id} has no evidence accounting`);
        continue;
      }
      let unavailable = false;
      for (const evidenceClass of ["zone", "dns", "pages"]) {
        const entry = evidence[evidenceClass];
        if (!entry || typeof entry !== "object") {
          add(`property ${id} has no ${evidenceClass} evidence accounting`);
          continue;
        }
        if (!STATUSES[evidenceClass].has(entry.status)) {
          add(`property ${id} has an invalid ${evidenceClass} evidence status`);
          continue;
        }
        if (entry.authority !== EXPECTED_AUTHORITY[evidenceClass]) {
          add(`property ${id} ${evidenceClass} evidence names the wrong authority`);
        }
        if (entry.status !== "observed") {
          if (typeof entry.reason !== "string" || !entry.reason.trim()) {
            add(`property ${id} ${evidenceClass} evidence is ${entry.status} without an explicit reason`);
          }
          if (entry.status === "unavailable") unavailable = true;
        }
      }
      if (evidence.pages?.status === "observed" && !(property.pages && typeof property.pages.project_name === "string")) {
        add(`property ${id} claims observed Pages evidence but carries no project`);
      }
      // Substantive values only: a fixed-shape {project_name: null, source_type: ""} carries no facts.
      const hasPagesFacts =
        property.pages &&
        typeof property.pages === "object" &&
        Object.values(property.pages).some((v) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0));
      if (evidence.pages?.status !== "observed" && hasPagesFacts) {
        add(`property ${id} carries Pages facts its evidence accounting does not claim`);
      }
      if (evidence.zone?.status === "observed" && typeof property.zone_status !== "string") {
        add(`property ${id} claims observed zone evidence but has no zone_status`);
      }
      if (!Array.isArray(property.dns_apex) || !Array.isArray(property.dns_www)) {
        add(`property ${id} DNS records must be lists`);
      } else {
        // Required fields, not "a string if present": an entry with none of them would
        // otherwise be silently ignored while dns evidence reads `observed`.
        const wellFormed = (r) =>
          r !== null &&
          typeof r === "object" &&
          ["name", "type", "content"].every((f) => typeof r[f] === "string" && r[f] !== "") &&
          (r.proxied === undefined || r.proxied === null || typeof r.proxied === "boolean");
        if (![...property.dns_apex, ...property.dns_www].every(wellFormed)) add(`property ${id} contains a malformed DNS record`);
      }
      if (unavailable) counts.accounted_unavailable += 1;
      else counts.observed += 1;
    }

    // Declared inventory counts must reconcile with the evidence built from them.
    const zoneCount = inventory?.zones?.count;
    const pagesCount = inventory?.pages?.count;
    const observedZones = properties.filter((p) => p?.evidence?.zone?.status === "observed").length;
    if (Number.isSafeInteger(zoneCount) && zoneCount < observedZones) {
      add(`zone inventory count ${zoneCount} is smaller than the ${observedZones} zones observed from it`);
    }
    const observedProjects = new Set(
      properties.filter((p) => p?.evidence?.pages?.status === "observed" && p?.pages?.project_name).map((p) => p.pages.project_name),
    );
    if (Number.isSafeInteger(pagesCount) && pagesCount < observedProjects.size) {
      add(`pages inventory count ${pagesCount} is smaller than the ${observedProjects.size} distinct projects observed from it`);
    }

    // Systemic-failure guard: per-zone loss is legitimate accounting, but a
    // class unavailable for *every* zone means acquisition itself failed.
    for (const evidenceClass of ["zone", "dns", "pages"]) {
      // For Pages only `unavailable` is a failure: every zone being `no_project`
      // against a complete inventory is a valid known negative.
      const failed = (p) =>
        evidenceClass === "pages" ? p?.evidence?.pages?.status === "unavailable" : p?.evidence?.[evidenceClass]?.status !== "observed";
      if (properties.length > 0 && properties.every(failed)) {
        add(`${evidenceClass} evidence is unavailable for every governed zone (systemic acquisition failure)`);
      }
    }
  }

  const serialized = JSON.stringify(artifact);
  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length >= MIN_SECRET_LENGTH && serialized.includes(secret)) {
      add("a credential was serialized into the artifact");
      break;
    }
  }

  if (problems.length > 0) throw new EstateValidationError(problems);
  return { governed: expectedZones.length, ...counts };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export function renderSummary(artifact) {
  const cell = (value) => String(value ?? "—").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
  const lines = [
    "### Estate configuration accounting",
    "",
    `Governed zones: **${artifact.governed_zones.length}** · accounted: **${artifact.properties.length}** · Pages inventory: **${artifact.inventory.pages.count}** projects (complete=${artifact.inventory.pages.complete}) · zone inventory: **${artifact.inventory.zones.count}** (complete=${artifact.inventory.zones.complete})`,
    "",
    "| Zone | Zone (analytics) | DNS (analytics) | Pages (deploy) | Project | Source |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const property of artifact.properties) {
    const e = property.evidence;
    const show = (entry) => (entry.status === "observed" ? "observed" : `${entry.status}: ${entry.reason}`);
    lines.push(
      `| ${cell(property.property_id)} | ${cell(show(e.zone))} | ${cell(show(e.dns))} | ${cell(show(e.pages))} | ${cell(property.pages?.project_name)} | ${cell(property.pages?.source_type ?? (property.pages?.project_name ? "direct upload" : null))} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    if (!flag?.startsWith("--") || rest[i + 1] === undefined) throw new EstateAcquisitionError(`invalid arguments near ${redact(String(flag))}`);
    options[flag.slice(2)] = rest[i + 1];
  }
  return { command, options };
}

async function writeAtomic(target, contents) {
  const temp = `${target}.tmp-${process.pid}`;
  await writeFile(temp, contents, "utf8");
  await rename(temp, target);
}

export async function main(argv, env = process.env) {
  const secrets = [env.CF_ZONE_API_TOKEN, env.CLOUDFLARE_API_TOKEN].filter(Boolean);
  const { command, options } = parseArgs(argv);
  const expectedZones = parseExpectedZones(env.CF_EXPECTED_ZONES);

  if (command === "validate") {
    if (!options.artifact) throw new EstateAcquisitionError("validate requires --artifact");
    const artifact = JSON.parse(await readFile(options.artifact, "utf8"));
    const accounting = validateEstateArtifact(artifact, { expectedZones, secrets });
    console.log(`estate_artifact_valid=true governed=${accounting.governed} observed=${accounting.observed} accounted_unavailable=${accounting.accounted_unavailable}`);
    return;
  }

  if (command !== "build") throw new EstateAcquisitionError("usage: cf-estate-config.mjs build|validate ...");
  if (!options["pages-projects"] || !options.out) throw new EstateAcquisitionError("build requires --pages-projects and --out");
  for (const name of ["CF_ACCOUNT_ID", "CF_ZONE_API_TOKEN"]) {
    if (!env[name]) throw new EstateAcquisitionError(`${name} is required`);
  }

  const pagesProjects = parsePagesInventory(await readFile(options["pages-projects"], "utf8"));
  const artifact = await acquireEstate({
    base: env.CF_API_BASE || DEFAULT_API_BASE,
    accountId: env.CF_ACCOUNT_ID,
    zoneToken: env.CF_ZONE_API_TOKEN,
    secrets,
    expectedZones,
    pagesProjects,
    onWarning: (message) => console.error(`::warning::${redact(message, secrets)}`),
  });
  // Validate BEFORE writing: an incomplete artifact must not exist on disk.
  const accounting = validateEstateArtifact(artifact, { expectedZones, secrets });
  await writeAtomic(options.out, `${JSON.stringify(artifact, null, 2)}\n`);
  if (options.summary) await appendFile(options.summary, renderSummary(artifact), "utf8");
  console.log(`estate_config_properties=${artifact.properties.length}`);
  console.log(`governed_zones=${accounting.governed}`);
  console.log(`pages_inventory_projects=${artifact.inventory.pages.count}`);
  console.log(`estate_zones_observed=${accounting.observed}`);
  console.log(`estate_zones_accounted_unavailable=${accounting.accounted_unavailable}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const secrets = [process.env.CF_ZONE_API_TOKEN, process.env.CLOUDFLARE_API_TOKEN].filter(Boolean);
  main(process.argv.slice(2)).catch((error) => {
    // Only our own errors carry vetted text; everything else is reduced to its
    // class name so an unexpected runtime error can never echo a value.
    const safe = error instanceof EstateAcquisitionError || error instanceof EstateValidationError
      ? redact(error.message, secrets)
      : `unexpected ${error?.name ?? "error"}`;
    console.error(`estate-config acquisition failed: ${safe}`);
    process.exit(1);
  });
}
