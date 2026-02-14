const puppeteer = require('puppeteer');
const path = require('path');

/**
 * Calculate relative luminance for WCAG contrast calculations
 */
function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two RGB colors
 */
function getContrastRatio(rgb1, rgb2) {
  const lum1 = getLuminance(rgb1[0], rgb1[1], rgb1[2]);
  const lum2 = getLuminance(rgb2[0], rgb2[1], rgb2[2]);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Parse RGB color string to array
 */
function parseColor(colorStr) {
  const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return match ? [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])] : null;
}

async function diagnoseContrast() {
  console.log('🔍 Diagnosing Color Contrast Issues...\n');

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  const filePath = `file://${path.resolve(__dirname, 'temp_review.html')}`;
  await page.goto(filePath, { waitUntil: 'networkidle0' });

  // Set mobile viewport to check all states
  await page.setViewport({ width: 375, height: 667 });

  const violations = await page.evaluate(() => {
    const issues = [];

    // Helper to get computed styles
    function getStyles(element) {
      const computed = window.getComputedStyle(element);
      return {
        color: computed.color,
        backgroundColor: computed.backgroundColor,
        selector: element.className ? `.${element.className.split(' ')[0]}` : element.tagName.toLowerCase(),
        text: element.textContent.trim().substring(0, 50),
        fontSize: computed.fontSize
      };
    }

    // Get all text elements
    const textElements = document.querySelectorAll('p, a, span, button, h1, h2, h3, h4, h5, h6, li, label, input, textarea');

    textElements.forEach(el => {
      // Skip hidden elements
      if (el.offsetParent === null) return;

      const styles = getStyles(el);

      // Skip if no meaningful text
      if (!styles.text || styles.text.length < 2) return;

      issues.push({
        selector: styles.selector,
        text: styles.text,
        color: styles.color,
        backgroundColor: styles.backgroundColor,
        fontSize: styles.fontSize
      });
    });

    return issues;
  });

  // Calculate contrast ratios
  const contrastIssues = [];

  violations.forEach(item => {
    const fgColor = parseColor(item.color);
    const bgColor = parseColor(item.backgroundColor);

    if (!fgColor || !bgColor) return;

    // Skip transparent backgrounds - need to check parent
    if (bgColor[0] === 0 && bgColor[1] === 0 && bgColor[2] === 0) {
      // Assume dark background (#0d0d0d = 13,13,13)
      bgColor[0] = bgColor[1] = bgColor[2] = 13;
    }

    const ratio = getContrastRatio(fgColor, bgColor);

    // WCAG AA requires 4.5:1 for normal text, 3:1 for large text (18pt+ or 14pt+ bold)
    const fontSize = parseFloat(item.fontSize);
    const threshold = fontSize >= 24 ? 3.0 : 4.5;

    if (ratio < threshold) {
      contrastIssues.push({
        selector: item.selector,
        text: item.text,
        ratio: ratio.toFixed(2),
        required: threshold,
        foreground: item.color,
        background: item.backgroundColor,
        fontSize: item.fontSize
      });
    }
  });

  // Group by selector and sort by severity
  const grouped = {};
  contrastIssues.forEach(issue => {
    const key = `${issue.selector}|${issue.foreground}|${issue.background}`;
    if (!grouped[key]) {
      grouped[key] = issue;
    }
  });

  const uniqueIssues = Object.values(grouped).sort((a, b) => parseFloat(a.ratio) - parseFloat(b.ratio));

  console.log(`Found ${uniqueIssues.length} unique color contrast violations:\n`);

  uniqueIssues.forEach((issue, i) => {
    console.log(`${i + 1}. ${issue.selector}`);
    console.log(`   Text: "${issue.text}"`);
    console.log(`   Contrast: ${issue.ratio}:1 (needs ${issue.required}:1)`);
    console.log(`   Foreground: ${issue.foreground}`);
    console.log(`   Background: ${issue.background}`);
    console.log(`   Font Size: ${issue.fontSize}`);
    console.log('');
  });

  await browser.close();

  if (uniqueIssues.length === 0) {
    console.log('✅ No contrast violations found!');
  }
}

diagnoseContrast().catch(console.error);
