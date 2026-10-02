/**
 * Key check value (KCV): proves two parties hold the SAME key without either revealing it.
 *
 * kcv(key, role) = first 8 bytes of HMAC-SHA256(key, "gfd-mc-kcv-v1:" + role), hex, prefixed "kcv:".
 *
 * The label is public and constant, the HMAC key is a uniformly random 256-bit secret, and the output is truncated
 * to 64 bits, so the value is a one-way commitment that cannot be inverted to the key. The role domain-separates
 * the three credentials so one KCV is never valid for another. Callers MUST only publish a KCV for a key that is
 * strong (64-hex / long random); a weak human-chosen string would allow offline guessing, so those get no KCV and
 * therefore cannot pass an interoperability check.
 *
 * The Worker computes it with Web Crypto; the preflight computes it with node:crypto (scripts/lib). Both produce
 * identical output (tested), so comparing them proves the runtime and the FWOMPS host hold the same key bytes.
 */

export const KCV_LABEL_PREFIX = 'gfd-mc-kcv-v1:';
export const KCV_ROLES = Object.freeze(['contract', 'result', 'bearer']);

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function keyCheckValue(keyBytes, role) {
  if (!KCV_ROLES.includes(role)) throw new Error('unknown KCV role');
  // strong*Bytes returns null deliberately when material is not strong enough to publish a KCV.
  // Treat that explicit marker as "no KCV"; malformed byte arrays still throw.
  if (keyBytes == null) return undefined;
  if (!(keyBytes instanceof Uint8Array) || keyBytes.byteLength < 16) throw new Error('key too short for a check value');
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${KCV_LABEL_PREFIX}${role}`)));
  return `kcv:${hex(mac.slice(0, 8))}`;
}

const HEX64 = /^[0-9a-fA-F]{64}$/;

/** Bytes for a 64-hex key, else null (only strong hex keys are ever given a KCV). */
export function strongHexKeyBytes(value) {
  if (typeof value !== 'string' || !HEX64.test(value.trim())) return null;
  const trimmed = value.trim();
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) out[i] = Number.parseInt(trimmed.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const BEARER128 = /^[0-9a-f]{128}$/;

/** Bytes for the generated 512-bit lowercase-hex delivery bearer, else null. Weak/human tokens never get a KCV. */
export function strongTokenBytes(value) {
  if (typeof value !== 'string' || !BEARER128.test(value)) return null;
  return new TextEncoder().encode(value);
}
