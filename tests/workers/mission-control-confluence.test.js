/**
 * MC-CONFLUENCE-001 (#371) — permanent confluence gate, tier 1 (runs in merge-blocking CI).
 *
 *   AIAIMate health observation -> canonical work item -> registry qualification -> signed contract
 *   -> durable investigation_dispatch intent -> claim -> signed lease -> FWOMPS wire -> authenticated
 *   result through the real worker route -> same work item DIAGNOSED
 *
 * Everything on the GFD side is real: D1 persistence, the workers/auth.js entry (routing + bearer
 * roles), the health-sweep observation path, the estate registry binding, the outbox module's
 * published API. The FWOMPS side is the pinned wire contract (#368 vectors): results are signed
 * with the worker key exactly as FWOMPS signs them. Tier 2
 * (tests/acceptance/, docs/mission-control-confluence-gate.md) drives the real FWOMPS CLI in its
 * attested sandbox against a real-D1 GFD endpoint; this file never claims that.
 *
 * Nothing here imports FWOMPS internals and nothing here grants repair, promotion or deploy authority.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';

import worker from '../../workers/auth.js';
import { reportToGitHub } from '../../workers/health-sweep.js';
import { createD1WorkItemStore, ensureWorkItemSchema } from '../../workers/mission-control-work-items.js';
import { keyBytesFromEnv, signResultEnvelope } from '../../workers/fwomps-investigation-adapter.js';
import {
  abandonEffect,
  claimDispatch,
  dispatchOnce,
  ensureOutboxSchema,
  loadEffect,
  planEffect,
  recordReceipt,
} from '../../workers/lib/mission-control-outbox.js';

const SECRET = 'sk_test_mission_control';
const CONTRACT_KEY = 'mission-control-test-key';
const RESULT_KEY = 'mission-control-result-key';
const WORKER_TOKEN = 'mission-control-worker-token-test';
const WORKER_ID = 'fwomps-worker-a';
const REVISION = '257210036bff85961a1b9c96c0572aabcaaa9cd4';
const PROFILE = 'web-health-readonly-v1';
const FINDING_KEY = 'health:aiaimate:machine_contract_mismatch';

const target = {
  id: 'aiaimate',
  brand: 'aiaimate',
  name: 'AI Aimate',
  url: 'https://aiaimate.com',
  sweepUrl: 'https://aiaimate.com/api/health',
  checkType: 'page',
  expectedKeyword: 'gfd-property-health',
  machineContract: {
    contract: 'gfd-property-health',
    contractVersion: 1,
    propertyId: 'aiaimate.com',
    productId: 'aiaimate',
    status: 'ok',
  },
};
const degraded = {
  target,
  overall_status: 'warn',
  finding_kind: 'machine_contract_mismatch',
  status_code: 200,
  response_time_ms: 180,
  keyword_found: 0,
  content_keyword: 'machine:gfd-property-health',
  content_detail: 'propertyId expected "aiaimate.com", got "wrong.example"',
  error: null,
};

// ---------------------------------------------------------------------------------------------
// harness: published boundaries only
// ---------------------------------------------------------------------------------------------

function bearer(payload) {
  const body = btoa(JSON.stringify(payload)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
  return `header.${body}.signature`;
}
const adminToken = () => bearer({ sid: 'sess_admin', sub: 'user_admin', exp: Math.floor(Date.now() / 1000) + 3600 });

function testEnv(overrides = {}) {
  return {
    ...env,
    CLERK_SECRET_KEY: SECRET,
    CLERK_SECRET_KEY_GFD: SECRET,
    MISSION_CONTROL_GITHUB_TOKEN: 'gh_test',
    MISSION_CONTROL_CONTRACT_KEY: CONTRACT_KEY,
    MISSION_CONTROL_CONTRACT_KEY_ID: 'gfd-mission-control-test',
    MISSION_CONTROL_RESULT_KEY: RESULT_KEY,
    MISSION_CONTROL_RESULT_KEY_ID: 'gfd-result-test',
    MISSION_CONTROL_RESULT_WORKER_ID: WORKER_ID,
    MISSION_CONTROL_WORKER_TOKEN: WORKER_TOKEN,
    ...overrides,
  };
}

function call(path, { method = 'POST', auth, workerAuth, body } = {}) {
  return worker.fetch(new Request(`https://goodflippindesign.com${path}`, {
    method,
    headers: {
      ...((workerAuth || auth) ? { Authorization: `Bearer ${workerAuth || auth}` } : {}),
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), testEnv());
}

// Routes the two outbound services the chain touches: Clerk (operator session) and the GitHub
// incident issue the sweep manages. The GitHub side is stateful so a repeat observation updates the
// same issue, exactly like production.
let ghIssues = [];
function stubOutbound() {
  const issues = [];
  ghIssues = issues;
  vi.stubGlobal('fetch', vi.fn(async (input, init = {}) => {
    const url = String(input?.url || input);
    if (url.includes('api.clerk.com')) {
      return new Response(JSON.stringify({
        user: { id: 'user_admin', emailAddress: 'ops@example.com', publicMetadata: { role: 'admin' } },
      }), { status: 200 });
    }
    if (url.includes('api.github.com')) {
      const method = init.method || 'GET';
      if (method === 'GET') return new Response(JSON.stringify(issues), { status: 200 });
      const payload = JSON.parse(init.body || '{}');
      if (method === 'POST') {
        const issue = { number: 900 + issues.length, title: payload.title, body: payload.body };
        issues.push(issue);
        return new Response(JSON.stringify({ number: issue.number }), { status: 201 });
      }
      const number = Number(url.split('/').pop());
      const issue = issues.find((entry) => entry.number === number);
      Object.assign(issue, { title: payload.title ?? issue.title, body: payload.body ?? issue.body });
      return new Response(JSON.stringify({ number }), { status: 200 });
    }
    throw new Error(`unexpected outbound call in confluence harness: ${url}`);
  }));
}

const observe = (at) => reportToGitHub([degraded], at, { GITHUB_TOKEN: 'test-token', DB: env.DB });

// A healthy production observation of one target, entering through the same sweep path as a degraded one.
const healthyCheck = (checkTarget = target) => ({
  target: checkTarget,
  overall_status: 'pass',
  finding_kind: null,
  status_code: 200,
  response_time_ms: 120,
  keyword_found: 1,
  content_keyword: 'machine:gfd-property-health',
  content_detail: null,
  error: null,
});
const observeHealthy = (offsetMs, checkTarget = target) => (
  reportToGitHub([healthyCheck(checkTarget)], at(offsetMs), { GITHUB_TOKEN: 'test-token', DB: env.DB })
);
const store = () => createD1WorkItemStore(env.DB);
async function currentItem() {
  const items = (await store().list()).filter((item) => item.findingKey === FINDING_KEY);
  expect(items).toHaveLength(1);
  return items[0];
}

const enc = encodeURIComponent;
const itemPath = (item, action) => `/api/mission-control/work-items/${enc(item.workItemId)}/${action}`;
const operator = (item, action, body) => call(itemPath(item, action), { auth: adminToken(), body });
const workerCall = (item, action, body) => call(itemPath(item, action), { workerAuth: WORKER_TOKEN, body });

async function eventCount(workItemId, toState) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM mc_work_item_events WHERE work_item_id = ? AND event_type = 'transition' AND to_state = ?",
  ).bind(workItemId, toState).first();
  return Number(row.n);
}
async function leaseRowCount(workItemId) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM mc_work_item_leases WHERE work_item_id = ?')
    .bind(workItemId).first();
  return Number(row.n);
}

// What FWOMPS sends. Field-for-field the pinned mc-fw-investigation-result-1 envelope; signed with
// the worker result key. The execution receipts describe a read-only, attested-sandbox run.
const sign = (unsigned, keyText = RESULT_KEY) => signResultEnvelope(unsigned, keyBytesFromEnv(keyText));

function fwompsResult(chain, patch = {}) {
  const { item, contract, leaseGrant } = chain;
  const investigation = chain.issued.workItem.investigation;
  return {
    schema_version: 'mc-fw-investigation-result-1',
    request_id: investigation.requestId,
    contract_digest: investigation.digest,
    attempt: leaseGrant.attempt,
    lease_token_digest: leaseGrant.lease_token_digest,
    worker: { id: WORKER_ID, fwomps_version: '0.1.0', completed_at: new Date().toISOString() },
    source: {
      property_id: item.propertyId,
      repository: 'weave0/aiaimate',
      workspace_name: 'aiaimate',
      inspected_head_sha: REVISION,
      source_state: 'accepted_by_host_policy',
    },
    evidence: {
      revision: REVISION,
      snapshot_digest: contract.evidence.snapshot_digest,
      diagnostic_id: item.workItemId,
      diagnostic_digest: contract.diagnostic.digest,
    },
    outcome: 'reproduced',
    summary: `profile ${PROFILE}: reproduced`,
    observations: ['command 1: fail (exit 1)'],
    execution_receipts: [{
      profile: PROFILE, index: 0, status: 'fail', exit_code: 1,
      output_digest: `sha256:${'5'.repeat(64)}`, stdout_excerpt: '', stderr_excerpt: 'mismatch',
      output_truncated: false, timed_out: false, authoritative_sandbox: true,
    }],
    repairability: { state: 'not_indicated', advisory_repair_scope: [] },
    stop_reason: null,
    authentication: { key_id: 'gfd-result-test' },
    ...patch,
  };
}

const postResult = (chain, envelope) => workerCall(chain.item, 'result', envelope);

/**
 * Every hostile delivery must be refused by its OWN named fence. A generic 4xx is not evidence: it
 * would also pass if the intended fence were removed and some earlier validation layer caught the case.
 */
