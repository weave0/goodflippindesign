// Operator-bearer resolution for the production canary driver: fresh per request, loopback-only, fail-closed, never leaked.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { assertLoopbackFeed, createOperatorTokenSource, sendWithConnectionRetry } from '../scripts/lib/canary-operator-auth.mjs';

const jwt = (tag) => `eyJ${tag}header.eyJ${tag}payload.${tag}signature`;
const SECRET_A = jwt('aaaa'); const SECRET_B = jwt('bbbb');
const ROOT = fileURLToPath(new URL('..', import.meta.url));

async function feed(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}/token`, close: () => new Promise((resolve) => server.close(resolve)) };
}
const rejects = async (fn, message) => {
  let caught;
  try { await fn(); } catch (error) { caught = error; }
  assert.ok(caught, message);
  for (const secret of [SECRET_A, SECRET_B]) assert.ok(!String(caught.message).includes(secret), 'error message must not contain a token');
  return caught;
};

// two sequential calls receive two different fresh tokens (no caching)
{
  const tokens = [SECRET_A, SECRET_B]; let calls = 0;
  const server = await feed((req, res) => { calls += 1; res.setHeader('Cache-Control', 'no-store'); res.end(`${tokens.shift()}\n`); });
  const source = createOperatorTokenSource({ feedUrl: server.url });
  assert.equal(await source(), SECRET_A);
  assert.equal(await source(), SECRET_B);
  assert.equal(calls, 2);
  await server.close();
}

// static fallback still works; nothing configured is an error
{
  assert.equal(await createOperatorTokenSource({ staticToken: 'static-token-value' })(), 'static-token-value');
  assert.throws(() => createOperatorTokenSource({}), /must be set/);
}

// non-loopback / non-http / credentialed / malformed feed URLs are refused before any request
for (const bad of ['https://127.0.0.1:1/t', 'http://example.com/t', 'http://10.0.0.5:80/t', 'http://127.0.0.1.evil.example/t', 'http://user:pw@127.0.0.1:1/t', 'not a url', 'file:///etc/passwd']) {
  let called = false;
  assert.throws(() => createOperatorTokenSource({ feedUrl: bad, fetchImpl: () => { called = true; } }), /loopback|valid URL/, bad);
  assert.equal(called, false);
}
for (const ok of ['http://127.0.0.1:9/t', 'http://localhost:9/t', 'http://[::1]:9/t']) assert.doesNotThrow(() => assertLoopbackFeed(ok), ok);

// unavailable / non-200 / malformed / empty / redirecting feed fails closed
{
  const dead = createOperatorTokenSource({ feedUrl: 'http://127.0.0.1:1/t' });
  await rejects(() => dead(), 'unreachable feed');
  for (const [name, handler] of [
    ['500', (req, res) => { res.statusCode = 500; res.end(SECRET_A); }],
    ['garbage', (req, res) => res.end('not-a-jwt')],
    ['empty', (req, res) => res.end('')],
    ['json wrapper', (req, res) => res.end(JSON.stringify({ token: SECRET_A }))],
    ['redirect', (req, res) => { res.statusCode = 302; res.setHeader('Location', 'http://example.com/'); res.end(); }],
  ]) {
    const server = await feed(handler);
    await rejects(() => createOperatorTokenSource({ feedUrl: server.url })(), name);
    await server.close();
  }
}

// a server response (even 401) is returned once and never retried; only a connection-level failure is retried once
{
  let sends = 0;
  const response = await sendWithConnectionRetry(async () => { sends += 1; return { status: 401 }; });
  assert.equal(response.status, 401); assert.equal(sends, 1);
  sends = 0;
  const recovered = await sendWithConnectionRetry(async () => { sends += 1; if (sends === 1) throw new Error('socket'); return { status: 200 }; });
  assert.equal(recovered.status, 200); assert.equal(sends, 2);
  sends = 0;
  await assert.rejects(() => sendWithConnectionRetry(async () => { sends += 1; throw new Error('socket'); }));
  assert.equal(sends, 2);
}

// the driver itself refuses a non-loopback feed at startup and prints no token
{
  const run = spawnSync(process.execPath, ['--no-warnings', '--import', './tests/acceptance/node-json-hook.mjs', 'scripts/mc-production-canary.mjs', '--out', 'NUL-not-written.json'], {
    cwd: ROOT, encoding: 'utf8',
    env: { ...process.env, FWOMPS_REPO: ROOT, GFD_MC_WORKER_TOKEN: 'w'.repeat(128), GFD_OPERATOR_TOKEN: SECRET_A, GFD_OPERATOR_TOKEN_FEED: 'http://example.com/token' },
  });
  assert.notEqual(run.status, 0);
  assert.match(`${run.stderr}${run.stdout}`, /loopback/);
  for (const secret of [SECRET_A, 'w'.repeat(128)]) assert.ok(!`${run.stderr}${run.stdout}`.includes(secret));
}

console.log('mc canary operator auth tests passed');
