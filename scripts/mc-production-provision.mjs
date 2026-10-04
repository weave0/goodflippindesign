#!/usr/bin/env node
/**
 * Provision the production Pages project with the Mission Control <-> FWOMPS material that the operator's FWOMPS host
 * already holds. Additive, minimal, recoverable, and silent about secret values.
 *
 *   node --no-warnings scripts/mc-production-provision.mjs --fwomps-home ~/.fwomps               # PLAN (read-only)
 *   node --no-warnings scripts/mc-production-provision.mjs --fwomps-home ~/.fwomps --apply       # write
 *   node --no-warnings scripts/mc-production-provision.mjs --enable-canary | --disable-canary [--apply]
 *   node --no-warnings scripts/mc-production-provision.mjs --rollback <state.json> [--apply]
 *   node --no-warnings scripts/mc-production-provision.mjs --rotate-canary-runner | --revoke-canary-runner [--apply]
 *
 * Writes (Pages production secrets, via `wrangler pages secret put`, value on stdin only):
 *   MISSION_CONTROL_CONTRACT_KEY / _KEY_ID   <- host contract key store (the key FWOMPS verifies contracts/leases with)
 *   MISSION_CONTROL_RESULT_KEY / _KEY_ID     <- host worker key store (the key FWOMPS signs results with)
 *   MISSION_CONTROL_RESULT_WORKER_ID         <- host config mission_control.worker_id
 *   MISSION_CONTROL_WORKER_TOKEN             <- the delivery bearer; generated here if the host user has none, and persisted
 *                                               as the Windows USER env var named by the host config (default GFD_MC_WORKER_TOKEN)
 * It never overwrites an existing secret of the same name unless --replace is given, records the prior secret NAMES
 * (values are unreadable by design) in a state file, and prints names only. A secret value is never echoed, logged,
 * written to the state file, or put on a command line.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { generateCanaryRunnerToken, resolveCanaryRunnerProvision, resolveCanaryRunnerToken, resolveDeliveryBearer } from './lib/mc-delivery-bearer.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] ?? null : null; };
const APPLY = flag('--apply');
const REPLACE = flag('--replace');
const PROJECT = value('--project') || 'goodflippindesign';
const home = path.resolve((value('--fwomps-home') || path.join(os.homedir(), '.fwomps')).replace(/^~(?=$|[\\/])/, os.homedir()));
const STATE_DIR = path.join(home, 'provisioning');
const CANARY_NAME = 'MISSION_CONTROL_CANARY';
const RUNNER_NAME = 'MISSION_CONTROL_CANARY_RUNNER_TOKEN'; // the canary-runner identity; inert unless the kill switch names aiaimate.com
const RUNNER_ENV = 'GFD_MC_CANARY_RUNNER_TOKEN';           // the authorized local canary host's copy (Windows user env)
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const wrangler = (wranglerArgs, { input } = {}) => spawnSync(NPX, ['wrangler', ...wranglerArgs], {
  encoding: 'utf8', input, shell: process.platform === 'win32', windowsHide: true,
});

function listSecretNames() {
  const out = wrangler(['pages', 'secret', 'list', '--project-name', PROJECT]);
  if (out.status !== 0) throw new Error(`could not list Pages secrets for ${PROJECT} (is wrangler logged in?)`);
  return [...out.stdout.matchAll(/^\s*-\s+([A-Z0-9_]+):/gm)].map((match) => match[1]).sort();
}

function putSecret(name, secretValue) {
  const out = wrangler(['pages', 'secret', 'put', name, '--project-name', PROJECT], { input: secretValue });
  if (out.status !== 0) throw new Error(`failed to set ${name}`); // wrangler output is deliberately not forwarded
}

function deleteSecret(name) {
  const out = wrangler(['pages', 'secret', 'delete', name, '--project-name', PROJECT], { input: 'y\n' });
  if (out.status !== 0) throw new Error(`failed to delete ${name}`);
}

function persistUserEnv(name, secretValue) {
  if (process.platform !== 'win32') throw new Error('persisting the delivery bearer is implemented for Windows user env only; export it yourself');
  const done = spawnSync('powershell', ['-NoProfile', '-Command', `[Environment]::SetEnvironmentVariable('${name}', $env:MC_PERSIST_VALUE, 'User')`], {
    env: { ...process.env, MC_PERSIST_VALUE: secretValue }, encoding: 'utf8', windowsHide: true,
  });
  if (done.status !== 0) throw new Error(`could not persist ${name}`);
}

function userEnv(name) {
  if (process.platform !== 'win32') return process.env[name] || null;
  const done = spawnSync('powershell', ['-NoProfile', '-Command', `[Environment]::GetEnvironmentVariable('${name}', 'User')`], { encoding: 'utf8', windowsHide: true });
  return done.status === 0 && done.stdout.trim() ? done.stdout.trim() : null;
}

function clearUserEnv(name) {
  if (process.platform !== 'win32') throw new Error('clearing the canary-runner variable is implemented for Windows user env only; unset it yourself');
  const done = spawnSync('powershell', ['-NoProfile', '-Command', `[Environment]::SetEnvironmentVariable('${name}', $null, 'User')`], { encoding: 'utf8', windowsHide: true });
  if (done.status !== 0) throw new Error(`could not clear ${name}`);
}

function save(state) {
  mkdirSync(STATE_DIR, { recursive: true });
  const file = path.join(STATE_DIR, `pages-secrets-${state.kind}-${state.at.replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
  return file;
}

// ---- rollback --------------------------------------------------------------------------------------------------
if (value('--rollback')) {
  const state = JSON.parse(readFileSync(path.resolve(value('--rollback')), 'utf8'));
  console.log(`rollback of ${state.kind} ${state.at}: delete ${state.created.join(', ') || '(nothing)'} (only secrets this run CREATED)`);
  if (APPLY) { for (const name of state.created) deleteSecret(name); console.log('deleted; redeploy for the change to take effect'); } else console.log('plan only: re-run with --apply');
  process.exit(0);
}

// ---- canary kill switch --------------------------------------------------------------------------------------------
if (flag('--enable-canary') || flag('--disable-canary')) {
  const before = listSecretNames();
  const enabling = flag('--enable-canary');
  console.log(`${enabling ? 'enable' : 'disable'} ${CANARY_NAME} (currently ${before.includes(CANARY_NAME) ? 'set' : 'unset'}); takes effect on the next deployment`);
  if (APPLY) {
    if (enabling) putSecret(CANARY_NAME, 'aiaimate.com'); else if (before.includes(CANARY_NAME)) deleteSecret(CANARY_NAME);
    const file = save({ kind: enabling ? 'canary-enable' : 'canary-disable', at: new Date().toISOString(), project: PROJECT, before, created: enabling && !before.includes(CANARY_NAME) ? [CANARY_NAME] : [] });
    console.log(`done; state ${file}`);
  } else console.log('plan only: re-run with --apply');
  process.exit(0);
}

// ---- canary-runner credential: deliberate rotation / revocation (values are never printed or stored) -----------------
if (flag('--rotate-canary-runner') || flag('--revoke-canary-runner')) {
  const rotating = flag('--rotate-canary-runner');
  const before = listSecretNames();
  console.log(`${rotating ? 'rotate' : 'revoke'} ${RUNNER_NAME} (currently ${before.includes(RUNNER_NAME) ? 'set' : 'unset'}); takes effect on the next deployment`);
  if (!APPLY) { console.log('plan only: re-run with --apply'); process.exit(0); }
  const previousLocal = userEnv(RUNNER_ENV);
  if (rotating) {
    let workerBearer = null;
    try { workerBearer = userEnv(JSON.parse(readFileSync(path.join(home, 'config.json'), 'utf8')).mission_control?.delivery?.bearer_env || 'GFD_MC_WORKER_TOKEN'); } catch { workerBearer = userEnv('GFD_MC_WORKER_TOKEN'); }
    const next = generateCanaryRunnerToken(workerBearer);
    persistUserEnv(RUNNER_ENV, next);
    try { putSecret(RUNNER_NAME, next); } catch (error) { if (previousLocal) persistUserEnv(RUNNER_ENV, previousLocal); else clearUserEnv(RUNNER_ENV); throw error; }
  } else {
    if (before.includes(RUNNER_NAME)) deleteSecret(RUNNER_NAME);
    clearUserEnv(RUNNER_ENV);
  }
  const file = save({ kind: rotating ? 'canary-runner-rotate' : 'canary-runner-revoke', at: new Date().toISOString(), project: PROJECT, before, created: [] });
  console.log(`done; state (names only) ${file}; redeploy for the change to take effect`);
  process.exit(0);
}

// ---- provisioning plan ---------------------------------------------------------------------------------------------
const config = JSON.parse(readFileSync(path.join(home, 'config.json'), 'utf8'));
const mc = config.mission_control || {};
if (!mc.enabled || !mc.worker_id || !mc.worker_key_id) throw new Error('the FWOMPS host has no enabled Mission Control worker identity');
const contractDir = path.join(home, 'mission-control', 'contract-keys');
const contractIds = readdirSync(contractDir).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -5));
if (contractIds.length !== 1) throw new Error(`expected exactly one enrolled contract key, found ${contractIds.length}`);
const bearerEnv = mc.delivery?.bearer_env || 'GFD_MC_WORKER_TOKEN';
const secretOf = (file) => JSON.parse(readFileSync(file, 'utf8')).secret_hex;

const names = {
  MISSION_CONTROL_CONTRACT_KEY_ID: () => contractIds[0],
  MISSION_CONTROL_CONTRACT_KEY: () => secretOf(path.join(contractDir, `${contractIds[0]}.json`)),
  MISSION_CONTROL_RESULT_KEY_ID: () => mc.worker_key_id,
  MISSION_CONTROL_RESULT_KEY: () => secretOf(path.join(home, 'mission-control', 'worker-keys', `${mc.worker_key_id}.json`)),
  MISSION_CONTROL_RESULT_WORKER_ID: () => mc.worker_id,
  MISSION_CONTROL_WORKER_TOKEN: null, // resolved below
  [RUNNER_NAME]: null,                // resolved below (independent of the delivery bearer)
};
const before = listSecretNames();
const existing = Object.keys(names).filter((name) => before.includes(name));
console.log(`project ${PROJECT} production secrets today: ${before.length} (${before.filter((n) => n.startsWith('MISSION_CONTROL_')).join(', ') || 'no MISSION_CONTROL_*'})`);
console.log(`host identity: worker ${mc.worker_id}, contract key id ${contractIds[0]}, result key id ${mc.worker_key_id}, bearer env ${bearerEnv}`);
const hostBearer = userEnv(bearerEnv);
resolveDeliveryBearer(hostBearer, bearerEnv); // a present-but-malformed host bearer stops the plan, not just the apply
const localRunner = userEnv(RUNNER_ENV);
const runnerAlreadyInstalled = before.includes(RUNNER_NAME);
// A remote runner secret is unusable to the local driver without its paired local copy. Fail the plan/apply instead of
// reporting success, and validate every local value even when the remote secret already exists and will be kept.
if (runnerAlreadyInstalled && !REPLACE && !localRunner) {
  resolveCanaryRunnerProvision(localRunner, hostBearer, { remoteInstalled: true, replace: false, envName: RUNNER_ENV });
}
if (localRunner) resolveCanaryRunnerToken(localRunner, hostBearer, RUNNER_ENV);
for (const name of Object.keys(names)) {
  const action = existing.includes(name) ? (REPLACE ? 'REPLACE' : 'keep (exists)') : 'create';
  console.log(`  ${action.padEnd(14)} ${name}${name === 'MISSION_CONTROL_WORKER_TOKEN' ? (hostBearer ? ' (reusing the host user bearer)' : ' (a new bearer will be generated and persisted)') : ''}`);
}
if (!APPLY) { console.log('plan only: re-run with --apply'); process.exit(0); }

// ---- apply -----------------------------------------------------------------------------------------------------------
const { bearer, generated } = resolveDeliveryBearer(hostBearer, bearerEnv);
if (generated) { persistUserEnv(bearerEnv, bearer); console.log(`persisted ${bearerEnv} as a Windows user environment variable (new shells only)`); }
names.MISSION_CONTROL_WORKER_TOKEN = () => bearer;
const { token: runnerToken, generated: runnerGenerated } = resolveCanaryRunnerProvision(localRunner, bearer, {
  remoteInstalled: runnerAlreadyInstalled,
  replace: REPLACE,
  envName: RUNNER_ENV,
});
if (runnerGenerated) { persistUserEnv(RUNNER_ENV, runnerToken); console.log(`persisted ${RUNNER_ENV} as a Windows user environment variable (new shells only)`); }
names[RUNNER_NAME] = () => runnerToken;
const created = [];
const replaced = [];
for (const [name, supply] of Object.entries(names)) {
  if (existing.includes(name) && !REPLACE) continue;
  putSecret(name, supply());
  (existing.includes(name) ? replaced : created).push(name);
  console.log(`set ${name}`);
}
const after = listSecretNames();
const missing = Object.keys(names).filter((name) => !after.includes(name));
const file = save({ kind: 'provision', at: new Date().toISOString(), project: PROJECT, before, after, created, replaced, hostIdentity: { workerId: mc.worker_id, contractKeyId: contractIds[0], resultKeyId: mc.worker_key_id, bearerEnv } });
console.log(`state (names only, for rollback): ${file}`);
if (missing.length) { console.error(`MISSING after apply: ${missing.join(', ')}`); process.exit(1); }
console.log('all Mission Control secrets present. They apply to a NEW deployment only: redeploy the exact merged main revision.');
