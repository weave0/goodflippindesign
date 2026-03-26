/**
 * Diagnostic script to find elements with touch targets < 44px
 */

const puppeteer = require('puppeteer');

async function diagnoseSmallTouchTargets() {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 667 }); // iPhone SE

    await page.goto('file:///' + __dirname.replace(/\\/g, '/') + '/temp_review.html', {
        waitUntil: 'networkidle0'
    });

    const smallElements = await page.evaluate(() => {
        const interactive = document.querySelectorAll('a, button, input, select, textarea, [role="button"]');
        const tooSmall = [];

        interactive.forEach(el => {
            const rect = el.getBoundingClientRect();
            const styles = getComputedStyle(el);

            // Skip hidden elements
            if (styles.display === 'none' || styles.visibility === 'hidden') return;
            if (rect.width === 0 || rect.height === 0) return;

            // Check size
            if (rect.width < 44 || rect.height < 44) {
                tooSmall.push({
                    tag: el.tagName,
                    class: el.className,
                    id: el.id,
                    text: el.textContent?.trim().substring(0, 40),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                    padding: styles.padding,
                    type: el.type || null
                });
            }
        });

        return tooSmall;
    });

    console.log('Elements with touch targets < 44px:');
    console.log(JSON.stringify(smallElements, null, 2));
    console.log(`\nTotal: ${smallElements.length} elements`);

    await browser.close();
}

diagnoseSmallTouchTargets().catch(console.error);
