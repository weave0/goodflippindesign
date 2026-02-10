# Deployment & Setup Guide

## Initial Setup (One-Time)

### 1. Install Dependencies

```powershell
# Install Node.js dependencies
npm install

# Install additional dev tools (optional)
npm install -D husky prettier
```

### 2. Configure Environment Variables

```powershell
# Copy template
cp .env.example .env

# Edit .env with your values
code .env
```

Required values:

- `FORMSPREE_FORM_ID`: Get from https://formspree.io after creating account
- `CLOUDFLARE_ACCOUNT_ID`: From Cloudflare dashboard
- `CLOUDFLARE_API_TOKEN`: Create in Cloudflare → My Profile → API Tokens

### 3. Set Up GitHub Secrets

For CI/CD to work, add these secrets in GitHub:

1. Go to repository → Settings → Secrets and variables → Actions
2. Add secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

### 4. Update Formspree ID

```powershell
# Edit assets/contact-form.html
# Replace YOUR_FORM_ID with actual form ID from Formspree
```

## Local Development

### Start Development Server

```powershell
# Option 1: Using npm script
npm run dev

# Option 2: Manual
npx http-server . -p 3000 -o
```

Visit: http://localhost:3000

### Making Changes

**Critical Workflow**:

```powershell
# 1. Edit index.html
code index.html

# 2. Sync to test target (REQUIRED)
npm run sync

# 3. Run tests
npm test

# 4. Commit both files
git add index.html temp_review.html
git commit -m "feat: description of changes"
```

### Running Tests

```powershell
# All tests (144 total)
npm test

# Specific suites
npm run test:a11y         # Accessibility only
npm run test:responsive   # Responsive design only

# Watch mode (re-run on file changes)
npm run test:watch
```

## Deployment

### Automated Deployment (Recommended)

**Trigger**: Push to `main` branch

```powershell
git add .
git commit -m "chore: update content"
git push origin main
```

GitHub Actions will:

1. Auto-sync index.html → temp_review.html
2. Update cache bust timestamp
3. Run all tests
4. Deploy to Cloudflare Pages
5. Commit updated cache-bust.txt

### Manual Deployment

```powershell
# 1. Build (updates cache bust)
npm run build

# 2. Run tests
npm test

# 3. Deploy to Cloudflare
npx wrangler pages publish . --project-name=good-flippin-design

# 4. Commit cache bust update
git add cache-bust.txt index.html temp_review.html
git commit -m "chore: cache bust [skip ci]"
git push
```

## Cloudflare Pages Setup

### First-Time Configuration

1. **Create Project**
   - Go to Cloudflare Dashboard → Pages
   - Connect GitHub repository
   - Project name: `good-flippin-design`
   - Build settings:
     - Build command: `npm run build`
     - Output directory: `.`

2. **Custom Domain**
   - Add custom domain in Cloudflare Pages settings
   - Update CNAME file in repository root

3. **Environment Variables** (if needed)
   - Add in Cloudflare Pages → Settings → Environment Variables
   - `NODE_ENV=production`

### Security Headers

Headers are automatically applied via `_headers` file:

- Content Security Policy
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy

**Verify**: Check response headers after deployment

```powershell
curl -I https://your-domain.com
```

## Cache Busting

### Automatic (CI/CD)

Cache bust updates automatically on deployment via GitHub Actions.

### Manual

```powershell
# Update timestamp in index.html and cache-bust.txt
npm run cache-bust

# Sync to test file
npm run sync

# Commit
git add cache-bust.txt index.html temp_review.html
git commit -m "chore: manual cache bust"
```

## Monitoring

### Test Results

Check GitHub Actions → Latest workflow run → Test results artifact

### Lighthouse Reports

Automated Lighthouse CI runs on every PR:

- Accessibility score
- Performance metrics
- Best practices
- SEO

### Analytics (Optional)

**Plausible Analytics** (recommended - privacy-first):

```html
<!-- Add to index.html before </head> -->
<script
  defer
  data-domain="your-domain.com"
  src="https://plausible.io/js/script.js"
></script>
```

**Google Analytics 4** (alternative):

```html
<!-- Add to index.html before </head> -->
<script
  async
  src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"
></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    dataLayer.push(arguments);
  }
  gtag("js", new Date());
  gtag("config", "G-XXXXXXXXXX");
</script>
```

## Troubleshooting

### Tests Failing

**Issue**: index.html and temp_review.html out of sync

```powershell
# Solution
npm run sync
npm test
```

**Issue**: Accessibility tests failing

```powershell
# Check color contrast
node tests/accessibility.test.js

# Verify --text-muted is #8a8a8a or darker
# Check all touch targets are 44px minimum
```

**Issue**: Animation performance warnings

```powershell
# Check for forbidden transitions
grep -n "transition: all" index.html
grep -n "transition: top" index.html

# Use only: transform, opacity, color, background-color, border-color
```

### Deployment Failing

**Issue**: GitHub Actions failing

```powershell
# Check secrets are set:
# - CLOUDFLARE_API_TOKEN
# - CLOUDFLARE_ACCOUNT_ID

# Verify in GitHub repo → Settings → Secrets
```

**Issue**: Cloudflare Pages build failing

```powershell
# Check build logs in Cloudflare dashboard
# Common fix: Ensure package.json has correct scripts
npm install  # Verify dependencies install locally
```

### Cache Not Updating

**Issue**: Users seeing old content

```powershell
# 1. Verify cache-bust.txt was updated
cat cache-bust.txt

# 2. Check HTML comment in index.html (line 2)
head -n 3 index.html

# 3. Clear Cloudflare cache
# Cloudflare Dashboard → Caching → Purge Everything

# 4. Force browser refresh (Ctrl+Shift+R or Cmd+Shift+R)
```

## Performance Optimization

### Image Optimization

```powershell
# Compress images before adding
# Use: tinypng.com or squoosh.app
# Target: <100KB per image
```

### Font Loading

Fonts are loaded from Google CDN with `preconnect`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
```

### Animation Performance

- Only use GPU-accelerated properties: `transform`, `opacity`
- Add `will-change: transform` for frequently animated elements
- Keep transitions under 500ms

## Backup & Recovery

### Backup Strategy

```powershell
# Git is the backup - all changes are versioned
git log --oneline  # View history
git show <commit>  # View specific change

# Create backup branch before major changes
git checkout -b backup/before-major-update
git checkout main
```

### Rollback Deployment

```powershell
# Revert to previous commit
git revert HEAD
git push origin main

# Or roll back to specific commit
git reset --hard <commit-hash>
git push --force origin main  # Use with caution
```

### Disaster Recovery

1. Clone repository from GitHub
2. Run `npm install`
3. Deploy: `npm run build && npx wrangler pages publish .`

## Maintenance

### Regular Tasks

**Monthly**:

- Review test results for new warnings
- Check Lighthouse scores
- Update dependencies: `npm outdated && npm update`

**Quarterly**:

- Review analytics (if enabled)
- Audit accessibility compliance
- Check for broken links
- Update portfolio projects

**Yearly**:

- Review and update business information
- Refresh screenshots/portfolio items
- Security audit: `npm audit`

## Support

For issues or questions:

- **Developer**: Brett Weaver (brett.l.weaver@gmail.com)
- **Tests**: Run `npm test` and share output
- **GitHub Issues**: https://github.com/weave0/goodflippindesign/issues

---

**Last Updated**: January 28, 2026
