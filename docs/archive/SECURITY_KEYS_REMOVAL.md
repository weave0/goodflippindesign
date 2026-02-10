# 🔐 SECURITY: Exposed API Keys - Removal Guide

**Severity:** 🔴 CRITICAL
**Discovered:** February 4, 2026, 10:10 AM
**Status:** URGENT - Keys exposed in public GitHub repository
**Time to Fix:** 30-45 minutes

---

## 🚨 WHAT WAS EXPOSED

GitHub blocked your push due to exposed secrets in repository history:

**Location:** `GFD Dev Projects/GFV/_SECURE_KEYS/` folder

**Exposed Credentials:**

- ❌ AWS Access Keys (`AKIA...`)
- ❌ OpenAI API Keys
- ❌ Sentry Authentication Tokens
- ❌ Google OAuth Client Secrets
- ❌ Other API credentials

**Risk Level:** 🔴 **HIGH**

- Keys are publicly visible in GitHub history
- Anyone can clone repo and access keys
- AWS keys could incur charges
- API keys could be rate-limited/abused

---

## ✅ IMMEDIATE ACTIONS (Do These RIGHT NOW)

### Step 1: Revoke All Exposed Keys (15 min)

**AWS Keys:**

1. Log into AWS Console: https://console.aws.amazon.com/
2. Go to IAM → Users → Your User
3. Security Credentials → Access Keys
4. Find exposed key (starts with `AKIA...`)
5. Click "Make inactive" then "Delete"
6. Generate NEW key (keep it secure!)

**OpenAI API Keys:**

1. Log into OpenAI: https://platform.openai.com/
2. Go to API Keys section
3. Find exposed keys
4. Click "Revoke" on each one
5. Create NEW keys

**Sentry Tokens:**

1. Log into Sentry
2. Settings → Auth Tokens
3. Revoke exposed tokens
4. Generate new ones

**Google OAuth:**

1. Google Cloud Console
2. APIs & Services → Credentials
3. Delete exposed OAuth client
4. Create new OAuth 2.0 Client ID

---

### Step 2: Add .gitignore Protection (ALREADY DONE ✅)

I already added this to `.gitignore`:

```gitignore
# Secure keys and credentials
**/GFD Dev Projects/GFV/_SECURE_KEYS/
**/_SECURE_KEYS/
*.env.local
*.env.production
.env
```

This prevents future commits of secrets, but doesn't remove them from history.

---

### Step 3: Remove Keys from Git History (30 min)

**WARNING:** This rewrites Git history. Coordinate with any team members!

**Option A: BFG Repo-Cleaner (Recommended - Fastest)**

```bash
# Download BFG
# Windows: https://rtyley.github.io/bfg-repo-cleaner/

# Run BFG to remove folder from history
java -jar bfg.jar --delete-folders "_SECURE_KEYS" .

# Clean up
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push (rewrites history)
git push origin --force --all
```

**Option B: Git Filter-Repo (More Control)**

```bash
# Install git-filter-repo
pip install git-filter-repo

# Remove folder from history
git filter-repo --path "GFD Dev Projects/GFV/_SECURE_KEYS" --invert-paths

# Force push
git push origin --force --all
```

**Option C: Manual (Safest but Slowest)**

```bash
# Remove folder from all commits
git filter-branch --force --index-filter \
  'git rm -r --cached --ignore-unmatch "GFD Dev Projects/GFV/_SECURE_KEYS"' \
  --prune-empty --tag-name-filter cat -- --all

# Clean up
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push
git push origin --force --all
```

---

### Step 4: Verify Keys Are Gone (5 min)

**Check GitHub:**

1. Go to: https://github.com/weave0/goodflippindesign
2. Search for any exposed key fragments
3. Check commit history for `_SECURE_KEYS`
4. Should return no results

**Local verification:**

```bash
# Search entire git history for AWS keys
git log --all --source -S 'AKIA' --pretty=format:'%H'

# Should return nothing
```

---

## 🔒 PREVENTION: Secure Key Management

### Where to Store Secrets (Going Forward)

**Option 1: Environment Variables (Best for Development)**

```bash
# Create .env file (already in .gitignore)
AWS_ACCESS_KEY_ID=your_key_here
AWS_SECRET_ACCESS_KEY=your_secret_here
OPENAI_API_KEY=your_openai_key
```

**Option 2: Cloudflare Pages Environment Variables**

```
1. Cloudflare Dashboard → Pages → goodflippindesign
2. Settings → Environment Variables
3. Add production secrets
4. Deploy uses these automatically
```

**Option 3: Password Manager Vault**

- Store in 1Password, Bitwarden, or LastPass
- Never commit to Git
- Share securely via encrypted vault

---

## 📋 Checklist: Complete Remediation

- [ ] **Revoked** all exposed AWS keys
- [ ] **Revoked** all exposed OpenAI API keys
- [ ] **Revoked** all exposed Sentry tokens
- [ ] **Revoked** all exposed Google OAuth credentials
- [ ] **Generated** new keys (stored securely)
- [ ] **.gitignore** updated (already done)
- [ ] **Git history** cleaned (keys removed from all commits)
- [ ] **Force pushed** to GitHub
- [ ] **Verified** no keys appear in GitHub search
- [ ] **Updated** applications with new keys
- [ ] **Tested** that apps still work with new keys

---

## ⏱️ Timeline

**Priority 1: Revoke Keys (DO FIRST)**

- Time: 15 minutes
- Impact: Prevents abuse of exposed keys

**Priority 2: Clean Git History**

- Time: 30 minutes
- Impact: Removes keys from public view

**Priority 3: Update Apps with New Keys**

- Time: Variable
- Impact: Restore application functionality

**Total Time:** 45-60 minutes

---

## 🚨 Why This Matters

**What attackers can do with exposed keys:**

**AWS Keys:**

- Spin up expensive EC2 instances
- Access your S3 buckets
- Delete resources
- Rack up massive bills

**OpenAI Keys:**

- Use your API quota
- Generate content under your account
- Potentially violate terms of service
- Cost you money

**OAuth Credentials:**

- Impersonate your application
- Access user data
- Phishing attacks

**Sentry:**

- View error logs (may contain sensitive data)
- Modify project settings

---

## ✅ After You Fix This

**Resume normal workflow:**

1. Keys revoked and regenerated ✅
2. Git history cleaned ✅
3. Apps updated with new keys ✅
4. Can push to GitHub without errors ✅
5. Cloudflare Pages can deploy ✅
6. Back to deploying donations! 🚀

---

## 📞 Need Help?

**GitHub Secret Scanning:**

- https://docs.github.com/en/code-security/secret-scanning

**BFG Repo-Cleaner:**

- https://rtyley.github.io/bfg-repo-cleaner/

**Git Filter-Repo:**

- https://github.com/newren/git-filter-repo

---

**START NOW:** Revoke all exposed keys before proceeding with any other work!
