import { describe, expect, it } from 'vitest';

import vector from '../fixtures/mc-fw001-result-vector.json';

const encoder = new TextEncoder();

function canonicalize(value) {
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new TypeError('wire numbers must be safe integers');
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  throw new TypeError(`unsupported wire value: ${typeof value}`);
}

function withoutMac(envelope) {
  const copy = structuredClone(envelope);
  delete copy.authentication.mac;
  return copy;
}

function bytesFromHex(hex) {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) throw new TypeError('invalid hex');
  return Uint8Array.from(hex.match(/../g), (pair) => Number.parseInt(pair, 16));
}

function toHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function digestBytes(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(canonicalize(value))));
}

async function macHex(unsigned, keyHex, purpose) {
  const key = await crypto.subtle.importKey(
    'raw',
    bytesFromHex(keyHex),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await digestBytes(unsigned);
  const purposeBytes = encoder.encode(purpose);
  const message = new Uint8Array(purposeBytes.length + 1 + digest.length);
  message.set(purposeBytes, 0);
  message[purposeBytes.length] = 0;
  message.set(digest, purposeBytes.length + 1);
  return toHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, message)));
}

describe('MC-FW-001 cross-language result conformance', () => {
  it('recomputes the FWOMPS canonical bytes, MAC, and result digest exactly', async () => {
    const unsigned = withoutMac(vector.envelope);
    const jcs = canonicalize(unsigned);
    expect(jcs).toBe(vector.expected.jcs_without_mac);

    const digest = await digestBytes(unsigned);
    expect(`sha256:${toHex(digest)}`).toBe(vector.expected.result_digest);

    const mac = await macHex(unsigned, vector.key_hex, vector.purpose);
    expect(mac).toBe(vector.expected.mac);
    expect(vector.envelope.authentication.mac).toBe(vector.expected.mac);
  });

  it('preserves UTF-8 non-ASCII receipt text in the authenticated bytes', () => {
    const text = vector.envelope.execution_receipts[0].stdout_excerpt;
    expect(text).toBe('ok é中😀');
    expect(canonicalize(withoutMac(vector.envelope))).toContain('ok é中😀');
  });

  it.each([
    ['attempt', (envelope) => { envelope.attempt = 2; }],
    ['outcome', (envelope) => { envelope.outcome = 'not_reproduced'; }],
    ['worker identity', (envelope) => { envelope.worker.id = 'worker-evil'; }],
  ])('changes the result digest and MAC when %s is tampered', async (_name, mutate) => {
    const tampered = structuredClone(vector.envelope);
    mutate(tampered);
    const unsigned = withoutMac(tampered);

    const digest = await digestBytes(unsigned);
    expect(`sha256:${toHex(digest)}`).not.toBe(vector.expected.result_digest);

    const mac = await macHex(unsigned, vector.key_hex, vector.purpose);
    expect(mac).not.toBe(vector.expected.mac);
  });
});
