const ADMIN_EMAILS = new Set([
  "brett.l.weaver@gmail.com",
  "getsome@goodflippinvibes.com",
  "community@culturesherpa.org",
  "hello@aiaimate.com",
]);

// Mission Control feed credential. A machine-to-machine application secret (not a Cloudflare API token) that the
// Pages project receives as the MISSION_CONTROL_FEED_TOKEN secret binding. It authorises read-only GET/HEAD access to
// the governed Gold documents listed below and nothing else: it is not an admin identity, never reaches the Clerk
// profile lookup, and never passes /api/admin-session.
const FEED_TOKEN_PREFIX = "mcf_";
const FEED_MIN_SECRET_LENGTH = 32;
const FEED_READABLE_PATHS = new Set([
  "/gold/canonical-gold-m1.2.json",
  // The filename is stable for consumers; the contents are schema 1.1.0.
  "/gold/traffic-insights-1.0.json",
]);

const encoder = new TextEncoder();

function bearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

function isFeedShaped(token) {
  return token.startsWith(FEED_TOKEN_PREFIX);
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

// Compares fixed-length SHA-256 digests of both values so timing reveals neither the secret nor its length.
async function timingSafeMatch(presented, expected) {
  const [a, b] = await Promise.all([sha256(presented), sha256(expected)]);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

async function authorizeFeed(token, env) {
  const expected = env?.MISSION_CONTROL_FEED_TOKEN;
  // Fail closed: an unset or weak secret disables the feed path entirely.
  if (typeof expected !== "string" || expected.length < FEED_MIN_SECRET_LENGTH) return false;
  if (!isFeedShaped(token)) return false;
  return timingSafeMatch(token, expected);
}

async function authorizeAdmin(request) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return { ok: false, status: 401 };
  // A feed credential is not a user session; never forward it (or a near-miss of it) to the profile service.
  if (isFeedShaped(bearerToken(request))) return { ok: false, status: 401 };

  const response = await fetch("https://goodflippindesign.com/api/profile", {
    method: "GET",
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    if (response.status === 401) return { ok: false, status: 401 };
    if (response.status === 403) return { ok: false, status: 403 };
    return { ok: false, status: 503 };
  }

  let profile;
  try {
    profile = await response.json();
  } catch {
    return { ok: false, status: 503 };
  }

  const email = typeof profile?.email === "string" ? profile.email.toLowerCase() : "";
  return ADMIN_EMAILS.has(email)
    ? { ok: true, status: 200, email }
    : { ok: false, status: 403 };
}

function denied(status) {
  const message = status === 401
    ? "Authentication required"
    : status === 403
      ? "Forbidden"
      : status === 405
        ? "Method not allowed"
        : "Administrator verification unavailable";
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Vary": "Authorization",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      ...(status === 405 ? { Allow: "GET, HEAD" } : {}),
    },
  });
}

// Case- and percent-encoding-insensitive, so /GOLD/… or /%67old/… cannot slip past the wall.
function isGoldPath(pathname) {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return true;
  }
  const lowered = decoded.toLowerCase();
  return lowered === "/gold" || lowered.startsWith("/gold/");
}

async function serveGold(request, env) {
  const asset = await env.ASSETS.fetch(request);
  const response = new Response(asset.body, asset);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Vary", "Authorization");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/admin-session") {
      const auth = await authorizeAdmin(request);
      if (!auth.ok) return denied(auth.status);
      return Response.json(
        { ok: true, admin: true },
        { headers: { "Cache-Control": "no-store", "Vary": "Authorization" } },
      );
    }

    if (isGoldPath(url.pathname)) {
      const token = bearerToken(request);

      if (isFeedShaped(token)) {
        if (!(await authorizeFeed(token, env))) return denied(401);
        if (request.method !== "GET" && request.method !== "HEAD") return denied(405);
        if (!FEED_READABLE_PATHS.has(url.pathname)) return denied(403);
        return serveGold(request, env);
      }

      const auth = await authorizeAdmin(request);
      if (!auth.ok) return denied(auth.status);
      return serveGold(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
