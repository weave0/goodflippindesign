/**
 * GFV LLC - Visual Consistency & Cross-Browser Compatibility Tests
 * Tests for CSS feature support and visual consistency
 */

const { TestResults, BrowserUtils, ElementUtils, Assertions, config } = require('./test-utils');

async function runCompatibilityTests() {
    const results = new TestResults('Visual Consistency & Compatibility');
    let browser;
    
    try {
        browser = await BrowserUtils.launchBrowser();
        const page = await BrowserUtils.createPage(browser);
        
        await page.goto(config.targets.mainSite, { waitUntil: 'networkidle0', timeout: config.timeouts.navigation });
        
        // ============================================
        // TEST: CSS Custom Properties Support
        // ============================================
        try {
            const cssVarSupport = await page.evaluate(() => {
                const root = document.documentElement;
                const testVar = '--test-support-check';
                root.style.setProperty(testVar, 'test');
                const supported = getComputedStyle(root).getPropertyValue(testVar) === 'test';
                root.style.removeProperty(testVar);
                
                // Check if CSS vars are being used
                const styles = getComputedStyle(root);
                const varsInUse = [
                    { name: '--bg', value: styles.getPropertyValue('--bg') },
                    { name: '--text', value: styles.getPropertyValue('--text') },
                    { name: '--accent', value: styles.getPropertyValue('--accent') },
                    { name: '--border', value: styles.getPropertyValue('--border') }
                ];
                
                return {
                    supported,
                    varsInUse: varsInUse.filter(v => v.value.trim().length > 0)
                };
            });
            
            Assertions.isTrue(cssVarSupport.supported, 'CSS custom properties not supported');
            
            results.pass('CSS custom properties supported', cssVarSupport);
        } catch (e) {
            results.fail('CSS custom properties support', e);
        }
        
        // ============================================
        // TEST: Flexbox Support
        // ============================================
        try {
            const flexboxSupport = await page.evaluate(() => {
                const flexElements = [];
                document.querySelectorAll('*').forEach(el => {
                    const display = getComputedStyle(el).display;
                    if (display === 'flex' || display === 'inline-flex') {
                        flexElements.push({
                            tag: el.tagName,
                            class: el.className?.split(' ')[0] || ''
                        });
                    }
                });
                
                return {
                    supported: CSS.supports('display', 'flex'),
                    elementsUsingFlex: flexElements.length,
                    examples: flexElements.slice(0, 5)
                };
            });
            
            results.pass('Flexbox supported and in use', flexboxSupport);
        } catch (e) {
            results.fail('Flexbox support', e);
        }
        
        // ============================================
        // TEST: CSS Grid Support
        // ============================================
        try {
            const gridSupport = await page.evaluate(() => {
                const gridElements = [];
                document.querySelectorAll('*').forEach(el => {
                    const display = getComputedStyle(el).display;
                    if (display === 'grid' || display === 'inline-grid') {
                        gridElements.push({
                            tag: el.tagName,
                            class: el.className?.split(' ')[0] || '',
                            gridTemplateColumns: getComputedStyle(el).gridTemplateColumns
                        });
                    }
                });
                
                return {
                    supported: CSS.supports('display', 'grid'),
                    elementsUsingGrid: gridElements.length,
                    examples: gridElements.slice(0, 5)
                };
            });
            
            results.pass('CSS Grid supported', gridSupport);
        } catch (e) {
            results.fail('CSS Grid support', e);
        }
        
        // ============================================
        // TEST: Backdrop Filter Support
        // ============================================
        try {
            const backdropSupport = await page.evaluate(() => {
                const supported = CSS.supports('backdrop-filter', 'blur(10px)') ||
                                CSS.supports('-webkit-backdrop-filter', 'blur(10px)');
                
                const elementsUsing = [];
                document.querySelectorAll('*').forEach(el => {
                    const styles = getComputedStyle(el);
                    if ((styles.backdropFilter && styles.backdropFilter !== 'none') ||
                        (styles.webkitBackdropFilter && styles.webkitBackdropFilter !== 'none')) {
                        elementsUsing.push({
                            tag: el.tagName,
                            class: el.className?.split(' ')[0] || '',
                            value: styles.backdropFilter || styles.webkitBackdropFilter
                        });
                    }
                });
                
                return {
                    supported,
                    inUse: elementsUsing.length > 0,
                    elements: elementsUsing
                };
            });
            
            if (backdropSupport.inUse && !backdropSupport.supported) {
                results.warn('Backdrop filter used but may not be supported',
                    'Consider fallback for older browsers',
                    backdropSupport
                );
            } else {
                results.pass('Backdrop filter check complete', backdropSupport);
            }
        } catch (e) {
            results.fail('Backdrop filter support', e);
        }
        
        // ============================================
        // TEST: CSS Clamp/Min/Max Support
        // ============================================
        try {
            const clampSupport = await page.evaluate(() => {
                return {
                    clamp: CSS.supports('font-size', 'clamp(1rem, 2vw, 3rem)'),
                    min: CSS.supports('width', 'min(100%, 500px)'),
                    max: CSS.supports('width', 'max(100%, 500px)')
                };
            });
            
            results.pass('CSS math functions support', clampSupport);
        } catch (e) {
            results.fail('CSS math functions', e);
        }
        
        // ============================================
        // TEST: Scroll Behavior Support
        // ============================================
        try {
            const scrollSupport = await page.evaluate(() => {
                return {
                    supported: CSS.supports('scroll-behavior', 'smooth'),
                    currentValue: getComputedStyle(document.documentElement).scrollBehavior
                };
            });
            
            results.pass('Scroll behavior support', scrollSupport);
        } catch (e) {
            results.fail('Scroll behavior support', e);
        }
        
        // ============================================
        // TEST: Font Loading
        // ============================================
        try {
            const fontLoading = await page.evaluate(() => {
                return {
                    fontsLoaded: document.fonts.status,
                    fontCount: document.fonts.size,
                    bodyFont: getComputedStyle(document.body).fontFamily,
                    fontsReady: document.fonts.status === 'loaded'
                };
            });
            
            // Wait for fonts if not loaded
            await page.evaluate(() => document.fonts.ready);
            
            const afterLoad = await page.evaluate(() => ({
                fontsLoaded: document.fonts.status,
                fontCount: document.fonts.size
            }));
            
            results.pass('Font loading complete', { initial: fontLoading, final: afterLoad });
        } catch (e) {
            results.fail('Font loading', e);
        }
        
        // ============================================
        // TEST: Image Format Support
        // ============================================
        try {
            const imageFormats = await page.evaluate(() => {
                const images = document.querySelectorAll('img');
                const formats = {};
                
                images.forEach(img => {
                    const src = img.src || img.currentSrc;
                    const ext = src.split('.').pop()?.split('?')[0]?.toLowerCase();
                    if (ext) {
                        formats[ext] = (formats[ext] || 0) + 1;
                    }
                });
                
                // Check for modern format support
                const webpSupported = document.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp') === 0;
                
                return {
                    formatsInUse: formats,
                    webpSupported,
                    totalImages: images.length
                };
            });
            
            results.pass('Image format analysis', imageFormats);
        } catch (e) {
            results.fail('Image format check', e);
        }
        
        // ============================================
        // TEST: Box Shadow Consistency
        // ============================================
        try {
            const boxShadows = await page.evaluate(() => {
                const shadows = new Map();
                
                document.querySelectorAll('*').forEach(el => {
                    const shadow = getComputedStyle(el).boxShadow;
                    if (shadow && shadow !== 'none') {
                        const key = shadow;
                        if (!shadows.has(key)) {
                            shadows.set(key, {
                                shadow,
                                count: 0,
                                examples: []
                            });
                        }
                        const entry = shadows.get(key);
                        entry.count++;
                        if (entry.examples.length < 2) {
                            entry.examples.push(el.tagName + (el.className ? '.' + el.className.split(' ')[0] : ''));
                        }
                    }
                });
                
                return {
                    uniqueShadows: shadows.size,
                    shadows: Array.from(shadows.values()).slice(0, 10)
                };
            });
            
            results.pass('Box shadow consistency', boxShadows);
        } catch (e) {
            results.fail('Box shadow check', e);
        }
        
        // ============================================
        // TEST: Border Radius Consistency
        // ============================================
        try {
            const borderRadii = await page.evaluate(() => {
                const radii = new Map();
                
                document.querySelectorAll('*').forEach(el => {
                    const radius = getComputedStyle(el).borderRadius;
                    if (radius && radius !== '0px') {
                        if (!radii.has(radius)) {
                            radii.set(radius, { radius, count: 0 });
                        }
                        radii.get(radius).count++;
                    }
                });
                
                return {
                    uniqueRadii: radii.size,
                    values: Array.from(radii.values()).sort((a, b) => b.count - a.count).slice(0, 10)
                };
            });
            
            // Check if there's too much variation (design inconsistency)
            if (borderRadii.uniqueRadii > 8) {
                results.warn('Many different border-radius values',
                    'Consider standardizing border-radius values for visual consistency',
                    borderRadii
                );
            } else {
                results.pass('Border radius consistency', borderRadii);
            }
        } catch (e) {
            results.fail('Border radius check', e);
        }
        
        // ============================================
        // TEST: Color Palette Consistency
        // ============================================
        try {
            const colorAnalysis = await page.evaluate(() => {
                const colors = new Map();
                const bgColors = new Map();
                
                document.querySelectorAll('*').forEach(el => {
                    const styles = getComputedStyle(el);
                    
                    // Text colors
                    const color = styles.color;
                    if (color && color !== 'rgba(0, 0, 0, 0)') {
                        colors.set(color, (colors.get(color) || 0) + 1);
                    }
                    
                    // Background colors
                    const bgColor = styles.backgroundColor;
                    if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
                        bgColors.set(bgColor, (bgColors.get(bgColor) || 0) + 1);
                    }
                });
                
                return {
                    uniqueTextColors: colors.size,
                    uniqueBgColors: bgColors.size,
                    topTextColors: Array.from(colors.entries())
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 5)
                        .map(([color, count]) => ({ color, count })),
                    topBgColors: Array.from(bgColors.entries())
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 5)
                        .map(([color, count]) => ({ color, count }))
                };
            });
            
            results.pass('Color palette analysis', colorAnalysis);
        } catch (e) {
            results.fail('Color palette check', e);
        }
        
        // ============================================
        // TEST: Z-Index Layering
        // ============================================
        try {
            const zIndexAnalysis = await page.evaluate(() => {
                const zIndices = [];
                
                document.querySelectorAll('*').forEach(el => {
                    const styles = getComputedStyle(el);
                    const zIndex = styles.zIndex;
                    const position = styles.position;
                    
                    if (zIndex !== 'auto' && position !== 'static') {
                        zIndices.push({
                            element: el.tagName + (el.className ? '.' + el.className.split(' ')[0] : ''),
                            zIndex: parseInt(zIndex),
                            position
                        });
                    }
                });
                
                // Sort by z-index
                zIndices.sort((a, b) => b.zIndex - a.zIndex);
                
                // Check for extremely high z-indices
                const problematic = zIndices.filter(z => z.zIndex > 9999);
                
                return {
                    totalWithZIndex: zIndices.length,
                    maxZIndex: zIndices[0]?.zIndex || 0,
                    problematicCount: problematic.length,
                    topLayers: zIndices.slice(0, 5),
                    problematic: problematic.slice(0, 3)
                };
            });
            
            if (zIndexAnalysis.problematicCount > 0) {
                results.warn('Very high z-index values detected',
                    'Consider using more reasonable z-index values',
                    zIndexAnalysis
                );
            } else {
                results.pass('Z-index layering reasonable', zIndexAnalysis);
            }
        } catch (e) {
            results.fail('Z-index analysis', e);
        }
        
        // ============================================
        // TEST: SVG Rendering
        // ============================================
        try {
            const svgAnalysis = await page.evaluate(() => {
                const svgs = document.querySelectorAll('svg');
                
                return {
                    count: svgs.length,
                    svgs: Array.from(svgs).slice(0, 5).map(svg => ({
                        viewBox: svg.getAttribute('viewBox'),
                        width: svg.getAttribute('width') || getComputedStyle(svg).width,
                        height: svg.getAttribute('height') || getComputedStyle(svg).height,
                        fill: svg.getAttribute('fill') || getComputedStyle(svg).fill,
                        hasTitle: !!svg.querySelector('title'),
                        rendered: svg.getBoundingClientRect().width > 0
                    }))
                };
            });
            
            const unrenderedSvgs = svgAnalysis.svgs.filter(s => !s.rendered);
            
            if (unrenderedSvgs.length > 0) {
                results.warn('Some SVGs not rendered',
                    `${unrenderedSvgs.length} SVGs have zero width`,
                    svgAnalysis
                );
            } else {
                results.pass('SVG rendering check', svgAnalysis);
            }
        } catch (e) {
            results.fail('SVG rendering', e);
        }
        
        // ============================================
        // TEST: External Resource Loading
        // ============================================
        try {
            const externalResources = await page.evaluate(() => {
                const resources = {
                    fonts: [],
                    stylesheets: [],
                    scripts: []
                };
                
                // Google Fonts or other external fonts
                document.querySelectorAll('link[href*="fonts"]').forEach(link => {
                    resources.fonts.push(link.href);
                });
                
                // External stylesheets
                document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
                    if (link.href.startsWith('http')) {
                        resources.stylesheets.push(link.href);
                    }
                });
                
                // External scripts
                document.querySelectorAll('script[src]').forEach(script => {
                    if (script.src.startsWith('http')) {
                        resources.scripts.push(script.src);
                    }
                });
                
                return resources;
            });
            
            results.pass('External resources identified', externalResources);
        } catch (e) {
            results.fail('External resources', e);
        }
        
        // ============================================
        // TEST: Print Styles
        // ============================================
        try {
            const printStyles = await page.evaluate(() => {
                let hasPrintStyles = false;
                
                Array.from(document.styleSheets).forEach(sheet => {
                    try {
                        Array.from(sheet.cssRules || []).forEach(rule => {
                            if (rule instanceof CSSMediaRule && rule.conditionText === 'print') {
                                hasPrintStyles = true;
                            }
                        });
                    } catch (e) {
                        // Cross-origin
                    }
                });
                
                // Also check for print stylesheet link
                const printLink = document.querySelector('link[media="print"]');
                
                return {
                    hasPrintStyles,
                    hasPrintStylesheet: !!printLink
                };
            });
            
            if (!printStyles.hasPrintStyles && !printStyles.hasPrintStylesheet) {
                results.warn('No print styles detected',
                    'Consider adding print-specific styles for better printed output'
                );
            } else {
                results.pass('Print styles present', printStyles);
            }
        } catch (e) {
            results.fail('Print styles check', e);
        }
        
        // ============================================
        // TEST: Vendor Prefix Usage
        // ============================================
        try {
            const vendorPrefixes = await page.evaluate(() => {
                const prefixed = [];
                
                Array.from(document.styleSheets).forEach(sheet => {
                    try {
                        Array.from(sheet.cssRules || []).forEach(rule => {
                            if (rule.cssText) {
                                const matches = rule.cssText.match(/-webkit-|-moz-|-ms-|-o-/g);
                                if (matches) {
                                    prefixed.push(...matches);
                                }
                            }
                        });
                    } catch (e) {
                        // Cross-origin
                    }
                });
                
                const counts = {};
                prefixed.forEach(p => {
                    counts[p] = (counts[p] || 0) + 1;
                });
                
                return {
                    totalPrefixed: prefixed.length,
                    breakdown: counts
                };
            });
            
            results.pass('Vendor prefix analysis', vendorPrefixes);
        } catch (e) {
            results.fail('Vendor prefix check', e);
        }
        
    } catch (e) {
        results.fail('Compatibility test suite setup', e);
    } finally {
        if (browser) await browser.close();
    }
    
    return results.getSummary();
}

module.exports = { runCompatibilityTests };

if (require.main === module) {
    runCompatibilityTests().then(results => {
        console.log(JSON.stringify(results, null, 2));
        process.exit(results.failed > 0 ? 1 : 0);
    });
}
