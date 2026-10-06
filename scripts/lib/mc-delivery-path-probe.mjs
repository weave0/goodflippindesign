/**
 * Credential-less proof that the FWOMPS host's REAL delivery transport reaches the Worker, run BEFORE any production
 * mutation (and with the canary OFF: the route it touches is refused by authentication, independent of the kill switch).
 *
 * Why: the canary item is single-attempt by design (BRIDGE_MAX_ATTEMPTS = 1) and only a human admin can expire an
 * abandoned lease. The first real production delivery (MC-CONFLUENCE-002, 2026-10-06) was blocked at the Cloudflare edge
 * (`403 error code: 1010`, Python's default urllib signature) and surfaced as `delivery_refused_auth`, spending the one
 * attempt. A node `fetch`, a unit test or a local origin can never see that. Only the host's own transport against the real
 * origin can, so this runs it with a deliberately invalid bearer against a work item that cannot exist:
 *
 *   OK      HTTP 401 with a JSON object body: the Worker itself evaluated and refused the fake bearer.
 *   FAIL    403 with Cloudflare's `error code: NNNN` text: blocked at the edge before the Worker saw the request.
 *   FAIL    anything else (unexpected status, non-JSON, transport error, host transport unavailable).
 *
 * Nothing here can create, change, lease or dispatch anything: the item id is the all-zero id, the bearer is a fixed
 * non-credential string, and the Worker refuses at authentication.
 */

import { spawnSync } from 'node:child_process';

export const PROBE_BEARER = 'mc-delivery-path-probe-not-a-credential';
export const NIL_WORK_ITEM_ID = `gfdwi_v1_${'0'.repeat(64)}`;

// Runs inside the host's Python, importing the host's own published transport. Prints exactly one JSON line.
const PROBE_SCRIPT = [
  'import json, sys',
  'try:',
  '    from fwomps.mission_control.delivery import urllib_transport',
  '    r = urllib_transport(sys.argv[1], b"{}", {"Authorization": "Bearer " + sys.argv[2], "Content-Type": "application/json", "Accept": "application/json"}, 15.0)',
  '    print(json.dumps({"status": r.status, "body": r.body[:300].decode("utf-8", "replace")}))',
  'except Exception as error:',
  '    print(json.dumps({"error": type(error).__name__}))',
].join('\n');

/** Pure. @param output { status, body } | { error } | null */
export function judgeDeliveryProbe(output) {
  if (!output || typeof output !== 'object') return { ok: false, verdict: 'no_output', detail: 'the host transport produced no result' };
  if (output.error) return { ok: false, verdict: 'transport_unavailable', detail: `the host transport failed before a response (${String(output.error).slice(0, 40)})` };
  const status = Number(output.status);
  const body = typeof output.body === 'string' ? output.body : '';
  if (status === 401) {
    let parsed = null;
    try { parsed = JSON.parse(body); } catch { /* not JSON */ }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed.error === 'string') return { ok: true, verdict: 'worker_refused_fake_bearer', detail: 'HTTP 401 from the Worker (JSON): the delivery path reaches the origin' };
    return { ok: false, verdict: 'unexpected_401', detail: 'HTTP 401 but not the Worker\'s JSON refusal' };
  }
  // Cloudflare edge blocks answer either `error code: 1010` (plain text) or an RFC 9457 JSON problem when Accept is JSON.
  const edgeText = /^error code:\s*\d{3,5}\s*$/i.test(body.trim());
  const edgeJson = /developers\.cloudflare\.com\/support\/troubleshooting|"error_code"\s*:\s*1\d{3}\b/.test(body);
  if (status === 403 && (edgeText || edgeJson)) {
    const code = /(?:error code:\s*|"error_code"\s*:\s*)(\d{3,5})/i.exec(body)?.[1] ?? 'unknown';
    return { ok: false, verdict: 'edge_blocked', detail: `HTTP 403, Cloudflare error ${code}: blocked at the edge before the Worker; the host transport signature is refused` };
  }
  return { ok: false, verdict: 'unexpected_response', detail: `unexpected HTTP ${Number.isFinite(status) ? status : 'status'} from the delivery path` };
}

/** Runs the host transport (python from the host checkout) once. Returns { ok, verdict, detail, status }. */
export function runDeliveryPathProbe({ origin, python, fwompsRepo, spawn = spawnSync, timeoutMs = 60000 }) {
  if (!fwompsRepo) return { ok: false, verdict: 'no_host_repo', detail: 'FWOMPS_REPO is not set', status: null };
  const url = `${String(origin).replace(/\/$/, '')}/api/mission-control/work-items/${NIL_WORK_ITEM_ID}/result`;
  const run = spawn(python || 'python', ['-c', PROBE_SCRIPT, url, PROBE_BEARER], {
    cwd: fwompsRepo, encoding: 'utf8', timeout: timeoutMs, windowsHide: true,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, PYTHONPATH: fwompsRepo, PYTHONIOENCODING: 'utf-8' },
  });
  let output = null;
  try { output = JSON.parse(String(run.stdout || '').trim().split('\n').pop() || 'null'); } catch { /* judged below */ }
  const verdict = judgeDeliveryProbe(output);
  return { ...verdict, status: output && Number.isFinite(Number(output.status)) ? Number(output.status) : null };
}