async function expectRefusedBy(response, code, label) {
  const body = await response.json().catch(() => ({}));
  expect({ label, status: response.status, code: body.code }).toEqual({ label, status: response.status, code });
  expect(response.status, label).toBeGreaterThanOrEqual(400);
}

// Times are relative to the start of the run: the lease route checks the claim window against the real clock.
const BASE = Date.now();
const at = (offsetMs) => new Date(BASE + offsetMs).toISOString();

/** Observation -> qualified via the real registry -> signed contract -> durable intent. */
async function readyWithIntent() {
  await observe(at(0));
  let item = await currentItem();
  expect(item.state).toBe('OBSERVED');

  const qualified = await operator(item, 'transition', { to: 'QUALIFIED' });
  expect(qualified.status).toBe(200);
  item = (await qualified.json()).workItem;
  expect(item).toMatchObject({
    state: 'QUALIFIED',
    repository: 'weave0/aiaimate',
    investigationProfile: PROFILE,
    verificationProfile: 'gfd-property-health-production',
    verificationScope: 'production',
  });

  const issuedResponse = await operator(item, 'investigate', { evidenceRevision: REVISION });
  expect(issuedResponse.status).toBe(200);
  const issued = await issuedResponse.json();
  item = issued.workItem;
  expect(item.state).toBe('INVESTIGATION_READY');
  expect(issued.contract.contract.authority?.repair ?? false).not.toBe(true);

  const intent = await planEffect(env.DB, {
    workItemId: item.workItemId,
    requestedLifecycleVersion: item.lifecycleVersion,
    effectType: 'investigation_dispatch',
    target: `fwomps:${item.propertyId}`,
    candidateDigest: issued.workItem.investigation.digest, // one intent per signed contract
    payload: {
      summary: 'dispatch one bounded read-only investigation',
      propertyId: item.propertyId,
      findingKey: item.findingKey,
      profileId: PROFILE,
    },
    now: at(1_000),
  });
  expect(intent.created).toBe(true);
  expect(intent.effect).toMatchObject({ status: 'PLANNED', attemptCount: 0, effectType: 'investigation_dispatch' });
  return { item, issued, contract: issued.contract, effectId: intent.effect.effectId };
}

/**
 * The dispatcher is the only piece of composition in this file: claim -> lease -> FWOMPS -> deliver ->
 * receipt, using only published calls. `fwomps` decides what the black box does.
 */
