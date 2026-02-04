#!/usr/bin/env node
/**
 * GFD Workspace CLI - Quick access to all portfolio projects
 * Usage: node gfd-cli.js [command] [project]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKSPACE_ROOT = path.resolve(__dirname);
const PROJECTS_DIR = path.join(WORKSPACE_ROOT, 'GFD Dev Projects');

// Project registry with metadata
const PROJECTS = {
    'ai': {
        name: 'AI Aimate',
        path: 'AI/portal',
        url: 'https://aiaimate.com',
        tech: ['Next.js', 'TypeScript', 'React'],
        scripts: {
            dev: 'npm run dev',
            build: 'npm run build',
            deploy: 'vercel --prod'
        },
        description: 'AI education platform with interactive visualizations'
    },
    'culture': {
        name: 'CultureSherpa',
        path: 'CultureSherpa',
        url: 'https://culturesherpa.org',
        tech: ['React', 'MapboxGL', 'PWA'],
        scripts: {
            dev: 'npm start',
            build: 'npm run build'
        },
        description: 'Interactive atlas of 470+ world cultures'
    },
    'gfv': {
        name: 'Good Flippin Vibes',
        path: 'GFV',
        url: 'https://goodflippinvibes.com',
        tech: ['Python', 'Flask'],
        scripts: {
            dev: 'python app.py'
        },
        description: 'Holistic wellness platform (origin story)'
    },
    'globaldeets': {
        name: 'GlobalDeets',
        path: 'Globaldeets',
        url: 'https://globaldeets.com',
        tech: ['React', 'PWA'],
        scripts: {
            dev: 'npm start',
            build: 'npm run build'
        },
        description: 'Portfolio hub with PWA capabilities'
    },
    'thyown': {
        name: 'ThyOwn',
        path: 'ThyOwn',
        tech: ['Python', 'PyTorch', 'CUDA'],
        description: 'Self-sufficient AI framework (15.3GB - local models)'
    },
    'summitview': {
        name: 'SummitView',
        path: 'SummitView',
        tech: ['Python', 'AI/ML'],
        description: 'Ethical documentary AI (14.9GB - content production)'
    },
    'weave': {
        name: 'Weave',
        path: 'Weave',
        description: 'Knowledge archive (8.6GB - 2020-2025 journey)'
    }
};

// CLI Commands
const COMMANDS = {
    list: listProjects,
    info: showProjectInfo,
    open: openProject,
    dev: runDevServer,
    code: openInVSCode,
    deploy: deployProject,
    help: showHelp
};

// Color codes for terminal output
const colors = {
    cyan: '\x1b[36m',
    purple: '\x1b[35m',
    pink: '\x1b[95m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

function colorize(text, color) {
    return `${colors[color]}${text}${colors.reset}`;
}

function listProjects() {
    console.log(colorize('\n🚀 GFD Portfolio Projects\n', 'cyan'));

    Object.entries(PROJECTS).forEach(([key, project]) => {
        const status = project.url ? colorize('●', 'green') + ' LIVE' : colorize('○', 'yellow') + ' LOCAL';
        console.log(`${colorize(key.padEnd(12), 'bold')} ${status.padEnd(20)} ${project.name}`);
        console.log(`${''.padEnd(12)} ${colorize(project.description, 'purple')}`);
        if (project.url) {
            console.log(`${''.padEnd(12)} ${colorize(project.url, 'cyan')}`);
        }
        console.log('');
    });

    console.log(colorize('Usage:', 'bold'));
    console.log('  gfd info [project]     Show detailed project info');
    console.log('  gfd open [project]     Open project folder');
    console.log('  gfd code [project]     Open in VS Code');
    console.log('  gfd dev [project]      Start dev server');
    console.log('  gfd deploy [project]   Deploy to production\n');
}

function showProjectInfo(projectKey) {
    const project = PROJECTS[projectKey];
    if (!project) {
        console.error(colorize(`❌ Project "${projectKey}" not found`, 'yellow'));
        console.log(colorize('Available projects:', 'bold'), Object.keys(PROJECTS).join(', '));
        return;
    }

    console.log(colorize(`\n📁 ${project.name}\n`, 'cyan'));
    console.log(colorize('Description:', 'bold'), project.description);
    console.log(colorize('Path:', 'bold'), path.join(PROJECTS_DIR, project.path));

    if (project.url) {
        console.log(colorize('Live URL:', 'bold'), colorize(project.url, 'green'));
    }

    if (project.tech && project.tech.length > 0) {
        console.log(colorize('Tech Stack:', 'bold'), project.tech.join(', '));
    }

    if (project.scripts) {
        console.log(colorize('\nAvailable Scripts:', 'bold'));
        Object.entries(project.scripts).forEach(([name, cmd]) => {
            console.log(`  ${colorize(name, 'purple')}: ${cmd}`);
        });
    }

    console.log('');
}

function openProject(projectKey) {
    const project = PROJECTS[projectKey];
    if (!project) {
        console.error(colorize(`❌ Project "${projectKey}" not found`, 'yellow'));
        return;
    }

    const projectPath = path.join(PROJECTS_DIR, project.path);

    if (!fs.existsSync(projectPath)) {
        console.error(colorize(`❌ Path not found: ${projectPath}`, 'yellow'));
        return;
    }

    console.log(colorize(`📂 Opening ${project.name}...`, 'cyan'));

    try {
        if (process.platform === 'win32') {
            execSync(`explorer "${projectPath}"`);
        } else if (process.platform === 'darwin') {
            execSync(`open "${projectPath}"`);
        } else {
            execSync(`xdg-open "${projectPath}"`);
        }
    } catch (error) {
        console.error(colorize(`❌ Failed to open: ${error.message}`, 'yellow'));
    }
}

function openInVSCode(projectKey) {
    const project = PROJECTS[projectKey];
    if (!project) {
        console.error(colorize(`❌ Project "${projectKey}" not found`, 'yellow'));
        return;
    }

    const projectPath = path.join(PROJECTS_DIR, project.path);

    console.log(colorize(`💻 Opening ${project.name} in VS Code...`, 'cyan'));

    try {
        execSync(`code "${projectPath}"`, { stdio: 'inherit' });
    } catch (error) {
        console.error(colorize(`❌ Failed to open VS Code: ${error.message}`, 'yellow'));
        console.log(colorize('Tip: Make sure VS Code is in your PATH', 'purple'));
    }
}

function runDevServer(projectKey) {
    const project = PROJECTS[projectKey];
    if (!project) {
        console.error(colorize(`❌ Project "${projectKey}" not found`, 'yellow'));
        return;
    }

    if (!project.scripts || !project.scripts.dev) {
        console.error(colorize(`❌ No dev script configured for ${project.name}`, 'yellow'));
        return;
    }

    const projectPath = path.join(PROJECTS_DIR, project.path);

    console.log(colorize(`🚀 Starting dev server for ${project.name}...`, 'green'));
    console.log(colorize(`Running: ${project.scripts.dev}`, 'purple'));

    try {
        execSync(project.scripts.dev, { cwd: projectPath, stdio: 'inherit' });
    } catch (error) {
        console.error(colorize(`❌ Dev server failed: ${error.message}`, 'yellow'));
    }
}

function deployProject(projectKey) {
    const project = PROJECTS[projectKey];
    if (!project) {
        console.error(colorize(`❌ Project "${projectKey}" not found`, 'yellow'));
        return;
    }

    if (!project.scripts || !project.scripts.deploy) {
        console.error(colorize(`❌ No deploy script configured for ${project.name}`, 'yellow'));
        return;
    }

    const projectPath = path.join(PROJECTS_DIR, project.path);

    console.log(colorize(`🚀 Deploying ${project.name} to production...`, 'green'));
    console.log(colorize(`Running: ${project.scripts.deploy}`, 'purple'));

    try {
        execSync(project.scripts.deploy, { cwd: projectPath, stdio: 'inherit' });
        console.log(colorize(`✅ Deployment complete!`, 'green'));
        if (project.url) {
            console.log(colorize(`🌐 Live at: ${project.url}`, 'cyan'));
        }
    } catch (error) {
        console.error(colorize(`❌ Deployment failed: ${error.message}`, 'yellow'));
    }
}

function showHelp() {
    console.log(colorize('\n🎯 GFD Workspace CLI\n', 'cyan'));
    console.log('Manage your portfolio projects from the command line.\n');

    console.log(colorize('Commands:', 'bold'));
    console.log('  list                   List all projects');
    console.log('  info <project>         Show detailed project info');
    console.log('  open <project>         Open project folder in file explorer');
    console.log('  code <project>         Open project in VS Code');
    console.log('  dev <project>          Start development server');
    console.log('  deploy <project>       Deploy to production');
    console.log('  help                   Show this help message\n');

    console.log(colorize('Examples:', 'bold'));
    console.log('  node gfd-cli.js list');
    console.log('  node gfd-cli.js info ai');
    console.log('  node gfd-cli.js code ai');
    console.log('  node gfd-cli.js dev ai');
    console.log('  node gfd-cli.js deploy ai\n');
}

// Main execution
function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'list';
    const projectKey = args[1];

    const handler = COMMANDS[command];

    if (!handler) {
        console.error(colorize(`❌ Unknown command: ${command}`, 'yellow'));
        showHelp();
        process.exit(1);
    }

    handler(projectKey);
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { PROJECTS, COMMANDS };
