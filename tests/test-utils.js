/**
 * GFV LLC - Test Utilities
 * Shared helper functions for all test suites
 */

const puppeteer = require('puppeteer');
const config = require('./test-config');

/**
 * Color utilities for accessibility testing
 */
const ColorUtils = {
    // Parse CSS color to RGB
    parseColor(color) {
        if (!color || color === 'transparent') return null;
        
        // Handle rgb/rgba
        const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (rgbMatch) {
            return {
                r: parseInt(rgbMatch[1]),
                g: parseInt(rgbMatch[2]),
                b: parseInt(rgbMatch[3])
            };
        }
        
        // Handle hex
        const hexMatch = color.match(/#([0-9a-f]{6}|[0-9a-f]{3})/i);
        if (hexMatch) {
            let hex = hexMatch[1];
            if (hex.length === 3) {
                hex = hex.split('').map(c => c + c).join('');
            }
            return {
                r: parseInt(hex.substr(0, 2), 16),
                g: parseInt(hex.substr(2, 2), 16),
                b: parseInt(hex.substr(4, 2), 16)
            };
        }
        
        return null;
    },
    
    // Calculate relative luminance
    getLuminance(color) {
        if (!color) return 0;
        const { r, g, b } = color;
        const [rs, gs, bs] = [r, g, b].map(c => {
            c = c / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    },
    
    // Calculate contrast ratio
    getContrastRatio(color1, color2) {
        const l1 = this.getLuminance(color1);
        const l2 = this.getLuminance(color2);
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
    }
};

/**
 * Test result tracking
 */
class TestResults {
    constructor(suiteName) {
        this.suiteName = suiteName;
        this.tests = [];
        this.startTime = Date.now();
    }
    
    pass(testName, details = null) {
        this.tests.push({ name: testName, status: 'PASS', details, duration: Date.now() - this.startTime });
    }
    
    fail(testName, error, details = null) {
        this.tests.push({ name: testName, status: 'FAIL', error: error.toString(), details, duration: Date.now() - this.startTime });
    }
    
    skip(testName, reason) {
        this.tests.push({ name: testName, status: 'SKIP', reason, duration: 0 });
    }
    
    warn(testName, warning, details = null) {
        this.tests.push({ name: testName, status: 'WARN', warning, details, duration: Date.now() - this.startTime });
    }
    
    getSummary() {
        const passed = this.tests.filter(t => t.status === 'PASS').length;
        const failed = this.tests.filter(t => t.status === 'FAIL').length;
        const skipped = this.tests.filter(t => t.status === 'SKIP').length;
        const warnings = this.tests.filter(t => t.status === 'WARN').length;
        
        return {
            suite: this.suiteName,
            total: this.tests.length,
            passed,
            failed,
            skipped,
            warnings,
            duration: Date.now() - this.startTime,
            tests: this.tests
        };
    }
}

/**
 * Simple delay function (replacement for deprecated page.waitForTimeout)
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Browser utilities
 */
const BrowserUtils = {
    async launchBrowser(options = {}) {
        return puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--allow-file-access-from-files'
            ],
            ...options
        });
    },
    
    async createPage(browser, viewport = config.viewports.desktop) {
        const page = await browser.newPage();
        await page.setViewport(viewport);
        
        // Collect console errors
        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });
        
        // Collect page errors
        const pageErrors = [];
        page.on('pageerror', error => {
            pageErrors.push(error.toString());
        });
        
        page.consoleErrors = consoleErrors;
        page.pageErrors = pageErrors;
        
        return page;
    },
    
    async waitForStable(page, timeout = 1000) {
        await page.evaluate(() => {
            return new Promise(resolve => {
                let lastTime = Date.now();
                const observer = new MutationObserver(() => {
                    lastTime = Date.now();
                });
                observer.observe(document.body, { 
                    childList: true, 
                    subtree: true, 
                    attributes: true 
                });
                
                const checkStable = () => {
                    if (Date.now() - lastTime > 100) {
                        observer.disconnect();
                        resolve();
                    } else {
                        setTimeout(checkStable, 50);
                    }
                };
                setTimeout(checkStable, 50);
            });
        });
    }
};

