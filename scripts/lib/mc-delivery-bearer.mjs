/**
 * The Mission Control delivery bearer has exactly one canonical shape: 512 bits as 128 lowercase hex characters
 * (workers/lib/key-check-value.js strongTokenBytes). The provisioner must never mint or accept anything else.
 */
import { randomBytes } from 'node:crypto';

import { strongTokenBytes } from '../../workers/lib/key-check-value.js';

export const DELIVERY_BEARER_BYTES = 64;

export function generateDeliveryBearer() {
  const bearer = randomBytes(DELIVERY_BEARER_BYTES).toString('hex');
  if (!strongTokenBytes(bearer)) throw new Error('generated delivery bearer does not meet the canonical requirement');
  return bearer;
}

/**
 * Reuse a valid host bearer; generate one only when the host has none. A present-but-malformed host bearer is an error:
 * silently replacing it would leave the host and production holding different material.
 */
export function resolveDeliveryBearer(hostBearer, bearerEnv = 'the host bearer variable') {
  if (hostBearer == null || hostBearer === '') return { bearer: generateDeliveryBearer(), generated: true };
  if (!strongTokenBytes(hostBearer)) {
    throw new Error(`${bearerEnv} is set but is not the canonical 128-lowercase-hex bearer; refusing to replace it silently (rotate it deliberately)`);
  }
  return { bearer: hostBearer, generated: false };
}

/**
 * The canary-runner credential has the same canonical strength (64 random bytes, 128 lowercase hex) but is a
 * different secret: it must never equal the FWOMPS delivery bearer. Reuse an already-valid local value; an absent one
 * is generated; a present-but-malformed (or worker-colliding) one is an error, never silently replaced.
 */
export function resolveCanaryRunnerToken(localToken, workerBearer, envName = 'the canary-runner variable') {
  if (localToken == null || localToken === '') return { token: generateDistinctFrom(workerBearer), generated: true };
  if (!strongTokenBytes(localToken)) {
    throw new Error(`${envName} is set but is not the canonical 128-lowercase-hex token; refusing to replace it silently (rotate deliberately)`);
  }
  if (localToken === workerBearer) throw new Error(`${envName} equals the delivery bearer; the canary-runner secret must be independent (rotate it)`);
  return { token: localToken, generated: false };
}

/** A fresh token for deliberate rotation, guaranteed distinct from the delivery bearer. */
export function resolveCanaryRunnerProvision(localToken, workerBearer, { remoteInstalled = false, replace = false, envName = 'the canary-runner variable' } = {}) {
  if (remoteInstalled && !replace && (localToken == null || localToken === '')) {
    throw new Error(`${envName} is not set on this host while MISSION_CONTROL_CANARY_RUNNER_TOKEN is already installed; refusing to claim a usable runner pair (rotate deliberately)`);
  }
  return resolveCanaryRunnerToken(localToken, workerBearer, envName);
}

export function generateCanaryRunnerToken(workerBearer) {
  return generateDistinctFrom(workerBearer);
}

function generateDistinctFrom(other) {
  for (let i = 0; i < 4; i += 1) {
    const candidate = generateDeliveryBearer();
    if (candidate !== other) return candidate;
  }
  throw new Error('could not generate an independent canary-runner token');
}
