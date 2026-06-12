#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const WORKSPACE = path.resolve(__dirname, "..");
const BRANDS_PATH = path.join(WORKSPACE, "brands.json");
const BRIEFS_DIR = path.join(WORKSPACE, "ecosystem", "site-briefs");

const VALID_STAGES = new Set(["seed", "mvp", "live", "monetizing", "paused"]);
const VALID_DEPLOYMENT_STATUSES = new Set([
  "not-live",
  "staged",
  "live",
  "unknown",
]);

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read JSON at ${filePath}: ${error.message}`);
  }
}

function existsRelative(relativePath) {
  if (!relativePath) return true;
  return fs.existsSync(path.join(WORKSPACE, relativePath));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validatePublicSite(
  slug,
  site,
  errors,
  warnings,
  seenDomains,
  seenSlugs,
) {
  const label = `public.${slug}`;
  const requiredStrings = [
    "name",
    "slug",
    "type",
    "status",
    "domain",
    "url",
    "tagline",
    "description",
  ];

  for (const field of requiredStrings) {
    if (typeof site[field] !== "string" || site[field].trim() === "") {
      errors.push(
        `${label}.${field} is required and must be a non-empty string.`,
      );
    }
  }

  if (site.slug && site.slug !== slug) {
    errors.push(`${label}.slug must match its registry key.`);
  }

  if (site.slug) {
    if (seenSlugs.has(site.slug))
      errors.push(`${label}.slug duplicates another slug: ${site.slug}`);
    seenSlugs.add(site.slug);
  }

  if (site.domain) {
    if (seenDomains.has(site.domain))
      errors.push(`${label}.domain duplicates another domain: ${site.domain}`);
    seenDomains.add(site.domain);
  }

  if (site.domain && site.url && site.url !== `https://${site.domain}`) {
    warnings.push(
      `${label}.url does not exactly match https://${site.domain}.`,
    );
  }

  if (site.stage && !VALID_STAGES.has(site.stage)) {
    errors.push(
      `${label}.stage must be one of: ${Array.from(VALID_STAGES).join(", ")}.`,
    );
  }

  if (!site.stage)
    warnings.push(
      `${label}.stage is missing; add it during the next registry touch.`,
    );
  if (!site.audience)
    warnings.push(
      `${label}.audience is missing; add it during the next registry touch.`,
    );
  if (!site.primaryCta)
    warnings.push(
      `${label}.primaryCta is missing; add it during the next registry touch.`,
    );
  if (!site.secondaryCta)
    warnings.push(
      `${label}.secondaryCta is missing; add it during the next registry touch.`,
    );

  if (site.dir && !existsRelative(site.dir)) {
    errors.push(`${label}.dir points to a missing workspace path: ${site.dir}`);
  }

  if (site.deployment) {
    if (!isObject(site.deployment)) {
      errors.push(`${label}.deployment must be an object when present.`);
    } else if (
      site.deployment.status &&
      !VALID_DEPLOYMENT_STATUSES.has(site.deployment.status)
    ) {
      errors.push(
        `${label}.deployment.status must be one of: ${Array.from(VALID_DEPLOYMENT_STATUSES).join(", ")}.`,
      );
    }
  } else {
    warnings.push(
      `${label}.deployment is missing; add provider/project/status during the next registry touch.`,
    );
  }

  if (site.ops) {
    if (!isObject(site.ops)) {
      errors.push(`${label}.ops must be an object when present.`);
    } else {
      if (!site.ops.nextAction)
        warnings.push(`${label}.ops.nextAction is missing.`);
      if (!site.ops.lastReviewed)
        warnings.push(`${label}.ops.lastReviewed is missing.`);
      if (
        site.ops.priority !== undefined &&
        !Number.isInteger(site.ops.priority)
      ) {
        errors.push(`${label}.ops.priority must be an integer when present.`);
      }
    }
  } else {
    warnings.push(
      `${label}.ops is missing; add nextAction/lastReviewed during the next registry touch.`,
    );
  }

  if (site.stage === "seed" || site.stage === "mvp") {
    const briefPath = path.join(BRIEFS_DIR, `${slug}.md`);
    if (!fs.existsSync(briefPath)) {
      warnings.push(
        `${label} is ${site.stage} but has no site brief at ecosystem/site-briefs/${slug}.md.`,
      );
    }
  }
}

function main() {
  const errors = [];
  const warnings = [];
  const brands = readJson(BRANDS_PATH);

  if (!isObject(brands.public)) errors.push("brands.public must be an object.");
  if (!isObject(brands.internal))
    warnings.push("brands.internal is missing or not an object.");
  if (!isObject(brands.paused))
    warnings.push("brands.paused is missing or not an object.");

  const seenDomains = new Set();
  const seenSlugs = new Set();

  if (isObject(brands.public)) {
    for (const [slug, site] of Object.entries(brands.public)) {
      if (!isObject(site)) {
        errors.push(`public.${slug} must be an object.`);
        continue;
      }
      validatePublicSite(slug, site, errors, warnings, seenDomains, seenSlugs);
    }
  }

  console.log(
    `Validated ${Object.keys(brands.public || {}).length} public ecosystem entries.`,
  );

  if (warnings.length) {
    console.log("\nWarnings:");
    for (const warning of warnings) console.log(`- ${warning}`);
  }

  if (errors.length) {
    console.error("\nErrors:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log("\nbrands.json structural validation passed.");
}

main();
