const sharp = require('sharp');
const fs = require('fs');

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0d0d0d"/>
  <g fill="#f5f5f5" transform="translate(56, 56) scale(0.78)">
    <path transform="matrix(0.77,0,0,0.77,-240,83)" d="M896.648,101.831L1398.17,101.831L1304.42,289.331L1154.42,289.331L1185.67,226.831L984.148,226.831L859.148,476.831L859.331,476.831L960,678.169L990,618.169L1065,768.169L960,978.169L709.24,476.648L896.648,101.831Z"/>
    <path transform="matrix(0.77,0,0,0.77,-240,83)" d="M521.831,101.831L836.648,101.831L679.24,416.648L521.831,101.831Z"/>
    <path transform="matrix(0.77,0,0,0.77,-240,83)" d="M1273.17,351.831L1095,708.169L1020,558.169L1060.67,476.831L919.331,476.831L919.24,476.648L981.648,351.831L1273.17,351.831Z"/>
  </g>
</svg>`;

const sizes = [
    { size: 16, name: 'favicon-16x16.png' },
    { size: 32, name: 'favicon-32x32.png' },
    { size: 180, name: 'apple-touch-icon.png' },
    { size: 192, name: 'android-chrome-192x192.png' },
    { size: 512, name: 'android-chrome-512x512.png' }
];

async function generateFavicons() {
    const svgBuffer = Buffer.from(svgContent);
    
    for (const { size, name } of sizes) {
        await sharp(svgBuffer, { density: 300 })
            .resize(size, size)
            .png()
            .toFile(name);
        console.log(`Created ${name}`);
    }
    
    // Also create the main favicon.ico from 32x32
    await sharp(svgBuffer, { density: 300 })
        .resize(32, 32)
        .png()
        .toFile('favicon.png');
    
    console.log('All favicons generated!');
}

generateFavicons().catch(console.error);
