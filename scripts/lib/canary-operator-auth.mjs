/**
 * Operator-bearer resolution and request retry rules for scripts/mc-production-canary.mjs.
 *
 * Clerk session tokens live ~60 seconds; a production canary outlives one. Each admin request therefore resolves its
 * bearer immediately before it is sent, from either
 *   - a static token (GFD_OPERATOR_TOKEN; tests and sufficiently short local runs), or
 *   - an optional LOOPBACK-ONLY feed (GFD_OPERATOR_TOKEN_FEED): a GET that returns one fresh JWT as plain text.
 * Nothing is cached, persisted, logged or placed in an error message. Any failure is fatal (fail closed). This is not
 * a credential daemon: it only reads from a local URL the operator started for the duration of one run.
 */

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const JWT_SHAPE = /^[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}$/;

export function assertLoopbackFeed(feedUrl) {
  let url;
  try { url = new URL(feedUrl); } catch { throw new Error('operator token feed is not a valid URL'); }
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname) || url.username || url.password) {
    throw new Error('operator token feed must be a loopback http URL (127.0.0.1, localhost or [::1])');
  }
  return url;
}

/** Returns an async () => bearer. Throws immediately when the feed is not loopback or neither source is configured. */
export function createOperatorTokenSource({ staticToken, feedUrl, fetchImpl = fetch } = {}) {
  if (feedUrl) {
    const url = assertLoopbackFeed(feedUrl);
    return async () => {
      let response;
      try {
        // A fresh connection per request: the blocking FWOMPS run leaves pooled sockets dead. Only a connection-level
        // failure (no response at all) is retried, once; any server response is final. Redirects are surfaced as a
        // response and rejected below so they can never be mistaken for a connection failure and retried.
        response = await sendWithConnectionRetry(() => fetchImpl(url, {
          cache: 'no-store', redirect: 'manual', headers: { Connection: 'close' }, signal: AbortSignal.timeout(5000),
        }));
      } catch {
        throw new Error('operator token feed unavailable');
      }
      if (!response.ok) throw new Error('operator token feed unavailable');
      const token = (await response.text()).trim();
      if (!JWT_SHAPE.test(token)) throw new Error('operator token feed returned an unusable value');
      return token;
    };
  }
  if (!staticToken) throw new Error('GFD_OPERATOR_TOKEN or GFD_OPERATOR_TOKEN_FEED must be set in the environment');
  return async () => staticToken;
}

/**
 * Sends once; if (and only if) the request never produced a server response (connection-level failure), sends once
 * more. A server response of ANY status, including 3xx/401/403, is returned as-is and never retried.
 */
export async function sendWithConnectionRetry(send) {
  try { return await send(); } catch { return send(); }
}
