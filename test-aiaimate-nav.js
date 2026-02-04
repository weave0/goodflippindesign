/**
 * Test AI Aimate Navigation
 * Verify ecosystem navigation on Next.js dev server
 */

const puppeteer = require('puppeteer');

async function testAIAnimateNavigation() {
    console.log('🧪 Testing AI Aimate Navigation (Next.js)...\n');

    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    try {
        // Navigate to AI Aimate dev server
        console.log('Loading http://localhost:3000...');
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 15000 });

        console.log('✓ Page loaded');

        // Wait for React to render
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check for ecosystem navigation
        const nav = await page.evaluate(() => {
            // Try multiple selectors for Next.js/React navigation
            const navElement = document.querySelector('.gfd-ecosystem-nav') ||
                              document.querySelector('nav[aria-label*="ecosystem" i]') ||
                              document.querySelector('[class*="ecosystem"]');

            if (!navElement) return { found: false };

            const title = navElement.querySelector('[class*="title"]')?.textContent ||
                         navElement.querySelector('span')?.textContent;
            const toggle = navElement.querySelector('button') ||
                          navElement.querySelector('[class*="toggle"]');
            const dropdown = navElement.querySelector('[class*="dropdown"]') ||
                           navElement.querySelector('[role="menu"]');
            const links = navElement.querySelectorAll('a[href]');

            return {
                found: true,
                className: navElement.className,
                title,
                hasToggle: !!toggle,
                hasDropdown: !!dropdown,
                linkCount: links.length,
                links: Array.from(links).slice(0, 5).map(l => ({
                    text: l.textContent.trim().substring(0, 30),
                    href: l.getAttribute('href')
                }))
            };
        });

        if (!nav.found) {
            console.log('❌ Ecosystem navigation NOT FOUND');
            console.log('   Checking page structure...');

            const structure = await page.evaluate(() => {
                const header = document.querySelector('header');
                const nav = document.querySelector('nav');
                return {
                    hasHeader: !!header,
                    hasNav: !!nav,
                    navClasses: nav?.className,
                    bodyClasses: document.body.className
                };
            });

            console.log('   Structure:', JSON.stringify(structure, null, 2));
        } else {
            console.log('✓ Ecosystem navigation found');
            console.log(`  Component class: "${nav.className}"`);
            console.log(`  Title: "${nav.title}"`);
            console.log(`  Toggle: ${nav.hasToggle ? '✓' : '❌'}`);
            console.log(`  Dropdown: ${nav.hasDropdown ? '✓' : '❌'}`);
            console.log(`  Links: ${nav.linkCount}`);

            if (nav.links.length > 0) {
                console.log('\n  Navigation links:');
                nav.links.forEach(l => {
                    console.log(`    • ${l.text} → ${l.href}`);
                });
            }
        }

        // Check /support page for donation section
        console.log('\n💰 Checking /support page...');
        await page.goto('http://localhost:3000/support', { waitUntil: 'networkidle0', timeout: 15000 });

        const supportPage = await page.evaluate(() => {
            const donationSection = document.querySelector('[class*="donation" i]') ||
                                  document.querySelector('[id*="donation" i]');
            const stripeElement = document.querySelector('[class*="stripe" i]');
            const heading = document.querySelector('h1, h2');

            return {
                hasDonationSection: !!donationSection,
                hasStripeElement: !!stripeElement,
                pageHeading: heading?.textContent,
                donationClasses: donationSection?.className
            };
        });

        console.log(`  Donation section: ${supportPage.hasDonationSection ? '✓' : '❌'}`);
        console.log(`  Stripe integration: ${supportPage.hasStripeElement ? '✓' : '❌'}`);
        console.log(`  Page heading: "${supportPage.pageHeading}"`);

        console.log('\n✅ AI Aimate Navigation Test Complete!\n');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.message.includes('net::ERR_CONNECTION_REFUSED')) {
            console.log('\n⚠️  Dev server not running on localhost:3000');
            console.log('   Start with: cd "GFD Dev Projects/AI/portal" && npm run dev');
        }
    } finally {
        await browser.close();
    }
}

testAIAnimateNavigation();
