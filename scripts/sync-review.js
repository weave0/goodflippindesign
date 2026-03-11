#!/usr/bin/env node
/**
 * sync-review.js - Cross-platform sync script
 * Syncs source HTML files to their test-target mirrors:
 *   index.html        → temp_review.html
 *   donate.html       → temp_donate_review.html
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const SYNC_PAIRS = [
    { src: 'index.html',  dest: 'temp_review.html' },
    { src: 'donate.html', dest: 'temp_donate_review.html' },
];

function syncPair(src, dest) {
    const srcPath  = path.join(ROOT, src);
    const destPath = path.join(ROOT, dest);

    console.log(`📋 Syncing ${src} → ${dest}...`);

    if (!fs.existsSync(srcPath)) {
        console.error(`❌ Error: ${src} not found!`);
        process.exit(1);
    }

    try {
        const content = fs.readFileSync(srcPath, 'utf8');
        const lines   = content.split('\n').length;

        fs.writeFileSync(destPath, content, 'utf8');

        const verify = fs.readFileSync(destPath, 'utf8');
        if (content === verify) {
            console.log(`✅ ${dest} synced (${lines} lines)`);
        } else {
            console.warn(`⚠️  WARNING: ${dest} differs after sync!`);
            process.exit(1);
        }
    } catch (error) {
        console.error(`❌ Error syncing ${src}:`, error.message);
        process.exit(1);
    }
}

function syncFiles() {
    SYNC_PAIRS.forEach(({ src, dest }) => syncPair(src, dest));
    console.log('✅ All syncs complete!');
}

if (require.main === module) {
    syncFiles();
}

module.exports = { syncFiles };
