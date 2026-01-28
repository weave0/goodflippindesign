#!/usr/bin/env node
/**
 * update-cache-bust.js - Automated cache busting
 * Updates the cache bust comment in index.html and syncs to temp_review.html
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const TEMP_PATH = path.join(ROOT, 'temp_review.html');
const CACHE_BUST_PATH = path.join(ROOT, 'cache-bust.txt');

function getTimestamp() {
    const now = new Date();
    // Format: YYYY-MM-DD-HH:MM
    return now.toISOString().slice(0, 16).replace('T', '-');
}

function updateCacheBust() {
    const timestamp = getTimestamp();

    console.log('🕐 Updating cache bust timestamp:', timestamp);

    // Update cache-bust.txt
    const cacheText = `Cache updated ${new Date().toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    })}\n`;

    fs.writeFileSync(CACHE_BUST_PATH, cacheText);
    console.log('✅ Updated cache-bust.txt');

    // Update index.html
    let html = fs.readFileSync(INDEX_PATH, 'utf8');
    const pattern = /<!-- Cache bust: .* -->/;
    const replacement = `<!-- Cache bust: ${timestamp} -->`;

    if (!pattern.test(html)) {
        console.error('❌ Error: Cache bust comment not found in index.html');
        console.error('   Expected format: <!-- Cache bust: YYYY-MM-DD-HH:MM -->');
        process.exit(1);
    }

    html = html.replace(pattern, replacement);
    fs.writeFileSync(INDEX_PATH, html);
    console.log('✅ Updated index.html');

    // Sync to temp_review.html
    fs.copyFileSync(INDEX_PATH, TEMP_PATH);
    console.log('✅ Synced to temp_review.html');

    console.log('🎉 Cache bust update complete!');
}

if (require.main === module) {
    try {
        updateCacheBust();
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

module.exports = { updateCacheBust };
