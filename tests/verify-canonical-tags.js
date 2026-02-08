#!/usr/bin/env node
/**
 * CANONICAL TAG VERIFICATION
 * Verifies canonical tags are properly implemented
 */

const fs = require('fs');
const path = require('path');

const filesToCheck = [
  { file: 'z:\\GFD\\donate.html', expectedCanonical: 'https://goodflippindesign.com/donate' },
  { file: 'z:\\GFD\\donate-v2.html', expectedCanonical: 'https://goodflippindesign.com/donate' },
  { file: 'z:\\GFD\\index.html', expectedCanonical: 'https://goodflippindesign.com/' },
  { file: 'z:\\GFD\\temp_review.html', expectedCanonical: 'https://goodflippindesign.com/' }
];

console.log('🔍 CANONICAL TAG VERIFICATION\n');
console.log('=' .repeat(60));

let allPassed = true;

filesToCheck.forEach(({ file, expectedCanonical }) => {
  const fileName = path.basename(file);

  try {
    if (!fs.existsSync(file)) {
      console.log(`⚠️  ${fileName}: File not found`);
      return;
    }

    const content = fs.readFileSync(file, 'utf8');
    const canonicalMatch = content.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);

    if (!canonicalMatch) {
      console.log(`❌ ${fileName}: No canonical tag found`);
      allPassed = false;
      return;
    }

    const actualCanonical = canonicalMatch[1];

    if (actualCanonical === expectedCanonical) {
      console.log(`✅ ${fileName}: Canonical correct`);
      console.log(`   → ${actualCanonical}`);
    } else {
      console.log(`⚠️  ${fileName}: Canonical mismatch`);
      console.log(`   Expected: ${expectedCanonical}`);
      console.log(`   Actual:   ${actualCanonical}`);
      allPassed = false;
    }

  } catch (error) {
    console.log(`❌ ${fileName}: Error reading file - ${error.message}`);
    allPassed = false;
  }
});

console.log('=' .repeat(60));

if (allPassed) {
  console.log('\n🎉 ALL CANONICAL TAGS VERIFIED ✅');
  console.log('\nNext Steps:');
  console.log('1. Deploy to production (git commit + push)');
  console.log('2. Wait 24-48 hours for Google to re-crawl');
  console.log('3. Check Search Console for updated status');
  console.log('4. Verify with: https://search.google.com/search-console');
} else {
  console.log('\n⚠️  ISSUES FOUND - Please review above');
  process.exit(1);
}
