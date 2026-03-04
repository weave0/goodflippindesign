/**
 * GFD - Community Portal Smoke Tests
 * Basic structural, accessibility, and load checks for community-portal.html
 *
 * Coverage:
 *  - Page loads without critical JS errors
 *  - Document metadata (lang, title, viewport meta)
 *  - Clerk SDK script tag + CLERK_PUBLISHABLE_KEY initialised
 *  - Key structural landmarks (main, nav, single h1)
 *  - Back-to-home navigation link present
 *  - Responsive layout (no horizontal scroll at mobile / tablet / desktop)
 *  - Touch targets >= 44px on mobile
 *  - WCAG AA colour contrast on body text and h1
 *  - No insecure HTTP resource URLs
 *  - External links carry rel="noopener"
 */

const { TestResults, BrowserUtils, ElementUtils, Assertions, config } = require('./test-utils');

// Inline contrast helpers (same approach as accessibility.test.js)
function parseColor(color) {
    if (!color || color === 'transparent') return null;
    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3] };
    const h = color.match(/#([0-9a-f]{6}|[0-9a-f]{3})/i);
    if (h) {
        let hex = h[1];
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        return { r: parseInt(hex.slice(0,2),16), g: parseInt(hex.slice(2,4),16), b: parseInt(hex.slice(4,6),16) };
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
    const fg = parseColor(styles.color);
    const bg = parseColor(styles.backgroundColor);
    return contrastRatio(fg, bg);
}

async function runCommunityTests() {
    const results = new TestResults('Community Portal');
    let browser;

    try {
        browser = await BrowserUtils.launchBrowser();

        // ─────────────────────────────────────────────
        // SECTION 1 — Page load & critical JS errors
        // ─────────────────────────────────────────────
        const page = await BrowserUtils.createPage(browser);

        const startTime = Date.now();
        await page.goto(config.targets.communityPortal, {
            waitUntil: 'domcontentloaded',
            timeout: config.timeouts.navigation
        });
        const loadTime = Date.now() - startTime;

        try {
            Assertions.lessThan(loadTime, config.timing.loadMax);
            results.pass('Page loads within threshold', { loadTime });
        } catch (e) {
            results.fail('Page load time', e);
        }

        try {
            const criticalErrors = (page.pageErrors || []).filter(msg =>
                !msg.includes('clerk') && !msg.includes('Clerk') &&
                !msg.includes('stripe') && !msg.includes('Stripe') &&
                !msg.includes('net::ERR_') && !msg.includes('ERR_NAME_NOT_RESOLVED')
            );
            Assertions.equals(criticalErrors.length, 0);
            results.pass('No critical JavaScript errors', {
                totalErrors: (page.pageErrors || []).length,
                criticalErrors: criticalErrors.length
            });
        } catch (e) {
            results.fail('Critical JavaScript errors', e);
        }

        // ─────────────────────────────────────────────
        // SECTION 2 — Document metadata
        // ─────────────────────────────────────────────
        try {
            const lang = await page.evaluate(() => document.documentElement.lang);
            Assertions.isTrue(lang && lang.length >= 2,
                `Document should have a valid lang attribute, got "${lang}"`);
            results.pass('Document lang attribute present', { lang });
        } catch (e) {
            results.fail('Document lang attribute', e);
        }

        try {
            const title = await page.evaluate(() => document.title);
            Assertions.isTrue(title && title.length > 5 && title.length < 100,
                `Page title should be 6-99 chars, got "${title}"`);
            results.pass('Page title present and descriptive', { title });
        } catch (e) {
            results.fail('Page title', e);
        }

        try {
            const viewport = await page.evaluate(() => {
                const meta = document.querySelector('meta[name="viewport"]');
                return meta ? meta.getAttribute('content') : null;
            });
            Assertions.isTrue(viewport && viewport.includes('width=device-width'),
                'Viewport meta tag should include width=device-width');
            results.pass('Viewport meta tag correct', { viewport });
        } catch (e) {
            results.fail('Viewport meta tag', e);
        }

        // ─────────────────────────────────────────────
        // SECTION 3 — Clerk SDK integration
        // ─────────────────────────────────────────────
        try {
            const clerkScript = await page.evaluate(() => {
                const scripts = Array.from(document.querySelectorAll('script[src]'));
                return scripts.map(s => s.src).find(src =>
                    src.toLowerCase().includes('clerk')
                ) || null;
            });
            Assertions.isTrue(clerkScript !== null,
                'Clerk SDK <script src="..."> tag should be present');
            results.pass('Clerk SDK script tag present', { src: clerkScript });
        } catch (e) {
            results.fail('Clerk SDK script tag', e);
        }

        try {
            const clerkKey = await page.evaluate(() =>
                typeof window.CLERK_PUBLISHABLE_KEY === 'string'
                    ? window.CLERK_PUBLISHABLE_KEY.substring(0, 12) + '...'
                    : null
            );
            Assertions.isTrue(clerkKey !== null,
                'window.CLERK_PUBLISHABLE_KEY should be set');
            results.pass('CLERK_PUBLISHABLE_KEY initialised', { key: clerkKey });
        } catch (e) {
            results.fail('CLERK_PUBLISHABLE_KEY initialised', e);
        }

        // ─────────────────────────────────────────────
        // SECTION 4 — Structural landmarks & navigation
        // ─────────────────────────────────────────────
        try {
            const hasMain = await page.evaluate(() =>
                !!document.querySelector('main, [role="main"]'));
            Assertions.isTrue(hasMain, '<main> or role="main" landmark should exist');
            results.pass('<main> landmark present');
        } catch (e) {
            results.fail('<main> landmark', e);
        }

        try {
            const hasNav = await page.evaluate(() =>
                !!document.querySelector('nav, [role="navigation"]'));
            Assertions.isTrue(hasNav, '<nav> or role="navigation" should exist');
            results.pass('<nav> landmark present');
        } catch (e) {
            results.fail('<nav> landmark', e);
        }

        try {
            const h1Count = await page.evaluate(() =>
                document.querySelectorAll('h1').length);
            Assertions.equals(h1Count, 1);
            results.pass('Single <h1> heading', { h1Count });
        } catch (e) {
            results.fail('Single <h1> heading', e);
        }

        try {
            const backLink = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a[href]'));
                return links.some(a => {
                    const h = a.getAttribute('href');
                    return h === '/' || h === './index.html' || h === '../' ||
                           h === '../index.html' || h === 'index.html' ||
                           (a.textContent && a.textContent.toLowerCase().includes('home'));
                });
            });
            Assertions.isTrue(backLink, 'Page should have a back-to-home navigation link');
            results.pass('Back-to-home link present');
        } catch (e) {
            results.fail('Back-to-home link', e);
        }

        // ─────────────────────────────────────────────
        // SECTION 5 — Colour contrast (desktop)
        // ─────────────────────────────────────────────
        try {
            const ratio = await getElementContrast(page, 'body');
            if (ratio !== null) {
                Assertions.isTrue(ratio >= config.accessibility.contrastRatioMin,
                    `Body text contrast ratio ${ratio.toFixed(2)} should be >= ${config.accessibility.contrastRatioMin}`);
                results.pass('Body text colour contrast meets WCAG AA', { ratio: +ratio.toFixed(2) });
            } else {
                results.skip('Body text colour contrast',
                    'Background transparent or unable to calculate');
            }
        } catch (e) {
            results.fail('Body text colour contrast', e);
        }

        try {
            const h1El = await page.$('h1');
            if (h1El) {
                const ratio = await getElementContrast(page, 'h1');
                if (ratio !== null) {
                    Assertions.isTrue(ratio >= config.accessibility.contrastRatioMin,
                        `H1 contrast ratio ${ratio.toFixed(2)} should be >= ${config.accessibility.contrastRatioMin}`);
                    results.pass('H1 heading colour contrast meets WCAG AA', { ratio: +ratio.toFixed(2) });
                } else {
                    results.skip('H1 heading colour contrast', 'Unable to calculate');
                }
            }
        } catch (e) {
            results.fail('H1 heading colour contrast', e);
        }

        // ─────────────────────────────────────────────
        // SECTION 6 — Responsive layout
        // ─────────────────────────────────────────────
        const responsiveViewports = [
            config.viewports.mobile,
            config.viewports.tablet,
            config.viewports.desktop
        ];

        for (const vp of responsiveViewports) {
            const vpPage = await BrowserUtils.createPage(browser);

            try {
                await vpPage.setViewport({ width: vp.width, height: vp.height });
                await vpPage.goto(config.targets.communityPortal, {
                    waitUntil: 'domcontentloaded',
                    timeout: config.timeouts.navigation
                });

                const hasHorizontalScroll = await vpPage.evaluate(() =>
                    document.documentElement.scrollWidth > document.documentElement.clientWidth
                );
                Assertions.isFalse(hasHorizontalScroll,
                    `No horizontal scroll at ${vp.name} (${vp.width}px)`);
                results.pass(`No horizontal scroll at ${vp.name}`, { width: vp.width });
            } catch (e) {
                results.fail(`Horizontal scroll at ${vp.name}`, e);
            }

            if (vp.width <= 600) {
                try {
                    const smallTargets = await vpPage.evaluate((minSize) => {
                        const interactive = document.querySelectorAll(
                            'a, button, input, select, textarea, [role="button"]'
                        );
                        const tooSmall = [];
                        interactive.forEach(el => {
                            // Inline text links inside <p>/<li>/<span> are exempt from 44px rule
                            const parent = el.parentElement;
                            if (el.tagName === 'A' && parent &&
                               (parent.tagName === 'P' || parent.tagName === 'LI' || parent.tagName === 'SPAN')) {
                                return;
                            }
                            const rect = el.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0 &&
                                (rect.width < minSize || rect.height < minSize)) {
                                tooSmall.push({
                                    tag: el.tagName,
                                    id: el.id || '',
                                    cls: (el.className || '').toString().substring(0, 40),
                                    text: (el.textContent || '').trim().substring(0, 30),
                                    w: Math.round(rect.width),
                                    h: Math.round(rect.height)
                                });
                            }
                        });
                        return tooSmall;
                    }, config.accessibility.minTapTarget);

                    Assertions.equals(smallTargets.length, 0);
                    results.pass(
                        `Touch targets >= ${config.accessibility.minTapTarget}px at ${vp.name}`,
                        { smallCount: smallTargets.length }
                    );
                } catch (e) {
                    results.fail(`Touch targets at ${vp.name}`, e);
                }
            }

            await vpPage.close();
        }

        // ─────────────────────────────────────────────
        // SECTION 7 — Security hygiene
        // ─────────────────────────────────────────────
        try {
            const insecureResources = await page.evaluate(() =>
                Array.from(document.querySelectorAll('[src], [href]'))
                    .map(el => el.getAttribute('src') || el.getAttribute('href') || '')
                    .filter(src => src.startsWith('http://'))
            );
            Assertions.equals(insecureResources.length, 0);
            results.pass('No insecure HTTP resource URLs', { count: insecureResources.length });
        } catch (e) {
            results.fail('Insecure HTTP resource URLs', e);
        }

        try {
            const unsafeLinks = await page.evaluate(() =>
                Array.from(document.querySelectorAll('a[href^="http"]'))
                    .filter(a => !a.rel || !a.rel.includes('noopener'))
                    .map(a => ({ href: a.href, text: a.textContent.trim().substring(0, 40) }))
            );
            Assertions.equals(unsafeLinks.length, 0);
            results.pass('External links have rel="noopener"', { unsafe: unsafeLinks.length });
        } catch (e) {
            results.fail('External links rel="noopener"', e);
        }

    } catch (fatalError) {
        results.fail('FATAL: Test suite crashed', fatalError);
    } finally {
        if (browser) await browser.close();
    }

    return results.getSummary();
}

module.exports = { runCommunityTests };

if (require.main === module) {
    runCommunityTests().then(results => {
        console.log(JSON.stringify(results, null, 2));
        process.exit(results.failed > 0 ? 1 : 0);
    });
}
