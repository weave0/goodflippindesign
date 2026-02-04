const fs = require('fs');

const data = JSON.parse(fs.readFileSync('Z:\\GFD\\PORTFOLIO_ANALYSIS.json', 'utf-8'));

console.log('\n📊 PROJECT BREAKDOWN\n' + '='.repeat(80));

Object.entries(data.projects).forEach(([name, proj]) => {
    console.log(`\n🔹 ${name.toUpperCase()}`);
    console.log(`   Files: ${proj.files.total.toLocaleString()}`);
    console.log(`   Size: ${(proj.size.total/1024/1024).toFixed(2)} MB`);
    console.log(`   Code Lines: ${proj.codeMetrics.totalLines.toLocaleString()}`);
    console.log(`   Technologies: ${proj.technologies.slice(0,5).join(', ')}${proj.technologies.length > 5 ? '...' : ''}`);
    console.log(`   Live URLs: ${proj.liveUrls.length} found`);
    if (proj.liveUrls.length > 0) {
        console.log(`   Primary: ${proj.liveUrls[0]}`);
    }
    console.log(`   Has Tests: ${proj.hasTests ? '✅' : '❌'}`);
    console.log(`   Last Modified: ${proj.lastModified?.slice(0,10) || 'Unknown'}`);
});

console.log('\n' + '='.repeat(80));
console.log('\n🎯 TOP INSIGHTS:');
console.log(`   • Largest Project: ${Object.entries(data.projects).sort((a,b) => b[1].size.total - a[1].size.total)[0][0]} (${(Object.values(data.projects).sort((a,b) => b.size.total - a.size.total)[0].size.total/1024/1024).toFixed(2)} MB)`);
console.log(`   • Most Files: ${Object.entries(data.projects).sort((a,b) => b[1].files.total - a[1].files.total)[0][0]} (${Object.values(data.projects).sort((a,b) => b.files.total - a.files.total)[0].files.total.toLocaleString()} files)`);
console.log(`   • Most Code: ${Object.entries(data.projects).sort((a,b) => b[1].codeMetrics.totalLines - a[1].codeMetrics.totalLines)[0][0]} (${Object.values(data.projects).sort((a,b) => b.codeMetrics.totalLines - a.codeMetrics.totalLines)[0].codeMetrics.totalLines.toLocaleString()} lines)`);
console.log(`   • Duplicate Waste: ${(data.globalStats.duplicateFileWaste/1024/1024).toFixed(2)} MB can be recovered`);
console.log(`   • Shared Dependencies: ${Object.keys(data.globalStats.sharedDependencies).join(', ')}`);
console.log('\n');
