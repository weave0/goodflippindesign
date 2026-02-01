/**
 * Live Google Analytics Test
 * Verifies GA4 is actually sending data by inspecting network requests
 */

const puppeteer = require('puppeteer');

async function testGoogleAnalytics() {
    console.log('\n🔍 TESTING GOOGLE ANALYTICS - LIVE VERIFICATION\n');
    console.log('='.repeat(60));

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Track all network requests
    const requests = [];
    page.on('request', request => {
        const url = request.url();
        if (url.includes('google-analytics.com') ||
            url.includes('googletagmanager.com') ||
            url.includes('analytics.google.com')) {
            requests.push({
                type: request.resourceType(),
                url: url,
                method: request.method()
            });
        }
    });

    // Track console errors
    const consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
        }
    });

    try {
        console.log('\n📍 Visiting: https://www.goodflippindesign.com\n');

        await page.goto('https://www.goodflippindesign.com', {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        // Wait a bit for GA to fire
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Check if gtag function exists
        const gtagExists = await page.evaluate(() => {
            return {
                gtagFunction: typeof gtag === 'function',
                dataLayer: window.dataLayer ? window.dataLayer.length : 0,
                dataLayerContents: window.dataLayer ? window.dataLayer.slice(0, 5) : []
            };
        });

        console.log('\n📊 RESULTS:\n');
        console.log('-'.repeat(60));

        // 1. Check gtag function
        if (gtagExists.gtagFunction) {
            console.log('✅ gtag() function exists');
        } else {
            console.log('❌ gtag() function NOT found');
        }

        // 2. Check dataLayer
        if (gtagExists.dataLayer > 0) {
            console.log(`✅ dataLayer initialized (${gtagExists.dataLayer} events)`);
            console.log('   Events:', JSON.stringify(gtagExists.dataLayerContents, null, 2));
        } else {
            console.log('❌ dataLayer empty or missing');
        }

        // 3. Check network requests
        console.log('\n📡 NETWORK REQUESTS:\n');

        const gtagScript = requests.find(r => r.url.includes('gtag/js'));
        const collectRequests = requests.filter(r =>
            r.url.includes('/g/collect') ||
            r.url.includes('/collect?v=2') ||
            r.url.includes('/j/collect')
        );

        if (gtagScript) {
            console.log('✅ gtag.js script loaded');
            console.log('   URL:', gtagScript.url.substring(0, 80) + '...');
        } else {
            console.log('❌ gtag.js script NOT loaded');
        }

        if (collectRequests.length > 0) {
            console.log(`\n✅ ✅ ✅ GOOGLE ANALYTICS IS SENDING DATA! ✅ ✅ ✅`);
            console.log(`\n   Found ${collectRequests.length} data collection request(s):\n`);
            collectRequests.forEach((req, i) => {
                console.log(`   ${i + 1}. ${req.method} ${req.url.substring(0, 100)}...`);
            });
        } else {
            console.log('\n⚠️  No data collection requests detected');
            console.log('   (May take a few seconds to fire - try manual test)');
        }

        // 4. Check for console errors
        console.log('\n🐛 CONSOLE ERRORS:\n');
        if (consoleErrors.length > 0) {
            consoleErrors.forEach(err => console.log('   ❌', err));
        } else {
            console.log('   ✅ No console errors');
        }

        // 5. All requests for debugging
        if (requests.length > 0) {
            console.log('\n📋 ALL GA-RELATED REQUESTS:\n');
            requests.forEach((req, i) => {
                console.log(`   ${i + 1}. [${req.type}] ${req.url.substring(0, 100)}...`);
            });
        }

        console.log('\n' + '='.repeat(60));

        // Final verdict
        if (gtagExists.gtagFunction && gtagExists.dataLayer > 0) {
            console.log('\n✅ VERDICT: Google Analytics is CONFIGURED CORRECTLY!\n');
            if (collectRequests.length > 0) {
                console.log('   AND it\'s actively sending data to Google! 🎉\n');
            } else {
                console.log('   Data may be sent on user interaction or after delay.\n');
                console.log('   Try visiting the site manually and check Network tab.\n');
            }
        } else {
            console.log('\n❌ VERDICT: Google Analytics has configuration issues\n');
        }

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
    } finally {
        await browser.close();
    }
}

testGoogleAnalytics().catch(console.error);
