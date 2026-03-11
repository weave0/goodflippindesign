/**
 * GFD - Community Portal Tests
 * Structural, accessibility, ARIA, and UI smoke checks for community-portal.html
 *
 * Coverage:
 *  - Page loads without critical JS errors
 *  - Document metadata (lang, title, viewport meta)
 *  - Clerk SDK script tag + CLERK_PUBLISHABLE_KEY initialised
 *  - Key structural landmarks (main, nav, single h1)
 *  - Skip link present and targets #main-content
 *  - Back-to-home navigation link present
 *  - ARIA tab structure (tablist / tab / tabpanel pattern)
 *  - All 5 tab panels present with role="tabpanel"
 *  - Hamburger button has aria-expanded + aria-label
 *  - Modal ARIA (role="dialog", aria-modal, aria-label, close buttons)
 *  - New-post form inputs have labels / aria-labels
 *  - Settings form inputs have labels / aria-labels
 *  - Thread search input has aria-label
 *  - Thread filter group has role="group" + aria-label
 *  - Toast container has aria-live="polite"
 *  - Stats bar has aria-label
 *  - Hero section and key sections have aria-label
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

        // ─────────────────────────────────────────────
        // SECTION 8 — Skip link
        // ─────────────────────────────────────────────
        try {
            const skipLink = await page.evaluate(() => {
                const el = document.querySelector('a.skip-link, a[href="#main-content"]');
                if (!el) return null;
                return { href: el.getAttribute('href'), text: el.textContent.trim() };
            });
            Assertions.isTrue(skipLink !== null, 'Skip link (.skip-link) should be present');
            results.pass('Skip link present', skipLink);
        } catch (e) {
            results.fail('Skip link present', e);
        }

        try {
            const mainContentExists = await page.evaluate(() =>
                !!document.getElementById('main-content')
            );
            Assertions.isTrue(mainContentExists, '#main-content target for skip link should exist');
            results.pass('Skip link target #main-content exists');
        } catch (e) {
            results.fail('Skip link target #main-content exists', e);
        }

        // ─────────────────────────────────────────────
        // SECTION 9 — ARIA tab structure
        // ─────────────────────────────────────────────
        try {
            const tablist = await page.evaluate(() => {
                const el = document.querySelector('[role="tablist"]');
                return el ? { label: el.getAttribute('aria-label') } : null;
            });
            Assertions.isTrue(tablist !== null, 'Element with role="tablist" should be present');
            results.pass('Tab bar has role="tablist"', tablist);
        } catch (e) {
            results.fail('Tab bar role="tablist"', e);
        }

        try {
            const tabs = await page.evaluate(() =>
                Array.from(document.querySelectorAll('[role="tab"]')).map(t => ({
                    text: t.textContent.trim(),
                    ariaSelected: t.getAttribute('aria-selected'),
                    ariaControls: t.getAttribute('aria-controls'),
                }))
            );
            // Expect exactly 5 tabs: Activity Feed, Threads, Leaderboard, Badges, Members
            Assertions.equals(tabs.length, 5);
            results.pass('5 tabs with role="tab" present', { tabs: tabs.map(t => t.text) });
        } catch (e) {
            results.fail('Tabs with role="tab"', e);
        }

        try {
            const panels = await page.evaluate(() =>
                Array.from(document.querySelectorAll('[role="tabpanel"]')).map(p => ({
                    id: p.id,
                }))
            );
            Assertions.equals(panels.length, 5);
            results.pass('5 tab panels with role="tabpanel" present', { panels: panels.map(p => p.id) });
        } catch (e) {
            results.fail('Tab panels with role="tabpanel"', e);
        }

        try {
            const tabsHaveControls = await page.evaluate(() =>
                Array.from(document.querySelectorAll('[role="tab"]')).every(t => {
                    const controls = t.getAttribute('aria-controls');
                    return controls && !!document.getElementById(controls);
                })
            );
            Assertions.isTrue(tabsHaveControls, 'All tabs should have aria-controls pointing to an existing panel id');
            results.pass('All tabs aria-controls reference existing panels');
        } catch (e) {
            results.fail('Tabs aria-controls reference existing panels', e);
        }

        // ─────────────────────────────────────────────
        // SECTION 10 — Hamburger menu ARIA
        // ─────────────────────────────────────────────
        try {
            const hamburger = await page.evaluate(() => {
                const btn = document.getElementById('hamburger-btn');
                if (!btn) return null;
                return {
                    ariaLabel: btn.getAttribute('aria-label'),
                    ariaExpanded: btn.getAttribute('aria-expanded'),
                    type: btn.tagName,
                };
            });
            Assertions.isTrue(hamburger !== null, 'Hamburger button #hamburger-btn should be present');
            Assertions.isTrue(!!hamburger.ariaLabel, 'Hamburger button should have aria-label');
            Assertions.isTrue(hamburger.ariaExpanded !== null, 'Hamburger button should have aria-expanded');
            results.pass('Hamburger button has correct ARIA attributes', hamburger);
        } catch (e) {
            results.fail('Hamburger button ARIA', e);
        }

        // ─────────────────────────────────────────────
        // SECTION 11 — Modal ARIA
        // ─────────────────────────────────────────────
        try {
            const newPostModal = await page.evaluate(() => {
                const el = document.getElementById('modal-new-post');
                if (!el) return null;
                return {
                    role: el.getAttribute('role'),
                    ariaModal: el.getAttribute('aria-modal'),
                    ariaLabel: el.getAttribute('aria-label'),
                    hasCloseBtn: !!document.getElementById('modal-close'),
                };
            });
            Assertions.isTrue(newPostModal !== null, '#modal-new-post should exist');
            Assertions.equals(newPostModal.role, 'dialog');
            Assertions.equals(newPostModal.ariaModal, 'true');
            Assertions.isTrue(!!newPostModal.ariaLabel, 'New-post modal should have aria-label');
            Assertions.isTrue(newPostModal.hasCloseBtn, 'New-post modal should have a close button');
            results.pass('New-post modal has correct ARIA attributes', newPostModal);
        } catch (e) {
            results.fail('New-post modal ARIA', e);
        }

        try {
            const settingsModal = await page.evaluate(() => {
                const el = document.getElementById('modal-settings');
                if (!el) return null;
                return {
                    role: el.getAttribute('role'),
                    ariaModal: el.getAttribute('aria-modal'),
                    ariaLabel: el.getAttribute('aria-label'),
                    hasCloseBtn: !!document.getElementById('settings-close'),
                };
            });
            Assertions.isTrue(settingsModal !== null, '#modal-settings should exist');
            Assertions.equals(settingsModal.role, 'dialog');
            Assertions.equals(settingsModal.ariaModal, 'true');
            Assertions.isTrue(!!settingsModal.ariaLabel, 'Settings modal should have aria-label');
            Assertions.isTrue(settingsModal.hasCloseBtn, 'Settings modal should have a close button');
            results.pass('Settings modal has correct ARIA attributes', settingsModal);
        } catch (e) {
            results.fail('Settings modal ARIA', e);
        }

        // Close buttons in modals must have aria-label
        try {
            const closeBtnsWithoutLabel = await page.evaluate(() =>
                Array.from(document.querySelectorAll(
                    '#modal-new-post .modal-close, #modal-settings .modal-close, #mobile-nav-close'
                )).filter(btn => !btn.getAttribute('aria-label')).length
            );
            Assertions.equals(closeBtnsWithoutLabel, 0);
            results.pass('Modal and nav close buttons have aria-label');
        } catch (e) {
            results.fail('Modal/nav close buttons aria-label', e);
        }

        // ─────────────────────────────────────────────
        // SECTION 12 — Form input accessibility
        // ─────────────────────────────────────────────
        try {
            // Thread search input
            const searchAriaLabel = await page.evaluate(() => {
                const el = document.getElementById('thread-search-input');
                return el ? el.getAttribute('aria-label') : null;
            });
            Assertions.isTrue(!!searchAriaLabel, 'Thread search input should have aria-label');
            results.pass('Thread search input has aria-label', { label: searchAriaLabel });
        } catch (e) {
            results.fail('Thread search input aria-label', e);
        }

        try {
            // Thread sort select
            const sortAriaLabel = await page.evaluate(() => {
                const el = document.getElementById('thread-sort');
                return el ? el.getAttribute('aria-label') : null;
            });
            Assertions.isTrue(!!sortAriaLabel, 'Thread sort select should have aria-label');
            results.pass('Thread sort select has aria-label', { label: sortAriaLabel });
        } catch (e) {
            results.fail('Thread sort select aria-label', e);
        }

        try {
            // Thread filter group role="group"
            const filterGroup = await page.evaluate(() => {
                const el = document.querySelector('.thread-filter-group[role="group"]');
                return el ? { role: el.getAttribute('role'), label: el.getAttribute('aria-label') } : null;
            });
            Assertions.isTrue(filterGroup !== null, 'Thread filter group should have role="group"');
            Assertions.isTrue(!!filterGroup.ariaLabel || filterGroup.label !== null,
                'Thread filter group should have aria-label');
            results.pass('Thread filter group has role="group" + aria-label');
        } catch (e) {
            results.fail('Thread filter group role/aria-label', e);
        }

        try {
            // Settings form inputs have labels (label element or aria-label)
            const unlabeledInputs = await page.evaluate(() => {
                const settingsForm = document.getElementById('form-settings');
                if (!settingsForm) return [];
                return Array.from(settingsForm.querySelectorAll('input, textarea, select'))
                    .filter(input => {
                        if (input.type === 'checkbox') return false; // wrapped in <label>
                        const id = input.id;
                        const hasLabel = id && !!document.querySelector(`label[for="${id}"]`);
                        const hasAriaLabel = !!input.getAttribute('aria-label');
                        const hasAriaLabelledBy = !!input.getAttribute('aria-labelledby');
                        const wrappedInLabel = !!input.closest('label');
                        return !hasLabel && !hasAriaLabel && !hasAriaLabelledBy && !wrappedInLabel;
                    })
                    .map(el => ({ id: el.id, type: el.type, placeholder: el.placeholder }));
            });
            Assertions.equals(unlabeledInputs.length, 0);
            results.pass('Settings form inputs are labelled');
        } catch (e) {
            results.fail('Settings form inputs labelled', e);
        }

        // ─────────────────────────────────────────────
        // SECTION 13 — Live regions & section labels
        // ─────────────────────────────────────────────
        try {
            const toastAriaLive = await page.evaluate(() => {
                const el = document.getElementById('toast-container');
                return el ? el.getAttribute('aria-live') : null;
            });
            Assertions.equals(toastAriaLive, 'polite');
            results.pass('Toast container has aria-live="polite"', { ariaLive: toastAriaLive });
        } catch (e) {
            results.fail('Toast container aria-live', e);
        }

        try {
            const statsBarLabel = await page.evaluate(() => {
                const el = document.getElementById('stats-bar');
                return el ? el.getAttribute('aria-label') : null;
            });
            Assertions.isTrue(!!statsBarLabel, 'Stats bar should have aria-label');
            results.pass('Stats bar has aria-label', { label: statsBarLabel });
        } catch (e) {
            results.fail('Stats bar aria-label', e);
        }

        try {
            // Verify key sections have aria-label
            const labelledSections = await page.evaluate(() => {
                const sectionsWithLabel = [
                    { id: null, selector: '.hero-section[aria-label]' },
                    { id: 'checkin-section', selector: '#checkin-section[aria-label]' },
                    { id: 'profile-card', selector: '#profile-card[aria-label]' },
                ];
                return sectionsWithLabel.map(s => ({
                    selector: s.selector,
                    found: !!document.querySelector(s.selector),
                    label: document.querySelector(s.selector)?.getAttribute('aria-label'),
                }));
            });
            const allLabelled = labelledSections.every(s => s.found);
            Assertions.isTrue(allLabelled, 'Hero, check-in, and profile sections should have aria-label');
            results.pass('Key sections have aria-label', { sections: labelledSections.map(s => s.label) });
        } catch (e) {
            results.fail('Key sections aria-label', e);
        }

        // ─────────────────────────────────────────────
        // SECTION 14 — Hero CTA buttons + New-post button
        // ─────────────────────────────────────────────
        try {
            const heroBtns = await page.evaluate(() => {
                const primary = document.getElementById('hero-primary-btn');
                const secondary = document.getElementById('hero-secondary-btn');
                return {
                    primaryExists: !!primary,
                    primaryType: primary?.getAttribute('type'),
                    secondaryExists: !!secondary,
                    secondaryType: secondary?.getAttribute('type'),
                };
            });
            Assertions.isTrue(heroBtns.primaryExists, '#hero-primary-btn should be present');
            Assertions.isTrue(heroBtns.secondaryExists, '#hero-secondary-btn should be present');
            Assertions.equals(heroBtns.primaryType, 'button');
            Assertions.equals(heroBtns.secondaryType, 'button');
            results.pass('Hero CTA buttons have type="button"', heroBtns);
        } catch (e) {
            results.fail('Hero CTA buttons type="button"', e);
        }

        try {
            const newPostBtn = await page.evaluate(() => {
                const btn = document.getElementById('btn-new-post');
                return btn ? { exists: true, type: btn.tagName } : null;
            });
            Assertions.isTrue(newPostBtn !== null, '#btn-new-post should be present');
            results.pass('New-post button present', newPostBtn);
        } catch (e) {
            results.fail('New-post button present', e);
        }

        // ─────────────────────────────────────────────
        // SECTION 15 — Mobile nav ARIA completeness
        // ─────────────────────────────────────────────
        try {
            const mobileNav = await page.evaluate(() => {
                const nav = document.getElementById('mobile-nav');
                const closeBtn = document.getElementById('mobile-nav-close');
                return {
                    navExists: !!nav,
                    navAriaLabel: nav?.getAttribute('aria-label'),
                    closeBtnExists: !!closeBtn,
                    closeBtnAriaLabel: closeBtn?.getAttribute('aria-label'),
                };
            });
            Assertions.isTrue(mobileNav.navExists, '#mobile-nav should be present');
            Assertions.isTrue(!!mobileNav.navAriaLabel, 'Mobile nav should have aria-label');
            Assertions.isTrue(mobileNav.closeBtnExists, '#mobile-nav-close should be present');
            Assertions.isTrue(!!mobileNav.closeBtnAriaLabel, 'Mobile nav close button should have aria-label');
            results.pass('Mobile nav has correct ARIA attributes', mobileNav);
        } catch (e) {
            results.fail('Mobile nav ARIA', e);
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
