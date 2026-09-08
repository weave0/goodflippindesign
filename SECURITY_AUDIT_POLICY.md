# npm Audit Policy

The repository has two distinct dependency security surfaces:

- Production dependencies are a hard gate. CI first verifies that the lockfile's production dependency closure contains no development-only or optional packages, then runs `npm audit --omit=dev --omit=optional --audit-level=moderate`. The optional omission is safe for this repository because its only root production dependency is `@sentry/cloudflare`; the graph check fails if that changes and an optional production path appears.
- The complete development tree is audited separately. CI stores the JSON report in the job workspace and compares it with `security/npm-audit-baseline.json` using `scripts/audit-policy.js`.

The full-tree policy fails when a pull request introduces a new vulnerable package, a new advisory for a governed package, or a severity increase. Existing development-only findings remain visible and report-only until they are remediated. The baseline is not an assertion that those packages are safe; it records inherited debt so unrelated changes are not falsely treated as its cause.

To refresh the baseline, first review the complete audit report and remediation path. Update the baseline only when the inherited finding set is intentionally accepted, and include the source commit and rationale in the JSON file. Do not use `npm audit fix --force` or suppress the audit with `|| true` without running the policy comparison afterward.

The current baseline contains 13 development-tree package findings: 12 high and 1 moderate. The production dependency graph is currently clean under the guarded production audit. Cloudflare deployment configuration is outside this policy and is not changed by the Node 24 modernization.
