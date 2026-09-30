import { VERIFICATION_SCOPES } from "../../workers/lib/mission-control-work-items.js";

// The one canonical scope set: the same VERIFICATION_SCOPES Mission Control qualification and the
// readiness analyzer use, so a registry that passes `estate:validate` cannot later fail qualification
// with "unsupported verificationScope".
export function verificationDeclarationProblems(domain, operating) {
  const problems = [];
  const scope = operating?.verification_scope;
  if (scope !== undefined) {
    if (typeof scope !== "string" || !scope.trim()) {
      problems.push(`${domain}: operating.verification_scope must be a non-empty string when declared`);
    } else if (!VERIFICATION_SCOPES.includes(scope)) {
      problems.push(`${domain}: operating.verification_scope "${scope}" is not a supported Mission Control scope (${VERIFICATION_SCOPES.join(", ")})`);
    }
  }
  const predicate = operating?.verification_predicate;
  if (predicate !== undefined && (typeof predicate !== "string" || !predicate.trim())) {
    problems.push(`${domain}: operating.verification_predicate must be a non-empty string when declared`);
  }
  return problems;
}
