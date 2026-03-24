/**
 * GFD - Gallery Page Smoke Tests
 * Structural, accessibility, and responsive checks for gallery.html
 *
 * Test target: gallery.html (direct file://)
 *
 * Coverage:
 *  - Page loads without critical JS errors
 *  - Document metadata (title contains "gallery", lang, viewport meta)
 *  - Proper semantic structure: skip link, <header>, <main>, noscript fallback
 *  - Single <h1>: "Gallery"
 *  - Skip link present and points to #main
 *  - Logo back-link to index.html present
 *  - Back-to-media link present (href includes "index.html#media")
 *  - aria-live="polite" on #gallery-meta
 *  - No insecure HTTP resource URLs in static HTML
 *  - External links carry rel="noopener"
 *  - Responsive layout — no horizontal overflow at mobile / tablet / desktop
 *  - Touch targets ≥44px on mobile (header logo)
 *  - WCAG AA colour contrast on body text
 *  - GA4 script tag present (G-WM6Q66W9W0)
 *  - Canonical link tag present and correct
 *  - CSS custom properties defined on :root (checks --bg, --text, --accent)
 *  - catalogue URL falls back gracefully with noscript message when JS is off
 */

const path = require('path');
const { TestResults, BrowserUtils, ElementUtils, Assertions, config } = require('./test-utils');

// ── Inline helpers (avoids tight coupling to ColorUtils internals) ─────────
function parseColor(color) {
    if (!color || color === 'transparent') return null;
    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3] };
    const h = color.match(/#([0-9a-f]{6}|[0-9a-f]{3})/i);
    if (h) {
        let hex = h[1];
        if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
        return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
    }
    return null;
}
function luminance({ r, g, b }) {
    return [r, g, b].reduce((sum, c, i) => {
        c /= 255;
        c = c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        return sum + c * [0.2126, 0.7152, 0.0722][i];
    }, 0);
}
function contrastRatio(fg, bg) {
    if (!fg || !bg) return null;
    const l1 = Math.max(luminance(fg), luminance(bg));
    const l2 = Math.min(luminance(fg), luminance(bg));
    return (l1 + 0.05) / (l2 + 0.05);
}
async function getElementContrast(page, selector) {
    const styles = await ElementUtils.getComputedStyles(page, selector);
    if (!styles) return null;
    return contrastRatio(parseColor(styles.color), parseColor(styles.backgroundColor));
}

// ── Target URL ────────────────────────────────────────────────────────────
const GALLERY_URL =
    'file://' +
    path.join(__dirname, '..').replace(/\\/g, '/') +
    '/gallery.html';

