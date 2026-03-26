const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
    });

    const page = await browser.newPage();
    const filePath = 'file://' + path.join(__dirname, 'temp_review.html').replace(/\\/g, '/');

    await page.goto(filePath, { waitUntil: 'networkidle0' });

    // Wait for ecosystem nav to load
    await page.waitForSelector('.gfd-ecosystem-nav', { timeout: 5000 });
    await new Promise(r => setTimeout(r, 1000));

    // Get all external links
    const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href^="http"]')).map(a => ({
            href: a.href,
            target: a.target,
            rel: a.rel,
            text: a.textContent.trim().substring(0, 40),
            hasTargetBlank: a.target === '_blank',
            hasNoopener: a.rel.includes('noopener')
        }));
    });

    console.log(`\nFound ${links.length} external links:\n`);
    links.forEach((link, i) => {
        const status = link.hasTargetBlank && link.hasNoopener ? '✓' : '✗';
        console.log(`${status} [${i + 1}] ${link.text}`);
        console.log(`    target="${link.target}" rel="${link.rel}"`);
        console.log(`    ${link.href}\n`);
    });

    const missingTarget = links.filter(l => !l.hasTargetBlank);
    const missingNoopener = links.filter(l => l.hasTargetBlank && !l.hasNoopener);

    console.log(`\n=== SUMMARY ===`);
    console.log(`Total external links: ${links.length}`);
    console.log(`Missing target="_blank": ${missingTarget.length}`);
    console.log(`Missing rel="noopener": ${missingNoopener.length}`);

    if (missingTarget.length > 0) {
        console.log(`\nLinks missing target="_blank":`);
        missingTarget.forEach(l => console.log(`  - ${l.text}: ${l.href}`));
    }

    await browser.close();
})();
