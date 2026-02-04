#!/usr/bin/env node
/**
 * build.js - Production build script
 * Prepares the site for deployment:
 * 1. Updates cache bust timestamp
 * 2. Syncs index.html to temp_review.html
 * 3. Validates critical files exist
 * 4. Minifies assets (optional - currently skipped to preserve single-file architecture)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

// ANSI colors
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function runCommand(command, description) {
    log(`\n▶ ${description}...`, 'blue');
    try {
        execSync(command, { cwd: ROOT, stdio: 'inherit' });
        log(`✅ ${description} - Done!`, 'green');
        return true;
    } catch (error) {
        log(`❌ ${description} - Failed!`, 'red');
        return false;
    }
}

function validateFile(filePath, description) {
    const fullPath = path.join(ROOT, filePath);
    if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        log(`✅ ${description}: ${(stats.size / 1024).toFixed(2)} KB`, 'green');
        return true;
    } else {
        log(`❌ Missing: ${description} (${filePath})`, 'red');
        return false;
    }
}

async function build() {
    log('\n' + '='.repeat(60), 'cyan');
    log('🏗️  GOOD FLIPPIN DESIGN - BUILD SCRIPT', 'cyan');
    log('='.repeat(60) + '\n', 'cyan');

    let allPassed = true;

    // Step 1: Update cache bust
    if (!runCommand('node scripts/update-cache-bust.js', 'Update cache bust timestamp')) {
        allPassed = false;
    }

    // Step 2: Sync files
    if (!runCommand('node scripts/sync-review.js', 'Sync index.html to temp_review.html')) {
        allPassed = false;
    }

    // Step 3: Validate critical files
    log('\n📋 Validating critical files...', 'blue');
    const criticalFiles = [
        ['index.html', 'Main site'],
        ['temp_review.html', 'Test target'],
        ['_headers', 'Security headers'],
        ['wrangler.toml', 'Cloudflare config'],
        ['assets/logo-vector.png', 'Logo'],
        ['assets/icons/GFD-Icon-NDA-20260131_191422.png', 'NDA icon']
    ];

    for (const [file, desc] of criticalFiles) {
        if (!validateFile(file, desc)) {
            allPassed = false;
        }
    }

    // Step 4: Verify files are in sync
    log('\n🔍 Verifying file sync...', 'blue');
    const indexContent = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const tempContent = fs.readFileSync(path.join(ROOT, 'temp_review.html'), 'utf8');

    if (indexContent === tempContent) {
        log('✅ Files are in sync', 'green');
    } else {
        log('❌ Files are NOT in sync!', 'red');
        allPassed = false;
    }

    // Step 5: Check for cache bust
    log('\n🕐 Checking cache bust...', 'blue');
    const cacheBustMatch = indexContent.match(/<!-- Cache bust: (.+?) -->/);
    if (cacheBustMatch) {
        log(`✅ Cache bust timestamp: ${cacheBustMatch[1]}`, 'green');
    } else {
        log('❌ Cache bust comment not found!', 'red');
        allPassed = false;
    }

    // Summary
    log('\n' + '='.repeat(60), 'cyan');
    if (allPassed) {
        log('✨ BUILD SUCCESSFUL - Ready for deployment! ✨', 'green');
    } else {
        log('⚠️  BUILD COMPLETED WITH WARNINGS - Review issues above', 'yellow');
    }
    log('='.repeat(60) + '\n', 'cyan');

    process.exit(allPassed ? 0 : 1);
}

if (require.main === module) {
    build().catch(error => {
        log(`\n❌ Build failed: ${error.message}`, 'red');
        process.exit(1);
    });
}

module.exports = { build };
