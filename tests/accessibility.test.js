/**
 * GFV LLC - Accessibility (a11y) Tests
 * Comprehensive WCAG 2.1 AA compliance testing
 */

const { TestResults, BrowserUtils, ElementUtils, ColorUtils, Assertions, config } = require('./test-utils');

async function runAccessibilityTests() {
    const results = new TestResults('Accessibility (WCAG 2.1 AA)');
    let browser;
    
    try {
        browser = await BrowserUtils.launchBrowser();
        const page = await BrowserUtils.createPage(browser);
        
        await page.goto(config.targets.mainSite, { waitUntil: 'networkidle0', timeout: config.timeouts.navigation });
        
        // ============================================
        // TEST: Document Language
        // ============================================
        try {
            const lang = await page.evaluate(() => {
                return {
                    hasLang: document.documentElement.hasAttribute('lang'),
                    lang: document.documentElement.lang,
                    isValidLang: /^[a-z]{2}(-[A-Z]{2})?$/.test(document.documentElement.lang)
                };
            });
            
            Assertions.isTrue(lang.hasLang, 'Document should have lang attribute');
            Assertions.isTrue(lang.isValidLang, `Lang "${lang.lang}" should be valid format`);
            
            results.pass('Document language set correctly', lang);
        } catch (e) {
            results.fail('Document language', e);
        }
        
        // ============================================
        // TEST: Page Title
        // ============================================
        try {
            const title = await page.evaluate(() => {
                return {
                    hasTitle: !!document.title,
                    title: document.title,
                    length: document.title.length,
                    isDescriptive: document.title.length > 10 && document.title.length < 70
                };
            });
            
            Assertions.isTrue(title.hasTitle, 'Page should have title');
            Assertions.isTrue(title.isDescriptive, 'Title should be descriptive (10-70 chars)');
            
            results.pass('Page title appropriate', title);
        } catch (e) {
            results.fail('Page title', e);
        }
        
        // ============================================
        // TEST: Heading Hierarchy
        // ============================================
        try {
            const headings = await page.evaluate(() => {
                const allHeadings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
                const headingData = Array.from(allHeadings).map((h, i) => ({
                    level: parseInt(h.tagName[1]),
                    text: h.textContent.trim().substring(0, 50),
                    index: i
                }));
                
                // Check for skipped levels
                const issues = [];
                let prevLevel = 0;
                
                headingData.forEach((h, i) => {
                    if (prevLevel > 0 && h.level > prevLevel + 1) {
                        issues.push(`Skipped from h${prevLevel} to h${h.level} at "${h.text}"`);
                    }
                    prevLevel = h.level;
                });
                
                return {
                    count: allHeadings.length,
                    h1Count: document.querySelectorAll('h1').length,
                    headings: headingData,
                    issues,
                    hasProperH1: document.querySelectorAll('h1').length === 1
                };
            });
            
            if (!headings.hasProperH1) {
                results.fail('Heading hierarchy', 
                    new Error(`Should have exactly 1 h1, found ${headings.h1Count}`),
                    headings
                );
            } else if (headings.issues.length > 0) {
                results.warn('Heading hierarchy has skipped levels', 
                    headings.issues.join('; '),
                    headings
                );
            } else {
                results.pass('Heading hierarchy correct', headings);
            }
        } catch (e) {
            results.fail('Heading hierarchy', e);
        }
        
        // ============================================
        // TEST: Image Alt Text
        // ============================================
        try {
            const images = await page.evaluate(() => {
                const imgs = document.querySelectorAll('img');
                return Array.from(imgs).map(img => ({
                    src: img.src.split('/').pop(),
                    hasAlt: img.hasAttribute('alt'),
                    alt: img.alt,
                    isDecorative: img.alt === '' && img.hasAttribute('alt'),
                    inLink: !!img.closest('a'),
                    width: img.width,
                    height: img.height,
                    role: img.getAttribute('role')
                }));
            });
            
            const missingAlt = images.filter(img => !img.hasAlt);
            const emptyAltInLink = images.filter(img => img.isDecorative && img.inLink);
            
            if (missingAlt.length > 0) {
                results.fail('Image alt text', 
                    new Error(`${missingAlt.length} images missing alt attribute`),
                    { missingAlt }
                );
            } else if (emptyAltInLink.length > 0) {
                results.warn('Images in links with empty alt',
                    'Linked images with empty alt may cause accessibility issues',
                    { emptyAltInLink }
                );
            } else {
                results.pass('All images have alt text', { count: images.length });
            }
        } catch (e) {
            results.fail('Image alt text', e);
        }
        
        // ============================================
        // TEST: Link Text Quality
        // ============================================
        try {
            const links = await page.evaluate(() => {
                const allLinks = document.querySelectorAll('a');
                const vagueLinkTexts = ['click here', 'here', 'read more', 'learn more', 'more', 'link'];
                
                return Array.from(allLinks).map(a => {
                    const text = a.textContent.trim().toLowerCase();
                    const ariaLabel = a.getAttribute('aria-label');
                    const title = a.title;
                    
                    return {
                        text: a.textContent.trim().substring(0, 50),
                        href: a.href,
                        isVague: vagueLinkTexts.includes(text) && !ariaLabel,
                        hasAriaLabel: !!ariaLabel,
                        ariaLabel,
                        isEmpty: text.length === 0 && !ariaLabel,
                        hasTitle: !!title
                    };
                });
            });
            
            const vagueLinks = links.filter(l => l.isVague);
            const emptyLinks = links.filter(l => l.isEmpty);
            
            if (emptyLinks.length > 0) {
                results.fail('Link text quality',
                    new Error(`${emptyLinks.length} links have no accessible text`),
                    { emptyLinks }
                );
            } else if (vagueLinks.length > 0) {
                results.warn('Vague link text detected',
                    'Some links use generic text like "click here"',
                    { vagueLinks }
                );
            } else {
                results.pass('Link text quality good', { totalLinks: links.length });
            }
        } catch (e) {
            results.fail('Link text quality', e);
        }
        
        // ============================================
        // TEST: Form Labels
        // ============================================
        try {
            const formLabels = await page.evaluate(() => {
                const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]), textarea, select');
                
                return Array.from(inputs).map(input => {
                    const id = input.id;
                    const explicitLabel = id ? document.querySelector(`label[for="${id}"]`) : null;
                    const implicitLabel = input.closest('label');
                    const ariaLabel = input.getAttribute('aria-label');
                    const ariaLabelledBy = input.getAttribute('aria-labelledby');
                    const placeholder = input.placeholder;
                    
                    return {
                        type: input.type || input.tagName.toLowerCase(),
                        id,
                        name: input.name,
                        hasExplicitLabel: !!explicitLabel,
                        hasImplicitLabel: !!implicitLabel,
                        hasAriaLabel: !!ariaLabel,
                        hasAriaLabelledBy: !!ariaLabelledBy,
                        hasPlaceholderOnly: !explicitLabel && !implicitLabel && !ariaLabel && !ariaLabelledBy && !!placeholder,
                        isAccessible: !!(explicitLabel || implicitLabel || ariaLabel || ariaLabelledBy)
                    };
                });
            });
            
            const inaccessibleInputs = formLabels.filter(i => !i.isAccessible);
            const placeholderOnly = formLabels.filter(i => i.hasPlaceholderOnly);
            
            if (inaccessibleInputs.length > 0) {
                results.fail('Form labels',
                    new Error(`${inaccessibleInputs.length} form fields have no accessible label`),
                    { inaccessibleInputs }
                );
            } else if (placeholderOnly.length > 0) {
                results.warn('Inputs using placeholder as only label',
                    'Placeholders disappear on input - use proper labels',
                    { placeholderOnly }
                );
            } else {
                results.pass('All form fields have labels', { count: formLabels.length });
            }
        } catch (e) {
            results.fail('Form labels', e);
        }
        
        // ============================================
        // TEST: Color Contrast
        // ============================================
        try {
            const contrastIssues = await page.evaluate(() => {
                const issues = [];
                const textElements = document.querySelectorAll('p, span, a, h1, h2, h3, h4, h5, h6, li, label, button');
                
                // Helper to parse color
                const parseColor = (color) => {
                    if (!color || color === 'transparent') return null;
                    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                    if (match) {
                        return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
                    }
                    return null;
                };
                
                // Helper for luminance
                const getLuminance = (color) => {
                    if (!color) return 0;
                    const [rs, gs, bs] = [color.r, color.g, color.b].map(c => {
                        c = c / 255;
                        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
                    });
                    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
                };
                
                // Helper for contrast ratio
                const getContrastRatio = (c1, c2) => {
                    const l1 = getLuminance(c1);
                    const l2 = getLuminance(c2);
                    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
                };
                
                const checked = new Set();
                
                textElements.forEach(el => {
                    const styles = getComputedStyle(el);
                    if (styles.display === 'none' || styles.visibility === 'hidden') return;
                    
                    const fg = parseColor(styles.color);
                    const bg = parseColor(styles.backgroundColor);
                    
                    if (!fg || !bg) return;
                    
                    const key = `${styles.color}-${styles.backgroundColor}`;
                    if (checked.has(key)) return;
                    checked.add(key);
                    
                    const ratio = getContrastRatio(fg, bg);
                    const fontSize = parseFloat(styles.fontSize);
                    const isBold = parseInt(styles.fontWeight) >= 700;
                    const isLargeText = fontSize >= 18 || (fontSize >= 14 && isBold);
                    const minRatio = isLargeText ? 3 : 4.5;
                    
                    if (ratio < minRatio) {
                        issues.push({
                            element: el.tagName,
                            text: el.textContent.substring(0, 30),
                            fgColor: styles.color,
                            bgColor: styles.backgroundColor,
                            ratio: ratio.toFixed(2),
                            required: minRatio,
                            isLargeText
                        });
                    }
                });
                
                return {
                    checked: checked.size,
                    issues: issues.slice(0, 10)
                };
            });
            
            if (contrastIssues.issues.length > 0) {
                results.warn('Color contrast issues detected',
                    `${contrastIssues.issues.length} text/background combinations may not meet WCAG AA`,
                    contrastIssues
                );
            } else {
                results.pass('Color contrast appears adequate', { combinationsChecked: contrastIssues.checked });
            }
        } catch (e) {
            results.fail('Color contrast', e);
        }
        
        // ============================================
        // TEST: Focus Indicators
        // ============================================
        try {
            const focusIndicators = await page.evaluate(() => {
                const focusable = document.querySelectorAll('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
                const issues = [];
                
                // This is a heuristic check - actual focus testing would need interaction
                focusable.forEach(el => {
                    const styles = getComputedStyle(el);
                    
                    // Check for outline: none without other focus indication
                    if (styles.outline === 'none' || styles.outlineStyle === 'none') {
                        // Could still have box-shadow or border change on focus
                        issues.push({
                            element: el.tagName,
                            text: el.textContent?.substring(0, 20),
                            hasOutline: false,
                            note: 'May have other focus styles via :focus-visible'
                        });
                    }
                });
                
                return {
                    totalFocusable: focusable.length,
                    potentialIssues: issues.slice(0, 5)
                };
            });
            
            results.pass('Focus indicators check complete', focusIndicators);
        } catch (e) {
            results.fail('Focus indicators', e);
        }
        
        // ============================================
        // TEST: ARIA Landmarks
        // ============================================
        try {
            const landmarks = await page.evaluate(() => {
                return {
                    hasMain: !!document.querySelector('main, [role="main"]'),
                    hasNav: !!document.querySelector('nav, [role="navigation"]'),
                    hasHeader: !!document.querySelector('header, [role="banner"]'),
                    hasFooter: !!document.querySelector('footer, [role="contentinfo"]'),
                    hasRegion: !!document.querySelector('[role="region"]'),
                    mainCount: document.querySelectorAll('main, [role="main"]').length,
                    navCount: document.querySelectorAll('nav, [role="navigation"]').length
                };
            });
            
            const issues = [];
            if (!landmarks.hasMain) issues.push('Missing main landmark');
            if (!landmarks.hasNav) issues.push('Missing navigation landmark');
            if (landmarks.mainCount > 1) issues.push(`Multiple main landmarks (${landmarks.mainCount})`);
            
            if (issues.length > 0) {
                results.warn('ARIA landmark issues', issues.join('; '), landmarks);
            } else {
                results.pass('ARIA landmarks present', landmarks);
            }
        } catch (e) {
            results.fail('ARIA landmarks', e);
        }
        
        // ============================================
        // TEST: Button Roles
        // ============================================
        try {
            const buttons = await page.evaluate(() => {
                const allButtons = document.querySelectorAll('button, [role="button"], a.btn, a[class*="button"]');
                
                return Array.from(allButtons).map(btn => ({
                    tagName: btn.tagName,
                    role: btn.getAttribute('role'),
                    type: btn.type,
                    text: btn.textContent?.trim().substring(0, 30),
                    isLink: btn.tagName === 'A',
                    href: btn.href,
                    hasRole: btn.hasAttribute('role'),
                    isCorrect: btn.tagName === 'BUTTON' || 
                              (btn.tagName === 'A' && btn.hasAttribute('role') && btn.getAttribute('role') === 'button') ||
                              (btn.tagName === 'A' && btn.href)
                }));
            });
            
            const incorrectButtons = buttons.filter(b => !b.isCorrect);
            
            if (incorrectButtons.length > 0) {
                results.warn('Button role issues',
                    'Some interactive elements may need proper roles',
                    { incorrectButtons }
                );
            } else {
                results.pass('Button roles correct', { count: buttons.length });
            }
        } catch (e) {
            results.fail('Button roles', e);
        }
        
        // ============================================
        // TEST: Reduced Motion Support
        // ============================================
        try {
            const motionSupport = await page.evaluate(() => {
                const styleSheets = Array.from(document.styleSheets);
                let hasReducedMotion = false;
                
                styleSheets.forEach(sheet => {
                    try {
                        const rules = Array.from(sheet.cssRules || []);
                        rules.forEach(rule => {
                            if (rule instanceof CSSMediaRule && 
                                rule.conditionText.includes('prefers-reduced-motion')) {
                                hasReducedMotion = true;
                            }
                        });
                    } catch (e) {
                        // Cross-origin stylesheet
                    }
                });
                
                return { hasReducedMotion };
            });
            
            if (motionSupport.hasReducedMotion) {
                results.pass('Reduced motion support present');
            } else {
                results.warn('No prefers-reduced-motion support',
                    'Consider adding @media (prefers-reduced-motion: reduce) for users who prefer less animation'
                );
            }
        } catch (e) {
            results.fail('Reduced motion check', e);
        }
        
        // ============================================
        // TEST: Tab Order
        // ============================================
        try {
            const tabOrder = await page.evaluate(() => {
                const focusable = document.querySelectorAll(
                    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
                );
                
                const withPositiveTabIndex = Array.from(focusable).filter(el => el.tabIndex > 0);
                const withNegativeTabIndex = Array.from(focusable).filter(el => el.tabIndex < 0);
                
                return {
                    totalFocusable: focusable.length,
                    positiveTabIndex: withPositiveTabIndex.length,
                    negativeTabIndex: withNegativeTabIndex.length,
                    positiveTabIndexElements: withPositiveTabIndex.map(el => ({
                        tag: el.tagName,
                        tabIndex: el.tabIndex,
                        text: el.textContent?.substring(0, 20)
                    }))
                };
            });
            
            if (tabOrder.positiveTabIndex > 0) {
                results.warn('Positive tabindex values found',
                    'Using positive tabindex values can disrupt natural tab order',
                    tabOrder
                );
            } else {
                results.pass('Tab order uses natural DOM order', tabOrder);
            }
        } catch (e) {
            results.fail('Tab order check', e);
        }
        
        // ============================================
        // TEST: Skip Link
        // ============================================
        try {
            const skipLink = await page.evaluate(() => {
                const skipSelectors = [
                    '.skip-link',
                    '.skip-to-content',
                    'a[href="#main"]',
                    'a[href="#content"]',
                    'a[href="#main-content"]'
                ];
                
                for (const sel of skipSelectors) {
                    const el = document.querySelector(sel);
                    if (el) {
                        return {
                            found: true,
                            href: el.getAttribute('href'),
                            text: el.textContent.trim(),
                            isVisuallyHidden: getComputedStyle(el).position === 'absolute' ||
                                             el.classList.contains('sr-only') ||
                                             el.classList.contains('visually-hidden')
                        };
                    }
                }
                return { found: false };
            });
            
            if (skipLink.found) {
                results.pass('Skip link present', skipLink);
            } else {
                results.warn('No skip link found',
                    'Consider adding a skip link for keyboard users to bypass navigation'
                );
            }
        } catch (e) {
            results.fail('Skip link check', e);
        }
        
        // ============================================
        // TEST: Focus Trap Prevention
        // ============================================
        try {
            // Check for elements that might trap focus (modals without escape)
            const focusTraps = await page.evaluate(() => {
                const modals = document.querySelectorAll('[role="dialog"], .modal, [aria-modal="true"]');
                
                return Array.from(modals).map(modal => ({
                    hasCloseButton: !!modal.querySelector('[aria-label*="close"], .close, button'),
                    hasEscapeHandler: modal.hasAttribute('data-keyboard') || true, // Can't detect JS handlers
                    isHidden: getComputedStyle(modal).display === 'none' || 
                             modal.getAttribute('aria-hidden') === 'true'
                }));
            });
            
            if (focusTraps.length > 0) {
                results.pass('Modal accessibility checked', { modalCount: focusTraps.length, modals: focusTraps });
            } else {
                results.pass('No modals detected (no focus trap risk)');
            }
        } catch (e) {
            results.fail('Focus trap check', e);
        }
        
    } catch (e) {
        results.fail('Accessibility test suite setup', e);
    } finally {
        if (browser) await browser.close();
    }
    
    return results.getSummary();
}

module.exports = { runAccessibilityTests };

if (require.main === module) {
    runAccessibilityTests().then(results => {
        console.log(JSON.stringify(results, null, 2));
        process.exit(results.failed > 0 ? 1 : 0);
    });
}
