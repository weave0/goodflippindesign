// The production OFF proof (scripts/lib/mc-off-proof.mjs) run against the REAL Worker entry (workers/auth.js).
// It binds the proof's probe plan to the code it claims to test:
//   - canary OFF  => the proof passes, for every way "off" can be spelled;
//   - canary ON   => the proof FAILS on every probe AND the probes themselves change nothing (inert even if the
//                    switch was unexpectedly on, so a failing proof can never have caused a canary write).
import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';

import worker from '../../workers/auth.js';
import { ensureWorkItemSchema } from '../../workers/mission-control-work-items.js';
import { ensureOutboxSchema } from '../../workers/lib/mission-control-outbox.js';
import { ALL_PROBES, OUT_OF_SURFACE_PROBES, SURFACE_PROBES, runOffProof } from '../../scripts/lib/mc-off-proof.mjs';

const RUNNER_TOKEN = 'ab'.repeat(64);
const WORKER_TOKEN = 'mission-control-worker-token-test';
const SHA = '5c184c9f42b24d74c5e8ebeeddca5212920bb8d2';
const ON = { MISSION_CONTROL_CANARY: 'aiaimate.com' };

function testEnv(overrides = {}) {
  return {
    ...env,
    CLERK_SECRET_KEY: 'sk_test_mission_control',
    CLERK_SECRET_KEY_GFD: 'sk_test_mission_control',
    MISSION_CONTROL_CONTRACT_KEY: 'mission-control-test-key',
    MISSION_CONTROL_CONTRACT_KEY_ID: 'gfd-mission-control-test',
    MISSION_CONTROL_RESULT_KEY: 'mission-control-result-key',
    MISSION_CONTROL_RESULT_KEY_ID: 'gfd-result-test',
    MISSION_CONTROL_RESULT_WORKER_ID: 'fwomps-worker-a',
    MISSION_CONTROL_WORKER_TOKEN: WORKER_TOKEN,
    MISSION_CONTROL_CANARY_RUNNER_TOKEN: RUNNER_TOKEN,
    ...overrides,
  };
}

const snapshot = { source: 'test', id: '11111111-1111-4111-8111-111111111111', environment: 'production', branch: 'main', commitHash: SHA, commitIsPrefix: false, stage: 'deploy:success' };
const proof = (overrides, db = env.DB) => runOffProof({
  runnerToken: RUNNER_TOKEN, expectedSha: SHA, label: 'initial', controlPlane: async () => snapshot,
  fetchImpl: (url, init) => worker.fetch(new Request(url, init), testEnv({ DB: db, ...overrides })),
});

