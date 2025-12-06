/**
 * GFV LLC - Animation & Transition Tests
 * Tests for smooth animations, transitions, and visual state changes
 */

const { TestResults, BrowserUtils, ElementUtils, Assertions, config, delay } = require('./test-utils');

async function runAnimationTests() {
    const results = new TestResults('Animations & Transitions');
    let browser;
    
    try {
        browser = await BrowserUtils.launchBrowser();
        const page = await BrowserUtils.createPage(browser);
        
        await page.goto(config.targets.mainSite, { waitUntil: 'networkidle0', timeout: config.timeouts.navigation });
        
        // ============================================
        // TEST: CSS Transitions Defined
        // ============================================
        try {
            const transitions = await page.evaluate(() => {
                const elements = document.querySelectorAll('a, button, .btn-primary, .btn-secondary, .nav-cta, .portfolio-card, .service-card, input, textarea, select');
                const transitionData = [];
                
                elements.forEach(el => {
                    const styles = getComputedStyle(el);
                    if (styles.transition && styles.transition !== 'all 0s ease 0s' && styles.transition !== 'none') {
                        transitionData.push({
                            element: el.tagName + (el.className ? '.' + el.className.split(' ')[0] : ''),
                            transition: styles.transition,
                            transitionDuration: styles.transitionDuration,
                            transitionProperty: styles.transitionProperty
                        });
                    }
                });
                
                return {
                    count: transitionData.length,
                    transitions: [...new Map(transitionData.map(t => [t.transition, t])).values()].slice(0, 15)
                };
            });
            
            if (transitions.count > 0) {
                results.pass('CSS transitions defined', transitions);
            } else {
                results.warn('No CSS transitions found',
                    'Consider adding transitions for smoother user experience'
                );
            }
        } catch (e) {
            results.fail('CSS transitions check', e);
        }
        
        // ============================================
        // TEST: Hover State Transitions
        // ============================================
        try {
            // Test button hover
            const buttonSelector = '.btn-primary, .nav-cta';
            const button = await page.$(buttonSelector);
            
            if (button) {
                // Get initial state
                const initialState = await page.evaluate((sel) => {
                    const el = document.querySelector(sel);
                    const styles = getComputedStyle(el);
                    return {
                        opacity: styles.opacity,
                        transform: styles.transform,
                        backgroundColor: styles.backgroundColor,
                        boxShadow: styles.boxShadow
                    };
                }, buttonSelector);
                
                // Hover
                await button.hover();
                await delay(config.timing.hoverDelay);
                
                // Get hover state
                const hoverState = await page.evaluate((sel) => {
                    const el = document.querySelector(sel);
                    const styles = getComputedStyle(el);
                    return {
                        opacity: styles.opacity,
                        transform: styles.transform,
                        backgroundColor: styles.backgroundColor,
                        boxShadow: styles.boxShadow
                    };
                }, buttonSelector);
                
                // Check if any property changed
                const changed = 
                    initialState.opacity !== hoverState.opacity ||
                    initialState.transform !== hoverState.transform ||
                    initialState.backgroundColor !== hoverState.backgroundColor ||
                    initialState.boxShadow !== hoverState.boxShadow;
                
                if (changed) {
                    results.pass('Button hover transition works', { initial: initialState, hover: hoverState });
                } else {
                    results.warn('Button hover state unchanged',
                        'Consider adding visual hover feedback',
                        { initial: initialState, hover: hoverState }
                    );
                }
            }
        } catch (e) {
            results.fail('Hover transition test', e);
        }
        
        // ============================================
        // TEST: Portfolio Card Hover Effects
        // ============================================
        try {
            const cardSelector = '.portfolio-card';
            const card = await page.$(cardSelector);
            
            if (card) {
                const initialCard = await page.evaluate((sel) => {
                    const el = document.querySelector(sel);
                    const img = el.querySelector('img');
                    const cardStyles = getComputedStyle(el);
                    const imgStyles = img ? getComputedStyle(img) : null;
                    
                    return {
                        cardTransform: cardStyles.transform,
                        cardBorderColor: cardStyles.borderColor,
                        imgOpacity: imgStyles?.opacity,
                        imgTransform: imgStyles?.transform
                    };
                }, cardSelector);
                
                await card.hover();
                await delay(config.timing.hoverDelay + 100);
                
                const hoverCard = await page.evaluate((sel) => {
                    const el = document.querySelector(sel);
                    const img = el.querySelector('img');
                    const cardStyles = getComputedStyle(el);
                    const imgStyles = img ? getComputedStyle(img) : null;
                    
                    return {
                        cardTransform: cardStyles.transform,
                        cardBorderColor: cardStyles.borderColor,
                        imgOpacity: imgStyles?.opacity,
                        imgTransform: imgStyles?.transform
                    };
                }, cardSelector);
                
                const cardChanged = initialCard.cardTransform !== hoverCard.cardTransform ||
                                   initialCard.cardBorderColor !== hoverCard.cardBorderColor;
                const imgChanged = initialCard.imgOpacity !== hoverCard.imgOpacity ||
                                  initialCard.imgTransform !== hoverCard.imgTransform;
                
                if (cardChanged || imgChanged) {
                    results.pass('Portfolio card hover effects work', {
                        cardChanged,
                        imgChanged,
                        before: initialCard,
                        after: hoverCard
                    });
                } else {
                    results.warn('Portfolio card hover effects not detected', '', {
                        before: initialCard,
                        after: hoverCard
                    });
                }
            }
        } catch (e) {
            results.fail('Portfolio card hover', e);
        }
        
        // ============================================
        // TEST: Service Card Hover Effects
        // ============================================
        try {
            const serviceSelector = '.service-card';
            const serviceCard = await page.$(serviceSelector);
            
            if (serviceCard) {
                const initialService = await page.evaluate((sel) => {
                    const el = document.querySelector(sel);
                    const styles = getComputedStyle(el);
                    return {
                        backgroundColor: styles.backgroundColor,
                        boxShadow: styles.boxShadow,
                        transform: styles.transform
                    };
                }, serviceSelector);
                
                await serviceCard.hover();
                await delay(config.timing.hoverDelay);
                
                const hoverService = await page.evaluate((sel) => {
                    const el = document.querySelector(sel);
                    const styles = getComputedStyle(el);
                    return {
                        backgroundColor: styles.backgroundColor,
                        boxShadow: styles.boxShadow,
                        transform: styles.transform
                    };
                }, serviceSelector);
                
                const changed = initialService.backgroundColor !== hoverService.backgroundColor;
                
                if (changed) {
                    results.pass('Service card hover works', { before: initialService, after: hoverService });
                } else {
                    results.warn('Service card hover unchanged', '', { before: initialService, after: hoverService });
                }
            }
        } catch (e) {
            results.fail('Service card hover', e);
        }
        
        // ============================================
        // TEST: Input Focus Transitions
        // ============================================
        try {
            // Navigate to contact section
            await page.evaluate(() => {
                const contact = document.querySelector('#contact');
                if (contact) contact.scrollIntoView();
            });
            await delay(500);
            
            const inputSelector = '#contact input[type="text"], #contact input[type="email"]';
            const input = await page.$(inputSelector);
            
            if (input) {
                const initialInput = await page.evaluate((sel) => {
                    const el = document.querySelector(sel);
                    const styles = getComputedStyle(el);
                    return {
                        borderColor: styles.borderColor,
                        boxShadow: styles.boxShadow,
                        outline: styles.outline
                    };
                }, inputSelector);
                
                await input.focus();
                await delay(100);
                
                const focusedInput = await page.evaluate((sel) => {
                    const el = document.querySelector(sel);
                    const styles = getComputedStyle(el);
                    return {
                        borderColor: styles.borderColor,
                        boxShadow: styles.boxShadow,
                        outline: styles.outline
                    };
                }, inputSelector);
                
                const changed = initialInput.borderColor !== focusedInput.borderColor ||
                               initialInput.boxShadow !== focusedInput.boxShadow;
                
                if (changed) {
                    results.pass('Input focus transition works', { before: initialInput, after: focusedInput });
                } else {
                    results.warn('Input focus transition not visible', '', { before: initialInput, after: focusedInput });
                }
            }
        } catch (e) {
            results.fail('Input focus transition', e);
        }
        
        // ============================================
        // TEST: Smooth Scroll Animation
        // ============================================
        try {
            // Scroll to top first
            await page.evaluate(() => window.scrollTo(0, 0));
            await delay(100);
            
            const smoothScroll = await page.evaluate(() => {
                const html = document.documentElement;
                return {
                    scrollBehavior: getComputedStyle(html).scrollBehavior,
                    isSmooth: getComputedStyle(html).scrollBehavior === 'smooth'
                };
            });
            
            if (smoothScroll.isSmooth) {
                // Test actual smooth scroll (exclude skip-link which is offscreen)
                const anchorLink = await page.$('a[href^="#"]:not([href="#"]):not(.skip-link)');
                
                if (anchorLink) {
                    const initialY = await page.evaluate(() => window.scrollY);
                    await anchorLink.click();
                    
                    // Check intermediate scroll position
                    await delay(50);
                    const midY = await page.evaluate(() => window.scrollY);
                    
                    // Wait for completion
                    await delay(500);
                    const finalY = await page.evaluate(() => window.scrollY);
                    
                    // If midY is between initial and final, smooth scroll is working
                    const wasSmooth = midY > initialY && midY < finalY;
                    
                    if (wasSmooth || finalY !== initialY) {
                        results.pass('Smooth scroll animation works', { initialY, midY, finalY, wasSmooth });
                    }
                }
            } else {
                results.warn('Smooth scroll not enabled',
                    'Add scroll-behavior: smooth to html element for smoother navigation'
                );
            }
        } catch (e) {
            results.fail('Smooth scroll test', e);
        }
        
        // ============================================
        // TEST: Transition Duration Appropriateness
        // ============================================
        try {
            const durations = await page.evaluate((maxDuration) => {
                const allElements = document.querySelectorAll('*');
                const issues = [];
                const durations = [];
                
                allElements.forEach(el => {
                    const styles = getComputedStyle(el);
                    const duration = styles.transitionDuration;
                    
                    if (duration && duration !== '0s') {
                        const ms = parseFloat(duration) * (duration.includes('ms') ? 1 : 1000);
                        durations.push(ms);
                        
                        if (ms > maxDuration) {
                            issues.push({
                                element: el.tagName + (el.className ? '.' + el.className.split(' ')[0] : ''),
                                duration: duration,
                                durationMs: ms
                            });
                        }
                    }
                });
                
                return {
                    totalWithTransitions: durations.length,
                    averageDuration: durations.length > 0 ? (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(0) : 0,
                    maxFound: durations.length > 0 ? Math.max(...durations) : 0,
                    tooLong: issues.slice(0, 5)
                };
            }, config.timing.transitionMax);
            
            if (durations.tooLong.length > 0) {
                results.warn('Some transitions may be too long',
                    `${durations.tooLong.length} transitions exceed ${config.timing.transitionMax}ms`,
                    durations
                );
            } else {
                results.pass('Transition durations appropriate', durations);
            }
        } catch (e) {
            results.fail('Transition duration check', e);
        }
        
        // ============================================
        // TEST: No Janky Animations (Performance)
        // ============================================
        try {
            // Check for animations that might cause layout thrashing
            const animationPerformance = await page.evaluate(() => {
                const issues = [];
                const allElements = document.querySelectorAll('*');
                
                allElements.forEach(el => {
                    const styles = getComputedStyle(el);
                    const transition = styles.transition;
                    
                    // Properties that can cause layout thrashing
                    const expensiveProps = ['width', 'height', 'top', 'left', 'right', 'bottom', 'margin', 'padding'];
                    
                    expensiveProps.forEach(prop => {
                        if (transition.includes(prop)) {
                            issues.push({
                                element: el.tagName + (el.className ? '.' + el.className.split(' ')[0] : ''),
                                property: prop,
                                note: 'Consider using transform instead for better performance'
                            });
                        }
                    });
                });
                
                return {
                    potentialIssues: [...new Map(issues.map(i => [i.element + i.property, i])).values()].slice(0, 10)
                };
            });
            
            if (animationPerformance.potentialIssues.length > 0) {
                results.warn('Potential animation performance issues',
                    'Some transitions animate expensive properties',
                    animationPerformance
                );
            } else {
                results.pass('Animation performance looks good');
            }
        } catch (e) {
            results.fail('Animation performance check', e);
        }
        
        // ============================================
        // TEST: CSS Keyframe Animations
        // ============================================
        try {
            const keyframeAnimations = await page.evaluate(() => {
                const animations = [];
                
                // Check stylesheets for keyframes
                Array.from(document.styleSheets).forEach(sheet => {
                    try {
                        Array.from(sheet.cssRules || []).forEach(rule => {
                            if (rule instanceof CSSKeyframesRule) {
                                animations.push({
                                    name: rule.name,
                                    keyframeCount: rule.cssRules.length
                                });
                            }
                        });
                    } catch (e) {
                        // Cross-origin stylesheet
                    }
                });
                
                // Check elements for animation property
                const animated = document.querySelectorAll('[style*="animation"], *');
                let withAnimation = 0;
                
                animated.forEach(el => {
                    const styles = getComputedStyle(el);
                    if (styles.animationName && styles.animationName !== 'none') {
                        withAnimation++;
                    }
                });
                
                return {
                    keyframeAnimations: animations,
                    elementsWithAnimation: withAnimation
                };
            });
            
            results.pass('Keyframe animations analyzed', keyframeAnimations);
        } catch (e) {
            results.fail('Keyframe animation check', e);
        }
        
        // ============================================
        // TEST: Loading State Transitions
        // ============================================
        try {
            // Check for loading indicators or skeleton screens
            const loadingStates = await page.evaluate(() => {
                const loaders = document.querySelectorAll('.loading, .skeleton, .spinner, [class*="loading"], [class*="skeleton"]');
                const shimmer = document.querySelectorAll('[class*="shimmer"], [class*="pulse"]');
                
                return {
                    hasLoadingIndicators: loaders.length > 0,
                    loaderCount: loaders.length,
                    hasShimmerEffects: shimmer.length > 0
                };
            });
            
            results.pass('Loading state analysis', loadingStates);
        } catch (e) {
            results.fail('Loading state check', e);
        }
        
        // ============================================
        // TEST: Form Submission Animation
        // ============================================
        try {
            const submitButton = await page.$('.form-submit, button[type="submit"]');
            
            if (submitButton) {
                const buttonState = await page.evaluate(() => {
                    const btn = document.querySelector('.form-submit, button[type="submit"]');
                    if (!btn) return null;
                    
                    const styles = getComputedStyle(btn);
                    return {
                        hasTransition: styles.transition !== 'none' && styles.transition !== 'all 0s ease 0s',
                        cursor: styles.cursor,
                        hasLoadingClass: btn.classList.contains('loading') || btn.classList.contains('submitting')
                    };
                });
                
                results.pass('Submit button state analyzed', buttonState);
            }
        } catch (e) {
            results.fail('Form submission animation', e);
        }
        
        // ============================================
        // TEST: Nav Background Transition on Scroll
        // ============================================
        try {
            // Scroll down and check if nav background changes
            await page.evaluate(() => window.scrollTo(0, 0));
            await delay(100);
            
            const navInitial = await page.evaluate(() => {
                const nav = document.querySelector('nav');
                const styles = getComputedStyle(nav);
                return {
                    backgroundColor: styles.backgroundColor,
                    backdropFilter: styles.backdropFilter,
                    boxShadow: styles.boxShadow
                };
            });
            
            await page.evaluate(() => window.scrollTo(0, 500));
            await delay(300);
            
            const navScrolled = await page.evaluate(() => {
                const nav = document.querySelector('nav');
                const styles = getComputedStyle(nav);
                return {
                    backgroundColor: styles.backgroundColor,
                    backdropFilter: styles.backdropFilter,
                    boxShadow: styles.boxShadow
                };
            });
            
            // Check if nav has backdrop-filter for frosted glass effect
            if (navScrolled.backdropFilter && navScrolled.backdropFilter !== 'none') {
                results.pass('Nav has backdrop-filter effect', { initial: navInitial, scrolled: navScrolled });
            } else {
                results.pass('Nav scroll behavior analyzed', { initial: navInitial, scrolled: navScrolled });
            }
        } catch (e) {
            results.fail('Nav scroll transition', e);
        }
        
    } catch (e) {
        results.fail('Animation test suite setup', e);
    } finally {
        if (browser) await browser.close();
    }
    
    return results.getSummary();
}

module.exports = { runAnimationTests };

if (require.main === module) {
    runAnimationTests().then(results => {
        console.log(JSON.stringify(results, null, 2));
        process.exit(results.failed > 0 ? 1 : 0);
    });
}
