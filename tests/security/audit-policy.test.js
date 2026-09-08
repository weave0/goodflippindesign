#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const policy = path.join(root, "scripts/audit-policy.js");
const compare = path.join(root, "scripts/compare-audit-baseline.js");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gfd-audit-policy-"));

function write(name, value) {
  const file = path.join(temp, name);
  fs.writeFileSync(file, JSON.stringify(value));
  return file;
}

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

function report(findings, exit = Object.keys(findings).length ? 1 : 0) {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  for (const finding of Object.values(findings)) counts[finding.severity] += 1;
  return { value: {
    metadata: { vulnerabilities: { ...counts, total: Object.keys(findings).length } },
    vulnerabilities: findings,
  }, exit };
}

const finding = (severity, source) => ({
  severity,
  via: [{ source, name: "fixture", title: "fixture", range: "*" }],
});
const clean = report({});
const inherited = report({ alpha: finding("high", 1001), beta: finding("moderate", 1002) });
const baseline = { packages: {
  alpha: { severity: "high", advisories: ["1001"] },
  beta: { severity: "moderate", advisories: ["1002"] },
} };
const baselineFile = write("baseline.json", baseline);

function policyFor(result, baselineValue = baseline, exit = result.exit) {
  const outcome = run(policy, [write("report.json", result.value), write("policy-baseline.json", baselineValue), String(exit)]);
  return outcome;
}

function compareFor(current, trusted, result = inherited.value) {
  const currentBaseline = current.packages ? current : { packages: current };
  const trustedPath = trusted === null
    ? path.join(temp, "trusted-baseline-missing.json")
    : write("trusted.json", trusted.packages ? trusted : { packages: trusted });
  return run(compare, [write("current.json", currentBaseline), trustedPath, write("compare-report.json", result)]);
}

assert.equal(policyFor(inherited).status, 0, "current inherited baseline passes");
assert.equal(policyFor(clean, { packages: {} }, 0).status, 0, "genuine clean report passes");
assert.equal(policyFor(report({ alpha: finding("high", 1001) }), { packages: { alpha: baseline.packages.alpha } }).status, 0, "finding removal passes");
assert.equal(policyFor(report({ alpha: { severity: "high", via: [] }, beta: finding("moderate", 1002) })).status, 0, "advisory removal passes");
assert.equal(policyFor(report({ alpha: finding("moderate", 1001), beta: finding("moderate", 1002) })).status, 0, "severity reduction passes");

assert.notEqual(policyFor(report({ alpha: finding("high", 1001), gamma: finding("high", 1003) })).status, 0, "new package fails");
assert.notEqual(policyFor(report({ alpha: { severity: "high", via: [{ source: 1001 }, { source: 1004 }] }, beta: finding("moderate", 1002) })).status, 0, "new advisory fails");
assert.notEqual(policyFor(report({ alpha: finding("critical", 1001), beta: finding("moderate", 1002) })).status, 0, "severity increase fails");

const missingMetadata = { value: { vulnerabilities: inherited.value.vulnerabilities }, exit: 1 };
assert.notEqual(policyFor(missingMetadata).status, 0, "missing metadata fails");
const malformed = path.join(temp, "malformed.json");
fs.writeFileSync(malformed, "not json");
assert.notEqual(run(policy, [malformed, baselineFile, "1"]).status, 0, "malformed report fails");
const stale = { metadata: { vulnerabilities: { info: 0, low: 0, moderate: 1, high: 0, critical: 0, total: 1 } }, vulnerabilities: {} };
assert.notEqual(policyFor({ value: stale, exit: 1 }).status, 0, "stale metadata fails");
assert.notEqual(policyFor(inherited, baseline, 2).status, 0, "unexpected audit failure fails");

assert.equal(compareFor({ alpha: baseline.packages.alpha }, baseline).status, 0, "baseline reduction passes");
assert.notEqual(compareFor({ ...baseline.packages, gamma: { severity: "high", advisories: ["1003"] } }, baseline).status, 0, "baseline package expansion fails");
assert.notEqual(compareFor({ ...baseline.packages, alpha: { severity: "high", advisories: ["1001", "1004"] } }, baseline).status, 0, "baseline advisory expansion fails");
assert.notEqual(compareFor({ ...baseline.packages, beta: { severity: "high", advisories: ["1002"] } }, baseline).status, 0, "baseline severity expansion fails");
assert.notEqual(compareFor({ alpha: baseline.packages.alpha }, { packages: {} }).status, 0, "disappearance/reappearance fails");
assert.equal(compareFor(baseline.packages, null, inherited.value).status, 0, "initial bootstrap passes");

console.log("Audit policy hostile tests passed.");
