# Stripe Payment System Setup Guide

**Status**: ⚠️ CRITICAL - Payment system currently non-functional until environment variable configured

## Problem Identified

The payment system was failing with "Error: Failed to create checkout session" because:

- Invalid Stripe secret key hardcoded in `functions/create-checkout.js`
- Key format was `mk_1So71wBL...` (invalid) instead of `sk_live_...` (valid)
- Secret key must be stored as environment variable, not in source code (security)

## Fix Applied

✅ Updated `functions/create-checkout.js` to read `STRIPE_SECRET_KEY` from environment variables
✅ Updated `.env.example` to include Stripe configuration template
✅ Added validation to return helpful error if environment variable missing

## Configuration Steps

### Step 1: Get Stripe Secret Key

1. Go to [Stripe Dashboard → API Keys](https://dashboard.stripe.com/apikeys)
2. In **Standard keys** section, find your **Secret key**
3. Click **Reveal live key token** (should start with `sk_live_`)
4. Copy the full key (DO NOT share this with anyone)

### Step 2: Add Environment Variable to Cloudflare Pages

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to: **Pages** → **goodflippindesign** → **Settings** → **Environment variables**
3. Click **Add variable**
4. Configure:
   - **Variable name**: `STRIPE_SECRET_KEY`
   - **Value**: `sk_live_...` (paste your actual Stripe secret key)
   - **Environment**: Select **Production** (and Preview if you want to test)
5. Click **Save**

### Step 3: Redeploy

After adding the environment variable:

**Option A - Automatic (via git push):**

```bash
git add .
git commit -m "fix: configure Stripe secret key via environment variables"
git push origin main
```

Cloudflare Pages will auto-deploy in 2-3 minutes.

**Option B - Manual redeploy:**

1. In Cloudflare Dashboard → Pages → goodflippindesign → Deployments
2. Click **...** on latest deployment → **Retry deployment**

### Step 4: Test Payment Flow

1. Go to <https://www.goodflippindesign.com/donate>
2. Select donation amount ($25 recommended)
3. Choose donation type (one-time or recurring)
4. Click **Donate** button
5. Should redirect to Stripe Checkout page (not show error modal)

## Expected Behavior

### ✅ Success States

- Clicking donate button shows "Creating checkout..."
- Redirects to `https://checkout.stripe.com/...`
- After payment, redirects to `/donate/success?session_id=...`
- If cancelled, redirects to `/donate?canceled=true`

### ❌ Error States (Before Fix)

- Error modal: "Failed to create checkout session"
- Browser console: 401 Unauthorized from Stripe API
- Cloudflare Function logs: "Invalid API key provided"

### ❌ Error States (After Code Fix, Before Env Var)

- Error modal: "Payment system configuration error"
- Browser console: "Missing Stripe credentials"
- Check Cloudflare Pages environment variables

## Security Notes

- ✅ Secret key stored in Cloudflare environment variables (encrypted at rest)
- ✅ Never committed to git repository
- ✅ Not exposed to client-side JavaScript
- ✅ Only accessible to Cloudflare Functions (server-side)
- ⚠️ Rotate key immediately if accidentally exposed

## Verification

After deploying with environment variable configured:

```bash
# Test endpoint directly (should return valid session URL)
curl -X POST https://www.goodflippindesign.com/create-checkout \
  -H "Content-Type: application/json" \
  -d '{"amount": 25, "type": "one-time"}'
```

Expected response:

```json
{
  "sessionId": "cs_test_...",
  "url": "https://checkout.stripe.com/c/pay/cs_test_..."
}
```

## Files Modified

1. `functions/create-checkout.js` - Removed hardcoded key, added env var read with validation
2. `.env.example` - Added Stripe configuration template
3. `STRIPE_SETUP_GUIDE.md` - This file

## Related Documentation

- [Cloudflare Pages Functions - Environment Variables](https://developers.cloudflare.com/pages/functions/bindings/#environment-variables)
- [Stripe API Keys](https://stripe.com/docs/keys)
- [Stripe Checkout Sessions](https://stripe.com/docs/api/checkout/sessions)

## Troubleshooting

### Problem: Still getting "Missing Stripe credentials" error

**Cause**: Environment variable not set or not deployed
**Fix**:

1. Verify environment variable exists in Cloudflare dashboard
2. Redeploy the site (env vars only apply to new deployments)
3. Check deployment logs for errors

### Problem: Getting Stripe API errors (401, 403)

**Cause**: Invalid secret key format or test key used in production
**Fix**:

1. Verify key starts with `sk_live_` (not `sk_test_`)
2. Regenerate key in Stripe dashboard if corrupted
3. Update Cloudflare environment variable with new key

### Problem: Payments work but don't show in Stripe dashboard

**Cause**: Using test keys instead of live keys
**Fix**:

1. Ensure `STRIPE_SECRET_KEY` uses `sk_live_...`
2. Ensure `donate.html` uses matching `pk_live_...` (already configured correctly)

---

**Last Updated**: 2026-02-05
**Status**: Ready for deployment pending Cloudflare environment variable configuration
