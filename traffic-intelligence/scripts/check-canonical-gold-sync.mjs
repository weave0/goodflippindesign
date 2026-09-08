import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const consumerRoot = resolve(import.meta.dirname, "..");
const producerRoot = process.env.CANONICAL_GOLD_SOURCE_ROOT
  ? resolve(process.env.CANONICAL_GOLD_SOURCE_ROOT)
  : resolve(consumerRoot, "..", "..", "gfd-traffic-intelligence");
const expectedCommit = "2a3bce3a7e5761a25a6412e6f7aab4fb781d7c40";
const files = [
  [
    "public/gold/canonical-gold-m1.2.json",
    "schemas/fixtures/canonical-gold-m1.2.json",
  ],
  ["schema/gold-layer-1.2.schema.json", "schemas/gold-layer-1.2.schema.json"],
];

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function fail(message) {
  throw new Error(`Canonical Gold sync failed: ${message}`);
}

if (!existsSync(producerRoot)) {
  fail(`producer checkout not found at ${producerRoot}; set CANONICAL_GOLD_SOURCE_ROOT`);
}

let producerCommit;
try {
  producerCommit = execFileSync("git", ["-C", producerRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
} catch (error) {
  fail(`cannot read producer Git SHA: ${error.message}`);
}
if (producerCommit !== expectedCommit) {
  fail(`producer checkout is ${producerCommit}, expected ${expectedCommit}`);
}

for (const [consumerRelative, producerRelative] of files) {
  const consumerPath = resolve(consumerRoot, consumerRelative);
  const producerPath = resolve(producerRoot, producerRelative);
  if (!existsSync(consumerPath) || !existsSync(producerPath)) {
    fail(`missing synchronized artifact: ${consumerRelative} or ${producerRelative}`);
  }
  const consumerHash = sha256(consumerPath);
  const producerHash = sha256(producerPath);
  if (consumerHash !== producerHash) {
    fail(`${consumerRelative} differs from producer ${producerRelative}`);
  }
  console.log(`canonical-sync ${consumerRelative} ${consumerHash}`);
}

console.log(`canonical-sync producer=${producerCommit}`);
