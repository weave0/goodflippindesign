#!/usr/bin/env node

const fs = require("node:fs");

const SEVERITIES = ["info", "low", "moderate", "high", "critical"];
const GOVERNED = ["moderate", "high", "critical"];

function fail(message) {
  console.error(`Audit policy error: ${message}`);
  process.exit(2);
}

function readJson(path) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (error) {
    fail(`unable to read valid JSON from ${path}: ${error.message}`);
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function advisoryIds(finding) {
  if (!Array.isArray(finding.via)) fail("each vulnerability must have a via array");
  const ids = [];
  for (const entry of finding.via) {
    if (typeof entry === "string") continue;
    if (!isObject(entry) || !Number.isInteger(entry.source) || entry.source <= 0) {
      fail("advisory entries must use positive numeric source IDs");
    }
    ids.push(String(entry.source));
  }
  return [...new Set(ids)].sort();
}

function validateReport(report, auditExit) {
  if (!isObject(report) || !isObject(report.vulnerabilities)) {
    fail("audit report must contain a vulnerabilities object");
  }
  if (!isObject(report.metadata) || !isObject(report.metadata.vulnerabilities)) {
    fail("audit report must contain vulnerability metadata");
  }
  const counts = report.metadata.vulnerabilities;
  for (const severity of SEVERITIES) {
    if (!Number.isInteger(counts[severity]) || counts[severity] < 0) {
      fail(`metadata.${severity} must be a non-negative integer`);
    }
  }
  if (!Number.isInteger(counts.total) || counts.total < 0) {
    fail("metadata.total must be a non-negative integer");
  }

  const calculated = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]));
  for (const [name, finding] of Object.entries(report.vulnerabilities)) {
    if (!name || !isObject(finding) || !SEVERITIES.includes(finding.severity)) {
      fail(`vulnerability ${name || "<unnamed>"} has an invalid severity record`);
    }
    advisoryIds(finding);
    calculated[finding.severity] += 1;
  }
  for (const severity of SEVERITIES) {
    if (counts[severity] !== calculated[severity]) {
      fail(`metadata.${severity} does not match vulnerability entries`);
    }
  }
  if (counts.total !== Object.keys(report.vulnerabilities).length) {
    fail("metadata.total does not match the vulnerability object");
  }
  if (auditExit !== 0 && auditExit !== 1) {
    fail(`npm audit exited unexpectedly with status ${auditExit}`);
  }
  if ((auditExit === 0 && counts.total !== 0) || (auditExit === 1 && counts.total === 0)) {
    fail("npm audit exit status is inconsistent with the report");
  }
}

function validateBaseline(baseline) {
  if (!isObject(baseline) || !isObject(baseline.packages)) {
    fail("baseline must contain a packages object");
  }
  for (const [name, finding] of Object.entries(baseline.packages)) {
    if (!isObject(finding) || !GOVERNED.includes(finding.severity)) {
      fail(`baseline ${name} has an invalid severity`);
    }
    if (!Array.isArray(finding.advisories) || finding.advisories.some((id) => !/^\d+$/.test(String(id)))) {
      fail(`baseline ${name} has invalid advisory IDs`);
    }
  }
}

function enforceReportAgainstBaseline(report, baseline) {
  for (const [name, finding] of Object.entries(report.vulnerabilities)) {
    if (!GOVERNED.includes(finding.severity)) continue;
    const allowed = baseline.packages[name];
    if (!allowed) fail(`audit introduced new vulnerable package ${name}`);
    const allowedSeverity = SEVERITIES.indexOf(allowed.severity);
    if (SEVERITIES.indexOf(finding.severity) > allowedSeverity) {
      fail(`audit severity increased for ${name}: ${allowed.severity} -> ${finding.severity}`);
    }
    const allowedAdvisories = new Set(allowed.advisories.map(String));
    for (const advisory of advisoryIds(finding)) {
      if (!allowedAdvisories.has(advisory)) {
        fail(`audit introduced new advisory ${name}/${advisory}`);
      }
    }
  }
}

function main() {
  const [reportPath, baselinePath, auditExitText] = process.argv.slice(2);
  if (!reportPath || !baselinePath || auditExitText === undefined) {
    fail("usage: node scripts/audit-policy.js <report> <baseline> <npm-audit-exit>");
  }
  const auditExit = Number(auditExitText);
  if (!Number.isInteger(auditExit)) fail("npm audit exit status must be an integer");
  const report = readJson(reportPath);
  const baseline = readJson(baselinePath);
  validateReport(report, auditExit);
  validateBaseline(baseline);
  enforceReportAgainstBaseline(report, baseline);
  const metadata = report.metadata.vulnerabilities;
  console.log(`Full-tree audit: ${metadata.total} findings (${metadata.high} high, ${metadata.moderate} moderate).`);
  if (metadata.total === 0) console.log("Genuine clean audit report validated.");
  console.log("Audit report and baseline structure validated.");
}

main();