/** Wraps the D1 binding so every statement the Worker issues is recorded. */
function recordingDb() {
  const statements = [];
  const db = new Proxy(env.DB, {
    get(target, property) {
      if (property === 'prepare') return (sql) => { statements.push(String(sql)); return target.prepare(sql); };
      if (property === 'exec') return (sql) => { statements.push(String(sql)); return target.exec(sql); };
      const value = target[property];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { db, statements };
}

const TABLES = ['mc_work_items', 'mc_work_item_events', 'mc_work_item_leases', 'mc_effects'];
async function dump() {
  const out = {};
  for (const table of TABLES) out[table] = (await env.DB.prepare(`SELECT * FROM ${table}`).all()).results;
  return out;
}

beforeEach(async () => {
  await ensureWorkItemSchema(env.DB);
  await ensureOutboxSchema(env.DB);
  for (const table of ['mc_work_item_events', 'mc_work_item_leases', 'mc_effects', 'mc_work_items']) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
});

describe('the OFF proof against the real Worker', () => {
  it('covers the runner surface and the forbidden routes', () => {
    expect(SURFACE_PROBES.map((p) => `${p.method} ${p.path.replace(/gfdwi_v1_0+/, ':id')}`)).toEqual([
      'GET /api/mission-control/provenance',
      'GET /api/mission-control/operations',
      'GET /api/mission-control/work-items',
      'GET /api/mission-control/work-items/:id',
      'POST /api/mission-control/canary-observations',
      'POST /api/mission-control/work-items/:id/transition',
      'POST /api/mission-control/work-items/:id/investigate',
      'POST /api/mission-control/work-items/:id/dispatch',
    ]);
    expect(OUT_OF_SURFACE_PROBES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(ALL_PROBES.map((p) => p.id)).size).toBe(ALL_PROBES.length);
  });

  it('is OFF_PROVEN for every spelling of "off" (absent, empty, other property, wrong case, truthy string)', async () => {
    for (const off of [undefined, '', 'globaldeets.com', 'AIAIMATE.COM', 'true', 'aiaimate.com ']) {
      const evidence = await proof({ MISSION_CONTROL_CANARY: off });
      expect(evidence.failures, JSON.stringify(off)).toEqual([]);
      expect(evidence.verdict, JSON.stringify(off)).toBe('OFF_PROVEN');
      expect(evidence.summary).toEqual({ probes: ALL_PROBES.length, probesOk: ALL_PROBES.length, controls: 2, controlsOk: 2 });
      expect(evidence.probes.every((p) => p.status === 404 && p.code === 'canary_disabled')).toBe(true);
      expect(evidence.controls.every((c) => c.status === 401)).toBe(true);
    }
  });

  it('is NOT_PROVEN when the runner secret in the deployment differs from the local credential (valid-credential control)', async () => {
    const evidence = await proof({ MISSION_CONTROL_CANARY: undefined, MISSION_CONTROL_CANARY_RUNNER_TOKEN: 'cd'.repeat(64) });
    expect(evidence.verdict).toBe('NOT_PROVEN');
    expect(evidence.probes.every((p) => p.status === 401 && !p.ok)).toBe(true);
  });

  it('is NOT_PROVEN when the deployment has no runner secret at all', async () => {
    const evidence = await proof({ MISSION_CONTROL_CANARY: undefined, MISSION_CONTROL_CANARY_RUNNER_TOKEN: undefined });
    expect(evidence.verdict).toBe('NOT_PROVEN');
  });

  it('FAILS on every probe when the canary is ON, and the probes themselves change nothing', async () => {
    // Seed a real, enabled canary item first so "unchanged" is meaningful rather than vacuous.
    const seeded = await worker.fetch(new Request('https://goodflippindesign.com/api/mission-control/canary-observations', {
      method: 'POST', headers: { Authorization: `Bearer ${RUNNER_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'degraded' }),
    }), testEnv(ON));
    expect(seeded.status).toBe(200);
    const before = await dump();
    expect(before.mc_work_items.length).toBe(1);

    const { db, statements } = recordingDb();
    const evidence = await proof(ON, db);
    expect(evidence.verdict).toBe('NOT_PROVEN');
    expect(statements.length).toBeGreaterThan(0);
    // No data-modifying statement is ever issued; only reads and the Worker's own idempotent schema bootstrap.
    for (const sql of statements) {
      expect(sql, sql).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER)\b/i);
      expect(/^\s*(SELECT|PRAGMA|CREATE\s+(TABLE|INDEX|UNIQUE\s+INDEX)\s+IF\s+NOT\s+EXISTS)\b/i.test(sql), sql).toBe(true);
    }
    expect(evidence.probes.every((p) => !p.ok)).toBe(true);
    expect(evidence.probes.some((p) => p.code === 'canary_disabled')).toBe(false);
    const byId = Object.fromEntries(evidence.probes.map((p) => [p.id, p]));
    expect(byId['surface:canary-observations'].status).toBe(400);
    for (const probe of OUT_OF_SURFACE_PROBES.filter((p) => p.path.includes('/work-items/') || p.path.endsWith('/mission-control'))) {
      expect(byId[probe.id].status, probe.id).toBe(403);
    }
    expect(await dump()).toEqual(before);
  });

  it('a failing release binding fails the proof even when every probe is inert-correct', async () => {
    const stale = { ...snapshot, commitHash: 'f'.repeat(40) };
    const evidence = await runOffProof({
      runnerToken: RUNNER_TOKEN, expectedSha: SHA, label: 'initial', controlPlane: async () => stale,
      fetchImpl: (url, init) => worker.fetch(new Request(url, init), testEnv({ MISSION_CONTROL_CANARY: undefined })),
    });
    expect(evidence.verdict).toBe('NOT_PROVEN');
    expect(evidence.failures.some((f) => f.startsWith('release:'))).toBe(true);
    expect(evidence.summary.probesOk).toBe(ALL_PROBES.length);
  });
});
