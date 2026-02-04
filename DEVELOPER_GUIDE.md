# Good Flippin Design - Developer Quick Reference

**Last Updated:** February 2, 2026

---

## 🚀 Quick Start

```bash
# Clone repository
git clone https://github.com/weave0/goodflippindesign.git
cd goodflippindesign

# Install dependencies
npm install

# Start development server
npm run dev
```

Opens at `http://localhost:3000`

---

## 📝 Common Commands

### Development
```bash
npm run dev              # Start local dev server
npm run test:watch       # Run tests on file changes
npm run sync             # Sync index.html → temp_review.html
```

### Testing
```bash
npm test                 # Run all tests (144 total)
npm run test:a11y        # Accessibility tests only
npm run test:responsive  # Responsive design tests only
```

### Building
```bash
npm run cache-bust       # Update cache bust timestamp
npm run build            # Full production build (cache-bust + sync)
npm run format           # Format code with Prettier
npm run lint:html        # Validate HTML
```

---

## 🔄 Git Workflow

### Pre-commit Hooks (Automatic)
When you commit, Husky automatically:
1. ✅ Syncs `index.html` → `temp_review.html`
2. ✅ Updates cache bust timestamp
3. ✅ Stages changes
4. ✅ Prevents node_modules commits

```bash
# Standard workflow:
git add .
git commit -m "Feature: Add new section"
# Hooks run automatically!

git push
# CI/CD runs tests automatically!
```

### Manual Sync (if needed)
```bash
npm run sync
```

---

## 🎨 File Structure

```
goodflippindesign/
├── index.html                 # 🔴 PRODUCTION FILE (edit this)
├── temp_review.html           # 🟡 AUTO-GENERATED (never edit directly)
├── _headers                   # Security headers for Cloudflare
├── wrangler.toml             # Cloudflare Pages config
├── .lighthouserc.json        # Lighthouse CI budgets
├── .env.example              # Environment variables template
├── package.json              # NPM scripts & dependencies
│
├── .github/workflows/
│   ├── ci.yml                # Automated tests on PR
│   ├── deploy.yml            # Deployment pipeline
│   └── lighthouse.yml        # Weekly performance audits
│
├── .husky/
│   └── pre-commit            # Git pre-commit automation
│
├── scripts/
│   ├── build.js              # Production build script
│   ├── sync-review.js        # File sync utility
│   └── update-cache-bust.js  # Cache bust automation
│
├── tests/
│   ├── run-all-tests.js      # Test suite runner
│   ├── test-config.js        # Test configuration
│   ├── test-utils.js         # Test utilities
│   ├── accessibility.test.js # WCAG 2.1 AA tests
│   ├── responsive.test.js    # Responsive design tests
│   └── [other test files]
│
├── assets/
│   ├── backgrounds/          # Background images
│   ├── icons/                # Legal form icons
│   ├── forms/                # Legal form HTML files
│   └── logo-vector.png       # Main logo
│
└── .vscode/
    ├── settings.json         # VS Code workspace settings
    └── extensions.json       # Recommended extensions
```

---

## ⚠️ Critical Rules

### **NEVER edit temp_review.html directly**
- It's auto-generated from `index.html`
- Edit `index.html` instead
- Run `npm run sync` if they get out of sync

### **Always run tests before pushing**
```bash
npm test
```

### **Update cache bust after significant changes**
```bash
npm run cache-bust
# Or just run:
npm run build
```

---

## 🧪 Test Suite

### Coverage
- **144 total tests** across 7 suites
- **96.5% pass rate** (138 passing)
- **34 seconds** average run time

### Test Categories
| Suite | Tests | Coverage |
|-------|-------|----------|
| Structure | 14 | HTML semantics, CSS, JS |
| Navigation | 14 | Links, scroll, focus |
| Forms | 14 | Validation, labels, ARIA |
| Responsive | 60 | 7 viewports × 8 aspects |
| Accessibility | 14 | WCAG 2.1 AA compliance |
| Animations | 12 | Performance, GPU usage |
| Compatibility | 16 | Browser support, print |

### Running Specific Tests
```bash
# Full suite
npm test

# Individual suites (from tests/ directory)
node tests/accessibility.test.js
node tests/responsive.test.js
node tests/animations.test.js
node tests/navigation.test.js
node tests/forms.test.js
node tests/structure.test.js
node tests/visual.test.js
```

---

## 🌐 Deployment

### Automatic (Recommended)
1. Push to `main` branch
2. Cloudflare Pages deploys automatically
3. CI/CD runs tests first
4. Lighthouse audit runs weekly

