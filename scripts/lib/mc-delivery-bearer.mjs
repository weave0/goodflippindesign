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
