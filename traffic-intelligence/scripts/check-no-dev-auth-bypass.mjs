// Fails the build if the local-dev admin-gate bypass (src/main.tsx) survives into a production bundle.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MARKER = "data-ti-local-dev-auth-bypass";
const dist = fileURLToPath(new URL("../dist/", import.meta.url));

const leaks = readdirSync(dist, { recursive: true })
  .filter((file) => /\.(js|html|css|map)$/.test(file))
  .filter((file) => readFileSync(join(dist, file), "utf8").includes(MARKER));

if (leaks.length) {
  console.error(`Local dev auth bypass found in production bundle: ${leaks.join(", ")}`);
  process.exit(1);
}
console.log("check-no-dev-auth-bypass: production bundle is gated");
