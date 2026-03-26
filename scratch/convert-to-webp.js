/**
 * WebP Conversion & Optimization Script
 * Converts PNG screenshots to optimized WebP format
 * Requires: npm install sharp
 */

const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

const INPUT_DIR = path.join(__dirname, 'assets', 'portfolio');
const QUALITY = 85; // WebP quality (85 is good balance)
const TARGET_WIDTH = 800; // Match Unsplash parameter from original

const FILES_TO_CONVERT = [
    { input: 'aiaimate-hero.png', output: 'ai-aimate.webp' },
    { input: 'culturesherpa-hero.png', output: 'culturesherpa.webp' },
    { input: 'goodflippinvibes-hero.png', output: 'good-flippin-vibes.webp' },
    { input: 'globaldeets-hero.png', output: 'globaldeets.webp' },
    { input: 'citizenapproved-hero.png', output: 'citizenapproved.webp' }
];

async function convertToWebP(inputFile, outputFile) {
    const inputPath = path.join(INPUT_DIR, inputFile);
    const outputPath = path.join(INPUT_DIR, outputFile);

    console.log(`\n🔄 Converting: ${inputFile}`);

    try {
        // Get original file size
        const inputStats = await fs.stat(inputPath);
        const inputSizeKB = (inputStats.size / 1024).toFixed(2);

        // Convert to WebP with optimization
        await sharp(inputPath)
            .resize(TARGET_WIDTH, null, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .webp({ quality: QUALITY })
            .toFile(outputPath);

        // Get output file size
        const outputStats = await fs.stat(outputPath);
        const outputSizeKB = (outputStats.size / 1024).toFixed(2);
        const savings = ((1 - outputStats.size / inputStats.size) * 100).toFixed(1);

        console.log(`   ✓ Original: ${inputSizeKB} KB`);
        console.log(`   ✓ WebP: ${outputSizeKB} KB`);
        console.log(`   ✓ Savings: ${savings}%`);

        return {
            success: true,
            input: inputFile,
            output: outputFile,
            originalSize: inputStats.size,
            webpSize: outputStats.size,
            savings: parseFloat(savings)
        };

    } catch (error) {
        console.error(`   ✗ Error: ${error.message}`);
        return {
            success: false,
            input: inputFile,
            error: error.message
        };
    }
}

async function main() {
    console.log('🎨 WebP Conversion & Optimization Tool');
    console.log('======================================\n');
    console.log(`Quality: ${QUALITY}%`);
    console.log(`Target width: ${TARGET_WIDTH}px`);
    console.log(`Processing: ${FILES_TO_CONVERT.length} files\n`);

    // Check if sharp is installed
    try {
        require('sharp');
    } catch (e) {
        console.error('❌ Sharp not installed. Run: npm install sharp');
        process.exit(1);
    }

    // Convert all files
    const results = [];
    for (const file of FILES_TO_CONVERT) {
        const result = await convertToWebP(file.input, file.output);
        results.push(result);
    }

    // Summary
    console.log('\n📊 Conversion Summary');
    console.log('====================');

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`✓ Successful: ${successful.length}/${FILES_TO_CONVERT.length}`);

    if (successful.length > 0) {
        const totalOriginal = successful.reduce((sum, r) => sum + r.originalSize, 0);
        const totalWebP = successful.reduce((sum, r) => sum + r.webpSize, 0);
        const totalSavings = ((1 - totalWebP / totalOriginal) * 100).toFixed(1);
        const totalWebPMB = (totalWebP / 1024 / 1024).toFixed(2);

        console.log(`Total WebP size: ${totalWebPMB} MB`);
        console.log(`Overall savings: ${totalSavings}%`);
    }

    if (failed.length > 0) {
        console.log(`\n✗ Failed: ${failed.length}`);
        failed.forEach(f => {
            console.log(`   - ${f.input}: ${f.error}`);
        });
    }

    console.log('\n✨ Optimized files ready!');
    console.log('   Next: Update index.html image paths\n');
}

main().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
});
