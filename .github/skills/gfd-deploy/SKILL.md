---
name: gfd-deploy
description: "Deployment procedures for the GFD ecosystem. Use when deploying a Cloudflare Worker, updating secrets, applying D1 schema migrations, or triggering a CF Pages deployment. Trigger phrases: deploy worker, wrangler deploy, push to production, update secret, apply schema, deploy social publisher, deploy stripe, deploy health sweep, CF Pages deploy, force deploy."
argument-hint: "What to deploy: 'stripe worker', 'social publisher', 'pages site', 'health sweep', or 'D1 schema <filename>'"
---

# GFD Deployment Procedures

## Which Deployment Path?

| Target                            | Method                                                     |
| --------------------------------- | ---------------------------------------------------------- |
| Main site (goodflippindesign.com) | `git push origin main` → CF Pages auto-deploys in ~2 min   |
| gfd-stripe worker                 | `npm run deploy:stripe`                                    |
| gfv-social-publisher worker       | `npm run deploy:social`                                    |
| gfd-health-sweep worker           | `npm run deploy:health-sweep`                              |
| D1 schema migration               | `wrangler d1 execute gfd_community --remote --file=<file>` |

---

## 1. CF Pages (Main Site)

```powershell
git add .
git commit -m "feat: <description>"
git push origin main
```

CF Pages auto-deploys from `main`. Monitor at: https://dash.cloudflare.com → Workers & Pages → goodflippindesign.

**Force deploy** (if CF doesn't auto-trigger):
→ GitHub → Actions → "Force Cloudflare Pages Deployment" → Run workflow

---

## 2. Cloudflare Worker Deployments

### Pre-deployment checklist

1. Verify the correct wrangler config file (see table in cloudflare-worker.instructions.md)
2. Confirm required secrets are set (see `/memories/repo/secrets-inventory.md`)
3. Test locally if possible: `wrangler dev --config <config-file>`

### Deploy commands

```powershell
# Stripe payments worker
npm run deploy:stripe
# Equivalent: wrangler deploy --config workers/wrangler-stripe.toml

# Social publisher
npm run deploy:social
# Equivalent: wrangler deploy --config wrangler-social.toml

# Health sweep
npm run deploy:health-sweep
# Equivalent: wrangler deploy --config workers/wrangler-health-sweep.toml

# Cron worker
npm run deploy:cron
# Equivalent: wrangler deploy --config wrangler-cron.toml
```

### After deploying

Verify the worker is reachable:

```powershell
# Stripe worker health check
curl https://gfd-stripe.weave0.workers.dev/health

# Social publisher run-now (requires INTERNAL_SECRET)
curl -H "Authorization: Bearer <INTERNAL_SECRET>" https://gfv-social-publisher.weave0.workers.dev/run-now

# Health sweep last result
npm run health-sweep:last
```

---

## 3. Managing Secrets

### Check existing secrets

```powershell
# CF Pages secrets
wrangler pages secret list --project-name goodflippindesign

# Specific worker secrets
wrangler secret list --config workers/wrangler-stripe.toml
wrangler secret list --config wrangler-social.toml
wrangler secret list --config workers/wrangler-health-sweep.toml
```

### Add/update a secret

```powershell
# Pages worker secret
wrangler pages secret put <SECRET_NAME> --project-name goodflippindesign
# (will prompt for the value)

# Named worker secret
wrangler secret put <SECRET_NAME> --config workers/wrangler-stripe.toml

# Convenience npm scripts for common secrets
npm run stripe:secret            # STRIPE_SECRET_KEY for gfd-stripe
npm run social:secret:encrypt    # TOKEN_ENCRYPTION_KEY for social publisher
npm run social:secret:internal   # INTERNAL_SECRET for social publisher
npm run health-sweep:secret:github  # GITHUB_TOKEN for health sweep
```

**Reference**: Full secrets inventory at `/memories/repo/secrets-inventory.md`

---

## 4. D1 Schema Migrations

### Safe migration procedure

```powershell
# Step 1: Test locally (no real data risk)
wrangler d1 execute gfd_community --local --file=d1-schema-<name>.sql

# Step 2: Apply to production
wrangler d1 execute gfd_community --remote --file=d1-schema-<name>.sql

# Step 3: Verify
wrangler d1 execute gfd_community --remote --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

See `.github/instructions/d1-schema.instructions.md` for SQL conventions.

---

## 5. CSP / Security Headers Update

After any change to allowed origins, scripts, or fonts:

```powershell
# Edit source of truth
# (edit scripts/csp-config.js first)

# Regenerate _headers file
npm run gen:csp

# Verify output
npm run gen:csp:dry   # dry-run, prints without writing

# Commit both files
git add scripts/csp-config.js _headers
git commit -m "security: update CSP for <reason>"
```

---

## Troubleshooting

| Symptom             | Check                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| Worker returns 500  | Check `wrangler tail --config <file>` for live logs                                                       |
| Secret not found    | Run `wrangler secret list` for that config — re-push if missing                                           |
| Pages build fails   | Check CI logs: GitHub → Actions → most recent run                                                         |
| D1 query fails      | Verify column exists: `wrangler d1 execute gfd_community --remote --command="PRAGMA table_info(<table>)"` |
| CSP blocks resource | Check browser console, update `scripts/csp-config.js` + run `npm run gen:csp`                             |
