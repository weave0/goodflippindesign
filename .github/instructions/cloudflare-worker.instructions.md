---
description: "Use when writing, editing, or reviewing Cloudflare Worker code in _worker.js, workers/auth.js, workers/stripe-payments.js, workers/social-publisher.js, or any workers/*.js file. Covers D1 binding conventions, env var access, Clerk JWT auth patterns, R2 storage, CORS, error handling, and wrangler config."
applyTo: "_worker.js, workers/*.js"
---

# Cloudflare Workers Standards — GFD Ecosystem

## Runtime Constraints

- Workers run on **Cloudflare's V8 isolate**, not Node.js
- `nodejs_compat` flag is set in `wrangler.toml` — Node.js built-ins are available via polyfill
- No filesystem access, no long-running processes
- CPU time limit: 50ms (free) / 30s (Paid/Pages) — avoid synchronous heavy loops

## Environment Variables

**Always** access secrets via `env.*`, never hardcode:

```javascript
// ✅ Correct
const key = env.CLERK_SECRET_KEY;
const dsn = env.SENTRY_DSN;

// ❌ Never do this
const key = "sk_live_...";
```

### Key Bindings (wrangler.toml)

| Binding         | Type        | Variable name         |
| --------------- | ----------- | --------------------- |
| `gfd_community` | D1 Database | `env.DB` (check toml) |
| `gfv-media`     | R2 Bucket   | `env.MEDIA_BUCKET`    |

Note: D1 binding name is `gfd_community` in wrangler.toml but accessed via the binding alias in env.

## D1 Database Patterns

```javascript
// Prepared statement — always use ? params, never string concat
const stmt = env.DB.prepare("SELECT * FROM profiles WHERE clerk_id = ?");
const row = await stmt.bind(clerkId).first();

// Batch
const results = await env.DB.batch([
  env.DB.prepare("INSERT INTO ...").bind(a, b),
  env.DB.prepare("UPDATE ...").bind(c),
]);
```

- D1 is **SQLite** — use SQLite-compatible SQL only (no RETURNING on older D1)
- Always use prepared statements — never template-literal SQL

## Clerk JWT Verification (workers/auth.js pattern)

```javascript
import { createClerkClient } from "@clerk/backend";

async function verifyClerk(request, env) {
  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
  try {
    const sessionClaims = await clerk.verifyToken(
      request.headers.get("Authorization")?.replace("Bearer ", ""),
    );
    return sessionClaims; // contains sub (userId), etc.
  } catch {
    return null; // treat as unauthenticated
  }
}
```

## CORS Pattern

```javascript
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://goodflippindesign.com",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Handle preflight
if (request.method === "OPTIONS") {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
```

Only allow `goodflippindesign.com` origin in production workers. Expand only when explicitly required.

## Error Handling

```javascript
try {
  // operation
} catch (err) {
  // Log to Sentry if DSN is available — gracefully degrade if not
  if (env.SENTRY_DSN) {
    // sentry.captureException(err);
  }
  return new Response(JSON.stringify({ error: "Internal error" }), {
    status: 500,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
```

Never expose raw error messages or stack traces in production responses.

## window.ENV Injection (\_worker.js)

The Pages worker intercepts HTML responses and injects a `<script>` tag:

```javascript
window.ENV = {
  STRIPE_PUBLISHABLE_KEY: env.STRIPE_PUBLISHABLE_KEY || null,
  CLERK_PUBLISHABLE_KEY: env.CLERK_PUBLISHABLE_KEY || null,
};
```

Only **publishable** (non-secret) keys go into `window.ENV`. Never inject secret keys.

## Wrangler Config Files

| Worker           | Config                               |
| ---------------- | ------------------------------------ |
| Pages (main)     | `wrangler.toml`                      |
| Stripe           | `workers/wrangler-stripe.toml`       |
| Health sweep     | `workers/wrangler-health-sweep.toml` |
| Social publisher | `wrangler-social.toml`               |
| Cron             | `wrangler-cron.toml`                 |

Use the matching config when running `wrangler deploy --config <file>`.

## Deployment

See the `gfd-deploy` skill for step-by-step deployment procedures.
Quick reference npm scripts:

```powershell
npm run deploy:stripe        # gfd-stripe worker
npm run deploy:social        # gfv-social-publisher worker
npm run deploy:health-sweep  # gfd-health-sweep worker
# CF Pages (main site): just git push origin main
```
