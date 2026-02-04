/**
 * Portfolio Analysis Tool
 * Scans all projects and generates comprehensive reports
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORTFOLIO_ROOT = 'Z:\\GFD\\GFD Dev Projects';
const OUTPUT_FILE = 'Z:\\GFD\\PORTFOLIO_ANALYSIS.json';

// Project directories to analyze
const PROJECTS = [
    'AI',
    'CitizenApproved',
    'elliasssan',
    'fantasy-penpal',
    'GFV',
    'Globaldeets',
    'SaintPaul',
    'steveb',
    'SummitView',
    'ThyOwn',
    'ToneDef',
    'Weave'
];

// File extensions to analyze
const CODE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.scss', '.json', '.md', '.py', '.php'];
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'];
const IGNORE_DIRS = ['node_modules', '.git', '.next', 'dist', 'build', '_SECURE_KEYS'];

class PortfolioAnalyzer {
    constructor() {
        this.results = {
            timestamp: new Date().toISOString(),
            projects: {},
            globalStats: {
                totalProjects: 0,
                totalFiles: 0,
                totalSize: 0,
                totalCodeLines: 0,
                duplicateFiles: {},
                sharedDependencies: {},
                technologies: new Set(),
            }
        };
        this.fileHashes = {}; // For duplicate detection
    }

    async analyzeAll() {
        console.log('🚀 Starting Portfolio Analysis...\n');

        for (const project of PROJECTS) {
            const projectPath = path.join(PORTFOLIO_ROOT, project);
            if (fs.existsSync(projectPath)) {
                console.log(`📁 Analyzing: ${project}`);
                this.results.projects[project] = await this.analyzeProject(projectPath, project);
            } else {
                console.log(`⚠️  Not found: ${project}`);
            }
        }

        this.detectDuplicates();
        this.analyzeDependencies();
        this.calculateGlobalStats();

        this.saveResults();
        this.printSummary();
    }

    async analyzeProject(projectPath, projectName) {
        const stats = {
            name: projectName,
            path: projectPath,
            files: {
                total: 0,
                byType: {},
                byExtension: {},
            },
            size: {
                total: 0,
                byType: {},
            },
            codeMetrics: {
                totalLines: 0,
                jsLines: 0,
                htmlLines: 0,
                cssLines: 0,
            },
            technologies: new Set(),
            packageJson: null,
            hasGit: false,
            hasTests: false,
            deploymentConfigs: [],
            liveUrls: [],
            lastModified: null,
        };

        // Check for package.json
        const packageJsonPath = path.join(projectPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            try {
                stats.packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                if (stats.packageJson.dependencies) {
                    Object.keys(stats.packageJson.dependencies).forEach(dep => {
                        stats.technologies.add(dep);
                    });
                }
            } catch (e) {
                console.log(`  ⚠️  Error reading package.json: ${e.message}`);
            }
        }

        // Check for git
        stats.hasGit = fs.existsSync(path.join(projectPath, '.git'));

        // Scan directory
        this.scanDirectory(projectPath, stats);

        // Detect technologies from files
        this.detectTechnologies(stats);

        // Extract URLs from markdown files
        this.extractUrls(projectPath, stats);

        // Convert Sets to Arrays for JSON serialization
        stats.technologies = Array.from(stats.technologies);

        return stats;
    }

    scanDirectory(dirPath, stats, relativePath = '') {
        let entries;
        try {
            entries = fs.readdirSync(dirPath, { withFileTypes: true });
        } catch (e) {
            return; // Skip inaccessible directories
        }

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            const relPath = path.join(relativePath, entry.name);

            if (entry.isDirectory()) {
                // Skip ignored directories
                if (IGNORE_DIRS.includes(entry.name)) continue;

                // Check for test directories
                if (entry.name === 'test' || entry.name === 'tests' || entry.name === '__tests__') {
                    stats.hasTests = true;
                }

                // Check for deployment configs
                if (entry.name === '.github' || entry.name === '.netlify' || entry.name === '.vercel') {
                    stats.deploymentConfigs.push(entry.name);
                }

                this.scanDirectory(fullPath, stats, relPath);
            } else if (entry.isFile()) {
                this.analyzeFile(fullPath, relPath, stats);
            }
        }
    }

    analyzeFile(filePath, relativePath, stats) {
        stats.files.total++;

        const ext = path.extname(filePath).toLowerCase();
        stats.files.byExtension[ext] = (stats.files.byExtension[ext] || 0) + 1;

        let fileType = 'other';
        if (CODE_EXTENSIONS.includes(ext)) fileType = 'code';
        else if (IMAGE_EXTENSIONS.includes(ext)) fileType = 'image';

        stats.files.byType[fileType] = (stats.files.byType[fileType] || 0) + 1;

        try {
            const fileStat = fs.statSync(filePath);
            const fileSize = fileStat.size;

            stats.size.total += fileSize;
            stats.size.byType[fileType] = (stats.size.byType[fileType] || 0) + fileSize;

            // Track last modified
            if (!stats.lastModified || fileStat.mtime > new Date(stats.lastModified)) {
                stats.lastModified = fileStat.mtime.toISOString();
            }

            // Count lines for code files
            if (fileType === 'code') {
                const content = fs.readFileSync(filePath, 'utf-8');
                const lines = content.split('\n').length;
                stats.codeMetrics.totalLines += lines;

                if (ext === '.js' || ext === '.jsx' || ext === '.ts' || ext === '.tsx') {
                    stats.codeMetrics.jsLines += lines;
                } else if (ext === '.html') {
                    stats.codeMetrics.htmlLines += lines;
                } else if (ext === '.css' || ext === '.scss') {
                    stats.codeMetrics.cssLines += lines;
                }

                // Calculate hash for duplicate detection
                const hash = crypto.createHash('md5').update(content).digest('hex');
                if (!this.fileHashes[hash]) {
                    this.fileHashes[hash] = [];
                }
                this.fileHashes[hash].push({ project: stats.name, path: relativePath, size: fileSize });
            }
        } catch (e) {
            // Skip files we can't read
        }
    }

    detectTechnologies(stats) {
        // Detect from file extensions and content
        if (stats.files.byExtension['.tsx'] || stats.files.byExtension['.jsx']) {
            stats.technologies.add('React');
        }
        if (stats.files.byExtension['.ts']) {
            stats.technologies.add('TypeScript');
        }
        if (stats.files.byExtension['.py']) {
            stats.technologies.add('Python');
        }
        if (stats.files.byExtension['.php']) {
            stats.technologies.add('PHP');
        }
        if (stats.packageJson) {
            if (stats.packageJson.dependencies?.next) stats.technologies.add('Next.js');
            if (stats.packageJson.dependencies?.react) stats.technologies.add('React');
            if (stats.packageJson.dependencies?.vue) stats.technologies.add('Vue');
            if (stats.packageJson.dependencies?.express) stats.technologies.add('Express');
        }
    }

    extractUrls(projectPath, stats) {
        const mdFiles = this.findFiles(projectPath, '.md');
        const urlPattern = /https?:\/\/[^\s<>)"']+/g;

        for (const mdFile of mdFiles) {
            try {
                const content = fs.readFileSync(mdFile, 'utf-8');
                const matches = content.match(urlPattern);
                if (matches) {
                    matches.forEach(url => {
                        if (!stats.liveUrls.includes(url)) {
                            stats.liveUrls.push(url);
                        }
                    });
                }
            } catch (e) {
                // Skip
            }
        }
    }

    findFiles(dirPath, extension, files = []) {
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                if (entry.isDirectory() && !IGNORE_DIRS.includes(entry.name)) {
                    this.findFiles(fullPath, extension, files);
                } else if (entry.isFile() && path.extname(entry.name) === extension) {
                    files.push(fullPath);
                }
            }
        } catch (e) {
            // Skip
        }
        return files;
    }

    detectDuplicates() {
        for (const [hash, locations] of Object.entries(this.fileHashes)) {
            if (locations.length > 1) {
                this.results.globalStats.duplicateFiles[hash] = {
                    count: locations.length,
                    size: locations[0].size,
                    totalWaste: locations[0].size * (locations.length - 1),
                    locations: locations
                };
            }
        }
    }

    analyzeDependencies() {
        const depCounts = {};
        for (const project of Object.values(this.results.projects)) {
            if (project.packageJson?.dependencies) {
                Object.keys(project.packageJson.dependencies).forEach(dep => {
                    if (!depCounts[dep]) depCounts[dep] = [];
                    depCounts[dep].push(project.name);
                });
            }
        }

        // Only keep dependencies used by 2+ projects
        for (const [dep, projects] of Object.entries(depCounts)) {
            if (projects.length >= 2) {
                this.results.globalStats.sharedDependencies[dep] = projects;
            }
        }
    }

    calculateGlobalStats() {
        const stats = this.results.globalStats;
        stats.totalProjects = Object.keys(this.results.projects).length;

        for (const project of Object.values(this.results.projects)) {
            stats.totalFiles += project.files.total;
            stats.totalSize += project.size.total;
            stats.totalCodeLines += project.codeMetrics.totalLines;
            project.technologies.forEach(tech => stats.technologies.add(tech));
        }

        stats.technologies = Array.from(stats.technologies);

        // Calculate duplicate file waste
        stats.duplicateFileWaste = Object.values(stats.duplicateFiles)
            .reduce((sum, dup) => sum + dup.totalWaste, 0);
    }

    saveResults() {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(this.results, null, 2));
        console.log(`\n✅ Results saved to: ${OUTPUT_FILE}`);
    }

    printSummary() {
        const stats = this.results.globalStats;
        console.log('\n' + '='.repeat(60));
        console.log('📊 PORTFOLIO ANALYSIS SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total Projects: ${stats.totalProjects}`);
        console.log(`Total Files: ${stats.totalFiles.toLocaleString()}`);
        console.log(`Total Size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Total Code Lines: ${stats.totalCodeLines.toLocaleString()}`);
        console.log(`Duplicate Files: ${Object.keys(stats.duplicateFiles).length}`);
        console.log(`Duplicate Waste: ${(stats.duplicateFileWaste / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Shared Dependencies: ${Object.keys(stats.sharedDependencies).length}`);
        console.log(`Technologies: ${stats.technologies.join(', ')}`);
        console.log('='.repeat(60) + '\n');
    }
}

// Run analysis
const analyzer = new PortfolioAnalyzer();
analyzer.analyzeAll().catch(console.error);
