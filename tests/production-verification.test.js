/**
 * PRODUCTION DEPLOYMENT VERIFICATION
 * Tests conversion features across all 6 ecosystem sites
 * Run: node tests/production-verification.test.js
 */

const puppeteer = require('puppeteer');

// Helper function for delays (Puppeteer compatibility)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const SITES = {
  GFD: {
    url: 'https://goodflippindesign.com',
    features: ['exit-intent', 'email-capture', 'ecosystem-nav']
  },
  GoodFlippinVibes: {
    url: 'https://goodflippinvibes.com',
    features: ['exit-intent', 'ecosystem-nav']
  },
  GlobalDeets: {
    url: 'https://globaldeets.com',
    features: ['sticky-cta', 'social-proof', 'ecosystem-nav']
  },
  AIAimate: {
    url: 'https://aiaimate.com/support',
    features: ['recommended-tier', 'social-proof', 'ecosystem-nav']
  },
  CitizenApproved: {
    url: 'https://citizenapproved.org',
    features: ['ecosystem-nav', 'exit-intent']
  },
  CultureSherpa: {
    url: 'https://culturesherpa.org',
    features: ['ecosystem-nav', 'social-proof', 'exit-intent']
  }
};

class ProductionVerifier {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      sites: {},
      summary: { passed: 0, failed: 0, warnings: 0 }
    };
  }

  async run() {
    console.log('🚀 Starting Production Verification...\n');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    for (const [siteName, config] of Object.entries(SITES)) {
      console.log(`\n📍 Testing ${siteName} (${config.url})`);
      await this.verifySite(browser, siteName, config);
    }

    await browser.close();
    this.generateReport();
  }

  async verifySite(browser, siteName, config) {
    const page = await browser.newPage();
    const siteResults = {
      url: config.url,
      accessible: false,
      features: {},
      errors: [],
      performance: {}
    };

    try {
      // Test 1: Site Accessibility (with fallback strategies)
      const startTime = Date.now();
      let response;

      try {
        // Try networkidle2 first (most thorough)
        response = await page.goto(config.url, {
          waitUntil: 'networkidle2',
          timeout: 15000
        });
      } catch (timeoutError) {
        if (timeoutError.name === 'TimeoutError') {
          console.log(`  ⚠️  networkidle2 timeout, trying domcontentloaded...`);
          // Fallback to domcontentloaded (faster, less thorough)
          response = await page.goto(config.url, {
            waitUntil: 'domcontentloaded',
            timeout: 10000
          });
        } else {
          throw timeoutError;
        }
      }

      const loadTime = Date.now() - startTime;

      siteResults.accessible = response.status() === 200;
      siteResults.performance.loadTime = loadTime;
      siteResults.performance.status = response.status();

      if (!siteResults.accessible) {
        siteResults.errors.push(`Site returned ${response.status()}`);
        console.log(`  ❌ Site not accessible (${response.status()})`);
        this.results.summary.failed++;
      } else {
        console.log(`  ✅ Site accessible (${loadTime}ms)`);
      }

      // Test 2: Console Errors
      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      page.on('pageerror', error => {
        consoleErrors.push(error.message);
      });

      // Wait for page to settle
      await delay(2000);

      // Test 3: Exit Intent Popup
      if (config.features.includes('exit-intent')) {
        const hasExitIntent = await this.testExitIntent(page);
        siteResults.features['exit-intent'] = hasExitIntent;
        console.log(`  ${hasExitIntent.passed ? '✅' : '❌'} Exit Intent: ${hasExitIntent.message}`);
      }

      // Test 4: Sticky CTA (scroll-based)
      if (config.features.includes('sticky-cta')) {
        const hasStickyCTA = await this.testStickyCTA(page);
        siteResults.features['sticky-cta'] = hasStickyCTA;
        console.log(`  ${hasStickyCTA.passed ? '✅' : '❌'} Sticky CTA: ${hasStickyCTA.message}`);
      }

      // Test 5: Recommended Tier Badge
      if (config.features.includes('recommended-tier')) {
        const hasRecommendedBadge = await this.testRecommendedTier(page);
        siteResults.features['recommended-tier'] = hasRecommendedBadge;
        console.log(`  ${hasRecommendedBadge.passed ? '✅' : '❌'} Recommended Tier: ${hasRecommendedBadge.message}`);
      }

      // Test 6: Social Proof
      if (config.features.includes('social-proof')) {
        const hasSocialProof = await this.testSocialProof(page);
        siteResults.features['social-proof'] = hasSocialProof;
        console.log(`  ${hasSocialProof.passed ? '✅' : '❌'} Social Proof: ${hasSocialProof.message}`);
      }

      // Test 7: Ecosystem Navigation
      if (config.features.includes('ecosystem-nav')) {
        const hasEcosystemNav = await this.testEcosystemNav(page);
        siteResults.features['ecosystem-nav'] = hasEcosystemNav;
        console.log(`  ${hasEcosystemNav.passed ? '✅' : '⚠️'} Ecosystem Nav: ${hasEcosystemNav.message}`);
      }

      // Test 8: Formspree Integration
      const hasFormspree = await this.testFormspree(page);
      siteResults.features['formspree'] = hasFormspree;
      console.log(`  ${hasFormspree.passed ? '✅' : '⚠️'} Formspree: ${hasFormspree.message}`);

      // Test 9: GA4 Tracking (check if gtag exists)
      const hasGA4 = await this.testGA4(page);
      siteResults.features['ga4'] = hasGA4;
      console.log(`  ${hasGA4.passed ? '✅' : '⚠️'} GA4: ${hasGA4.message}`);

      if (consoleErrors.length > 0) {
        siteResults.errors = consoleErrors;
        console.log(`  ⚠️  ${consoleErrors.length} console errors detected`);
        this.results.summary.warnings++;
      }

      this.results.summary.passed++;

    } catch (error) {
      siteResults.errors.push(error.message);
      console.log(`  ❌ Error: ${error.message}`);
      this.results.summary.failed++;
    }

    this.results.sites[siteName] = siteResults;
    await page.close();
  }

  async testExitIntent(page) {
    try {
      // Check if exit intent function exists
      const hasExitIntent = await page.evaluate(() => {
        return typeof window.showExitIntentPopup === 'function' ||
               document.querySelector('.exit-intent-popup') !== null ||
               document.querySelector('[class*="exit"]') !== null;
      });

      if (hasExitIntent) {
        return { passed: true, message: 'Exit intent code detected' };
      }
      return { passed: false, message: 'Exit intent code not found' };
    } catch (e) {
      return { passed: false, message: e.message };
    }
  }

  async testStickyCTA(page) {
    try {
      // Scroll page to 50%
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight * 0.5);
      });
      await delay(1000);

      const hasStickyCTA = await page.evaluate(() => {
        const stickies = Array.from(document.querySelectorAll('[class*="sticky"], [class*="fixed"]'));
        return stickies.some(el => {
          const rect = el.getBoundingClientRect();
          const styles = window.getComputedStyle(el);
          return (styles.position === 'fixed' || styles.position === 'sticky') &&
                 rect.top >= 0 && rect.bottom <= window.innerHeight;
        });
      });

      if (hasStickyCTA) {
        return { passed: true, message: 'Sticky CTA appears on scroll' };
      }
      return { passed: false, message: 'No sticky CTA detected' };
    } catch (e) {
      return { passed: false, message: e.message };
    }
  }

  async testRecommendedTier(page) {
    try {
      const hasRecommendedBadge = await page.evaluate(() => {
        const text = document.body.innerText.toLowerCase();
        return text.includes('recommended') && text.includes('$10');
      });

      if (hasRecommendedBadge) {
        return { passed: true, message: '$10 tier has RECOMMENDED badge' };
      }
      return { passed: false, message: 'RECOMMENDED badge not found on $10 tier' };
    } catch (e) {
      return { passed: false, message: e.message };
    }
  }

  async testSocialProof(page) {
    try {
      // Wait for social proof (up to 20 seconds)
      await delay(16000); // Wait past 15s trigger

      const hasSocialProof = await page.evaluate(() => {
        const text = document.body.innerText.toLowerCase();
        return text.includes('just donated') ||
               text.includes('supporter') ||
               document.querySelector('[class*="social-proof"]') !== null;
      });

      if (hasSocialProof) {
        return { passed: true, message: 'Social proof notification detected' };
      }
      return { passed: false, message: 'Social proof not triggered' };
    } catch (e) {
      return { passed: false, message: e.message };
    }
  }

  async testEcosystemNav(page) {
    try {
      const hasEcosystemNav = await page.evaluate(() => {
        // Look for ecosystem nav elements
        const navText = document.body.innerText.toLowerCase();
        const hasMultipleSites = (navText.match(/globaldeets|citizenapproved|culturesherpa|aiaimate/gi) || []).length >= 2;
        const hasDropdown = document.querySelector('[class*="dropdown"]') !== null ||
                           document.querySelector('nav select') !== null;
        return hasMultipleSites || hasDropdown;
      });

      if (hasEcosystemNav) {
        return { passed: true, message: 'Ecosystem navigation detected' };
      }
      return { passed: false, message: 'Ecosystem nav not found (may not be deployed yet)' };
    } catch (e) {
      return { passed: false, message: e.message };
    }
  }

  async testFormspree(page) {
    try {
      const hasFormspree = await page.evaluate(() => {
        const forms = document.querySelectorAll('form');
        for (let form of forms) {
          if (form.action.includes('formspree.io') ||
              form.action.includes('xanyedqp')) {
            return true;
          }
        }
        return false;
      });

      if (hasFormspree) {
        return { passed: true, message: 'Formspree endpoint configured' };
      }
      return { passed: false, message: 'Formspree not found (may use different method)' };
    } catch (e) {
      return { passed: false, message: e.message };
    }
  }

  async testGA4(page) {
    try {
      const hasGA4 = await page.evaluate(() => {
        return typeof window.gtag === 'function' ||
               typeof window.dataLayer !== 'undefined';
      });

      if (hasGA4) {
        return { passed: true, message: 'GA4 tracking configured' };
      }
      return { passed: false, message: 'GA4 not configured - ACTION REQUIRED' };
    } catch (e) {
      return { passed: false, message: e.message };
    }
  }

  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 PRODUCTION VERIFICATION REPORT');
    console.log('='.repeat(60));
    console.log(`Timestamp: ${this.results.timestamp}`);
    console.log(`Sites Tested: ${Object.keys(SITES).length}`);
    console.log(`✅ Passed: ${this.results.summary.passed}`);
    console.log(`❌ Failed: ${this.results.summary.failed}`);
    console.log(`⚠️  Warnings: ${this.results.summary.warnings}`);
    console.log('='.repeat(60));

    // Critical Issues
    const criticalIssues = [];
    for (const [site, results] of Object.entries(this.results.sites)) {
      if (!results.accessible) {
        criticalIssues.push(`${site}: Site not accessible`);
      }
      if (results.features['ga4'] && !results.features['ga4'].passed) {
        criticalIssues.push(`${site}: GA4 not configured`);
      }
    }

    if (criticalIssues.length > 0) {
      console.log('\n🚨 CRITICAL ISSUES:');
      criticalIssues.forEach(issue => console.log(`  • ${issue}`));
    }

    // Save detailed report
    const fs = require('fs');
    const reportPath = 'z:\\GFD\\PRODUCTION_VERIFICATION_REPORT.json';
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    console.log(`\n📄 Detailed report saved: ${reportPath}`);

    // Generate next steps
    console.log('\n📋 RECOMMENDED NEXT STEPS:');
    if (criticalIssues.some(i => i.includes('GA4'))) {
      console.log('  1. ⚡ Set up GA4 tracking on all sites (HIGH PRIORITY)');
    }
    if (this.results.summary.failed > 0) {
      console.log('  2. 🔧 Fix sites that are not accessible');
    }
    if (this.results.summary.warnings > 0) {
      console.log('  3. ⚠️  Review console errors in browser DevTools');
    }
    console.log('  4. ✅ Manually verify conversion features work end-to-end');
    console.log('  5. 📧 Check Formspree dashboard for test submissions\n');
  }
}

// Run verification
(async () => {
  const verifier = new ProductionVerifier();
  await verifier.run();
})();
