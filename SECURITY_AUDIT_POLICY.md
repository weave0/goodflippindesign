# npm Audit Policy

The repository has two distinct dependency security surfaces:

- Production dependencies are a hard gate. CI first verifies that the lockfile's production dependency closure contains no development-only or optional packages, then runs `npm audit --omit=dev --omit=optional --audit-level=moderate`. The optional omission is safe for this repository because its only root production dependency is `@sentry/cloudflare`; the graph check fails if that changes and an optional production path appears.
- The complete development tree is audited separately. CI stores the JSON report in the job workspace, validates npm metadata and exit status with `scripts/audit-policy.js`, and compares the baseline with the trusted pull-request base revision using `scripts/compare-audit-baseline.js`.

The full-tree policy fails when a pull request introduces a new vulnerable package, a new advisory for a governed package, or a severity increase. Existing development-only findings remain visible and report-only until they are remediated. The baseline is a non-expanding debt ceiling: ordinary pull requests may remove packages, advisories, or severity, but may not add them relative to the trusted base revision.

PR #254 establishes the first baseline. Because its base revision has no baseline file, CI permits bootstrap only when the new baseline exactly equals the current validated audit report. Future pull requests always compare against the baseline from their actual base SHA; a same-PR baseline expansion cannot approve itself.

To refresh the baseline, first review the complete audit report and remediation path. Update the baseline only by narrowing inherited debt in an ordinary pull request. Do not use `npm audit fix --force` or suppress the audit with `|| true` without running the policy comparison afterward. Missing metadata, inconsistent counts, malformed JSON, unexpected npm exit statuses, and stale metadata fail closed.

The current baseline contains 13 development-tree package findings: 12 high and 1 moderate. The production dependency graph is currently clean under the guarded production audit. Cloudflare deployment configuration is outside this policy and is not changed by the Node 24 modernization.
