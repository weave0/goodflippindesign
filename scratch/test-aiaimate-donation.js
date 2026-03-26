/**
 * AI Aimate - Donation Flow Test
 * Tests the complete Stripe donation integration on /support page
 */

const puppeteer = require('puppeteer');

async function testAIAimateDonation() {
    console.log('🧪 AI Aimate Donation Flow Test\n');

    let browser;
    try {
        browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();

        // Navigate to support page
        console.log('📍 Navigating to http://localhost:3000/support...');
        await page.goto('http://localhost:3000/support', {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        // Check for ecosystem navigation
        const hasEcosystemNav = await page.evaluate(() => {
            return !!document.querySelector('.ecosystem-nav') ||
                   !!document.querySelector('[class*="ecosystem"]');
        });
        console.log(`Ecosystem Nav: ${hasEcosystemNav ? '✓' : '✗'}`);

        // Check for donation section
        const donationSection = await page.evaluate(() => {
            // Look for various donation indicators
            const hasDonationHeading = !!document.querySelector('h1, h2, h3').textContent?.toLowerCase().includes('support');
            const hasStripeElements = !!document.querySelector('#donation-payment-element, [id*="stripe"], [class*="stripe"]');
            const hasAmountButtons = document.querySelectorAll('button[data-amount], button').length;

            return {
                hasDonationHeading,
                hasStripeElements,
                buttonCount: hasAmountButtons,
                pageTitle: document.title,
                mainHeading: document.querySelector('h1, h2')?.textContent?.trim()
            };
        });

        console.log(`\nDonation Section Analysis:`);
        console.log(`  Page Title: ${donationSection.pageTitle}`);
        console.log(`  Main Heading: ${donationSection.mainHeading}`);
        console.log(`  Donation Heading: ${donationSection.hasDonationHeading ? '✓' : '✗'}`);
        console.log(`  Stripe Elements: ${donationSection.hasStripeElements ? '✓' : '✗'}`);
        console.log(`  Interactive Buttons: ${donationSection.buttonCount}`);

        // Check for amount selection buttons
        const amountButtons = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const amountButtons = buttons.filter(btn => {
                const text = btn.textContent.toLowerCase();
                return text.includes('$') || text.includes('donate') || text.includes('support');
            });

            return amountButtons.map(btn => ({
                text: btn.textContent.trim(),
                disabled: btn.disabled,
                visible: btn.offsetParent !== null
            }));
        });

        console.log(`\nAmount Selection Buttons:`);
        if (amountButtons.length > 0) {
            amountButtons.forEach((btn, i) => {
                console.log(`  ${i + 1}. "${btn.text}" ${btn.disabled ? '[DISABLED]' : ''} ${btn.visible ? '' : '[HIDDEN]'}`);
            });
        } else {
            console.log(`  ⚠️  No amount buttons found`);
        }

        // Check for custom amount input
        const customAmountInput = await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input[type="number"], input[type="text"]'));
            const customInput = inputs.find(inp =>
                inp.placeholder?.toLowerCase().includes('amount') ||
                inp.placeholder?.toLowerCase().includes('custom') ||
                inp.name?.includes('amount')
            );

            return customInput ? {
                found: true,
                placeholder: customInput.placeholder,
                type: customInput.type,
                name: customInput.name
            } : { found: false };
        });

        console.log(`\nCustom Amount Input: ${customAmountInput.found ? '✓' : '✗'}`);
        if (customAmountInput.found) {
            console.log(`  Placeholder: "${customAmountInput.placeholder}"`);
        }

        // Check for payment form/Stripe iframe
        const stripeIframe = await page.evaluate(() => {
            const iframes = Array.from(document.querySelectorAll('iframe'));
            const stripeFrame = iframes.find(iframe =>
                iframe.src?.includes('stripe') ||
                iframe.title?.toLowerCase().includes('stripe') ||
                iframe.title?.toLowerCase().includes('payment')
            );

            return stripeFrame ? {
                found: true,
                src: stripeFrame.src,
                title: stripeFrame.title
            } : { found: false };
        });

        console.log(`\nStripe Payment Element: ${stripeIframe.found ? '✓' : '✗'}`);
        if (stripeIframe.found) {
            console.log(`  Title: "${stripeIframe.title}"`);
        }

        // Overall assessment
        const isFullyFunctional =
            hasEcosystemNav &&
            donationSection.hasDonationHeading &&
            amountButtons.length >= 4 &&
            customAmountInput.found;

        console.log(`\n${'='.repeat(50)}`);
        if (isFullyFunctional) {
            console.log('✅ DONATION FLOW: FULLY FUNCTIONAL');
        } else {
            console.log('⚠️  DONATION FLOW: NEEDS REVIEW');
            console.log('\nMissing Components:');
            if (!hasEcosystemNav) console.log('  - Ecosystem Navigation');
            if (!donationSection.hasDonationHeading) console.log('  - Donation Section Heading');
            if (amountButtons.length < 4) console.log('  - Amount Selection Buttons (need 4+)');
            if (!customAmountInput.found) console.log('  - Custom Amount Input');
        }

    } catch (error) {
        console.error('❌ Test Failed:', error.message);
    } finally {
        if (browser) await browser.close();
    }
}

testAIAimateDonation();
