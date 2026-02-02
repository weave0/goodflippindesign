#!/usr/bin/env node
/**
 * GFD Ecosystem Audit & SEO Cross-Linking Tool
 * Discovers all projects, identifies live sites, and builds cross-reference strategy
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKSPACE = 'Z:\\GFD';
const PROJECTS_DIR = path.join(WORKSPACE, 'GFD Dev Projects');

// Known live sites from documentation
const KNOWN_LIVE = {
    'goodflippindesign.com': {
        type: 'primary',
        tech: 'Vanilla HTML/CSS/JS',
        purpose: 'Web development consultancy portfolio',
        keywords: ['web development', 'AI integration', 'business intelligence', 'React', 'Next.js']
    },
    'aiaimate.com': {
        type: 'product',
        tech: 'Next.js 14, RAG, Vector DB',
        purpose: 'AI education platform',
        keywords: ['AI education', 'RAG', 'semantic search', 'learning platform', 'AI tools']
    },
    'culturesherpa.org': {
        type: 'product',
        tech: 'React 18, MapboxGL, PWA',
        purpose: 'Interactive cultural atlas',
        keywords: ['cultural data', 'world cultures', 'geographic visualization', 'anthropology', 'travel']
    },
    'goodflippinvibes.com': {
        type: 'origin',
        tech: 'Python Flask (assumed)',
        purpose: 'Wellness platform - origin story',
        keywords: ['wellness', 'holistic health', 'community', 'lifestyle']
    },
    'globaldeets.com': {
        type: 'portfolio',
        tech: 'Vanilla JS, PWA',
        purpose: 'Project portfolio hub',
        keywords: ['portfolio', 'web development', 'projects', 'case studies']
    }
};

// Scan for additional sites
function discoverProjects() {
    console.log('🔍 DISCOVERING PROJECTS...\n');

    const projects = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => {
            const projectPath = path.join(PROJECTS_DIR, d.name);
            const data = {
                name: d.name,
                path: projectPath,
                hasIndex: fs.existsSync(path.join(projectPath, 'index.html')),
                hasPackage: fs.existsSync(path.join(projectPath, 'package.json')),
                hasWrangler: fs.existsSync(path.join(projectPath, 'wrangler.toml')),
                hasCNAME: fs.existsSync(path.join(projectPath, 'CNAME')),
                url: null,
                tech: [],
                status: 'unknown'
            };

            // Try to find URL
            if (data.hasCNAME) {
                const cname = fs.readFileSync(path.join(projectPath, 'CNAME'), 'utf8').trim();
                data.url = `https://${cname}`;
            }

            if (data.hasPackage) {
                try {
                    const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf8'));
                    if (pkg.homepage) data.url = pkg.homepage;

                    // Detect tech stack
                    if (pkg.dependencies) {
                        if (pkg.dependencies.next) data.tech.push('Next.js');
                        if (pkg.dependencies.react) data.tech.push('React');
                        if (pkg.dependencies['@mapbox/mapbox-gl']) data.tech.push('MapboxGL');
                    }
                } catch (e) {}
            }

            if (data.hasWrangler) {
                try {
                    const wrangler = fs.readFileSync(path.join(projectPath, 'wrangler.toml'), 'utf8');
                    const match = wrangler.match(/name\s*=\s*"([^"]+)"/);
                    if (match && !data.url) {
                        data.url = `https://${match[1]}.pages.dev`;
                    }
                } catch (e) {}
            }

            data.status = data.url ? 'LIVE' : 'DEV';

            return data;
        });

    return projects;
}

// Generate SEO cross-linking strategy
function generateCrossLinkStrategy(sites) {
    console.log('\n📊 SEO CROSS-LINKING STRATEGY\n');
    console.log('=' .repeat(80) + '\n');

    const strategy = {
        primary: 'goodflippindesign.com',
        sites: {},
        recommendations: []
    };

    // For each site, determine optimal cross-links
    Object.entries(sites).forEach(([domain, data]) => {
        strategy.sites[domain] = {
            ...data,
            linksTo: [],
            linkedFrom: [],
            seoValue: calculateSEOValue(domain, data, sites)
        };
    });

    // Build bi-directional link graph
    // Primary site should link to all products
    strategy.sites['goodflippindesign.com'].linksTo = [
        'aiaimate.com',
        'culturesherpa.org',
        'goodflippinvibes.com',
        'globaldeets.com'
    ];

    // All products should link back to primary
    ['aiaimate.com', 'culturesherpa.org', 'goodflippinvibes.com', 'globaldeets.com'].forEach(site => {
        if (strategy.sites[site]) {
            strategy.sites[site].linksTo.push('goodflippindesign.com');
        }
    });

    // Cross-link related products
    strategy.sites['aiaimate.com'].linksTo.push('culturesherpa.org'); // Both data-driven
    strategy.sites['culturesherpa.org'].linksTo.push('aiaimate.com');
    strategy.sites['goodflippinvibes.com'].linksTo.push('goodflippindesign.com'); // Origin story

    // Generate recommendations
    strategy.recommendations = [
        {
            priority: 'HIGH',
            action: 'Add footer ecosystem links to goodflippindesign.com',
            sites: ['aiaimate.com', 'culturesherpa.org', 'goodflippinvibes.com'],
            impact: 'Establishes site authority and internal link equity'
        },
        {
            priority: 'HIGH',
            action: 'Add "Built by Good Flippin Design" footer to all products',
            sites: ['aiaimate.com', 'culturesherpa.org'],
            impact: 'Backlinks to primary, establishes credibility'
        },
        {
            priority: 'MEDIUM',
            action: 'Create /portfolio page on primary site with detailed case studies',
            sites: ['goodflippindesign.com'],
            impact: 'Deep linking to live projects with context'
        },
        {
            priority: 'MEDIUM',
            action: 'Add structured data (JSON-LD) to all sites',
            sites: 'ALL',
            impact: 'Google rich snippets, knowledge graph eligibility'
        },
        {
            priority: 'LOW',
            action: 'Cross-reference blog posts if content exists',
            sites: 'ALL',
            impact: 'Contextual backlinks, establishes expertise'
        }
    ];

    return strategy;
}

function calculateSEOValue(domain, data, allSites) {
    let score = 0;

    // Domain age/type
    if (data.type === 'primary') score += 50;
    if (data.type === 'product') score += 40;
    if (data.type === 'portfolio') score += 30;

    // Tech sophistication
    if (data.tech.includes('AI')) score += 15;
    if (data.tech.includes('React') || data.tech.includes('Next.js')) score += 10;

    // Keywords value
    if (data.keywords) {
        if (data.keywords.includes('AI')) score += 10;
        if (data.keywords.includes('web development')) score += 10;
    }

    return score;
}

// Generate HTML snippets for implementation
function generateHTMLSnippets(strategy) {
    console.log('\n🔧 IMPLEMENTATION CODE\n');
    console.log('=' .repeat(80) + '\n');

    // Footer ecosystem section for goodflippindesign.com
    console.log('<!-- Add to goodflippindesign.com footer (already partially exists) -->');
    console.log('<div class="footer-ecosystem">');
    console.log('    <span class="footer-ecosystem-label">Our Ecosystem:</span>');
    console.log('    <a href="https://aiaimate.com" target="_blank" rel="noopener">AI Aimate</a>');
    console.log('    <a href="https://culturesherpa.org" target="_blank" rel="noopener">CultureSherpa</a>');
    console.log('    <a href="https://goodflippinvibes.com" target="_blank" rel="noopener">Good Flippin Vibes</a>');
    console.log('    <a href="https://globaldeets.com" target="_blank" rel="noopener">Portfolio Hub</a>');
    console.log('</div>\n');

    // Product site backlink footer
    console.log('<!-- Add to aiaimate.com, culturesherpa.org footers -->');
    console.log('<footer class="site-footer">');
    console.log('    <p>Built by <a href="https://goodflippindesign.com" target="_blank" rel="noopener">Good Flippin Design</a></p>');
    console.log('    <p>Explore more: <a href="https://culturesherpa.org">CultureSherpa</a> | <a href="https://goodflippinvibes.com">Good Flippin Vibes</a></p>');
    console.log('</footer>\n');

    // JSON-LD structured data
    console.log('<!-- JSON-LD for goodflippindesign.com (add to <head>) -->');
    console.log('<script type="application/ld+json">');
    console.log(JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Good Flippin Design",
        "url": "https://goodflippindesign.com",
        "logo": "https://goodflippindesign.com/assets/logo-master.png",
        "sameAs": [
            "https://aiaimate.com",
            "https://culturesherpa.org",
            "https://goodflippinvibes.com",
            "https://globaldeets.com"
        ],
        "owns": [
            {
                "@type": "WebApplication",
                "name": "AI Aimate",
                "url": "https://aiaimate.com",
                "applicationCategory": "EducationalApplication"
            },
            {
                "@type": "WebSite",
                "name": "CultureSherpa",
                "url": "https://culturesherpa.org",
                "applicationCategory": "ReferenceApplication"
            }
        ]
    }, null, 2));
    console.log('</script>\n');
}

// Main execution
function main() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  GFD ECOSYSTEM AUDIT & SEO CROSS-LINKING TOOL              ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Discover projects
    const projects = discoverProjects();

    console.log('\n📁 DISCOVERED PROJECTS:\n');
    projects.forEach(p => {
        const status = p.status === 'LIVE' ? '✅' : '🔧';
        console.log(`${status} ${p.name.padEnd(20)} ${p.url || 'No URL detected'}`);
        if (p.tech.length > 0) {
            console.log(`   Tech: ${p.tech.join(', ')}`);
        }
    });

    // Generate strategy
    const strategy = generateCrossLinkStrategy(KNOWN_LIVE);

    // Display recommendations
    console.log('\n🎯 PRIORITY ACTIONS:\n');
    strategy.recommendations.forEach((rec, i) => {
        const priority = rec.priority === 'HIGH' ? '🔴' : rec.priority === 'MEDIUM' ? '🟡' : '🟢';
        console.log(`${priority} [${rec.priority}] ${rec.action}`);
        console.log(`   Impact: ${rec.impact}\n`);
    });

    // Generate implementation code
    generateHTMLSnippets(strategy);

    // Export to JSON
    const outputPath = path.join(WORKSPACE, 'ecosystem-strategy.json');
    fs.writeFileSync(outputPath, JSON.stringify(strategy, null, 2));
    console.log(`\n💾 Full strategy exported to: ${outputPath}`);

    console.log('\n✅ AUDIT COMPLETE\n');
}

if (require.main === module) {
    main();
}

module.exports = { discoverProjects, generateCrossLinkStrategy };
