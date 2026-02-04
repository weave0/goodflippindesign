/**
 * Portfolio Screenshot Capture Script
 * Automatically captures hero screenshots from live GFD ecosystem sites
 * Optimized for portfolio display at 1600x900 (16:9 aspect ratio)
 */

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const VIEWPORT = {
    width: 1600,
    height: 900,
    deviceScaleFactor: 2 // Retina quality
};

const SCREENSHOTS_DIR = path.join(__dirname, 'assets', 'portfolio');

const SITES = [
    {
        name: 'aiaimate',
        url: 'https://aiaimate.com',
        filename: 'aiaimate-hero.png',
        waitFor: 3000, // Wait for animations
        description: 'AI Aimate - AI Education Platform'
    },
    {
        name: 'culturesherpa',
        url: 'https://culturesherpa.org',
        filename: 'culturesherpa-hero.png',
        waitFor: 3000,
        description: 'CultureSherpa - Interactive Cultural Atlas'
    },
    {
        name: 'goodflippinvibes',
        url: 'https://goodflippinvibes.com',
        filename: 'goodflippinvibes-hero.png',
        waitFor: 2000,
        description: 'Good Flippin Vibes - Wellness Platform'
    },
    {
        name: 'globaldeets',
        url: 'https://globaldeets.com',
        filename: 'globaldeets-hero.png',
        waitFor: 2000,
        description: 'GlobalDeets - Portfolio Hub'
    },
    {
        name: 'citizenapproved',
        url: 'https://citizenapproved.org',
        filename: 'citizenapproved-hero.png',
        waitFor: 2500,
        description: 'CitizenApproved - U.S. Citizenship Pathways'
    }
];

async function ensureDirectory() {
    try {
        await fs.access(SCREENSHOTS_DIR);
    } catch {
        await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });
        console.log(`✓ Created directory: ${SCREENSHOTS_DIR}`);
    }
}

async function captureScreenshot(browser, site) {
    console.log(`\n📸 Capturing: ${site.description}`);
    console.log(`   URL: ${site.url}`);

    const page = await browser.newPage();

    try {
        // Set viewport
        await page.setViewport(VIEWPORT);

        // Navigate to site
        await page.goto(site.url, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        // Wait for content to load and animations to settle
        await new Promise(resolve => setTimeout(resolve, site.waitFor));

        // Optional: Scroll slightly to trigger any lazy-loaded images
        await page.evaluate(() => window.scrollBy(0, 100));
        await new Promise(resolve => setTimeout(resolve, 500));
        await page.evaluate(() => window.scrollTo(0, 0));
        await new Promise(resolve => setTimeout(resolve, 500));

        // Capture screenshot
        const screenshotPath = path.join(SCREENSHOTS_DIR, site.filename);
        await page.screenshot({
            path: screenshotPath,
            type: 'png',
            fullPage: false // Only capture viewport (hero section)
        });

        console.log(`   ✓ Saved: ${site.filename}`);

        // Get file size
        const stats = await fs.stat(screenshotPath);
        const fileSizeKB = (stats.size / 1024).toFixed(2);
        console.log(`   Size: ${fileSizeKB} KB`);

        return { success: true, path: screenshotPath, size: stats.size };

    } catch (error) {
        console.error(`   ✗ Error: ${error.message}`);
        return { success: false, error: error.message };
    } finally {
        await page.close();
    }
}

async function main() {
    console.log('🎯 GFD Portfolio Screenshot Capture Tool');
    console.log('=========================================\n');
    console.log(`Viewport: ${VIEWPORT.width}x${VIEWPORT.height} @ ${VIEWPORT.deviceScaleFactor}x`);
    console.log(`Output: ${SCREENSHOTS_DIR}\n`);

    // Ensure output directory exists
    await ensureDirectory();

    // Launch browser
    console.log('🚀 Launching browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ]
    });

    console.log('✓ Browser ready\n');

    // Capture all screenshots
    const results = [];
    for (const site of SITES) {
        const result = await captureScreenshot(browser, site);
        results.push({ site: site.name, ...result });
    }

    // Close browser
    await browser.close();
    console.log('\n✓ Browser closed');

    // Summary
    console.log('\n📊 Capture Summary');
    console.log('==================');

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`✓ Successful: ${successful.length}/${SITES.length}`);
    if (failed.length > 0) {
        console.log(`✗ Failed: ${failed.length}`);
        failed.forEach(f => {
            console.log(`   - ${f.site}: ${f.error}`);
        });
    }

    if (successful.length > 0) {
        const totalSize = successful.reduce((sum, r) => sum + r.size, 0);
        const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
        console.log(`\nTotal size: ${totalSizeMB} MB`);
        console.log('\n✨ Next steps:');
        console.log('   1. Review screenshots in assets/portfolio/');
        console.log('   2. Run WebP conversion for optimization');
        console.log('   3. Update index.html with new image paths');
    }

    console.log('\n✅ Screenshot capture complete!\n');
}

// Run the script
main().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
});
