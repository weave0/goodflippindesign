#!/usr/bin/env node

const fs = require("node:fs");

const [reportPath, baselinePath] = process.argv.slice(2);

if (!reportPath || !baselinePath) {
  console.error(
    "Usage: node scripts/audit-policy.js <audit-report.json> <baseline.json>",
  );
  process.exit(2);
}

function readJson(path) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (error) {
    console.error(`Unable to read JSON file ${path}: ${error.message}`);
    process.exit(2);
  }
}

const report = readJson(reportPath);
const baseline = readJson(baselinePath);
const findings = report.vulnerabilities || {};
const baselinePackages = baseline.packages || {};
const newFindings = [];
let inheritedCount = 0;

for (const [name, finding] of Object.entries(findings)) {
  const known = baselinePackages[name];
  const advisoryIds = new Set(
    (finding.via || [])
      .filter((entry) => typeof entry === "object" && entry.source != null)
      .map((entry) => String(entry.source)),
  );

  if (!known) {
    newFindings.push({
      name,
      reason: "new package finding",
      severity: finding.severity,
    });
    continue;
  }

  const knownIds = new Set((known.advisories || []).map(String));
  const addedAdvisories = [...advisoryIds].filter((id) => !knownIds.has(id));
  const severityEscalated =
    known.severity &&
    known.severity !== finding.severity &&
    ["moderate", "high", "critical"].indexOf(finding.severity) >
      ["moderate", "high", "critical"].indexOf(known.severity);

  if (addedAdvisories.length || severityEscalated) {
    newFindings.push({
      name,
      reason: addedAdvisories.length
        ? `new advisories: ${addedAdvisories.join(", ")}`
        : "severity increased",
      severity: finding.severity,
    });
  } else {
    inheritedCount += 1;
  }
}

const metadata = report.metadata?.vulnerabilities || {};
console.log(
  `Full-tree audit: ${metadata.total ?? Object.keys(findings).length} findings ` +
    `(${metadata.high ?? 0} high, ${metadata.moderate ?? 0} moderate); ` +
    `${inheritedCount} governed baseline findings remain visible.`,
);
for (const [name, finding] of Object.entries(findings)) {
  if (!newFindings.some((entry) => entry.name === name)) {
    console.log(`- inherited: ${name} (${finding.severity})`);
  }
}

if (newFindings.length) {
  console.error("New or worsened audit findings detected:");
  for (const finding of newFindings) {
    console.error(`- ${finding.name}: ${finding.reason} (${finding.severity})`);
  }
  process.exit(1);
}

console.log("No new or worsened full-tree findings detected.");
