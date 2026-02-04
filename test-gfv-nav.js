/**
 * Test Good Flippin Vibes Navigation
 * Verify ecosystem navigation is working on local GFV site
 */

const puppeteer = require('puppeteer');

async function testGFVNavigation() {
    console.log('🧪 Testing Good Flippin Vibes Navigation...\n');

    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    try {
        // Navigate to local GFV site
        await page.goto('http://localhost:3001', { waitUntil: 'networkidle0', timeout: 10000 });

        console.log('✓ Page loaded');

        // Check for ecosystem navigation
        const nav = await page.evaluate(() => {
            const navElement = document.querySelector('.gfd-ecosystem-nav');
            if (!navElement) return { found: false };

            const title = navElement.querySelector('.ecosystem-title')?.textContent;
            const toggle = navElement.querySelector('.ecosystem-toggle');
            const dropdown = navElement.querySelector('.ecosystem-dropdown');
            const links = navElement.querySelectorAll('.nav-link');

            return {
                found: true,
                title,
                hasToggle: !!toggle,
                hasDropdown: !!dropdown,
                linkCount: links.length,
                links: Array.from(links).slice(0, 5).map(l => ({
                    title: l.querySelector('.nav-link-title')?.textContent,
                    href: l.getAttribute('href')
                }))
            };
        });

        if (!nav.found) {
            console.log('❌ Ecosystem navigation NOT FOUND');
            console.log('   Check if shared/ecosystem-nav.css and .js are loading');
        } else {
            console.log('✓ Ecosystem navigation found');
            console.log(`  Title: "${nav.title}"`);
            console.log(`  Toggle button: ${nav.hasToggle ? '✓' : '❌'}`);
            console.log(`  Dropdown: ${nav.hasDropdown ? '✓' : '❌'}`);
            console.log(`  Links: ${nav.linkCount}`);

            if (nav.links.length > 0) {
                console.log('\n  Sample links:');
                nav.links.forEach(l => {
                    console.log(`    • ${l.title} → ${l.href}`);
                });
            }
        }

        // Test dropdown interaction
        console.log('\n🖱️  Testing dropdown toggle...');
        await page.click('.ecosystem-toggle');
        await new Promise(resolve => setTimeout(resolve, 500));

        const dropdownVisible = await page.evaluate(() => {
            const dropdown = document.querySelector('.ecosystem-dropdown');
            const isVisible = dropdown && dropdown.getAttribute('aria-hidden') === 'false';
            return isVisible;
        });

        console.log(`  Dropdown opens: ${dropdownVisible ? '✓' : '❌'}`);

        // Test responsive behavior
        console.log('\n📱 Testing mobile responsive...');
        await page.setViewport({ width: 375, height: 667 });
        await new Promise(resolve => setTimeout(resolve, 300));

        const mobileNav = await page.evaluate(() => {
            const nav = document.querySelector('.gfd-ecosystem-nav');
            if (!nav) return { visible: false };

            const styles = window.getComputedStyle(nav);
            return {
                visible: styles.display !== 'none',
                position: styles.position
            };
        });

        console.log(`  Mobile nav visible: ${mobileNav.visible ? '✓' : '❌'}`);
        console.log(`  Position: ${mobileNav.position}`);

        console.log('\n✅ GFV Navigation Test Complete!\n');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        await browser.close();
    }
}

testGFVNavigation();
