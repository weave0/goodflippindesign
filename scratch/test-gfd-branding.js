/**
 * GFD Branding Verification Test
 * Checks that all GFD ecosystem branding is correct
 */

const puppeteer = require('puppeteer');
const path = require('path');

async function testGFDBranding() {
    console.log('🔍 Testing GFD Branding Corrections...\n');

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    const filePath = 'file://' + path.join(__dirname, 'temp_review.html').replace(/\\/g, '/');

    await page.goto(filePath, { waitUntil: 'networkidle0' });
    await new Promise(resolve => setTimeout(resolve, 2000)); // Let JavaScript fully execute

    // Check branding elements
    const branding = await page.evaluate(() => {
        const results = {
            ecosystemTitle: null,
            cssClassCorrect: false,
            navAriaLabel: null,
            dropdownContent: [],
            jsLoaded: false
        };

        // Check ecosystem title
        const titleEl = document.querySelector('.gfd-ecosystem-nav .ecosystem-title');
        if (titleEl) results.ecosystemTitle = titleEl.textContent.trim();

        // Check CSS class
        results.cssClassCorrect = !!document.querySelector('.gfd-ecosystem-nav');

        // Check ARIA label
        const nav = document.querySelector('nav.gfd-ecosystem-nav');
        if (nav) results.navAriaLabel = nav.getAttribute('aria-label');

        // Check dropdown links text
        const dropdownLinks = document.querySelectorAll('.gfd-ecosystem-nav .nav-link-title');
        dropdownLinks.forEach(link => {
            results.dropdownContent.push(link.textContent.trim());
        });

        // Check if JavaScript loaded by looking for event handlers
        results.jsLoaded = typeof window.ecosystemNavLoaded !== 'undefined' ||
                          document.querySelector('.gfd-ecosystem-nav .ecosystem-toggle') !== null;

        return results;
    });

    console.log('📋 Branding Check Results:\n');
    console.log(`   Ecosystem Title: "${branding.ecosystemTitle}"`);
    console.log(`   ✓ Expected: "GFD Ecosystem"`);
    console.log(`   ${branding.ecosystemTitle === 'GFD Ecosystem' ? '✅' : '❌'} ${branding.ecosystemTitle === 'GFD Ecosystem' ? 'CORRECT' : 'WRONG!'}\n`);

    console.log(`   CSS Class: ${branding.cssClassCorrect ? '.gfd-ecosystem-nav' : 'NOT FOUND'}`);
    console.log(`   ${branding.cssClassCorrect ? '✅' : '❌'} ${branding.cssClassCorrect ? 'CORRECT' : 'WRONG!'}\n`);

    console.log(`   ARIA Label: "${branding.navAriaLabel}"`);
    console.log(`   ✓ Expected: "Ecosystem navigation"`);
    console.log(`   ${branding.navAriaLabel === 'Ecosystem navigation' ? '✅' : '❌'} ${branding.navAriaLabel === 'Ecosystem navigation' ? 'CORRECT' : 'WRONG!'}\n`);

    console.log(`   Dropdown Links Found: ${branding.dropdownContent.length}`);
    branding.dropdownContent.forEach((text, i) => {
        console.log(`   ${i + 1}. ${text}`);
    });
    console.log(`   ${branding.dropdownContent.length >= 5 ? '✅' : '❌'} ${branding.dropdownContent.length >= 5 ? 'All links present' : 'Missing links!'}\n`);

    console.log(`   JavaScript Loaded: ${branding.jsLoaded ? 'Yes' : 'No'}`);
    console.log(`   ${branding.jsLoaded ? '✅' : '❌'} ${branding.jsLoaded ? 'Component functional' : 'Component broken!'}\n`);

    // Summary
    const allCorrect = branding.ecosystemTitle === 'GFD Ecosystem' &&
                      branding.cssClassCorrect &&
                      branding.navAriaLabel === 'Ecosystem navigation' &&
                      branding.dropdownContent.length >= 5 &&
                      branding.jsLoaded;

    console.log('━'.repeat(70));
    console.log(`${allCorrect ? '✅ BRANDING VERIFICATION: PASSED' : '❌ BRANDING VERIFICATION: FAILED'}`);
    console.log('━'.repeat(70));

    await browser.close();

    return allCorrect;
}

testGFDBranding().then(success => {
    process.exit(success ? 0 : 1);
}).catch(err => {
    console.error('❌ Test Error:', err.message);
    process.exit(1);
});
