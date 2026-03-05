# Security Policy

## Reporting a Vulnerability

**Please do NOT open public issues for security vulnerabilities.**

If you discover a security issue, please report it responsibly:

- **Email**: brett.l.weaver@gmail.com
- **Subject line**: `[SECURITY] goodflippindesign — <brief description>`

We commit to:

- Acknowledging your report within **48 hours**
- Providing an initial assessment within **5 business days**
- Keeping you informed of progress toward a fix

## Scope

The following are in scope for security reports:

| Component              | Location                                                      |
| ---------------------- | ------------------------------------------------------------- |
| Production site        | goodflippindesign.com                                         |
| Cloudflare Workers     | `_worker.js`, `workers/auth.js`, `workers/stripe-payments.js` |
| CSP / Security headers | `_headers`, `scripts/csp-config.js`                           |
| Community portal auth  | Clerk integration in `community-portal.html`                  |
| Payment processing     | Stripe integration in `donate.html`                           |

## Secrets Management

- **Stripe & Clerk secrets**: Stored exclusively in Cloudflare Workers via `wrangler secret put` — never in source or `.env` files
- **GitHub Secrets**: Cloudflare API token only (`CF_FULL_ITHINK`)
- **Client-side keys**: Only publishable/public keys are injected via `window.ENV` from the edge worker
- **Key rotation**: Via Cloudflare dashboard or `wrangler secret put`

## Security Controls

- **Content Security Policy**: Whitelist-based CSP generated from `scripts/csp-config.js`
- **Security headers**: HSTS, X-Frame-Options: DENY, X-Content-Type-Options, Referrer-Policy
- **Pre-commit hooks**: Block accidental commits of `node_modules`, secrets, or large files
- **CI validation**: CSP sync check on every PR and deploy
- **Dependency monitoring**: Dependabot weekly scans, `npm audit` in CI pipeline

## Supported Versions

| Version                 | Supported |
| ----------------------- | --------- |
| Current (`main` branch) | ✅        |
| Older commits           | ❌        |

This is a single-deployment site — only the latest version on `main` receives security updates.
