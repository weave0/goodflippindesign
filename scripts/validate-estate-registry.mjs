#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, ROOT), "utf8"));
const fail = (problems) => {
  console.error("GFD estate registry validation failed:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
};

const registry = await readJson("estate/registry.json");
const brands = await readJson("brands.json");
const workflow = await readFile(new URL(".github/workflows/traffic-intelligence-deploy.yml", ROOT), "utf8");

const match = workflow.match(/^\s*CF_EXPECTED_ZONES:\s*([^\n#]+)\s*$/m);
if (!match) {
  fail(["Could not find the authoritative CF_EXPECTED_ZONES declaration in traffic-intelligence-deploy.yml"]);
} else {
  const expectedZones = match[1].split(",").map((x) => x.trim()).filter(Boolean).sort();
  const properties = Array.isArray(registry.properties) ? registry.properties : [];
  const registryZones = properties.filter((p) => p?.governed === true).map((p) => p.domain).sort();
  const problems = [];

  if (registry.contract_name !== "gfd-estate-registry") problems.push("contract_name must be gfd-estate-registry");
  if (!/^1\./.test(String(registry.schema_version ?? ""))) problems.push("schema_version must be a 1.x version");

  const domains = properties.map((p) => p?.domain).filter(Boolean);
  for (const value of new Set(domains)) {
    if (domains.filter((d) => d === value).length > 1) problems.push(`duplicate registry domain: ${value}`);
  }

  const missingGoverned = expectedZones.filter((z) => !registryZones.includes(z));
  const extraGoverned = registryZones.filter((z) => !expectedZones.includes(z));
  if (missingGoverned.length) problems.push(`governed zones missing from registry: ${missingGoverned.join(", ")}`);
  if (extraGoverned.length) problems.push(`registry marks non-governed zones as governed: ${extraGoverned.join(", ")}`);

  const publicBrands = brands.public ?? {};
  for (const [brandId, brand] of Object.entries(publicBrands)) {
    if (!brand?.domain) continue;
    const property = properties.find((p) => p.domain === brand.domain);
    if (!property) {
      problems.push(`public brand domain missing from registry: ${brandId} -> ${brand.domain}`);
      continue;
    }
    if (property.brand_id !== brandId) problems.push(`brand mapping mismatch for ${brand.domain}: expected ${brandId}, got ${property.brand_id ?? "null"}`);
  }

  for (const property of properties) {
    if (!property || typeof property !== "object") {
      problems.push("registry contains a non-object property");
      continue;
    }
    if (property.operator_visibility !== "required") problems.push(`${property.domain ?? "unknown"}: operator_visibility must be required`);
    if (property.classification === "unclassified" && property.brand_id !== null) problems.push(`${property.domain}: unclassified property must not invent brand_id`);
    if (property.brand_id != null) {
      const brand = publicBrands[property.brand_id];
      if (!brand) problems.push(`${property.domain}: unknown brand_id ${property.brand_id}`);
      else if (brand.domain !== property.domain) problems.push(`${property.domain}: brand_id ${property.brand_id} is not supported by brands.json primary domain ${brand.domain}`);
    }
  }

  if (problems.length) fail(problems);
  else {
    const unclassified = properties.filter((p) => p.classification === "unclassified").map((p) => p.domain);
    console.log(`Estate registry valid: ${registryZones.length} governed zones, ${Object.keys(publicBrands).length} public brands, ${unclassified.length} unclassified properties.`);
    if (unclassified.length) console.log(`Unclassified and intentionally visible: ${unclassified.join(", ")}`);
  }
}
