#!/usr/bin/env node
/**
 * sync-review.js - Cross-platform sync script
 * Syncs index.html to temp_review.html
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const TEMP_PATH = path.join(ROOT, 'temp_review.html');

function syncFiles() {
    console.log('📋 Syncing index.html → temp_review.html...');

    if (!fs.existsSync(INDEX_PATH)) {
        console.error('❌ Error: index.html not found!');
        process.exit(1);
    }

    try {
        // Read index.html
        const content = fs.readFileSync(INDEX_PATH, 'utf8');
        const lines = content.split('\n').length;

        // Write to temp_review.html
        fs.writeFileSync(TEMP_PATH, content, 'utf8');

        console.log('✅ Sync complete!');
        console.log(`📊 Synced ${lines} lines`);

        // Verify
        const tempContent = fs.readFileSync(TEMP_PATH, 'utf8');
        if (content === tempContent) {
            console.log('✅ Verification passed: Files are identical');
        } else {
            console.warn('⚠️  WARNING: Files differ after sync!');
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Error during sync:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    syncFiles();
}

module.exports = { syncFiles };
