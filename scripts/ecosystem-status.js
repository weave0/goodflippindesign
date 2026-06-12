#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const WORKSPACE = path.resolve(__dirname, "..");
const BRANDS_PATH = path.join(WORKSPACE, "brands.json");
const SWEEP_PATH = path.join(WORKSPACE, "local-sweep.json");

const JSON_ONLY = process.argv.includes("--json");

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function countBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item) || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function findRepoForSite(site, sweep) {
  if (!sweep?.repos || !Array.isArray(sweep.repos)) return null;
  if (site.repo) {
    const repoName = String(site.repo).split("/").pop().toLowerCase();
    const repo = sweep.repos.find((candidate) => candidate.name === repoName);
    if (repo) return repo;
  }
  if (site.dir) {
    const normalizedDir = site.dir.replace(/\\/g, "/").toLowerCase();
    const repo = sweep.repos.find(
      (candidate) =>
        candidate.path &&
        candidate.path
          .replace(/\\/g, "/")
          .toLowerCase()
          .endsWith(normalizedDir),
    );
    if (repo) return repo;
  }
  if (site.slug) {
    const repo = sweep.repos.find(
      (candidate) =>
        candidate.brand === site.slug || candidate.name === site.slug,
    );
    if (repo) return repo;
  }
  if (site.domain) {
    return (
      sweep.repos.find(
        (candidate) => candidate.url === `https://${site.domain}`,
      ) || null
    );
  }
  return null;
}

function buildStatus() {
  const brands = readJson(BRANDS_PATH, {});
  const sweep = readJson(SWEEP_PATH, null);
  const publicSites = Object.entries(brands.public || {}).map(
    ([slug, site]) => ({ slug, ...site }),
  );

  const rows = publicSites
    .map((site) => {
      const repo = findRepoForSite(site, sweep);
      const missing = [];
      for (const field of ["stage", "audience", "primaryCta", "secondaryCta"]) {
        if (!site[field]) missing.push(field);
      }
      if (!site.deployment) missing.push("deployment");
      if (!site.ops?.nextAction) missing.push("ops.nextAction");

      return {
        slug: site.slug,
        name: site.name,
        domain: site.domain,
        status: site.status,
        stage: site.stage || "unknown",
        priority: site.ops?.priority ?? null,
        deployment: site.deployment?.status || "unknown",
        repoStatus: repo?.git?.status || (repo ? "not-git" : "not-found"),
        nextAction: site.ops?.nextAction || null,
        missing,
      };
    })
    .sort((a, b) => {
      const pa = a.priority ?? 99;
      const pb = b.priority ?? 99;
      return pa - pb || a.slug.localeCompare(b.slug);
    });

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      publicSites: rows.length,
      byStatus: countBy(rows, (row) => row.status),
      byStage: countBy(rows, (row) => row.stage),
      dirtyRepos: rows.filter((row) => row.repoStatus === "dirty").length,
      missingOpsFields: rows.filter((row) => row.missing.length > 0).length,
    },
    sites: rows,
  };
}

function printStatus(status) {
  console.log("Ecosystem Status");
  console.log(`Generated: ${status.generatedAt}`);
  console.log(`Public sites: ${status.counts.publicSites}`);
  console.log(`Dirty mapped repos: ${status.counts.dirtyRepos}`);
  console.log(`Sites missing ops fields: ${status.counts.missingOpsFields}`);
  console.log("");

  for (const site of status.sites) {
    const priority = site.priority === null ? "-" : site.priority;
    console.log(
      `${priority}  ${site.slug.padEnd(18)} ${site.stage.padEnd(10)} ${site.deployment.padEnd(9)} ${site.repoStatus}`,
    );
    if (site.nextAction) console.log(`   next: ${site.nextAction}`);
    if (site.missing.length)
      console.log(`   missing: ${site.missing.join(", ")}`);
  }
}

const status = buildStatus();
if (JSON_ONLY) console.log(JSON.stringify(status, null, 2));
else printStatus(status);
