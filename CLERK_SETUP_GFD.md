# Clerk Setup for GFD Admin Panel

## 🚀 Setup Status (Updated 2026-03-05)

### ✅ Complete

1. **Production Clerk app created** (separate from GFV):
   - Publishable Key: `pk_live_Y2xlcmsuZ29vZGZsaXBwaW5kZXNpZ24uY29tJA`
   - Clerk Domain: `clerk.goodflippindesign.com`

2. **DNS records configured** (all 5/5):

   ```
   ✅ clerk.goodflippindesign.com → frontend-api.clerk.services
   ✅ accounts.goodflippindesign.com → accounts.clerk.services
   ✅ clkmail.goodflippindesign.com → mail.k6r91ngsvz3c.clerk.services
   ✅ clk._domainkey.goodflippindesign.com → dkim1.k6r91ngsvz3c.clerk.services
   ✅ clk2._domainkey.goodflippindesign.com → dkim2.k6r91ngsvz3c.clerk.services
   ```

3. **admin.html updated** with production keys

4. **Auth worker updated** to support multiple Clerk apps (hostname-based routing)

### ⚠️ Remaining Steps

**STEP 1**: Configure Google OAuth (Custom Credentials Required)

**Note**: Production Clerk instances require custom OAuth credentials, not development credentials.

### Create Google OAuth App

1. Go to: <https://console.cloud.google.com/apis/credentials>
2. Select or create a project (e.g., "GFD Admin")
3. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
4. If prompted, configure OAuth consent screen first:
   - User Type: **External**
   - App name: "Good Flippin Design Admin"
   - User support email: <brett.l.weaver@gmail.com>
   - Developer email: <brett.l.weaver@gmail.com>
   - Click **Save and Continue** (skip scopes, skip test users)
5. Create OAuth client ID:
   - Application type: **Web application**
   - Name: "GFD Admin Panel"
   - **Authorized redirect URIs**: `https://clerk.goodflippindesign.com/v1/oauth_callback`
   - Click **CREATE**
6. **Copy Client ID and Client Secret** from the popup

### Add Credentials to Clerk

1. Go to: <https://dashboard.clerk.com/> → **"Good Flippin Design Admin"** app
2. Navigate to: **Configure** → **Google OAuth**
3. Paste **Client ID** and **Client Secret** from Google Cloud Console
4. Verify redirect URI matches: `https://clerk.goodflippindesign.com/v1/oauth_callback`
5. Click **Save**

### Optional: Enable Additional Providers

- **LinkedIn**: Navigate to **Configure** → Add LinkedIn OAuth (also requires custom credentials)
- **Email**: Under **Configure** → **Email** → Enable email/password authentication

**STEP 2**: Set Cloudflare Pages secret

1. Go to: <https://dash.cloudflare.com/> → **Pages** → **goodflippindesign** → **Settings** → **Environment variables**
2. Click **Add variable** (Production environment)
3. Set:
   - **Name**: `CLERK_SECRET_KEY_GFD`
   - **Value**: `sk_live_XNoNOJvA***************Gl` (use full key from Clerk dashboard)
   - **Type**: Encrypted variable
4. Click **Save** → **Redeploy site**

**STEP 3**: Wait for DNS propagation (5-10 minutes)

Verify in Clerk dashboard that all 5 DNS records show "Verified" ✅

**STEP 4**: Test authentication

Visit <https://goodflippindesign.com/admin.html> and sign in with Google or email

---

## Overview

The GFD admin panel (goodflippindesign.com) uses a **separate Clerk application** from the GFV community portal (goodflippinvibes.com). This ensures isolated user pools and independent authentication.

## Credentials

### GFD Admin Clerk App Keys

```
Publishable Key: pk_live_Y2xlcmsuZ29vZGZsaXBwaW5kZXNpZ24uY29tJA
Secret Key:      sk_live_XNoNOJvAG6i7MR***************Gl  (redacted)
Clerk Domain:    clerk.goodflippindesign.com
```

### GFV Community Clerk App Keys

```
Publishable Key: pk_live_Y2xlcmsuZ29vZGZsaXBwaW52aWJlcy5jb20k
Secret Key:      sk_live_5qsJhVPIdb7H6r***************gJ  (redacted)
Clerk Domain:    clerk.goodflippinvibes.com
```

## Configuration Required

### 1. Cloudflare Pages Environment Variables

Go to **Cloudflare Dashboard** → **Pages** → **goodflippindesign** → **Settings** → **Environment variables**

Set these variables for the **Production** environment:

| Variable                | Value                                  | Purpose                                                        |
| ----------------------- | -------------------------------------- | -------------------------------------------------------------- |
| `CLERK_SECRET_KEY_GFD`  | `sk_live_XNoNOJvAG6i7MR...***...Gl`    | GFD admin auth verification                                    |
| `CLERK_PUBLISHABLE_KEY` | _(optional)_ `pk_live_Y2xlcmsuZ29v...` | Injected into admin.html via `window.ENV` (fallback hardcoded) |

