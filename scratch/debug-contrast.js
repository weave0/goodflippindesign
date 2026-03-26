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
    await new Promise(r => setTimeout(r, 1000));

    const contrastIssues = await page.evaluate(() => {
        const issues = [];
        const textElements = document.querySelectorAll('p, span, a, h1, h2, h3, h4, h5, h6, li, label, button');

        const parseColor = (color) => {
            if (!color || color === 'transparent') return null;
            const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (match) {
                return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
            }
            return null;
        };

        const getLuminance = (color) => {
            if (!color) return 0;
            const [rs, gs, bs] = [color.r, color.g, color.b].map(c => {
                c = c / 255;
                return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
        };

        const getContrastRatio = (c1, c2) => {
            const l1 = getLuminance(c1);
            const l2 = getLuminance(c2);
            return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        };

        const checked = new Set();

        textElements.forEach(el => {
            const styles = getComputedStyle(el);
            if (styles.display === 'none' || styles.visibility === 'hidden') return;

            const fg = parseColor(styles.color);
            const bg = parseColor(styles.backgroundColor);

            if (!fg || !bg) return;

            const key = `${styles.color}-${styles.backgroundColor}`;
            if (checked.has(key)) return;
            checked.add(key);

            const ratio = getContrastRatio(fg, bg);
            const fontSize = parseFloat(styles.fontSize);
            const isBold = parseInt(styles.fontWeight) >= 700;
            const isLargeText = fontSize >= 18 || (fontSize >= 14 && isBold);
            const minRatio = isLargeText ? 3 : 4.5;

            if (ratio < minRatio) {
                issues.push({
                    element: el.tagName,
                    text: el.textContent.substring(0, 30),
                    fgColor: styles.color,
                    bgColor: styles.backgroundColor,
                    ratio: ratio.toFixed(2),
                    required: minRatio,
                    isLargeText,
                    fontSize: fontSize + 'px',
                    fontWeight: styles.fontWeight
                });
            }
        });

        return {
            checked: checked.size,
            issues: issues.slice(0, 10)
        };
    });

    console.log(`\n=== COLOR CONTRAST ANALYSIS ===\n`);
    console.log(`Total combinations checked: ${contrastIssues.checked}`);
    console.log(`Issues found: ${contrastIssues.issues.length}\n`);

    if (contrastIssues.issues.length > 0) {
        console.log('FAILING COMBINATIONS:\n');
        contrastIssues.issues.forEach((issue, i) => {
            console.log(`${i + 1}. ${issue.element}: "${issue.text}"`);
            console.log(`   Foreground: ${issue.fgColor}`);
            console.log(`   Background: ${issue.bgColor}`);
            console.log(`   Ratio: ${issue.ratio}:1 (required: ${issue.required}:1)`);
            console.log(`   Font: ${issue.fontSize} / weight ${issue.fontWeight}`);
            console.log(`   Large text: ${issue.isLargeText}\n`);
        });
    } else {
        console.log('✓ All color combinations meet WCAG AA standards!');
    }

    await browser.close();
})();