/**
 * Element utilities
 */
const ElementUtils = {
    async getComputedStyles(page, selector) {
        return page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (!el) return null;
            const styles = window.getComputedStyle(el);
            return {
                display: styles.display,
                visibility: styles.visibility,
                opacity: styles.opacity,
                color: styles.color,
                backgroundColor: styles.backgroundColor,
                fontSize: styles.fontSize,
                fontWeight: styles.fontWeight,
                lineHeight: styles.lineHeight,
                padding: styles.padding,
                margin: styles.margin,
                border: styles.border,
                borderRadius: styles.borderRadius,
                transform: styles.transform,
                transition: styles.transition,
                position: styles.position,
                zIndex: styles.zIndex,
                overflow: styles.overflow,
                pointerEvents: styles.pointerEvents,
                cursor: styles.cursor
            };
        }, selector);
    },
    
    async getBoundingBox(page, selector) {
        const element = await page.$(selector);
        if (!element) return null;
        return element.boundingBox();
    },
    
    async isVisible(page, selector) {
        return page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (!el) return false;
            const styles = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return (
                styles.display !== 'none' &&
                styles.visibility !== 'hidden' &&
                parseFloat(styles.opacity) > 0 &&
                rect.width > 0 &&
                rect.height > 0
            );
        }, selector);
    },
    
    async getAllElements(page, selector) {
        return page.evaluate((sel) => {
            return Array.from(document.querySelectorAll(sel)).map(el => {
                const rect = el.getBoundingClientRect();
                const styles = window.getComputedStyle(el);
                return {
                    tagName: el.tagName,
                    id: el.id,
                    className: el.className,
                    text: el.textContent?.substring(0, 100),
                    href: el.href,
                    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                    visible: styles.display !== 'none' && styles.visibility !== 'hidden' && parseFloat(styles.opacity) > 0
                };
            });
        }, selector);
    },
    
    async getFocusableElements(page) {
        return page.evaluate(() => {
            const focusable = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
            return Array.from(document.querySelectorAll(focusable)).map(el => ({
                tagName: el.tagName,
                type: el.type,
                id: el.id,
                name: el.name,
                tabIndex: el.tabIndex,
                disabled: el.disabled,
                ariaLabel: el.getAttribute('aria-label'),
                text: el.textContent?.substring(0, 50)
            }));
        });
    }
};

/**
 * Assertion helpers
 */
const Assertions = {
    isTrue(condition, message) {
        if (!condition) {
            throw new Error(message || 'Expected condition to be true');
        }
    },
    
    isFalse(condition, message) {
        if (condition) {
            throw new Error(message || 'Expected condition to be false');
        }
    },
    
    equals(actual, expected, message) {
        if (actual !== expected) {
            throw new Error(message || `Expected ${expected} but got ${actual}`);
        }
    },
    
    greaterThan(actual, expected, message) {
        if (actual <= expected) {
            throw new Error(message || `Expected ${actual} to be greater than ${expected}`);
        }
    },
    
    lessThan(actual, expected, message) {
        if (actual >= expected) {
            throw new Error(message || `Expected ${actual} to be less than ${expected}`);
        }
    },
    
    contains(array, item, message) {
        if (!array.includes(item)) {
            throw new Error(message || `Expected array to contain ${item}`);
        }
    },
    
    matches(string, pattern, message) {
        if (!pattern.test(string)) {
            throw new Error(message || `Expected "${string}" to match pattern ${pattern}`);
        }
    }
};

module.exports = {
    ColorUtils,
    TestResults,
    BrowserUtils,
    ElementUtils,
    Assertions,
    config,
    delay
};
