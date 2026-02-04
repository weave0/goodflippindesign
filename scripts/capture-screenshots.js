const puppeteer = require('puppeteer');
const path = require('path');

const sites = [
    { url: 'https://culturesherpa.org', name: 'culturesherpa' },
    { url: 'https://aiaimate.com', name: 'aiaimate' },
    { url: 'https://www.goodflippinvibes.com', name: 'goodflippinvibes' },
    { url: 'https://eliassen.globaldeets.com', name: 'eliassen' },
    { url: 'https://medical.globaldeets.com', name: 'medical' }
];

(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    
    for (const site of sites) {
        try {
            console.log('Capturing ' + site.name + '...');
            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 720 });
            await page.goto(site.url, { waitUntil: 'networkidle2', timeout: 30000 });
            await page.screenshot({ 
                path: path.join(__dirname, 'screenshots', site.name + '.png'),
                type: 'png'
            });
            await page.close();
            console.log('Done: ' + site.name);
        } catch (err) {
            console.log('Failed ' + site.name + ': ' + err.message);
        }
    }
    
    await browser.close();
    console.log('All screenshots complete!');
})();
