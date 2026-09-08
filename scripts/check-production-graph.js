#!/usr/bin/env node

const fs = require("node:fs");

const lockfile = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const root = lockfile.packages?.[""] || {};
const packages = lockfile.packages || {};
const roots = Object.keys(root.dependencies || {});
const visited = new Set();
const violations = [];

function resolvePackage(parentPath, name) {
  let current = parentPath;
  while (current) {
    const candidate = `${current}/node_modules/${name}`;
    if (packages[candidate]) return candidate;
    const next = current.slice(0, current.lastIndexOf("/node_modules/"));
    if (next === current) break;
    current = next;
  }
  return packages[`node_modules/${name}`] ? `node_modules/${name}` : null;
}

function visit(packagePath) {
  if (!packagePath || visited.has(packagePath)) return;
  visited.add(packagePath);
  const entry = packages[packagePath];
  if (!entry) return;

  if (entry.dev || entry.devOptional) {
    violations.push(`${packagePath} is marked as development-only`);
  }
  if (entry.optional) {
    violations.push(`${packagePath} is an optional production dependency; do not omit optional packages`);
  }

  for (const name of Object.keys(entry.dependencies || {})) {
    visit(resolvePackage(packagePath, name));
  }
  for (const name of Object.keys(entry.optionalDependencies || {})) {
    visit(resolvePackage(packagePath, name));
  }
}

for (const name of roots) visit(resolvePackage("", name));

if (violations.length) {
  console.error("Production dependency graph contains packages that cannot be omitted:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`Production graph verified: ${visited.size} non-development packages.`);
