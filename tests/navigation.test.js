/**
 * GFV LLC - Navigation & Link Tests
 * Tests for all navigation, anchors, smooth scrolling, and link integrity
 */

const { TestResults, BrowserUtils, ElementUtils, Assertions, config, delay } = require('./test-utils');

async function runNavigationTests() {
    const results = new TestResults('Navigation & Links');
    let browser;
    
    try {
        browser = await BrowserUtils.launchBrowser();
        const page = await BrowserUtils.createPage(browser);
        
        await page.goto(config.targets.mainSite, { waitUntil: 'networkidle0', timeout: config.timeouts.navigation });
        
        // ============================================
        // TEST: Fixed Navigation Stays Visible on Scroll
        // ============================================
        try {
            // Get initial nav position
            const initialNav = await page.evaluate(() => {
                const nav = document.querySelector('nav');
                const rect = nav.getBoundingClientRect();
                return { top: rect.top, visible: rect.top >= 0 };
            });
            
            // Scroll down significantly
            await page.evaluate(() => window.scrollTo(0, 1000));
            await delay(config.timing.scrollDelay);
            
            // Check nav is still visible
            const scrolledNav = await page.evaluate(() => {
                const nav = document.querySelector('nav');
                const rect = nav.getBoundingClientRect();
                const styles = getComputedStyle(nav);
                return { 
                    top: rect.top, 
                    visible: rect.top >= 0,
                    position: styles.position,
                    zIndex: styles.zIndex
                };
            });
            
            Assertions.isTrue(scrolledNav.visible, 'Navigation should stay visible when scrolling');
            Assertions.equals(scrolledNav.position, 'fixed', 'Navigation should be fixed');
            
            // Scroll back to top for other tests
            await page.evaluate(() => window.scrollTo(0, 0));
            
            results.pass('Fixed navigation stays visible on scroll', scrolledNav);
        } catch (e) {
            results.fail('Fixed navigation scroll test', e);
        }
        
        // ============================================
        // TEST: Internal Anchor Links Work
        // ============================================
        try {
            const anchorLinks = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('a[href^="#"]')).map(a => ({
                    href: a.getAttribute('href'),
                    text: a.textContent.trim().substring(0, 30),
                    targetExists: !!document.querySelector(a.getAttribute('href'))
                }));
            });
            
            const brokenAnchors = anchorLinks.filter(link => !link.targetExists && link.href !== '#');
            
            if (brokenAnchors.length > 0) {
                throw new Error(`Broken anchor links: ${brokenAnchors.map(l => l.href).join(', ')}`);
            }
            
            results.pass('All internal anchor links have valid targets', { 
                totalAnchors: anchorLinks.length,
                anchors: anchorLinks.map(a => a.href)
            });
        } catch (e) {
            results.fail('Internal anchor link validation', e);
        }
        
        // ============================================
        // TEST: Smooth Scroll Behavior
        // ============================================
        try {
            // Get a valid anchor link (exclude skip-link which is offscreen)
            const anchorHref = await page.evaluate(() => {
                const link = document.querySelector('a[href^="#"]:not([href="#"]):not(.skip-link)');
                return link ? link.getAttribute('href') : null;
            });
            
            if (anchorHref) {
                const targetId = anchorHref.substring(1);
                
                // Get initial scroll position
                const initialScroll = await page.evaluate(() => window.scrollY);
                
                // Click the anchor link
                await page.click(`a[href="${anchorHref}"]:not(.skip-link)`);
                await delay(100);
                
                // Check if scrolling started (smooth scroll means intermediate positions)
                const midScroll = await page.evaluate(() => window.scrollY);
                
                // Wait for scroll to complete
                await delay(500);
                
                // Get final position
                const finalScroll = await page.evaluate(() => window.scrollY);
                const targetPosition = await page.evaluate((id) => {
                    const el = document.getElementById(id);
                    return el ? el.getBoundingClientRect().top + window.scrollY : null;
                }, targetId);
                
                // Verify we scrolled
                Assertions.isTrue(finalScroll !== initialScroll, 'Page should scroll after clicking anchor');
                
                // Check if smooth scrolling is enabled (CSS)
                const smoothScrollEnabled = await page.evaluate(() => {
                    return getComputedStyle(document.documentElement).scrollBehavior === 'smooth';
                });
                
                if (smoothScrollEnabled) {
                    results.pass('Smooth scroll behavior enabled and working', {
                        from: initialScroll,
                        to: finalScroll,
                        target: anchorHref
                    });
                } else {
                    results.warn('Scroll works but smooth behavior not enabled', 
                        'Consider adding scroll-behavior: smooth to html',
                        { scrollBehavior: 'instant' }
                    );
                }
            } else {
                results.skip('Smooth scroll test', 'No valid anchor links found');
            }
            
            // Reset scroll position
            await page.evaluate(() => window.scrollTo(0, 0));
        } catch (e) {
            results.fail('Smooth scroll behavior', e);
        }
        
        // ============================================
        // TEST: Nav Links Navigate to Correct Sections
        // ============================================
        try {
            const navLinks = await page.evaluate(() => {
                const links = document.querySelectorAll('.nav-links a, nav a[href^="#"]');
                return Array.from(links).map(a => ({
                    href: a.getAttribute('href'),
                    text: a.textContent.trim()
                })).filter(l => l.href && l.href.startsWith('#'));
            });
            
            for (const link of navLinks) {
                // Click the link
                await page.click(`nav a[href="${link.href}"]`);
                await delay(600); // Wait for smooth scroll
                
                // Verify the target section is in view
                const inView = await page.evaluate((href) => {
                    const target = document.querySelector(href);
                    if (!target) return { found: false };
                    
                    const rect = target.getBoundingClientRect();
                    const viewHeight = window.innerHeight;
                    
                    // Section should be near the top of viewport (accounting for fixed nav)
                    return {
                        found: true,
                        top: rect.top,
                        inView: rect.top < viewHeight * 0.3 && rect.top > -100
                    };
                }, link.href);
                
                if (!inView.found) {
                    throw new Error(`Target ${link.href} not found`);
                }
                
                if (!inView.inView) {
                    results.warn(`Nav link ${link.text}`, `Section not scrolled to ideal position (top: ${inView.top}px)`);
                }
            }
            
            // Reset
            await page.evaluate(() => window.scrollTo(0, 0));
            
            results.pass('Navigation links scroll to correct sections', { 
                testedLinks: navLinks.length 
            });
        } catch (e) {
            results.fail('Nav link navigation', e);
        }
        
        // ============================================
        // TEST: External Links Have Target Blank
        // ============================================
        try {
            const externalLinks = await page.evaluate(() => {
                const links = document.querySelectorAll('a[href^="http"]');
                return Array.from(links).map(a => ({
                    href: a.href,
                    text: a.textContent.trim().substring(0, 30),
                    target: a.target,
                    rel: a.rel,
                    hasTargetBlank: a.target === '_blank',
                    hasNoopener: a.rel.includes('noopener')
                }));
            });
            
            const missingTarget = externalLinks.filter(l => !l.hasTargetBlank);
            const missingNoopener = externalLinks.filter(l => l.hasTargetBlank && !l.hasNoopener);
            
            if (missingTarget.length > 0) {
                results.warn('External links without target="_blank"', 
                    `${missingTarget.length} external links open in same tab`,
                    { links: missingTarget.map(l => l.href) }
                );
            }
            
            if (missingNoopener.length > 0) {
                results.warn('External links without rel="noopener"',
                    'Security: external links should have rel="noopener"',
                    { links: missingNoopener.map(l => l.href) }
                );
            }
            
            if (missingTarget.length === 0 && missingNoopener.length === 0) {
                results.pass('All external links configured correctly', {
                    totalExternal: externalLinks.length
                });
            }
        } catch (e) {
            results.fail('External link validation', e);
        }
        
        // ============================================
        // TEST: Logo Links to Home
        // ============================================
        try {
            const logo = await page.evaluate(() => {
                const logoLink = document.querySelector('.logo');
                if (!logoLink) return null;
                return {
                    href: logoLink.getAttribute('href'),
                    tagName: logoLink.tagName,
                    text: logoLink.textContent.trim()
                };
            });
            
            Assertions.isTrue(logo !== null, 'Logo element not found');
            Assertions.equals(logo.tagName.toLowerCase(), 'a', 'Logo should be a link');
            Assertions.isTrue(
                logo.href === '/' || logo.href === '#' || logo.href === '',
                `Logo should link to home, got: ${logo.href}`
            );
            
            results.pass('Logo links to home correctly', logo);
        } catch (e) {
            results.fail('Logo link validation', e);
        }
        
        // ============================================
        // TEST: CTA Button Links Work
        // ============================================
        try {
            const ctaButtons = await page.evaluate(() => {
                const buttons = document.querySelectorAll('.btn-primary, .btn-secondary, .nav-cta');
                return Array.from(buttons).map(btn => ({
                    text: btn.textContent.trim(),
                    href: btn.getAttribute('href'),
                    tagName: btn.tagName,
                    isLink: btn.tagName === 'A',
                    isButton: btn.tagName === 'BUTTON',
                    targetExists: btn.getAttribute('href')?.startsWith('#') 
                        ? !!document.querySelector(btn.getAttribute('href'))
                        : true
                }));
            });
            
            const brokenCTAs = ctaButtons.filter(btn => !btn.targetExists);
            
            if (brokenCTAs.length > 0) {
                throw new Error(`Broken CTA links: ${brokenCTAs.map(b => b.text).join(', ')}`);
            }
            
            results.pass('All CTA buttons have valid links', { 
                totalCTAs: ctaButtons.length,
                ctas: ctaButtons.map(b => ({ text: b.text, href: b.href }))
            });
        } catch (e) {
            results.fail('CTA button validation', e);
        }
        
        // ============================================
        // TEST: Portfolio Card Links
        // ============================================
        try {
            const portfolioLinks = await page.evaluate(() => {
                const cards = document.querySelectorAll('.portfolio-card');
                return Array.from(cards).map(card => ({
                    title: card.querySelector('h3')?.textContent,
                    href: card.href,
                    isLink: card.tagName === 'A',
                    hasNoLink: card.classList.contains('no-link'),
                    target: card.target
                }));
            });
            
            const linkedCards = portfolioLinks.filter(p => p.isLink && !p.hasNoLink);
            const unlinkedCards = portfolioLinks.filter(p => p.hasNoLink || !p.isLink);
            
            results.pass('Portfolio card links analyzed', {
                linkedProjects: linkedCards.length,
                unlinkedProjects: unlinkedCards.length,
                linkedCards: linkedCards.map(c => ({ title: c.title, href: c.href }))
            });
        } catch (e) {
            results.fail('Portfolio link validation', e);
        }
        
        // ============================================
        // TEST: Footer Links
        // ============================================
        try {
            const footerLinks = await page.evaluate(() => {
                const footer = document.querySelector('footer');
                if (!footer) return [];
                
                return Array.from(footer.querySelectorAll('a')).map(a => ({
                    text: a.textContent.trim(),
                    href: a.href,
                    target: a.target,
                    isExternal: a.href.startsWith('http')
                }));
            });
            
            Assertions.greaterThan(footerLinks.length, 0, 'Footer should have links');
            
            results.pass('Footer links present', {
                linkCount: footerLinks.length,
                links: footerLinks
            });
        } catch (e) {
            results.fail('Footer link validation', e);
        }
        
        // ============================================
        // TEST: Keyboard Navigation (Tab Order)
        // ============================================
        try {
            // Get all focusable elements in tab order
            const tabOrder = await page.evaluate(() => {
                const focusable = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
                const elements = Array.from(document.querySelectorAll(focusable));
                
                // Sort by tabindex (0 or positive values first, then DOM order)
                return elements
                    .filter(el => {
                        const style = getComputedStyle(el);
                        return style.display !== 'none' && 
                               style.visibility !== 'hidden' && 
                               !el.disabled;
                    })
                    .map(el => ({
                        tagName: el.tagName,
                        text: el.textContent?.trim().substring(0, 30) || el.placeholder || el.name,
                        href: el.href,
                        tabIndex: el.tabIndex,
                        type: el.type
                    }));
            });
            
            Assertions.greaterThan(tabOrder.length, 0, 'Should have focusable elements');
            
            // Verify first focusable is likely the skip link or nav
            const firstFocusable = tabOrder[0];
            Assertions.isTrue(
                firstFocusable.tagName === 'A' || firstFocusable.tagName === 'BUTTON',
                'First focusable element should be a link or button'
            );
            
            results.pass('Tab order established', {
                totalFocusable: tabOrder.length,
                first5: tabOrder.slice(0, 5)
            });
        } catch (e) {
            results.fail('Keyboard navigation', e);
        }
        
        // ============================================
        // TEST: Focus Visible States
        // ============================================
        try {
            // Tab to first element and check focus style
            await page.keyboard.press('Tab');
            
            const focusedElement = await page.evaluate(() => {
                const el = document.activeElement;
                const styles = getComputedStyle(el);
                const beforeFocus = el.style.outline || 'none';
                
                return {
                    tagName: el.tagName,
                    text: el.textContent?.substring(0, 30),
                    outline: styles.outline,
                    outlineOffset: styles.outlineOffset,
                    boxShadow: styles.boxShadow,
                    hasFocusStyle: styles.outline !== 'none' || 
                                   styles.boxShadow !== 'none' ||
                                   styles.border !== getComputedStyle(document.body).border
                };
            });
            
            Assertions.isTrue(focusedElement.hasFocusStyle, 
                'Focused elements should have visible focus indicator');
            
            results.pass('Focus visible states working', focusedElement);
        } catch (e) {
            results.fail('Focus visible states', e);
        }
        
        // ============================================
        // TEST: Skip Link (Accessibility)
        // ============================================
        try {
            const skipLink = await page.evaluate(() => {
                // Common skip link selectors
                const selectors = [
                    'a[href="#main"]',
                    'a[href="#content"]',
                    '.skip-link',
                    '[class*="skip"]'
                ];
                
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el) {
                        return {
                            found: true,
                            href: el.href,
                            text: el.textContent,
                            visible: getComputedStyle(el).display !== 'none'
                        };
                    }
                }
                
                return { found: false };
            });
            
            if (skipLink.found) {
                results.pass('Skip link present', skipLink);
            } else {
                results.warn('Skip link not found',
                    'Consider adding a skip link for keyboard users: <a href="#main" class="skip-link">Skip to content</a>'
                );
            }
        } catch (e) {
            results.fail('Skip link check', e);
        }
        
        // ============================================
        // TEST: Back to Top Functionality
        // ============================================
        try {
            // Check for back-to-top button
            const backToTop = await page.evaluate(() => {
                const selectors = [
                    '.back-to-top',
                    '[class*="scroll-top"]',
                    'a[href="#top"]',
                    'a[href="#"]'
                ];
                
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el && el.textContent?.toLowerCase().includes('top')) {
                        return { found: true, selector: sel, text: el.textContent };
                    }
                }
                return { found: false };
            });
            
            if (backToTop.found) {
                results.pass('Back to top functionality present', backToTop);
            } else {
                results.skip('Back to top check', 'No back-to-top button found (optional feature)');
            }
        } catch (e) {
            results.fail('Back to top check', e);
        }
        
    } catch (e) {
        results.fail('Navigation test suite setup', e);
    } finally {
        if (browser) await browser.close();
    }
    
    return results.getSummary();
}

module.exports = { runNavigationTests };

if (require.main === module) {
    runNavigationTests().then(results => {
        console.log(JSON.stringify(results, null, 2));
        process.exit(results.failed > 0 ? 1 : 0);
    });
}
