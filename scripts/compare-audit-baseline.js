#!/usr/bin/env node

const fs = require("node:fs");

const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

function fail(message) {
  console.error(`Baseline comparison error: ${message}`);
  process.exit(1);
}

function read(path) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (error) {
    fail(`unable to read ${path}: ${error.message}`);
  }
}

function state(baseline) {
  if (!baseline || typeof baseline !== "object" || !baseline.packages || typeof baseline.packages !== "object") {
    fail("baseline must contain a packages object");
  }
  return Object.fromEntries(Object.entries(baseline.packages).map(([name, finding]) => {
    if (!finding || !Array.isArray(finding.advisories) || !Object.prototype.hasOwnProperty.call(RANK, finding.severity)) {
      fail(`baseline ${name} is malformed`);
    }
    return [name, {
      severity: finding.severity,
      advisories: [...new Set(finding.advisories.map(String))].sort(),
    }];
  }));
}

function reportState(report) {
  if (!report || !report.vulnerabilities || typeof report.vulnerabilities !== "object") {
    fail("audit report lacks vulnerabilities");
  }
  const state = Object.fromEntries(Object.entries(report.vulnerabilities)
    .filter(([, finding]) => RANK[finding.severity] >= RANK.moderate)
    .map(([name, finding]) => [name, {
      severity: finding.severity,
      advisories: [...new Set((finding.via || [])
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => String(entry.source)))].sort(),
      }]));
      return Object.fromEntries(Object.keys(state).sort().map((name) => [name, state[name]]));
}

function main() {
  const [currentPath, trustedPath, reportPath] = process.argv.slice(2);
  if (!currentPath || !trustedPath || !reportPath) {
    fail("usage: node scripts/compare-audit-baseline.js <current> <trusted-base> <report>");
  }
  const current = state(read(currentPath));
  const report = read(reportPath);

  if (!fs.existsSync(trustedPath) || fs.statSync(trustedPath).size === 0) {
    if (JSON.stringify(current) !== JSON.stringify(reportState(report))) {
      fail("initial baseline must exactly match the current audit report");
    }
    console.log("Initial baseline bootstrap validated against the current report.");
    return;
  }

  const trusted = state(read(trustedPath));
  for (const [name, finding] of Object.entries(current)) {
    if (!trusted[name]) fail(`baseline added package ${name}`);
    if (RANK[finding.severity] > RANK[trusted[name].severity]) {
      fail(`baseline increased severity for ${name}: ${trusted[name].severity} -> ${finding.severity}`);
    }
    const previous = new Set(trusted[name].advisories);
    for (const advisory of finding.advisories) {
      if (!previous.has(advisory)) fail(`baseline added advisory ${name}/${advisory}`);
    }
  }
  console.log("Baseline is non-expanding relative to the trusted base revision.");
}

main();