### Manual Build
```bash
npm run build
# Outputs ready-to-deploy files
```

### Cloudflare Pages Setup
- **Build command:** `npm run build`
- **Publish directory:** `.` (root)
- **Environment variables:** See `.env.example`

---

## 📊 Monitoring

### Web Vitals (Built-in)
Open browser console to see:
- **LCP** (Largest Contentful Paint): Target <2.5s
- **FID** (First Input Delay): Target <100ms
- **CLS** (Cumulative Layout Shift): Target <0.1
- **TTFB** (Time to First Byte): Target <600ms

### Lighthouse CI
- Runs automatically on PRs
- Weekly scheduled audits
- Results posted as PR comments

### View Results
```bash
# After CI runs, check:
# - GitHub Actions tab
# - PR comments for Lighthouse scores
# - Console for Web Vitals
```

---

## 🔐 Security

### Headers (_headers file)
- **CSP**: Content Security Policy
- **X-Frame-Options**: Clickjacking protection
- **X-Content-Type-Options**: MIME sniffing prevention
- **Referrer-Policy**: Privacy controls

### External Resources
All external links use `rel="noopener"` for security.

### Environment Variables
Copy `.env.example` to `.env` and fill in:
```bash
cp .env.example .env
# Edit .env with your values
# NEVER commit .env to git!
```

---

## 🛠️ Troubleshooting

### Tests Failing
```bash
# Check if files are in sync
npm run sync

# Run specific test to debug
node tests/accessibility.test.js
```

### Files Out of Sync
```bash
# Force sync
npm run sync

# Verify
diff index.html temp_review.html
# Should show no differences
```

### Pre-commit Hooks Not Running
```bash
# Reinstall Husky
npm run prepare

# Verify hooks
ls -la .husky/
```

### Build Errors
```bash
# Clean and rebuild
rm -rf node_modules
npm install
npm run build
```

---

## 🎯 Code Standards

### HTML
- Semantic HTML5 elements
- ARIA labels where needed
- Alt text for all images
- Skip link for accessibility

### CSS
- CSS Custom Properties (`:root` variables)
- Mobile-first responsive design
- GPU-accelerated animations only
- WCAG AA contrast ratios (4.5:1+)

### JavaScript
- Vanilla JS (no frameworks)
- IIFE wrapper to avoid global pollution
- Progressive enhancement
- Passive event listeners for touch

### Animations
**ONLY use GPU-accelerated properties:**
```css
/* ✅ GOOD */
transition: transform 0.3s ease, opacity 0.3s ease;

/* ❌ BAD */
transition: all 0.3s;  /* Causes layout thrashing */
transition: top 0.3s;  /* Not GPU-accelerated */
```

---

## 📚 Documentation

### Key Documents
- **README.md** - Project overview
- **ENTERPRISE_INFRASTRUCTURE_COMPLETE.md** - Implementation report
- **UX_PERFORMANCE_IMPROVEMENTS.md** - Performance optimizations
- **copilot-instructions.md** - AI coding guidelines
- **PROJECT_INQUIRY_FLOW.md** - Client onboarding process

### Architecture Decisions
- Single-file architecture (index.html)
- No build tools for core site
- Progressive enhancement
- Accessibility-first design
- GPU-optimized animations

---

## 🆘 Getting Help

### Check Documentation
1. Read this file
2. Check `ENTERPRISE_INFRASTRUCTURE_COMPLETE.md`
3. Review test output for specific issues

### Common Issues
| Issue | Solution |
|-------|----------|
| Tests failing | Run `npm run sync` |
| Cache not updating | Run `npm run cache-bust` |
| Hooks not firing | Run `npm run prepare` |
| Merge conflicts | Edit `index.html`, then `npm run sync` |

### Contact
- **Email**: brett.l.weaver@gmail.com
- **GitHub**: @weave0

---

## 🎉 Quick Tips

### Before Every PR
```bash
npm run build  # Update cache & sync
npm test       # Run all tests
```

### Performance Check
```bash
# Open site and check console for:
📊 Core Web Vitals: {lcp: 1234, fid: 45, cls: 0.05, ttfb: 123}
```

### Accessibility Check
```bash
npm run test:a11y
```

### Local Development Best Practices
1. **Use `npm run dev`** for live reload
2. **Keep tests running** with `npm run test:watch`
3. **Check console** for Web Vitals and errors
4. **Verify sync** before committing

---

**Last Updated:** February 2, 2026
**Version:** 1.0.0
**Status:** Production Ready ✅

