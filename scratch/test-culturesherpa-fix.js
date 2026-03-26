/**
 * CultureSherpa Path Verification Test
 * Run after CloudFront cache invalidation completes (~10 minutes after 23:43 = 23:53)
 *
 * USAGE: node test-culturesherpa-fix.js
 */

const SITE_URL = 'https://culturesherpa.org';

// Critical resources that were failing with /explore/ prefix
const CRITICAL_RESOURCES = [
  '/',                                      // Homepage
  '/_astro/accessibility.BB1yrr7f.css',     // CSS (was /explore/_astro/...)
  '/data/cultures_index.json',              // Data (was /explore/data/...)
  '/shared/ecosystem-nav.js',               // Shared JS (was /explore/shared/...)
  '/shared/ecosystem-nav.css',              // Shared CSS (was /explore/shared/...)
  '/cultural_images/afghan_card.webp',      // Images (was /explore/cultural_images/...)
  '/map',                                   // Map page (was /explore/map)
  '/search',                                // Search page (was /explore/search)
];

// Resources that should NOT exist (old /explore/ paths)
const SHOULD_NOT_EXIST = [
  '/explore/_astro/accessibility.BB1yrr7f.css',
  '/explore/data/cultures_index.json',
  '/explore/shared/ecosystem-nav.js',
];

async function testResource(path, shouldExist = true) {
  const url = `${SITE_URL}${path}`;
  try {
    const response = await fetch(url, { method: 'HEAD' });
    const status = response.status;
    const contentType = response.headers.get('content-type') || 'unknown';

    if (shouldExist) {
      if (status === 200) {
        console.log(`✅ ${path} - ${status} (${contentType.split(';')[0]})`);
        return true;
      } else {
        console.error(`❌ ${path} - ${status} (EXPECTED 200)`);
        return false;
      }
    } else {
      // Should NOT exist
      if (status === 404) {
        console.log(`✅ ${path} - 404 (correctly removed)`);
        return true;
      } else {
        console.error(`❌ ${path} - ${status} (SHOULD BE 404)`);
        return false;
      }
    }
  } catch (error) {
    if (shouldExist) {
      console.error(`❌ ${path} - FETCH ERROR: ${error.message}`);
      return false;
    } else {
      console.log(`✅ ${path} - Error (correctly removed)`);
      return true;
    }
  }
}

async function runTests() {
  console.log('🧪 Testing CultureSherpa Path Fix...\n');
  console.log('Deployment time: 23:43');
  console.log('Current time: ' + new Date().toLocaleTimeString());
  console.log('Expected cache clear: 23:53 (10 minutes)');
  console.log('\n' + '='.repeat(70));

  console.log('\n📋 Testing NEW root-relative paths (should all return 200):');
  const newPathResults = await Promise.all(
    CRITICAL_RESOURCES.map(path => testResource(path, true))
  );

  console.log('\n📋 Testing OLD /explore/ paths (should all return 404):');
  const oldPathResults = await Promise.all(
    SHOULD_NOT_EXIST.map(path => testResource(path, false))
  );

  const allResults = [...newPathResults, ...oldPathResults];
  const passed = allResults.filter(r => r).length;
  const failed = allResults.filter(r => !r).length;

  console.log('\n' + '='.repeat(70));
  console.log(`✅ Passed: ${passed}/${allResults.length}`);
  console.log(`❌ Failed: ${failed}/${allResults.length}`);
  console.log('='.repeat(70));

  if (failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED - CultureSherpa is operational!');
    console.log('✅ Base path fix successful');
    console.log('✅ All /explore/ paths removed');
    console.log('✅ Root-relative paths working');
  } else if (failed === allResults.length) {
    console.log('\n⏳ ALL TESTS FAILED - CloudFront cache not propagated yet');
    console.log('⚠️  Wait 5-10 more minutes and re-run this test');
    console.log('📍 Or try hard refresh (Ctrl+Shift+R) in your browser');
  } else {
    console.log('\n⚠️  PARTIAL SUCCESS - Some paths still cached');
    console.log('⏳ Wait a few more minutes for full cache propagation');
  }

  console.log('\n💡 TIP: For immediate testing, use incognito mode or hard refresh');
  console.log('   Chrome/Edge: Ctrl+Shift+R');
  console.log('   Firefox: Ctrl+F5');
  console.log('   Safari: Cmd+Option+R');
}

// Run tests
runTests().catch(console.error);