async function dispatch(chain, { now = at(2_000), fwomps = 'deliver' } = {}) {
  let executions = 0;
  const outcome = await dispatchOnce(env.DB, chain.effectId, async (permit) => {
    executions += 1;
    const leased = await workerCall(chain.item, 'lease', { effect_id: permit.effectId, attempt: permit.attempt });
    if (leased.status !== 200) return { outcome: 'failed', reason: `lease refused (${leased.status})` };
    const body = await leased.json();
    chain.leaseGrant = body.leaseGrant;
    chain.leaseTokenHex = body.leaseTokenHex;
    if (fwomps === 'crash') throw new Error('executor crashed after the lease was issued');
    const envelope = await sign(fwompsResult(chain));
    chain.envelope = envelope;
    const delivered = await postResult(chain, envelope);
    if (delivered.status !== 200) return { outcome: 'failed', reason: `result refused (${delivered.status})` };
    const accepted = (await delivered.json()).workItem;
    return { outcome: 'committed', receipt: accepted.diagnosis.resultDigest };
  }, { now });
  return { outcome, executions };
}

/** Claims the intent and leases under that claim, exactly as a dispatcher would. Returns the lease grant. */
async function claimAndLease(chain, now = at(2_000)) {
  const claim = await claimDispatch(env.DB, chain.effectId, { now });
  chain.permit = claim.permit;
  const response = await workerCall(chain.item, 'lease', { effect_id: chain.effectId, attempt: claim.permit.attempt });
  expect(response.status).toBe(200);
  const body = await response.json();
  chain.leaseTokenHex = body.leaseTokenHex;
  return body.leaseGrant;
}

/** A second, fully fresh attempt after the first was abandoned (new contract, new intent). */
async function recoverAndRetry(chain) {
  const expired = await operator(chain.item, 'expire', {});
  expect(expired.status).toBe(200);
  let item = (await expired.json()).workItem;
  expect(item.state).toBe('QUALIFIED');
  const issuedResponse = await operator(item, 'investigate', { evidenceRevision: REVISION });
  expect(issuedResponse.status).toBe(200);
  const issued = await issuedResponse.json();
  item = issued.workItem;
  const intent = await planEffect(env.DB, {
    workItemId: item.workItemId,
    requestedLifecycleVersion: item.lifecycleVersion,
    effectType: 'investigation_dispatch',
    target: `fwomps:${item.propertyId}`,
    candidateDigest: issued.workItem.investigation.digest,
    payload: {
      summary: 'dispatch the recovered bounded read-only investigation',
      propertyId: item.propertyId,
      findingKey: item.findingKey,
      profileId: PROFILE,
    },
    now: at(10_000),
  });
  return { item, issued, contract: issued.contract, effectId: intent.effect.effectId };
}

async function expireLeaseNow(chain) {
  await env.DB.prepare('UPDATE mc_work_items SET lease_expires_at = ? WHERE work_item_id = ?')
    .bind('2020-01-01T00:00:00.000Z', chain.item.workItemId).run();
}

