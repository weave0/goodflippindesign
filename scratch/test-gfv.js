/**
 * Quick GFV Navigation Test
 * Verifies ecosystem nav integration
 */

const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();

    try {
        await page.goto('http://localhost:3001', { waitUntil: 'networkidle0', timeout: 10000 });

        // Wait for ecosystem nav to load
        await page.waitForSelector('.gfd-ecosystem-nav', { timeout: 5000 });

        const results = await page.evaluate(() => {
            const ecosystemNav = document.querySelector('.gfd-ecosystem-nav');
            const dropdown = document.querySelector('.ecosystem-dropdown');
            const navLinks = Array.from(document.querySelectorAll('.nav-link'));
            const activeLink = document.querySelector('.nav-link.active');

            return {
                ecosystemNavExists: !!ecosystemNav,
                dropdownExists: !!dropdown,
                linkCount: navLinks.length,
                activeLink: activeLink ? {
                    text: activeLink.querySelector('.nav-link-title')?.textContent,
                    href: activeLink.href
                } : null,
                allLinks: navLinks.map(link => ({
                    title: link.querySelector('.nav-link-title')?.textContent,
                    href: link.href
                }))
            };
        });

        console.log('\n✅ GFV Navigation Test Results:\n');
        console.log(`Ecosystem Nav: ${results.ecosystemNavExists ? '✓' : '✗'}`);
        console.log(`Dropdown Menu: ${results.dropdownExists ? '✓' : '✗'}`);
        console.log(`Navigation Links: ${results.linkCount} found`);
        console.log(`\nActive Link: ${results.activeLink ? results.activeLink.text : 'NONE'}`);
        console.log(`Expected: "Good Flippin Vibes"`);
        console.log(`\nAll Links:`);
        results.allLinks.forEach((link, i) => {
            console.log(`  ${i + 1}. ${link.title} → ${link.href}`);
        });

        const testPassed = results.ecosystemNavExists &&
                          results.dropdownExists &&
                          results.linkCount >= 5 &&
                          results.activeLink?.text === 'Good Flippin Vibes';

        console.log(`\n${testPassed ? '🎉 ALL TESTS PASSED' : '❌ TESTS FAILED'}\n`);
        process.exit(testPassed ? 0 : 1);

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
