/**
 * GFV LLC - Responsive Design Tests
 * Tests for responsive layouts across all viewport sizes
 */

const { TestResults, BrowserUtils, ElementUtils, Assertions, config } = require('./test-utils');

async function runResponsiveTests() {
    const results = new TestResults('Responsive Design');
    let browser;
    
    try {
        browser = await BrowserUtils.launchBrowser();
        
        // Test each viewport size
        for (const [viewportKey, viewport] of Object.entries(config.viewports)) {
            const page = await BrowserUtils.createPage(browser, viewport);
            await page.goto(config.targets.mainSite, { waitUntil: 'networkidle0', timeout: config.timeouts.navigation });
            
            // ============================================
            // TEST: No Horizontal Overflow
            // ============================================
            try {
                const overflow = await page.evaluate(() => {
                    const docWidth = document.documentElement.scrollWidth;
                    const winWidth = window.innerWidth;
                    
                    // Find elements causing overflow
                    const overflowingElements = [];
                    document.querySelectorAll('*').forEach(el => {
                        const rect = el.getBoundingClientRect();
                        if (rect.right > winWidth + 5) {
                            overflowingElements.push({
                                tag: el.tagName,
                                class: el.className,
                                id: el.id,
                                right: rect.right,
                                overflow: rect.right - winWidth
                            });
                        }
                    });
                    
                    return {
                        hasOverflow: docWidth > winWidth,
                        docWidth,
                        winWidth,
                        overflowAmount: docWidth - winWidth,
                        overflowingElements: overflowingElements.slice(0, 5) // First 5 offenders
                    };
                });
                
                if (overflow.hasOverflow && overflow.overflowAmount > 5) {
                    results.fail(`[${viewport.name}] Horizontal overflow`, 
                        new Error(`${overflow.overflowAmount}px overflow detected`),
                        overflow
                    );
                } else {
                    results.pass(`[${viewport.name}] No horizontal overflow`, { docWidth: overflow.docWidth, winWidth: overflow.winWidth });
                }
            } catch (e) {
                results.fail(`[${viewport.name}] Overflow check`, e);
            }
            
            // ============================================
            // TEST: Navigation Responsive Behavior
            // ============================================
            try {
                const navBehavior = await page.evaluate(() => {
                    const nav = document.querySelector('nav');
                    const navLinks = document.querySelector('.nav-links');
                    const hamburger = document.querySelector('.hamburger, .menu-toggle, [class*="mobile-menu"]');
                    
                    if (!nav) return null;
                    
                    const navLinksStyle = navLinks ? getComputedStyle(navLinks) : null;
                    
                    return {
                        navVisible: getComputedStyle(nav).display !== 'none',
                        navLinksVisible: navLinksStyle?.display !== 'none',
                        hasHamburger: !!hamburger,
                        hamburgerVisible: hamburger ? getComputedStyle(hamburger).display !== 'none' : false,
                        navHeight: nav.getBoundingClientRect().height
                    };
                });
                
                // Mobile viewports should hide nav links and show hamburger (if implemented)
                const isMobile = viewport.width < 768;
                
                if (isMobile && navBehavior?.navLinksVisible) {
                    results.warn(`[${viewport.name}] Nav links visible on mobile`,
                        'Consider hiding nav links on mobile and using a hamburger menu',
                        navBehavior
                    );
                } else {
                    results.pass(`[${viewport.name}] Navigation responsive`, navBehavior);
                }
            } catch (e) {
                results.fail(`[${viewport.name}] Nav responsive check`, e);
            }
            
            // ============================================
            // TEST: Text Readability (Font Sizes)
            // ============================================
            try {
                const fontSizes = await page.evaluate(() => {
                    const measurements = {};
                    
                    const elements = {
                        body: document.body,
                        h1: document.querySelector('h1'),
                        h2: document.querySelector('h2'),
                        h3: document.querySelector('h3'),
                        p: document.querySelector('p'),
                        nav: document.querySelector('nav')
                    };
                    
                    for (const [name, el] of Object.entries(elements)) {
                        if (el) {
                            const styles = getComputedStyle(el);
                            measurements[name] = {
                                fontSize: parseFloat(styles.fontSize),
                                lineHeight: styles.lineHeight,
                                fontSizeRaw: styles.fontSize
                            };
                        }
                    }
                    
                    return measurements;
                });
                
                // Check minimum font sizes
                const minBodyFont = 14;
                const minNavFont = 12;
                
                const issues = [];
                if (fontSizes.body && fontSizes.body.fontSize < minBodyFont) {
                    issues.push(`Body font ${fontSizes.body.fontSize}px < ${minBodyFont}px minimum`);
                }
                if (fontSizes.p && fontSizes.p.fontSize < minBodyFont) {
                    issues.push(`Paragraph font ${fontSizes.p.fontSize}px < ${minBodyFont}px minimum`);
                }
                
                if (issues.length > 0) {
                    results.warn(`[${viewport.name}] Font size issues`, issues.join('; '), fontSizes);
                } else {
                    results.pass(`[${viewport.name}] Font sizes appropriate`, fontSizes);
                }
            } catch (e) {
                results.fail(`[${viewport.name}] Font size check`, e);
            }
            
            // ============================================
            // TEST: Hero Section Responsive
            // ============================================
            try {
                const heroLayout = await page.evaluate(() => {
                    const hero = document.querySelector('.hero');
                    if (!hero) return null;
                    
                    const h1 = hero.querySelector('h1');
                    const heroRect = hero.getBoundingClientRect();
                    const h1Rect = h1 ? h1.getBoundingClientRect() : null;
                    
                    return {
                        heroHeight: heroRect.height,
                        heroMinHeight: getComputedStyle(hero).minHeight,
                        viewportHeight: window.innerHeight,
                        isFullHeight: heroRect.height >= window.innerHeight * 0.8,
                        h1FontSize: h1 ? getComputedStyle(h1).fontSize : null,
                        h1Width: h1Rect ? h1Rect.width : null,
                        viewportWidth: window.innerWidth,
                        h1OverflowsViewport: h1Rect ? h1Rect.width > window.innerWidth : false
                    };
                });
                
                if (heroLayout) {
                    if (heroLayout.h1OverflowsViewport) {
                        results.fail(`[${viewport.name}] Hero h1 overflow`, 
                            new Error('H1 width exceeds viewport'),
                            heroLayout
                        );
                    } else {
                        results.pass(`[${viewport.name}] Hero section responsive`, heroLayout);
                    }
                }
            } catch (e) {
                results.fail(`[${viewport.name}] Hero responsive check`, e);
            }
            
            // ============================================
            // TEST: Grid Layouts Responsive
            // ============================================
            try {
                const gridLayouts = await page.evaluate(() => {
                    const grids = [
                        { selector: '.services-grid', name: 'Services' },
                        { selector: '.portfolio-grid', name: 'Portfolio' },
                        { selector: '.process-grid', name: 'Process' },
                        { selector: '.contact-content', name: 'Contact' }
                    ];
                    
                    return grids.map(grid => {
                        const el = document.querySelector(grid.selector);
                        if (!el) return { ...grid, found: false };
                        
                        const styles = getComputedStyle(el);
                        const children = el.children;
                        const childRects = Array.from(children).slice(0, 4).map(c => c.getBoundingClientRect());
                        
                        // Detect if items are stacked (mobile) or side-by-side
                        const isStacked = childRects.length > 1 && 
                            childRects.every((r, i) => i === 0 || r.top >= childRects[i-1].bottom - 10);
                        
                        return {
                            ...grid,
                            found: true,
                            display: styles.display,
                            gridTemplateColumns: styles.gridTemplateColumns,
                            gap: styles.gap,
                            childCount: children.length,
                            isStacked,
                            firstChildWidth: childRects[0]?.width,
                            viewportWidth: window.innerWidth
                        };
                    });
                });
                
                const isMobile = viewport.width < 600;
                const isTablet = viewport.width >= 600 && viewport.width < 1024;
                
                for (const grid of gridLayouts) {
                    if (!grid.found) continue;
                    
                    // On mobile, grids should stack
                    if (isMobile && !grid.isStacked && grid.name !== 'Contact') {
                        results.warn(`[${viewport.name}] ${grid.name} grid not stacked on mobile`, '', grid);
                    }
                }
                
                results.pass(`[${viewport.name}] Grid layouts analyzed`, 
                    gridLayouts.filter(g => g.found).map(g => ({ name: g.name, isStacked: g.isStacked }))
                );
            } catch (e) {
                results.fail(`[${viewport.name}] Grid layout check`, e);
            }
            
            // ============================================
            // TEST: Images Scale Properly
            // ============================================
            try {
                const imageScaling = await page.evaluate(() => {
                    const images = document.querySelectorAll('img');
                    const viewportWidth = window.innerWidth;
                    
                    return Array.from(images).map(img => {
                        const rect = img.getBoundingClientRect();
                        const styles = getComputedStyle(img);
                        
                        return {
                            src: img.src.substring(img.src.lastIndexOf('/') + 1),
                            displayWidth: rect.width,
                            displayHeight: rect.height,
                            naturalWidth: img.naturalWidth,
                            naturalHeight: img.naturalHeight,
                            exceedsViewport: rect.width > viewportWidth,
                            maxWidth: styles.maxWidth,
                            objectFit: styles.objectFit
                        };
                    });
                });
                
                const oversizedImages = imageScaling.filter(img => img.exceedsViewport);
                
                if (oversizedImages.length > 0) {
                    results.fail(`[${viewport.name}] Images exceed viewport`,
                        new Error(`${oversizedImages.length} images too wide`),
                        { oversized: oversizedImages }
                    );
                } else {
                    results.pass(`[${viewport.name}] Images scale correctly`, { imageCount: imageScaling.length });
                }
            } catch (e) {
                results.fail(`[${viewport.name}] Image scaling`, e);
            }
            
            // ============================================
            // TEST: Touch Targets Size (Mobile Only)
            // ============================================
            if (viewport.width <= 768) {
                try {
                    const touchTargets = await page.evaluate((minSize) => {
                        const interactive = document.querySelectorAll('a, button, input, select, textarea, [role="button"]');
                        const tooSmall = [];
                        
                        interactive.forEach(el => {
                            const rect = el.getBoundingClientRect();
                            const styles = getComputedStyle(el);
                            
                            // Skip hidden elements
                            if (styles.display === 'none' || styles.visibility === 'hidden') return;
                            if (rect.width === 0 || rect.height === 0) return;
                            
                            // Check size
                            if (rect.width < minSize || rect.height < minSize) {
                                tooSmall.push({
                                    tag: el.tagName,
                                    text: el.textContent?.substring(0, 20),
                                    width: rect.width,
                                    height: rect.height,
                                    href: el.href
                                });
                            }
                        });
                        
                        return {
                            totalInteractive: interactive.length,
                            tooSmallCount: tooSmall.length,
                            tooSmall: tooSmall.slice(0, 10)
                        };
                    }, config.accessibility.minTapTarget);
                    
                    if (touchTargets.tooSmallCount > 0) {
                        results.warn(`[${viewport.name}] Touch targets too small`,
                            `${touchTargets.tooSmallCount} elements smaller than ${config.accessibility.minTapTarget}px`,
                            touchTargets
                        );
                    } else {
                        results.pass(`[${viewport.name}] Touch targets adequate`, touchTargets);
                    }
                } catch (e) {
                    results.fail(`[${viewport.name}] Touch target check`, e);
                }
            }
            
            // ============================================
            // TEST: Form Layout Responsive
            // ============================================
            try {
                const formLayout = await page.evaluate(() => {
                    const form = document.querySelector('.contact-form, #contact form');
                    if (!form) return null;
                    
                    const formRect = form.getBoundingClientRect();
                    const inputs = form.querySelectorAll('input, textarea, select');
                    
                    return {
                        formWidth: formRect.width,
                        viewportWidth: window.innerWidth,
                        exceedsViewport: formRect.width > window.innerWidth,
                        inputWidths: Array.from(inputs).slice(0, 5).map(input => ({
                            name: input.name,
                            width: input.getBoundingClientRect().width,
                            percentOfForm: (input.getBoundingClientRect().width / formRect.width * 100).toFixed(1)
                        }))
                    };
                });
                
                if (formLayout?.exceedsViewport) {
                    results.fail(`[${viewport.name}] Form exceeds viewport`,
                        new Error('Form width > viewport'),
                        formLayout
                    );
                } else if (formLayout) {
                    results.pass(`[${viewport.name}] Form layout responsive`, formLayout);
                }
            } catch (e) {
                results.fail(`[${viewport.name}] Form layout check`, e);
            }
            
            // ============================================
            // TEST: Footer Layout Responsive
            // ============================================
            try {
                const footerLayout = await page.evaluate(() => {
                    const footer = document.querySelector('footer');
                    if (!footer) return null;
                    
                    const footerContent = footer.querySelector('.footer-content');
                    const contentStyles = footerContent ? getComputedStyle(footerContent) : null;
                    
                    return {
                        footerWidth: footer.getBoundingClientRect().width,
                        viewportWidth: window.innerWidth,
                        flexDirection: contentStyles?.flexDirection,
                        isStacked: contentStyles?.flexDirection === 'column'
                    };
                });
                
                results.pass(`[${viewport.name}] Footer layout`, footerLayout);
            } catch (e) {
                results.fail(`[${viewport.name}] Footer layout check`, e);
            }
            
            await page.close();
        }
        
        // ============================================
        // TEST: CSS Media Queries Present
        // ============================================
        const page = await BrowserUtils.createPage(browser);
        await page.goto(config.targets.mainSite, { waitUntil: 'networkidle0', timeout: config.timeouts.navigation });
        
        try {
            const mediaQueries = await page.evaluate(() => {
                const styleSheets = Array.from(document.styleSheets);
                const queries = [];
                
                styleSheets.forEach(sheet => {
                    try {
                        const rules = Array.from(sheet.cssRules || []);
                        rules.forEach(rule => {
                            if (rule instanceof CSSMediaRule) {
                                queries.push(rule.conditionText);
                            }
                        });
                    } catch (e) {
                        // Cross-origin stylesheet, skip
                    }
                });
                
                return [...new Set(queries)];
            });
            
            const hasResponsiveQueries = mediaQueries.some(q => 
                q.includes('max-width') || q.includes('min-width')
            );
            
            if (hasResponsiveQueries) {
                results.pass('CSS media queries present', { 
                    queryCount: mediaQueries.length,
                    queries: mediaQueries.slice(0, 10)
                });
            } else {
                results.warn('No responsive media queries found',
                    'Consider adding breakpoints for different screen sizes'
                );
            }
        } catch (e) {
            results.fail('Media query check', e);
        }
        
    } catch (e) {
        results.fail('Responsive test suite setup', e);
    } finally {
        if (browser) await browser.close();
    }
    
    return results.getSummary();
}

module.exports = { runResponsiveTests };

if (require.main === module) {
    runResponsiveTests().then(results => {
        console.log(JSON.stringify(results, null, 2));
        process.exit(results.failed > 0 ? 1 : 0);
    });
}
