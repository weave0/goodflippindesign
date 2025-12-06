/**
 * GFV LLC - HTML/CSS Structure Validation Tests
 * Tests for proper HTML structure, CSS loading, and visual integrity
 */

const { TestResults, BrowserUtils, ElementUtils, Assertions, config } = require('./test-utils');

async function runStructureTests() {
    const results = new TestResults('HTML/CSS Structure Validation');
    let browser;
    
    try {
        browser = await BrowserUtils.launchBrowser();
        const page = await BrowserUtils.createPage(browser);
        
        // Load main site
        await page.goto(config.targets.mainSite, { waitUntil: 'networkidle0', timeout: config.timeouts.navigation });
        
        // ============================================
        // TEST: Document Structure
        // ============================================
        try {
            const docStructure = await page.evaluate(() => {
                return {
                    hasDoctype: document.doctype !== null,
                    htmlLang: document.documentElement.lang,
                    hasHead: document.head !== null,
                    hasBody: document.body !== null,
                    hasTitle: document.title.length > 0,
                    title: document.title,
                    hasMetaCharset: !!document.querySelector('meta[charset]'),
                    hasMetaViewport: !!document.querySelector('meta[name="viewport"]'),
                    hasMetaDescription: !!document.querySelector('meta[name="description"]'),
                    metaDescription: document.querySelector('meta[name="description"]')?.content
                };
            });
            
            Assertions.isTrue(docStructure.hasDoctype, 'Missing DOCTYPE declaration');
            Assertions.equals(docStructure.htmlLang, 'en', 'HTML lang attribute should be "en"');
            Assertions.isTrue(docStructure.hasHead, 'Missing <head> element');
            Assertions.isTrue(docStructure.hasBody, 'Missing <body> element');
            Assertions.isTrue(docStructure.hasTitle, 'Missing or empty <title>');
            Assertions.isTrue(docStructure.hasMetaCharset, 'Missing charset meta tag');
            Assertions.isTrue(docStructure.hasMetaViewport, 'Missing viewport meta tag');
            Assertions.isTrue(docStructure.hasMetaDescription, 'Missing description meta tag');
            
            results.pass('Document structure is valid', docStructure);
        } catch (e) {
            results.fail('Document structure validation', e);
        }
        
        // ============================================
        // TEST: CSS Custom Properties (Variables)
        // ============================================
        try {
            const cssVars = await page.evaluate(() => {
                const root = getComputedStyle(document.documentElement);
                return {
                    '--bg': root.getPropertyValue('--bg').trim(),
                    '--text': root.getPropertyValue('--text').trim(),
                    '--accent': root.getPropertyValue('--accent').trim(),
                    '--border': root.getPropertyValue('--border').trim()
                };
            });
            
            Assertions.isTrue(cssVars['--bg'].length > 0, 'CSS variable --bg not defined');
            Assertions.isTrue(cssVars['--text'].length > 0, 'CSS variable --text not defined');
            
            results.pass('CSS custom properties loaded', cssVars);
        } catch (e) {
            results.fail('CSS custom properties', e);
        }
        
        // ============================================
        // TEST: Critical CSS Loaded
        // ============================================
        try {
            const criticalStyles = await page.evaluate(() => {
                const body = getComputedStyle(document.body);
                const hasStyles = body.fontFamily !== '' && body.backgroundColor !== '';
                
                // Check for common style issues
                const issues = [];
                if (body.fontFamily.includes('Times') || body.fontFamily.includes('serif')) {
                    issues.push('Using default serif font - custom fonts may not have loaded');
                }
                
                return {
                    fontFamily: body.fontFamily,
                    backgroundColor: body.backgroundColor,
                    color: body.color,
                    lineHeight: body.lineHeight,
                    hasStyles,
                    issues
                };
            });
            
            Assertions.isTrue(criticalStyles.hasStyles, 'Critical styles not applied');
            
            if (criticalStyles.issues.length > 0) {
                results.warn('Critical CSS loaded with warnings', criticalStyles.issues.join(', '), criticalStyles);
            } else {
                results.pass('Critical CSS loaded correctly', criticalStyles);
            }
        } catch (e) {
            results.fail('Critical CSS validation', e);
        }
        
        // ============================================
        // TEST: Semantic HTML Structure
        // ============================================
        try {
            const semantics = await page.evaluate(() => {
                return {
                    hasNav: !!document.querySelector('nav'),
                    hasMain: !!document.querySelector('main'),
                    hasHeader: !!document.querySelector('header'),
                    hasFooter: !!document.querySelector('footer'),
                    hasSection: !!document.querySelector('section'),
                    sectionCount: document.querySelectorAll('section').length,
                    hasH1: !!document.querySelector('h1'),
                    h1Count: document.querySelectorAll('h1').length,
                    headingOrder: Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
                        level: parseInt(h.tagName[1]),
                        text: h.textContent.substring(0, 50)
                    }))
                };
            });
            
            Assertions.isTrue(semantics.hasNav, 'Missing <nav> element');
            Assertions.isTrue(semantics.hasHeader, 'Missing <header> element');
            Assertions.isTrue(semantics.hasFooter, 'Missing <footer> element');
            Assertions.isTrue(semantics.hasH1, 'Missing <h1> element');
            Assertions.equals(semantics.h1Count, 1, `Should have exactly 1 h1, found ${semantics.h1Count}`);
            
            // Check heading order
            let prevLevel = 0;
            let orderIssues = [];
            for (const heading of semantics.headingOrder) {
                if (prevLevel > 0 && heading.level > prevLevel + 1) {
                    orderIssues.push(`Skipped from h${prevLevel} to h${heading.level}`);
                }
                prevLevel = heading.level;
            }
            
            if (orderIssues.length > 0) {
                results.warn('Semantic structure with heading order issues', orderIssues.join(', '), semantics);
            } else {
                results.pass('Semantic HTML structure valid', semantics);
            }
        } catch (e) {
            results.fail('Semantic HTML validation', e);
        }
        
        // ============================================
        // TEST: Navigation Structure
        // ============================================
        try {
            const navStructure = await page.evaluate(() => {
                const nav = document.querySelector('nav');
                if (!nav) return null;
                
                const links = Array.from(nav.querySelectorAll('a'));
                return {
                    hasLogo: !!nav.querySelector('.logo'),
                    linkCount: links.length,
                    links: links.map(a => ({
                        text: a.textContent.trim().substring(0, 30),
                        href: a.getAttribute('href'),
                        isInternal: a.getAttribute('href')?.startsWith('#') || a.getAttribute('href')?.startsWith('/'),
                        hasTarget: a.hasAttribute('target')
                    })),
                    hasCTA: !!nav.querySelector('.nav-cta'),
                    isFixed: getComputedStyle(nav).position === 'fixed'
                };
            });
            
            Assertions.isTrue(navStructure !== null, 'Navigation not found');
            Assertions.isTrue(navStructure.hasLogo, 'Navigation missing logo');
            Assertions.greaterThan(navStructure.linkCount, 0, 'Navigation has no links');
            Assertions.isTrue(navStructure.hasCTA, 'Navigation missing CTA button');
            Assertions.isTrue(navStructure.isFixed, 'Navigation should be fixed position');
            
            results.pass('Navigation structure valid', navStructure);
        } catch (e) {
            results.fail('Navigation structure validation', e);
        }
        
        // ============================================
        // TEST: Hero Section Structure
        // ============================================
        try {
            const heroStructure = await page.evaluate(() => {
                const hero = document.querySelector('.hero');
                if (!hero) return null;
                
                return {
                    exists: true,
                    hasH1: !!hero.querySelector('h1'),
                    h1Text: hero.querySelector('h1')?.textContent.substring(0, 100),
                    hasSubtitle: !!hero.querySelector('.hero-subtitle'),
                    hasCTAs: !!hero.querySelector('.hero-ctas'),
                    ctaCount: hero.querySelectorAll('.hero-ctas a').length,
                    minHeight: getComputedStyle(hero).minHeight,
                    display: getComputedStyle(hero).display
                };
            });
            
            Assertions.isTrue(heroStructure !== null, 'Hero section not found');
            Assertions.isTrue(heroStructure.hasH1, 'Hero missing h1');
            Assertions.isTrue(heroStructure.hasSubtitle, 'Hero missing subtitle');
            Assertions.isTrue(heroStructure.hasCTAs, 'Hero missing CTAs');
            Assertions.greaterThan(heroStructure.ctaCount, 0, 'Hero has no CTA buttons');
            
            results.pass('Hero section structure valid', heroStructure);
        } catch (e) {
            results.fail('Hero section validation', e);
        }
        
        // ============================================
        // TEST: Services Grid Structure
        // ============================================
        try {
            const servicesStructure = await page.evaluate(() => {
                const section = document.querySelector('#services');
                if (!section) return null;
                
                const grid = section.querySelector('.services-grid');
                const cards = section.querySelectorAll('.service-card');
                
                return {
                    hasSection: true,
                    hasGrid: !!grid,
                    cardCount: cards.length,
                    cards: Array.from(cards).map(card => ({
                        hasTitle: !!card.querySelector('h3'),
                        hasDescription: !!card.querySelector('p'),
                        titleText: card.querySelector('h3')?.textContent.substring(0, 50)
                    })),
                    gridDisplay: grid ? getComputedStyle(grid).display : null
                };
            });
            
            Assertions.isTrue(servicesStructure !== null, 'Services section not found');
            Assertions.isTrue(servicesStructure.hasGrid, 'Services grid not found');
            Assertions.greaterThan(servicesStructure.cardCount, 0, 'No service cards found');
            
            // Verify each card has required elements
            servicesStructure.cards.forEach((card, i) => {
                Assertions.isTrue(card.hasTitle, `Service card ${i + 1} missing title`);
                Assertions.isTrue(card.hasDescription, `Service card ${i + 1} missing description`);
            });
            
            results.pass('Services section structure valid', servicesStructure);
        } catch (e) {
            results.fail('Services section validation', e);
        }
        
        // ============================================
        // TEST: Portfolio Grid Structure
        // ============================================
        try {
            const portfolioStructure = await page.evaluate(() => {
                const section = document.querySelector('#work');
                if (!section) return null;
                
                const grid = section.querySelector('.portfolio-grid');
                const cards = section.querySelectorAll('.portfolio-card');
                
                return {
                    hasSection: true,
                    hasGrid: !!grid,
                    cardCount: cards.length,
                    cards: Array.from(cards).map(card => ({
                        hasPreview: !!card.querySelector('.portfolio-preview'),
                        hasImage: !!card.querySelector('.portfolio-preview img'),
                        hasInfo: !!card.querySelector('.portfolio-info'),
                        hasCategory: !!card.querySelector('.portfolio-category'),
                        hasTitle: !!card.querySelector('.portfolio-info h3'),
                        hasDescription: !!card.querySelector('.portfolio-info p'),
                        hasTechTags: !!card.querySelector('.portfolio-tech'),
                        href: card.href,
                        isLink: card.tagName === 'A'
                    }))
                };
            });
            
            Assertions.isTrue(portfolioStructure !== null, 'Portfolio section not found');
            Assertions.isTrue(portfolioStructure.hasGrid, 'Portfolio grid not found');
            Assertions.greaterThan(portfolioStructure.cardCount, 0, 'No portfolio cards found');
            
            let cardIssues = [];
            portfolioStructure.cards.forEach((card, i) => {
                if (!card.hasPreview) cardIssues.push(`Card ${i + 1} missing preview`);
                if (!card.hasImage) cardIssues.push(`Card ${i + 1} missing image`);
                if (!card.hasTitle) cardIssues.push(`Card ${i + 1} missing title`);
            });
            
            if (cardIssues.length > 0) {
                results.warn('Portfolio structure with issues', cardIssues.join(', '), portfolioStructure);
            } else {
                results.pass('Portfolio section structure valid', portfolioStructure);
            }
        } catch (e) {
            results.fail('Portfolio section validation', e);
        }
        
        // ============================================
        // TEST: Process Section Structure
        // ============================================
        try {
            const processStructure = await page.evaluate(() => {
                const section = document.querySelector('#process');
                if (!section) return null;
                
                const steps = section.querySelectorAll('.process-step');
                
                return {
                    hasSection: true,
                    stepCount: steps.length,
                    steps: Array.from(steps).map((step, i) => ({
                        hasNumber: !!step.querySelector('.process-number'),
                        number: step.querySelector('.process-number')?.textContent.trim(),
                        hasTitle: !!step.querySelector('h3'),
                        title: step.querySelector('h3')?.textContent,
                        hasDescription: !!step.querySelector('p:not(.process-number)')
                    }))
                };
            });
            
            Assertions.isTrue(processStructure !== null, 'Process section not found');
            Assertions.equals(processStructure.stepCount, 4, `Expected 4 process steps, found ${processStructure.stepCount}`);
            
            // Verify step numbering
            const expectedNumbers = ['01', '02', '03', '04'];
            processStructure.steps.forEach((step, i) => {
                Assertions.isTrue(step.hasNumber, `Step ${i + 1} missing number`);
                Assertions.isTrue(step.hasTitle, `Step ${i + 1} missing title`);
                Assertions.equals(step.number, expectedNumbers[i], `Step ${i + 1} has wrong number`);
            });
            
            results.pass('Process section structure valid', processStructure);
        } catch (e) {
            results.fail('Process section validation', e);
        }
        
        // ============================================
        // TEST: Contact Section Structure
        // ============================================
        try {
            const contactStructure = await page.evaluate(() => {
                const section = document.querySelector('#contact');
                if (!section) return null;
                
                const form = section.querySelector('form');
                const inputs = form ? Array.from(form.querySelectorAll('input, textarea, select')) : [];
                
                return {
                    hasSection: true,
                    hasContactInfo: !!section.querySelector('.contact-info'),
                    hasForm: !!form,
                    formAction: form?.action,
                    formMethod: form?.method,
                    inputCount: inputs.length,
                    inputs: inputs.map(input => ({
                        type: input.type || input.tagName.toLowerCase(),
                        name: input.name,
                        id: input.id,
                        required: input.required,
                        hasLabel: !!section.querySelector(`label[for="${input.id}"]`)
                    })),
                    hasSubmitButton: !!form?.querySelector('button[type="submit"], input[type="submit"], .form-submit')
                };
            });
            
            Assertions.isTrue(contactStructure !== null, 'Contact section not found');
            Assertions.isTrue(contactStructure.hasForm, 'Contact form not found');
            Assertions.isTrue(contactStructure.hasSubmitButton, 'Submit button not found');
            
            results.pass('Contact section structure valid', contactStructure);
        } catch (e) {
            results.fail('Contact section validation', e);
        }
        
        // ============================================
        // TEST: Footer Structure
        // ============================================
        try {
            const footerStructure = await page.evaluate(() => {
                const footer = document.querySelector('footer');
                if (!footer) return null;
                
                return {
                    hasFooter: true,
                    hasBrand: !!footer.querySelector('.footer-brand'),
                    hasLinks: !!footer.querySelector('.footer-links'),
                    linkCount: footer.querySelectorAll('.footer-links a').length,
                    hasCopyright: footer.textContent.includes('©') || footer.textContent.includes('2025'),
                    links: Array.from(footer.querySelectorAll('a')).map(a => ({
                        text: a.textContent.trim(),
                        href: a.href,
                        target: a.target
                    }))
                };
            });
            
            Assertions.isTrue(footerStructure !== null, 'Footer not found');
            Assertions.isTrue(footerStructure.hasBrand, 'Footer missing brand');
            Assertions.isTrue(footerStructure.hasCopyright, 'Footer missing copyright');
            
            results.pass('Footer structure valid', footerStructure);
        } catch (e) {
            results.fail('Footer validation', e);
        }
        
        // ============================================
        // TEST: No JavaScript Errors on Load
        // ============================================
        try {
            if (page.pageErrors.length > 0) {
                throw new Error(`JavaScript errors on load: ${page.pageErrors.join('; ')}`);
            }
            results.pass('No JavaScript errors on page load');
        } catch (e) {
            results.fail('JavaScript error check', e, { errors: page.pageErrors });
        }
        
        // ============================================
        // TEST: No Console Errors
        // ============================================
        try {
            // Filter out known acceptable errors (like favicon 404)
            const criticalErrors = page.consoleErrors.filter(err => 
                !err.includes('favicon') && 
                !err.includes('404') &&
                !err.includes('net::ERR')
            );
            
            if (criticalErrors.length > 0) {
                throw new Error(`Console errors: ${criticalErrors.join('; ')}`);
            }
            results.pass('No critical console errors');
        } catch (e) {
            results.fail('Console error check', e, { errors: page.consoleErrors });
        }
        
        // ============================================
        // TEST: Images Have Alt Text
        // ============================================
        try {
            const imageData = await page.evaluate(() => {
                const images = Array.from(document.querySelectorAll('img'));
                return images.map(img => ({
                    src: img.src,
                    alt: img.alt,
                    hasAlt: img.hasAttribute('alt'),
                    altIsEmpty: img.alt === '',
                    naturalWidth: img.naturalWidth,
                    naturalHeight: img.naturalHeight
                }));
            });
            
            const missingAlt = imageData.filter(img => !img.hasAlt);
            const emptyAlt = imageData.filter(img => img.hasAlt && img.altIsEmpty);
            
            if (missingAlt.length > 0) {
                throw new Error(`${missingAlt.length} images missing alt attribute`);
            }
            
            if (emptyAlt.length > 0) {
                results.warn('Some images have empty alt text', 
                    `${emptyAlt.length} images have alt="" (acceptable for decorative images)`,
                    { emptyAlt: emptyAlt.map(i => i.src) }
                );
            } else {
                results.pass('All images have alt text', { imageCount: imageData.length });
            }
        } catch (e) {
            results.fail('Image alt text validation', e);
        }
        
    } catch (e) {
        results.fail('Test suite setup', e);
    } finally {
        if (browser) await browser.close();
    }
    
    return results.getSummary();
}

module.exports = { runStructureTests };

// Run if called directly
if (require.main === module) {
    runStructureTests().then(results => {
        console.log(JSON.stringify(results, null, 2));
        process.exit(results.failed > 0 ? 1 : 0);
    });
}