beforeEach(async () => {
  await ensureWorkItemSchema(env.DB);
  await ensureOutboxSchema(env.DB);
  for (const table of ['mc_work_item_events', 'mc_work_item_leases', 'mc_effects', 'mc_work_items']) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
  stubOutbound();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------------------------
// the closed loop
// ---------------------------------------------------------------------------------------------

describe('one problem, one identity, one closed loop (happy path)', () => {
  it('carries one AIAIMate observation to DIAGNOSED under the same canonical work item', async () => {
    await observe(at(0));
    const observed = await currentItem();
    const chain = await readyWithIntent();
    expect(chain.item.workItemId).toBe(observed.workItemId);
    expect(chain.item.workItemId.startsWith('gfdwi_v1_')).toBe(true);

    const { outcome, executions } = await dispatch(chain);
    expect(executions).toBe(1);
    expect(outcome).toMatchObject({ dispatched: true });
    expect(outcome.effect).toMatchObject({ status: 'COMMITTED', attemptCount: 1 });

    const done = await currentItem();
    expect(done.workItemId).toBe(observed.workItemId);
    expect(done.state).toBe('DIAGNOSED');
    expect(done.activeLease).toBeNull();
    expect(done.diagnosis.resultDigest).toBe(outcome.effect.receiptRef);
    expect(done.attemptsIssued).toBe(1);
    // One identity: exactly one work item, one intent, one diagnosis event, one lease row.
    expect((await store().list()).filter((item) => item.findingKey === FINDING_KEY)).toHaveLength(1);
    expect(await eventCount(done.workItemId, 'DIAGNOSED')).toBe(1);
    expect(await leaseRowCount(done.workItemId)).toBe(1);
    const leaseRow = await env.DB.prepare('SELECT released_at, release_reason FROM mc_work_item_leases WHERE work_item_id = ?')
      .bind(done.workItemId).first();
    expect(leaseRow.release_reason).toBe('result_accepted');
    expect(leaseRow.released_at).toBeTruthy();
  });

  it('records the intent durably before anything executes, and never grants repair authority', async () => {
    const chain = await readyWithIntent();
    const beforeExecution = await loadEffect(env.DB, chain.effectId);
    expect(beforeExecution.status).toBe('PLANNED');
    expect(beforeExecution.attemptCount).toBe(0);
    expect(beforeExecution.requestedLifecycleVersion).toBe(chain.item.lifecycleVersion);
    const untouched = await currentItem();
    expect(untouched.state).toBe('INVESTIGATION_READY');
    expect(untouched.activeLease).toBeNull();

    await dispatch(chain);
    const diagnosed = await currentItem();
    const events = await env.DB.prepare('SELECT detail_json FROM mc_work_item_events WHERE work_item_id = ?')
      .bind(diagnosed.workItemId).all();
    expect(JSON.stringify(events.results)).not.toMatch(/"repairAuthority":true|"repair_authority":true/);
    // Diagnosis alone never resolves production health.
    const resolved = await operator(diagnosed, 'transition', { to: 'RESOLVED' });
    expect(resolved.status).toBeGreaterThanOrEqual(400);
    expect((await currentItem()).state).toBe('DIAGNOSED');
  });

  it('keeps a fresh observation from disturbing a live investigation or a recorded diagnosis', async () => {
    const chain = await readyWithIntent();
    chain.leaseGrant = await claimAndLease(chain);
    expect(chain.permit.attempt).toBe(1);
    const before = await currentItem();
    expect(before.state).toBe('INVESTIGATING');

    await observe(at(60_000)); // re-observation while investigating
    const during = await currentItem();
    expect(during.state).toBe('INVESTIGATING');
    expect(during.activeLease).toEqual(before.activeLease);
    expect(during.investigation?.requestId).toBe(before.investigation?.requestId);
    expect(during.attemptsIssued).toBe(1);

    const posted = await postResult(chain, await sign(fwompsResult(chain)));
    expect(posted.status).toBe(200);
    const diagnosed = await currentItem();
    await observe(at(120_000)); // re-observation after diagnosis
    const after = await currentItem();
    expect(after.state).toBe('DIAGNOSED');
    expect(after.diagnosis).toEqual(diagnosed.diagnosis);
    expect(after.activeLease).toBeNull();
    expect(await eventCount(after.workItemId, 'DIAGNOSED')).toBe(1);
    expect((await store().list()).filter((item) => item.findingKey === FINDING_KEY)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
// hostile matrix (#371): every row converges idempotently or fails closed
// ---------------------------------------------------------------------------------------------

describe('hostile delivery', () => {
  it('duplicate identical delivery succeeds idempotently without a second transition', async () => {
    const chain = await readyWithIntent();
    const { executions } = await dispatch(chain);
    expect(executions).toBe(1);
    const again = await postResult(chain, chain.envelope);
    expect(again.status).toBe(200);
    expect(await eventCount(chain.item.workItemId, 'DIAGNOSED')).toBe(1);
    // The dispatch effect is terminal: a second dispatch never calls the executor again.
    let calls = 0;
    const second = await dispatchOnce(env.DB, chain.effectId, async () => { calls += 1; return { outcome: 'committed', receipt: 'x' }; }, { now: at(3_000) });
    expect(second).toMatchObject({ dispatched: false, reason: 'terminal' });
    expect(calls).toBe(0);
  });

  it('concurrent identical deliveries all succeed with exactly one commit', async () => {
    const chain = await readyWithIntent();
    chain.leaseGrant = await claimAndLease(chain);
    const envelope = await sign(fwompsResult(chain));
    const responses = await Promise.all([1, 2, 3, 4].map(() => postResult(chain, envelope)));
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
    expect(await eventCount(chain.item.workItemId, 'DIAGNOSED')).toBe(1);
    expect((await currentItem()).state).toBe('DIAGNOSED');
  });

  it('concurrent different results: exactly one wins, the other fails closed', async () => {
    const chain = await readyWithIntent();
    chain.leaseGrant = await claimAndLease(chain);
    const a = await sign(fwompsResult(chain));
    const b = await sign(fwompsResult(chain, {
      outcome: 'not_reproduced',
      summary: `profile ${PROFILE}: not_reproduced`,
      execution_receipts: [{ ...fwompsResult(chain).execution_receipts[0], status: 'pass', exit_code: 0 }],
    }));
    const responses = await Promise.all([postResult(chain, a), postResult(chain, b)]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    await expectRefusedBy(responses.find((r) => r.status === 409), 'result_conflict', 'losing concurrent different result');
    expect(await eventCount(chain.item.workItemId, 'DIAGNOSED')).toBe(1);
  });

  it('a different validly signed result after acceptance fails closed as result_conflict and changes nothing', async () => {
    const chain = await readyWithIntent();
    chain.leaseGrant = await claimAndLease(chain);
    const first = await postResult(chain, await sign(fwompsResult(chain)));
    expect(first.status).toBe(200);
    const accepted = await currentItem();
    const different = await sign(fwompsResult(chain, {
      outcome: 'not_reproduced',
      summary: `profile ${PROFILE}: not_reproduced`,
      execution_receipts: [{ ...fwompsResult(chain).execution_receipts[0], status: 'pass', exit_code: 0 }],
    }));
    await expectRefusedBy(await postResult(chain, different), 'result_conflict', 'different result after acceptance');
    const after = await currentItem();
    expect(after.diagnosis).toEqual(accepted.diagnosis);
    expect(await eventCount(chain.item.workItemId, 'DIAGNOSED')).toBe(1);
  });

  it('rejects a wrong lease token, a wrong attempt, and every mismatched identity echo', async () => {
    const chain = await readyWithIntent();
    chain.leaseGrant = await claimAndLease(chain);
    const good = fwompsResult(chain);
    const WRONG_SHA = 'b'.repeat(40);
    // Each mutation keeps the envelope valid through every EARLIER layer (signature, closed schema,
    // source/evidence consistency) so it reaches, and is refused by, the fence it is named for.
    const cases = {
      wrongLeaseToken: [{ lease_token_digest: `sha256:${'9'.repeat(64)}` }, 'lease_mismatch'],
      wrongAttempt: [{ attempt: 2 }, 'attempt_mismatch'],
      wrongRequest: [{ request_id: 'mci_someone_elses_request' }, 'request_mismatch'],
      wrongContract: [{ contract_digest: `sha256:${'7'.repeat(64)}` }, 'digest_mismatch'],
      // BOTH fields move to the same wrong SHA: internally consistent, so only the signed-contract binding can refuse it.
      wrongEvidenceRevision: [{ evidence: { ...good.evidence, revision: WRONG_SHA }, source: { ...good.source, inspected_head_sha: WRONG_SHA } }, 'digest_mismatch'],
      wrongSnapshot: [{ evidence: { ...good.evidence, snapshot_digest: `sha256:${'8'.repeat(64)}` } }, 'digest_mismatch'],
      wrongDiagnosticDigest: [{ evidence: { ...good.evidence, diagnostic_digest: `sha256:${'6'.repeat(64)}` } }, 'digest_mismatch'],
      wrongWorkItem: [{ evidence: { ...good.evidence, diagnostic_id: 'gfdwi_v1_someone_else' } }, 'identity_mismatch'],
      wrongRepository: [{ source: { ...good.source, repository: 'weave0/other' } }, 'identity_mismatch'],
      wrongProperty: [{ source: { ...good.source, property_id: 'other.com' } }, 'identity_mismatch'],
    };
    for (const [name, [patch, code]] of Object.entries(cases)) {
      await expectRefusedBy(await postResult(chain, await sign(fwompsResult(chain, patch))), code, name);
    }
    const after = await currentItem();
    expect(after.state).toBe('INVESTIGATING');
    expect(after.diagnosis).toBeNull();
    expect(await eventCount(chain.item.workItemId, 'DIAGNOSED')).toBe(0);
  });

  it('rejects tampered payloads, tampered MACs, a foreign key and an unknown key id', async () => {
    const chain = await readyWithIntent();
    chain.leaseGrant = await claimAndLease(chain);
    const signed = await sign(fwompsResult(chain));
    const flip = (text) => `${text.slice(0, -1)}${text.endsWith('0') ? '1' : '0'}`;
    const macField = Object.keys(signed.authentication).find((key) => /mac|signature/.test(key));
    const tampered = [
      { ...signed, summary: 'profile web-health-readonly-v1: reproduced (edited in transit)' },
      { ...signed, outcome: 'not_reproduced' },
      { ...signed, authentication: { ...signed.authentication, [macField]: flip(signed.authentication[macField]) } },
      await sign(fwompsResult(chain), 'a-different-worker-key'),
      { ...signed, authentication: { ...signed.authentication, key_id: 'unknown-key' } },
    ];
    const expected = ['mac_invalid', 'mac_invalid', 'mac_invalid', 'mac_invalid', 'unknown_key'];
    for (const [index, envelope] of tampered.entries()) {
      await expectRefusedBy(await postResult(chain, envelope), expected[index], `tampered[${index}]`);
    }
    expect((await currentItem()).state).toBe('INVESTIGATING');
  });

  it('rejects an unsupported result schema even when correctly signed', async () => {
    const chain = await readyWithIntent();
    chain.leaseGrant = await claimAndLease(chain);
    const future = await sign(fwompsResult(chain, { schema_version: 'mc-fw-investigation-result-9' }));
    await expectRefusedBy(await postResult(chain, future), 'schema_version_mismatch', 'unsupported result schema');
    expect((await currentItem()).state).toBe('INVESTIGATING');
  });

  it('rejects authority smuggled into the result, the lease request and the dispatch intent', async () => {
    const chain = await readyWithIntent();
    // intent payload: closed per-effect schema
    for (const payload of [
      { summary: 'x', command: 'rm -rf /' },
      { summary: 'x', repairScope: 'src' },
      { summary: 'x', verification_commands: 'npm test' },
      { summary: 'x', promotion: true },
    ]) {
      await expect(planEffect(env.DB, {
        workItemId: chain.item.workItemId,
        requestedLifecycleVersion: chain.item.lifecycleVersion,
        effectType: 'investigation_dispatch',
        target: 'fwomps:aiaimate.com:smuggle',
        payload,
        now: at(1_500),
      })).rejects.toThrow(/cannot travel|payload schema/);
    }
    // lease request: the worker does not choose identity or authority
    const smuggledLease = await workerCall(chain.item, 'lease', { worker_id: 'evil', repair_authority: true });
    expect(smuggledLease.status).toBe(400);
    // result: unknown top-level or nested authority fields fail the closed schema
    chain.leaseGrant = await claimAndLease(chain);
    for (const patch of [
      { repair_authority: true },
      { promotion: { approved: true } },
      { repairability: { state: 'not_indicated', advisory_repair_scope: [], permitted_paths: ['src'] } },
    ]) {
      await expectRefusedBy(await postResult(chain, await sign(fwompsResult(chain, patch))), 'malformed_result', JSON.stringify(Object.keys(patch)));
    }
    expect((await currentItem()).state).toBe('INVESTIGATING');
  });
});

describe('hostile lifecycle: expiry, abandonment, replay', () => {
  it('refuses a result after expiry, then recovers through an explicit, fresh, bounded attempt', async () => {
    const chain = await readyWithIntent();
    const first = await dispatch(chain, { fwomps: 'crash' });
    expect(first.outcome).toMatchObject({ dispatched: false, reason: 'executor_failed' });
    const oldEnvelope = await sign(fwompsResult(chain));
    await expireLeaseNow(chain);
    await expectRefusedBy(await postResult(chain, oldEnvelope), 'lease_expired', 'result after expiry'); // expired, not yet abandoned
    // single attempt: no second lease, even presenting the very intent that authorized the first
    const relet = await workerCall(chain.item, 'lease', { effect_id: chain.effectId, attempt: 1 });
    expect(relet.status).toBe(409);
    expect((await relet.json()).code).toBe('dispatch_intent_ineligible');
    expect((await currentItem()).state).toBe('INVESTIGATING');

    const retry = await recoverAndRetry(chain);
    expect(retry.issued.workItem.investigation.requestId).not.toBe(chain.issued.workItem.investigation.requestId);
    // The abandoned attempt's effect is a dead intent: its lifecycle fence no longer matches.
    const stale = await claimDispatch(env.DB, chain.effectId, { now: at(20_000) });
    expect(stale).toMatchObject({ permit: null, reason: 'stale_lifecycle' });
    await abandonEffect(env.DB, chain.effectId, 'lease expired; superseded by a fresh contract', at(200_000));

    const second = await dispatch(retry, { now: at(300_000) });
    expect(second.outcome.effect.status).toBe('COMMITTED');
    const done = await currentItem();
    expect(done.state).toBe('DIAGNOSED');
    expect(done.workItemId).toBe(chain.item.workItemId);
    // One attempt per signed contract (never two per contract); the abandoned attempt stays on record.
    expect(done.attemptsIssued).toBe(1);
    expect(done.abandonment).toMatchObject({ reason: 'lease_expired', requestId: chain.issued.workItem.investigation.requestId });
    expect(done.investigation.requestId).toBe(retry.issued.workItem.investigation.requestId);

    // The first attempt's result can never land now (replay after a newer attempt), even though it
    // is validly signed and the old lease digest was real.
    await expectRefusedBy(await postResult(chain, oldEnvelope), 'request_mismatch', 'replay after a newer attempt');
    expect(await eventCount(done.workItemId, 'DIAGNOSED')).toBe(1);
  });

  it('no operator path leaves DIAGNOSED: resolution needs fresh evidence and repair is not granted', async () => {
    const chain = await readyWithIntent();
    await dispatch(chain);
    const diagnosed = await currentItem();
    for (const [to, status, code] of [
      ['RESOLVED', 409, 'resolution_requires_fresh_evidence'],
      ['REVERIFYING', 409, 'resolution_requires_fresh_evidence'],
      ['REPAIR_READY', 403, 'repair_authority_denied'],
      ['REPAIRING', 403, 'repair_authority_denied'],
    ]) {
      const refused = await operator(diagnosed, 'transition', { to });
      expect(refused.status, to).toBe(status);
      expect((await refused.json()).code, to).toBe(code);
    }
    expect((await currentItem()).state).toBe('DIAGNOSED');
  });

  it('accepts nothing for a result that arrives after the item advanced past DIAGNOSED', async () => {
    const chain = await readyWithIntent();
    await dispatch(chain);
    // The reverification path does not exist yet (Confluence-2). Simulate only its effect on D1: the
    // item has left DIAGNOSED. A late, validly signed, byte-identical delivery must change nothing.
    await env.DB.prepare("UPDATE mc_work_items SET lifecycle_state = 'REVERIFYING', lifecycle_version = lifecycle_version + 1 WHERE work_item_id = ?")
      .bind(chain.item.workItemId).run();
    const replay = await postResult(chain, chain.envelope);
    await expectRefusedBy(replay, 'illegal_transition', 'result after the item advanced');
    const after = await currentItem();
    expect(after.state).toBe('REVERIFYING');
    expect(after.activeLease).toBeNull();
    expect(await eventCount(after.workItemId, 'DIAGNOSED')).toBe(1);
  });

  it('crash after the lease: no implicit retry, no second lease, recovery only through expiry', async () => {
    const chain = await readyWithIntent();
    const crashed = await dispatch(chain, { fwomps: 'crash' });
    expect(crashed.outcome).toMatchObject({ dispatched: false, reason: 'executor_failed' });
    expect(crashed.executions).toBe(1);
    const effect = await loadEffect(env.DB, chain.effectId);
    expect(effect).toMatchObject({ status: 'PLANNED', attemptCount: 1 });
    // A naive retry (visibility window long past) cannot run the executor again: the lifecycle moved.
    let calls = 0;
    const retry = await dispatchOnce(env.DB, chain.effectId, async () => { calls += 1; return { outcome: 'committed', receipt: 'x' }; }, { now: at(400_000) });
    expect(retry).toMatchObject({ dispatched: false, reason: 'stale_lifecycle' });
    expect(calls).toBe(0);
    expect(await leaseRowCount(chain.item.workItemId)).toBe(1);
    expect((await currentItem()).attemptsIssued).toBe(1);
  });
});

describe('hostile outbox fences on the live chain', () => {
  it('a lifecycle transition that beat the claim leaves the intent stale: it cannot dispatch', async () => {
    const chain = await readyWithIntent();
    // Another claimant leases under its own live claim first: the item leaves the version the intent saw.
    await claimAndLease(chain);
    let calls = 0;
    const out = await dispatchOnce(env.DB, chain.effectId, async () => { calls += 1; return { outcome: 'committed', receipt: 'x' }; }, { now: at(2_000) });
    expect(out).toMatchObject({ dispatched: false, reason: 'stale_lifecycle' });
    expect(calls).toBe(0);
    expect((await loadEffect(env.DB, chain.effectId)).attemptCount).toBe(1); // only the other claimant's attempt
  });

  it('an intent cannot be planned against a lifecycle version the item already left', async () => {
    const chain = await readyWithIntent();
    await claimAndLease(chain);
    await expect(planEffect(env.DB, {
      workItemId: chain.item.workItemId,
      requestedLifecycleVersion: chain.item.lifecycleVersion,
      effectType: 'investigation_dispatch',
      target: 'fwomps:aiaimate.com:late',
      payload: { summary: 'late', propertyId: 'aiaimate.com' },
      now: at(3_000),
    })).rejects.toThrow(/lifecycle version/);
  });

  it('concurrent duplicate lease requests under one claim mint exactly one lease', async () => {
    const chain = await readyWithIntent();
    const claim = await claimDispatch(env.DB, chain.effectId, { now: at(2_000) });
    const body = { effect_id: chain.effectId, attempt: claim.permit.attempt };
    const responses = await Promise.all([workerCall(chain.item, 'lease', body), workerCall(chain.item, 'lease', body)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await leaseRowCount(chain.item.workItemId)).toBe(1);
    expect((await currentItem()).attemptsIssued).toBe(1);
  });

  it('an active claim cannot be abandoned or reclaimed until its visibility window passes', async () => {
    const chain = await readyWithIntent();
    const claim = await claimDispatch(env.DB, chain.effectId, { now: at(2_000) });
    expect(claim.permit.attempt).toBe(1);
    await expect(abandonEffect(env.DB, chain.effectId, 'too eager', at(2_500))).rejects.toThrow(/may still be running/);
    expect(await claimDispatch(env.DB, chain.effectId, { now: at(2_500) })).toMatchObject({ permit: null, reason: 'in_flight' });
    const reclaimed = await claimDispatch(env.DB, chain.effectId, { now: at(200_000) });
    expect(reclaimed.permit.attempt).toBe(2);
    // The first claimant's late receipt is fenced out even with identical bytes.
    await expect(recordReceipt(env.DB, chain.effectId, { attempt: 1, outcome: 'committed', receipt: 'probe:same', now: at(200_000) })).rejects.toThrow(/fence/);
    await recordReceipt(env.DB, chain.effectId, { attempt: 2, outcome: 'committed', receipt: 'probe:same', now: at(200_000) });
    await expect(recordReceipt(env.DB, chain.effectId, { attempt: 1, outcome: 'committed', receipt: 'probe:same', now: at(200_000) })).rejects.toThrow(/fence/);
  });

  it('fails closed on an unsupported or pre-contract effect row and never dispatches it', async () => {
    const chain = await readyWithIntent();
    await env.DB.prepare('UPDATE mc_effects SET schema_version = ? WHERE effect_id = ?').bind('gfd-effect-99', chain.effectId).run();
    let calls = 0;
    await expect(dispatchOnce(env.DB, chain.effectId, async () => { calls += 1; return { outcome: 'committed', receipt: 'x' }; }, { now: at(2_000) }))
      .rejects.toThrow(/unsupported effect schema/);
    expect(calls).toBe(0);
    const row = await env.DB.prepare('SELECT schema_version, status FROM mc_effects WHERE effect_id = ?').bind(chain.effectId).first();
    expect(row).toMatchObject({ schema_version: 'gfd-effect-99', status: 'PLANNED' }); // not rewritten
  });
});

// ---------------------------------------------------------------------------------------------
// Confluence-2 (#371): fresh reverification closes the loop. Diagnosis never resolves.
// ---------------------------------------------------------------------------------------------

const OTHER_TARGET = { id: 'globaldeets', brand: 'globaldeets', name: 'GlobalDeets', url: 'https://globaldeets.com', checkType: 'page' };
const lifecycleEvents = async (workItemId) => (await env.DB.prepare(
  "SELECT from_state, to_state, occurred_at, detail_json FROM mc_work_item_events WHERE work_item_id = ? AND event_type = 'transition' ORDER BY occurred_at, event_id",
).bind(workItemId).all()).results.map((row) => ({ ...row, detail: JSON.parse(row.detail_json || '{}') }));
const HEALTHY_LATER = 600_000;

describe('Confluence-2: observe -> diagnose -> fresh reverification -> resolve -> recur (one lineage)', () => {
  it('walks the full loop under one canonical work item', async () => {
    // 1. healthy baseline: nothing to track, nothing created
    await observeHealthy(-60_000);
    expect(await store().list()).toHaveLength(0);

    // 2-4. degraded observation creates exactly one item; a repeat does not duplicate it
    await observe(at(0));
    await observe(at(30_000));
    const observed = await currentItem();
    expect(observed).toMatchObject({ state: 'OBSERVED', occurrenceCount: 2, recurrenceCount: 0 });

    // 5-11. investigation-ready, durable intent, signed lease, FWOMPS result, authenticated diagnosis
    const chain = await readyWithIntent();
    const dispatched = await dispatch(chain, { now: at(40_000) });
    expect(dispatched.outcome.effect.status).toBe('COMMITTED');
    const diagnosed = await currentItem();
    expect(diagnosed).toMatchObject({ workItemId: observed.workItemId, state: 'DIAGNOSED' });
    expect(diagnosed.reverification).toBeNull();

    // 12. diagnosis alone does not resolve, however long it sits; still-failing evidence is journaled
    await observe(at(45_000));
    const stillFailing = await currentItem();
    expect(stillFailing.state).toBe('DIAGNOSED');
    expect(stillFailing.reverification).toMatchObject({ result: 'still_failing' });
    expect(stillFailing.resolvedAt).toBeNull();

    // 13-15. a fresh healthy observation reverifies the registered predicate and resolves the SAME item
    await observeHealthy(HEALTHY_LATER);
    const resolved = await currentItem();
    expect(resolved).toMatchObject({
      workItemId: observed.workItemId,
      state: 'RESOLVED',
      resolvedAt: at(HEALTHY_LATER),
    });
    expect(resolved.resolutionEvidenceDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(resolved.reverification).toMatchObject({ result: 'resolved', observedAt: at(HEALTHY_LATER) });
    expect(resolved.activeLease).toBeNull();
    expect(resolved.diagnosis.resultDigest).toBe(diagnosed.diagnosis.resultDigest); // lineage keeps the diagnosis
    expect(await eventCount(resolved.workItemId, 'RESOLVED')).toBe(1);

    // idempotent: the same healthy evidence again, and later healthy evidence, change nothing
    const version = resolved.lifecycleVersion;
    await observeHealthy(HEALTHY_LATER);
    await observeHealthy(HEALTHY_LATER + 900_000);
    const again = await currentItem();
    expect(again).toMatchObject({ state: 'RESOLVED', lifecycleVersion: version, resolvedAt: at(HEALTHY_LATER) });
    expect(await eventCount(resolved.workItemId, 'RESOLVED')).toBe(1);

    // a degraded observation OLDER than the resolution is stale: it does not reopen the item
    await observe(at(HEALTHY_LATER - 1_000));
    expect((await currentItem()).state).toBe('RESOLVED');

    // 16. degraded again afterwards: recurrence of the SAME lineage, not an unrelated incident
    await observe(at(HEALTHY_LATER + 1_800_000));
    const recurrent = await currentItem();
    expect(recurrent).toMatchObject({
      workItemId: observed.workItemId,
      state: 'RECURRENT',
      recurrenceCount: 1,
      resolvedAt: null,
      resolutionEvidenceDigest: null,
      diagnosis: null, // the old diagnosis does not answer the new occurrence
      investigation: null,
      reverification: null,
    });
    expect(recurrent.firstSeen).toBe(observed.firstSeen);
    expect((await store().list()).filter((item) => item.findingKey === FINDING_KEY)).toHaveLength(1);
    // history survives: one diagnosis, one resolution, one recurrence on the same item
    const history = (await lifecycleEvents(observed.workItemId)).map((event) => event.to_state);
    expect(history).toEqual(expect.arrayContaining(['QUALIFIED', 'INVESTIGATION_READY', 'INVESTIGATING', 'DIAGNOSED', 'RESOLVED', 'RECURRENT']));
    expect(history.filter((state) => state === 'DIAGNOSED')).toHaveLength(1);
    // and the new cycle starts from the same governed path
    const requalified = await operator(recurrent, 'transition', { to: 'QUALIFIED' });
    expect(requalified.status).toBe(200);
    expect((await requalified.json()).workItem.state).toBe('QUALIFIED');
  });
});

describe('Confluence-2 hostile reverification', () => {
  async function diagnosed() {
    const chain = await readyWithIntent();
    await dispatch(chain, { now: at(40_000) });
    const item = await currentItem();
    expect(item.state).toBe('DIAGNOSED');
    return { chain, item };
  }

  it('a healthy observation older than the diagnosis (or the failing evidence) cannot resolve', async () => {
    const { item } = await diagnosed();
    await observeHealthy(1_000); // predates the diagnosis
    await observe(at(120_000)); // fresher failing evidence
    await observeHealthy(60_000); // older than the latest failing observation
    const after = await currentItem();
    expect(after.state).toBe('DIAGNOSED');
    expect(after.workItemId).toBe(item.workItemId);
    expect(after.reverification).toMatchObject({ result: 'still_failing' });
  });

  it('a healthy observation at the very instant of the failing evidence cannot resolve (strictly newer)', async () => {
    await diagnosed();
    await observe(at(120_000));
    await observeHealthy(120_000);
    const after = await currentItem();
    expect(after.state).toBe('DIAGNOSED');
    expect(after.resolvedAt).toBeNull();
    // the refusal is journaled, even though the degraded probe shares its instant
    const journaled = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM mc_work_item_events WHERE work_item_id = ? AND detail_json LIKE '%\"result\":\"stale\"%'",
    ).bind(after.workItemId).first();
    expect(Number(journaled.n)).toBe(1);
  });

  it("another property's healthy observation cannot resolve this item", async () => {
    const { item } = await diagnosed();
    await observeHealthy(HEALTHY_LATER, OTHER_TARGET);
    const after = await currentItem();
    expect(after).toMatchObject({ state: 'DIAGNOSED', lifecycleVersion: item.lifecycleVersion });
    expect(after.reverification).toBeNull();
  });

  it('a diagnosis result that claims the problem is gone is still only a diagnosis', async () => {
    const chain = await readyWithIntent();
    chain.leaseGrant = await claimAndLease(chain);
    const posted = await postResult(chain, await sign(fwompsResult(chain, { outcome: 'not_reproduced', summary: 'looks healthy' })));
    expect(posted.status).toBe(200);
    const item = await currentItem();
    expect(item.state).toBe('DIAGNOSED');
    expect(item.resolvedAt).toBeNull();
    expect(item.reverification).toBeNull();
    expect(await eventCount(item.workItemId, 'RESOLVED')).toBe(0);
  });

  it('a healthy observation during an active lease neither resolves nor disturbs the investigation', async () => {
    const chain = await readyWithIntent();
    chain.leaseGrant = await claimAndLease(chain);
    const before = await currentItem();
    await observeHealthy(HEALTHY_LATER);
    const during = await currentItem();
    expect(during.state).toBe('INVESTIGATING');
    expect(during.activeLease).toEqual(before.activeLease);
    expect(during.lifecycleVersion).toBe(before.lifecycleVersion);
    expect(during.lastVerdict).toMatchObject({ result: 'deferred' });

    // the investigation still lands on the same lease, and only then can fresh evidence resolve
    const posted = await postResult(chain, await sign(fwompsResult(chain)));
    expect(posted.status).toBe(200);
    expect((await currentItem()).state).toBe('DIAGNOSED');
    await observeHealthy(HEALTHY_LATER + 60_000);
    expect((await currentItem()).state).toBe('RESOLVED');
  });

  it('reverifies from the work item itself, not from a still-open GitHub incident', async () => {
    await diagnosed();
    ghIssues.length = 0; // the incident issue was closed or removed out of band
    await observeHealthy(HEALTHY_LATER);
    expect((await currentItem()).state).toBe('RESOLVED');
  });

  it('never resolves behind a human blocker', async () => {
    const { item } = await diagnosed();
    const blocked = await operator(item, 'transition', { to: 'NEEDS_HUMAN', reason: 'operator hold' });
    expect(blocked.status).toBe(200);
    await observeHealthy(HEALTHY_LATER);
    const after = await currentItem();
    expect(after.state).toBe('NEEDS_HUMAN');
    expect(after.lastVerdict).toMatchObject({ result: 'blocked' });
  });

  it('unsupported transitions fail closed: no operator path resolves, recurs or reopens', async () => {
    const { item } = await diagnosed();
    for (const to of ['RESOLVED', 'REVERIFYING', 'RECURRENT']) {
      expect((await operator(item, 'transition', { to })).status, to).toBe(409);
    }
    await observeHealthy(HEALTHY_LATER);
    const resolved = await currentItem();
    expect(resolved.state).toBe('RESOLVED');
    for (const to of ['QUALIFIED', 'DIAGNOSED', 'REVERIFYING', 'RECURRENT']) {
      expect((await operator(resolved, 'transition', { to })).status, to).toBeGreaterThanOrEqual(400);
    }
    expect((await currentItem()).state).toBe('RESOLVED');
  });

  it('a replay of the old diagnosis result after resolution changes nothing', async () => {
    const { chain } = await diagnosed();
    await observeHealthy(HEALTHY_LATER);
    const resolved = await currentItem();
    await expectRefusedBy(await postResult(chain, chain.envelope), 'illegal_transition', 'old result after resolution');
    expect(await currentItem()).toMatchObject({ state: 'RESOLVED', lifecycleVersion: resolved.lifecycleVersion });
  });
});

describe('Confluence-2 operator projection', () => {
  const lifecycleOf = async (workItemId) => {
    const response = await call('/api/mission-control/operations', { method: 'GET', auth: adminToken() });
    expect(response.status).toBe(200);
    const { operations } = await response.json();
    expect(operations.authority).toEqual({ repair: false, deployment: false, execution: false });
    return operations.items.find((entry) => entry.workItemId === workItemId).lifecycle;
  };

  it('shows the lifecycle without reading logs, and only to an operator', async () => {
    await observe(at(0));
    const chain = await readyWithIntent();
    const id = chain.item.workItemId;
    expect(await lifecycleOf(id)).toMatchObject({ investigationReady: true, diagnosisAvailable: false, reverificationRequired: false });

    await dispatch(chain, { now: at(40_000) });
    expect(await lifecycleOf(id)).toMatchObject({
      occurrenceCount: 2, diagnosisAvailable: true, reverificationRequired: true, reverification: null, recurrenceCount: 0,
      blocker: expect.stringMatching(/healthy production observation newer than the diagnosis/),
    });

    await observe(at(45_000));
    expect(await lifecycleOf(id)).toMatchObject({
      reverification: { result: 'still_failing' }, blocker: expect.stringMatching(/still observed after diagnosis/),
    });

    await observeHealthy(HEALTHY_LATER);
    expect(await lifecycleOf(id)).toMatchObject({
      reverificationRequired: false, blocker: null, reverification: { result: 'resolved', observedAt: at(HEALTHY_LATER) },
    });

    await observe(at(HEALTHY_LATER + 1_800_000));
    expect(await lifecycleOf(id)).toMatchObject({ recurrenceCount: 1, reverification: null, diagnosisAvailable: false });

    const worker403 = await call('/api/mission-control/operations', { method: 'GET', workerAuth: WORKER_TOKEN });
    expect(worker403.status).toBeGreaterThanOrEqual(401);
    const anonymous = await call('/api/mission-control/operations', { method: 'GET' });
    expect(anonymous.status).toBeGreaterThanOrEqual(401);
  });
});