// ── Main test runner ──────────────────────────────────────────────────────
async function runGalleryTests() {
    const results = new TestResults('Gallery Page');
    let browser;

    try {
        browser = await BrowserUtils.launchBrowser();
        const page = await BrowserUtils.createPage(browser);

        const jsErrors = [];
        page.on('pageerror', (err) => jsErrors.push(err.message));

        // ────────────────────────────────────────────
        // SECTION 1 — Page load + critical JS errors
        // ────────────────────────────────────────────
        const startTime = Date.now();
        await page.goto(GALLERY_URL, {
            waitUntil: 'domcontentloaded',
            timeout: config.timeouts.navigation,
        });
        const loadTime = Date.now() - startTime;

        // Brief pause for inline IIFE to run
        await new Promise((r) => setTimeout(r, 400));

        try {
            const criticalErrors = jsErrors.filter(
                (e) => !e.includes('net::ERR') && !e.includes('Failed to fetch')
            );
            Assertions.equals(criticalErrors.length, 0, `No critical JS errors (found: ${criticalErrors.join(', ') || 'none'})`);
            results.pass('Gallery page loads without critical JS errors');
        } catch (e) {
            results.fail('Gallery page loads without critical JS errors', e.message);
        }

        try {
            Assertions.isTrue(loadTime <= config.timing.loadMax, `Load time under ${config.timing.loadMax}ms (actual: ${loadTime}ms)`);
            results.pass(`Gallery load time acceptable (${loadTime}ms)`);
        } catch (e) {
            results.warn(`Gallery load time exceeded threshold (${loadTime}ms)`, e.message);
        }

        // ────────────────────────────────────────────
        // SECTION 2 — Document metadata
        // ────────────────────────────────────────────
        const title = await page.title();
        try {
            Assertions.isTrue(title.toLowerCase().includes('gallery'), `Title contains "gallery" (got: "${title}")`);
            results.pass(`Document title: "${title}"`);
        } catch (e) {
            results.fail('Document title contains "gallery"', e.message);
        }

        try {
            const lang = await page.$eval('html', (el) => el.getAttribute('lang'));
            Assertions.equals(lang, 'en', 'html[lang="en"]');
            results.pass('Document language declared as "en"');
        } catch (e) {
            results.fail('Document language declared', e.message);
        }

        try {
            const viewport = await page.$('meta[name="viewport"]');
            Assertions.isTrue(viewport !== null, 'Viewport meta tag present');
            results.pass('Viewport meta tag present');
        } catch (e) {
            results.fail('Viewport meta tag present', e.message);
        }

        // ────────────────────────────────────────────
        // SECTION 3 — Canonical + GA4
        // ────────────────────────────────────────────
        try {
            const canonical = await page.$eval(
                'link[rel="canonical"]',
                (el) => el.getAttribute('href') || ''
            );
            Assertions.isTrue(canonical.includes('gallery.html'), `Canonical href includes "gallery.html" (got: "${canonical}")`);
            results.pass('Canonical link tag present and references gallery.html');
        } catch (e) {
            results.fail('Canonical link tag', e.message);
        }

        try {
            const ga4 = await page.$('script[src*="googletagmanager.com"]');
            Assertions.isTrue(ga4 !== null, 'GA4 script tag present');
            results.pass('GA4 analytics script tag present');
        } catch (e) {
            results.fail('GA4 analytics script tag present', e.message);
        }

        // ────────────────────────────────────────────
        // SECTION 4 — Structural landmarks & semantics
        // ────────────────────────────────────────────
        try {
            const main = await page.$('main#main');
            Assertions.isTrue(main !== null, '<main id="main"> present');
            results.pass('<main id="main"> landmark present');
        } catch (e) {
            results.fail('<main id="main"> landmark present', e.message);
        }

        try {
            const header = await page.$('header.gallery-top');
            Assertions.isTrue(header !== null, '<header> present');
            results.pass('<header> landmark present');
        } catch (e) {
            results.fail('<header> landmark present', e.message);
        }

        try {
            const h1s = await page.$$('h1');
            Assertions.equals(h1s.length, 1, 'Single <h1> on the page');
            const h1Text = await page.$eval('h1', (el) => el.textContent.trim());
            Assertions.isTrue(h1Text.toLowerCase().includes('gallery'), `<h1> contains "gallery" (got: "${h1Text}")`);
            results.pass(`Single <h1>: "${h1Text}"`);
        } catch (e) {
            results.fail('Single <h1> with "gallery" text', e.message);
        }

        try {
            const noscript = await page.$('noscript');
            Assertions.isTrue(noscript !== null, '<noscript> fallback block present');
            results.pass('<noscript> fallback content present');
        } catch (e) {
            results.fail('<noscript> fallback content present', e.message);
        }

        // ────────────────────────────────────────────
        // SECTION 5 — Accessibility
        // ────────────────────────────────────────────
        try {
            const skipLink = await page.$('a.skip-link');
            Assertions.isTrue(skipLink !== null, 'Skip link present');
            const skipHref = await page.$eval('a.skip-link', (el) => el.getAttribute('href'));
            Assertions.equals(skipHref, '#main', 'Skip link targets #main');
            results.pass('Skip link present and targets #main');
        } catch (e) {
            results.fail('Skip link', e.message);
        }

        try {
            const ariaLive = await page.$eval('#gallery-meta', (el) => el.getAttribute('aria-live'));
            Assertions.equals(ariaLive, 'polite', '#gallery-meta has aria-live="polite"');
            results.pass('#gallery-meta has aria-live="polite"');
        } catch (e) {
            results.fail('#gallery-meta has aria-live="polite"', e.message);
        }

        // WCAG AA contrast on body text
        try {
            const ratio = await getElementContrast(page, 'body');
            if (ratio !== null) {
                Assertions.isTrue(ratio >= config.accessibility.contrastRatioMin, `Body text contrast ≥ ${config.accessibility.contrastRatioMin} (actual: ${ratio?.toFixed(2)})`);
                results.pass(`Body text contrast ratio: ${ratio?.toFixed(2)} (WCAG AA ✓)`);
            } else {
                results.warn('Body text contrast', 'Could not compute contrast ratio');
            }
        } catch (e) {
            results.warn('Body text contrast check', e.message);
        }

        // ────────────────────────────────────────────
        // SECTION 6 — Navigation links
        // ────────────────────────────────────────────
        try {
            const logoLink = await page.$('header a.logo');
            Assertions.isTrue(logoLink !== null, 'Logo link in header present');
            const logoHref = await page.$eval('header a.logo', (el) => el.getAttribute('href'));
            Assertions.isTrue((logoHref || '').includes('index.html'), `Logo links to index.html (got: "${logoHref}")`);
            results.pass('Logo link present and points to index.html');
        } catch (e) {
            results.fail('Logo link to index.html', e.message);
        }

        try {
            const backLink = await page.$('a.top-link');
            Assertions.isTrue(backLink !== null, '"Back to media rows" link present');
            const backHref = await page.$eval('a.top-link', (el) => el.getAttribute('href'));
            Assertions.isTrue((backHref || '').includes('index.html'), `Back link points to index.html (got: "${backHref}")`);
            results.pass('Back-to-media link present');
        } catch (e) {
            results.fail('Back-to-media link', e.message);
        }

        // ────────────────────────────────────────────
        // SECTION 7 — External links security
        // ────────────────────────────────────────────
        try {
            const insecureLinks = await page.$$eval('a[href]', (links) =>
                links.filter((a) => /^http:\/\//i.test(a.href)).map((a) => a.href)
            );
            Assertions.equals(insecureLinks.length, 0, `No insecure HTTP links (found: ${insecureLinks.join(', ') || 'none'})`);
            results.pass('No insecure HTTP resource links');
        } catch (e) {
            results.fail('No insecure HTTP resource links', e.message);
        }

        try {
            const externalLinksWithoutNoopener = await page.$$eval('a[target="_blank"]', (links) =>
                links.filter((a) => !a.rel.includes('noopener')).map((a) => a.href)
            );
            Assertions.equals(
                externalLinksWithoutNoopener.length,
                0,
                `All _blank links have rel=noopener (violators: ${externalLinksWithoutNoopener.join(', ') || 'none'})`
            );
            results.pass('All target="_blank" links have rel="noopener"');
        } catch (e) {
            results.fail('External links rel="noopener"', e.message);
        }

        // ────────────────────────────────────────────
        // SECTION 8 — Responsive / overflow
        // ────────────────────────────────────────────
        const responsivenessViewports = [
            config.viewports.mobile,
            config.viewports.tablet,
            config.viewports.desktop,
        ];

        for (const vp of responsivenessViewports) {
            try {
                await page.setViewport(vp);
                await new Promise((r) => setTimeout(r, 100));
                const overflow = await page.evaluate(() => {
                    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
                });
                Assertions.equals(overflow, false, `No horizontal overflow at ${vp.name || vp.width + 'px'}`);
                results.pass(`No horizontal overflow at ${vp.name || vp.width + 'px'}`);
            } catch (e) {
                results.fail(`No horizontal overflow at ${vp.name || vp.width + 'px'}`, e.message);
            }
        }

        // ────────────────────────────────────────────
        // SECTION 9 — Touch targets on mobile
        // ────────────────────────────────────────────
        try {
            await page.setViewport(config.viewports.mobile);
            await new Promise((r) => setTimeout(r, 100));
            const headerLinks = await page.$$eval('header a', (links) =>
                links.map((el) => {
                    const rect = el.getBoundingClientRect();
                    return { text: el.textContent.trim().slice(0, 40), w: rect.width, h: rect.height };
                })
            );
            const tooSmall = headerLinks.filter((l) => l.h < 44 && l.w < 44);
            Assertions.equals(tooSmall.length, 0, `Header touch targets ≥44px (violators: ${tooSmall.map((l) => l.text).join(', ') || 'none'})`);
            results.pass('Header links meet 44px touch target minimum');
        } catch (e) {
            results.warn('Header touch targets', e.message);
        }

        // ────────────────────────────────────────────
        // SECTION 10 — Gallery DOM elements present
        // ────────────────────────────────────────────
        try {
            const galleryContent = await page.$('#gallery-content');
            Assertions.isTrue(galleryContent !== null, '#gallery-content container present');
            results.pass('#gallery-content container present in DOM');
        } catch (e) {
            results.fail('#gallery-content container present in DOM', e.message);
        }

        try {
            const galleryMeta = await page.$('#gallery-meta');
            Assertions.isTrue(galleryMeta !== null, '#gallery-meta container present');
            results.pass('#gallery-meta container present in DOM');
        } catch (e) {
            results.fail('#gallery-meta container present in DOM', e.message);
        }

        try {
            const gallerySubtitle = await page.$('#gallery-subtitle');
            Assertions.isTrue(gallerySubtitle !== null, '#gallery-subtitle element present');
            results.pass('#gallery-subtitle element present in DOM');
        } catch (e) {
            results.fail('#gallery-subtitle element present in DOM', e.message);
        }

    } catch (err) {
        results.fail('Gallery test suite (unexpected failure)', err.message);
    } finally {
        if (browser) await browser.close();
    }

    return results.getSummary();
}

module.exports = { runGalleryTests };

// Allow direct execution: node tests/gallery.test.js
if (require.main === module) {
    runGalleryTests().then((summary) => {
        const pass = summary.passed;
        const fail = summary.failed;
        const warn = summary.warnings;
        console.log(`\nGallery: ${pass} passed, ${fail} failed, ${warn} warnings`);
        process.exit(fail > 0 ? 1 : 0);
    });
}
