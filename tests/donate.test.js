/**
 * GFD - Donate Page Smoke Tests
 * Structural, accessibility, Stripe integration, and responsive checks for donate.html
 *
 * Test target: temp_donate_review.html (mirrors donate.html)
 *
 * Coverage:
 *  - Page loads without critical JS errors
 *  - Document metadata (lang, title, viewport meta)
 *  - Stripe SDK script tag present
 *  - Key donation UI elements (amounts, continue button, success message shell)
 *  - Structural landmarks (main, footer)
 *  - Single <h1> heading
 *  - Back-to-home link present
 *  - Responsive layout — no horizontal overflow at mobile / tablet / desktop
 *  - Touch targets >= 44px on mobile
 *  - WCAG AA colour contrast on body text
 *  - No insecure HTTP resource URLs
 *  - External links carry rel="noopener"
 *  - Amount buttons are keyboard accessible (type="button")
 *  - Custom amount input has a <label>
 */

const { TestResults, BrowserUtils, ElementUtils, Assertions, config } = require('./test-utils');

// ── Inline contrast helpers (matches community.test.js approach) ───────────
function parseColor(color) {
    if (!color || color === 'transparent') return null;
    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3] };
    const h = color.match(/#([0-9a-f]{6}|[0-9a-f]{3})/i);
    if (h) {
        let hex = h[1];
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
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
    const fg = parseColor(styles.color);
    const bg = parseColor(styles.backgroundColor);
    return contrastRatio(fg, bg);
}

// ── Main test runner ──────────────────────────────────────────────────────────
async function runDonateTests() {
    const results = new TestResults('Donate Page');
    let browser;

    try {
        browser = await BrowserUtils.launchBrowser();

        // ─────────────────────────────────────────────
        // SECTION 1 — Page load & critical JS errors
        // ─────────────────────────────────────────────
        const page = await BrowserUtils.createPage(browser);

        const startTime = Date.now();
        await page.goto(config.targets.donatePage, {
            waitUntil: 'domcontentloaded',
            timeout: config.timeouts.navigation,
        });
        const loadTime = Date.now() - startTime;

        try {
            Assertions.lessThan(loadTime, config.timing.loadMax);
            results.pass('Page loads within threshold', { loadTime });
        } catch (e) {
            results.fail('Page load time', e);
        }

        try {
            // Stripe SDK 404s and CORS errors from a file:// origin are expected —
            // filter those and any network-level errors unrelated to the page's own JS.
            const criticalErrors = (page.pageErrors || []).filter(msg =>
                !msg.includes('stripe') && !msg.includes('Stripe') &&
                !msg.includes('net::ERR_') && !msg.includes('ERR_NAME_NOT_RESOLVED') &&
                !msg.includes('gfd-stripe.weave0.workers.dev')
            );
            Assertions.equals(criticalErrors.length, 0);
            results.pass('No critical JavaScript errors', {
                totalErrors: (page.pageErrors || []).length,
                criticalErrors: criticalErrors.length,
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
                'Viewport meta should include width=device-width');
            results.pass('Viewport meta tag correct', { viewport });
        } catch (e) {
            results.fail('Viewport meta tag', e);
        }

        // ─────────────────────────────────────────────
        // SECTION 3 — Stripe SDK integration
        // ─────────────────────────────────────────────
        try {
            const stripeScript = await page.evaluate(() => {
                const scripts = Array.from(document.querySelectorAll('script[src]'));
                return scripts.map(s => s.src).find(src =>
                    src.toLowerCase().includes('stripe')
                ) || null;
            });
            Assertions.isTrue(stripeScript !== null,
                'Stripe JS SDK <script src="..."> tag should be present');
            results.pass('Stripe SDK script tag present', { src: stripeScript });
        } catch (e) {
            results.fail('Stripe SDK script tag', e);
        }

        // ─────────────────────────────────────────────
        // SECTION 4 — Donation UI elements
        // ─────────────────────────────────────────────
        try {
            const amountButtons = await page.evaluate(() =>
                Array.from(document.querySelectorAll('.donation-amount')).length
            );
            Assertions.isTrue(amountButtons >= 3,
                `At least 3 preset donation-amount buttons expected, found ${amountButtons}`);
            results.pass('Preset donation amount buttons present', { count: amountButtons });
        } catch (e) {
            results.fail('Donation amount buttons', e);
        }

        try {
            const continueBtn = await page.evaluate(() =>
                !!document.querySelector('#continue-btn, [id*="continue"]')
            );
            Assertions.isTrue(continueBtn, '"Continue to Payment" button should be present');
            results.pass('"Continue to Payment" button present');
        } catch (e) {
            results.fail('"Continue to Payment" button', e);
        }

        try {
            const successMessage = await page.evaluate(() =>
                !!document.querySelector('.success-message, #success-message')
            );
            Assertions.isTrue(successMessage, 'Success message element should exist in DOM');
            results.pass('Success message element present');
        } catch (e) {
            results.fail('Success message element', e);
        }

        try {
            const customInput = await page.evaluate(() =>
                !!document.querySelector('input[type="number"][id*="custom"], input[id*="custom-amount"]')
            );
            Assertions.isTrue(customInput, 'Custom donation amount input should be present');
            results.pass('Custom amount input present');
        } catch (e) {
            results.fail('Custom amount input', e);
        }

        try {
            const customLabel = await page.evaluate(() => {
                const input = document.querySelector('input[type="number"][id*="custom"], input[id*="custom-amount"]');
                if (!input) return false;
                const id = input.id;
                return !!(
                    document.querySelector(`label[for="${id}"]`) ||
                    input.closest('label') ||
                    input.getAttribute('aria-label')
                );
            });
            Assertions.isTrue(customLabel, 'Custom amount input should have a <label> or aria-label');
            results.pass('Custom amount input is labelled');
        } catch (e) {
            results.fail('Custom amount input label', e);
        }

        // Amount buttons must be type="button" (not submit) to be keyboard accessible
        // without accidentally submitting a parent form
        try {
            const allButtons = await page.evaluate(() =>
                Array.from(document.querySelectorAll('.donation-amount'))
                    .every(btn => btn.getAttribute('type') === 'button')
            );
            Assertions.isTrue(allButtons, 'All .donation-amount buttons should have type="button"');
            results.pass('Amount buttons have correct type="button"');
        } catch (e) {
            results.fail('Amount buttons type attribute', e);
        }

        // ─────────────────────────────────────────────
        // SECTION 5 — Structural landmarks & navigation
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
            const hasFooter = await page.evaluate(() =>
                !!document.querySelector('footer, [role="contentinfo"]'));
            Assertions.isTrue(hasFooter, '<footer> landmark should exist');
            results.pass('<footer> landmark present');
        } catch (e) {
            results.fail('<footer> landmark', e);
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
            Assertions.isTrue(backLink, 'Page should have a back-to-home link');
            results.pass('Back-to-home link present');
        } catch (e) {
            results.fail('Back-to-home link', e);
        }

        // ─────────────────────────────────────────────
        // SECTION 6 — Responsive layout (no overflow)
        // ─────────────────────────────────────────────
        const responsiveViewports = [
            config.viewports.mobile,
            config.viewports.tablet,
            config.viewports.laptop,
        ];

        for (const vp of responsiveViewports) {
            const vpPage = await BrowserUtils.createPage(browser);
            await vpPage.setViewport({ width: vp.width, height: vp.height });
            await vpPage.goto(config.targets.donatePage, {
                waitUntil: 'domcontentloaded',
                timeout: config.timeouts.navigation,
            });

            try {
                const overflow = await vpPage.evaluate(() => {
                    const body = document.body;
                    return body.scrollWidth > window.innerWidth;
                });
                Assertions.isFalse(overflow,
                    `Horizontal overflow should not exist at ${vp.name}`);
                results.pass(`No horizontal overflow at ${vp.name}`);
            } catch (e) {
                results.fail(`Horizontal overflow at ${vp.name}`, e);
            }

            // Touch targets on mobile
            if (vp.width <= 428) {
                try {
                    const smallTargets = await vpPage.evaluate(() => {
                        const MIN = 44;
                        return Array.from(
                            document.querySelectorAll('a, button, input, select, textarea, [role="button"]')
                        ).filter(el => {
                            const r = el.getBoundingClientRect();
                            return r.width > 0 && r.height > 0 &&
                                   (r.width < MIN || r.height < MIN);
                        }).map(el => ({
                            tag: el.tagName,
                            text: (el.textContent || '').trim().substring(0, 30),
                            w: Math.round(el.getBoundingClientRect().width),
                            h: Math.round(el.getBoundingClientRect().height),
                        }));
                    });
                    Assertions.equals(
                        smallTargets.length, 0,
                        `All tap targets should be >= 44px at ${vp.name}`,
                        { smallCount: smallTargets.length, targets: smallTargets }
                    );
                    results.pass(`Touch targets >= 44px at ${vp.name}`, { smallCount: smallTargets.length });
                } catch (e) {
                    results.fail(`Touch targets at ${vp.name}`, e);
                }
            }

            await vpPage.close();
        }

        // ─────────────────────────────────────────────
        // SECTION 7 — WCAG AA colour contrast
        // ─────────────────────────────────────────────
        const contrastSelectors = [
            { sel: 'body', label: 'body text' },
            { sel: 'h1', label: 'h1 heading' },
        ];

        for (const { sel, label } of contrastSelectors) {
            try {
                const ratio = await getElementContrast(page, sel);
                if (ratio === null) {
                    results.warn(`Contrast check skipped for ${label} — could not compute`);
                } else {
                    Assertions.isTrue(
                        ratio >= 4.5,
                        `${label} should meet WCAG AA 4.5:1 (got ${ratio.toFixed(2)}:1)`
                    );
                    results.pass(`WCAG AA contrast: ${label}`, { ratio: ratio.toFixed(2) });
                }
            } catch (e) {
                results.fail(`WCAG AA contrast: ${label}`, e);
            }
        }

        // ─────────────────────────────────────────────
        // SECTION 8 — Security hygiene
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

module.exports = { runDonateTests };

if (require.main === module) {
    runDonateTests().then(results => {
        console.log(JSON.stringify(results, null, 2));
        process.exit(results.failed > 0 ? 1 : 0);
    }).catch(err => {
        console.error('Donate test runner crashed:', err);
        process.exit(1);
    });
}