**Note**:

- The code already has `pk_test_...` hardcoded as a fallback in admin.html
- `CLERK_SECRET_KEY` (without `_GFD` suffix) is used for GFV community portal
- The auth worker automatically selects the correct key based on hostname

### 2. Manual Secret Configuration

If the Cloudflare API token has insufficient permissions, you can set secrets manually via the dashboard:

```powershell
# This command may fail with API token permission errors:
wrangler pages secret put CLERK_SECRET_KEY_GFD --project-name=goodflippindesign
```

Alternative: Use the **Cloudflare Dashboard UI** to add the secret.

## How It Works

### Multi-App Architecture

The auth worker (`workers/auth.js`) now supports **multiple Clerk applications** based on request hostname:

```javascript
function getClerkSecretKey(hostname, env) {
  // GFD admin panel uses separate Clerk app
  if (
    hostname === "goodflippindesign.com" ||
    hostname === "www.goodflippindesign.com"
  ) {
    return env.CLERK_SECRET_KEY_GFD || env.CLERK_SECRET_KEY;
  }
  // GFV community portal and all other sites use main Clerk app
  return env.CLERK_SECRET_KEY;
}
```

### Request Flow

1. User signs in on `admin.html` via Clerk browser SDK
2. Browser loads Clerk JS from `dynamic-labrador-35.clerk.accounts.dev`
3. admin.html makes API calls to `/api/cms/*` with `Authorization: Bearer <token>`
4. `_worker.js` routes requests to `workers/auth.js`
5. Auth worker detects hostname → selects `CLERK_SECRET_KEY_GFD`
6. Token verified against GFD Clerk app → CMS operations proceed

## Admin Role Assignment

The auth worker auto-assigns the `admin` role to whitelisted emails:

```javascript
const ADMIN_EMAILS = [
  "brett.l.weaver@gmail.com",
  "getsome@goodflippinvibes.com",
  "hello@goodflippindesign.com",
  // ... (see workers/auth.js)
];
```

To grant admin access:

1. Add email to `ADMIN_EMAILS` array in `workers/auth.js`
2. User signs in once
3. Auth worker assigns `role: 'admin'` to their Clerk profile
4. admin.html checks `clerk.user.publicMetadata?.role === 'admin'`

## Testing Checklist

### After Configuration

- [ ] Set `CLERK_SECRET_KEY_GFD` in Cloudflare Pages environment variables
- [ ] Redeploy to pick up the new secret
- [ ] Visit `https://goodflippindesign.com/admin.html`
- [ ] Sign in with an email from `ADMIN_EMAILS` list
- [ ] Verify no "authorization_invalid" errors in console
- [ ] Confirm admin panel loads after authentication
- [ ] Test creating/uploading content via CMS API

### Verification Commands

```powershell
# Check live admin.html uses correct Clerk domain
$html = (Invoke-WebRequest "https://goodflippindesign.com/admin.html" -Headers @{"Cache-Control"="no-cache"}).Content
$html -match "dynamic-labrador-35\.clerk\.accounts\.dev"  # Should return True

# Verify no constructor errors
$html -match "new window\.Clerk"  # Should return False
```

## Troubleshooting

### "Missing publishableKey" Error

- **Cause**: `window.ENV.CLERK_PUBLISHABLE_KEY` not set or wrong key type
- **Fix**: Unset the Cloudflare env var or ensure it matches the test key
- **Fallback**: admin.html already has `pk_test_...` hardcoded

### "authorization_invalid" 403 Error

- **Cause**: Token from GFD Clerk app verified against GFV secret key
- **Fix**: Ensure `CLERK_SECRET_KEY_GFD` is set and deployed

### Auth Worker Not Selecting GFD Key

- **Cause**: Hostname not matching detection logic
- **Debug**: Check `url.hostname` in worker logs
- **Fix**: Add hostname variant to `getClerkSecretKey()` function

## Production Migration

Currently using **test keys** (`pk_test_...` / `sk_test_...`). Before going live:

1. **Upgrade Clerk plan** to Production tier (if needed)
2. **Generate production keys** from Clerk dashboard
3. **Update environment variables**:
   - `CLERK_SECRET_KEY_GFD` → `sk_live_...`
   - Update fallback in admin.html → `pk_live_...`
4. **Redeploy** and verify

## Related Files

- [admin.html](admin.html#L14) - Clerk browser SDK initialization
- [workers/auth.js](workers/auth.js#L139) - Multi-app Clerk verification
- [\_worker.js](_worker.js#L119) - API routing to auth worker
- [wrangler.toml](wrangler.toml) - Worker bindings (add secrets here for local dev)
