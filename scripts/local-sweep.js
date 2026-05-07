#!/usr/bin/env node
/**
 * local-sweep.js — Machine + workspace intelligence for solo operator
 *
 * Generates local-sweep.json covering:
 *   • Drive usage across all volumes + delta vs storage-baseline.json
 *   • Git status for every ecosystem repo under Z:\GFD and GFD Dev Projects
 *   • Toolchain versions (Node, npm, Wrangler, Git, VS Code)
 *   • Z:\MediaDrop unprocessed queue
 *   • Actionable alerts (storage critical, dirty repos, unpushed commits)
 *
 * Usage:
 *   node scripts/local-sweep.js            # run sweep, write local-sweep.json
 *   node scripts/local-sweep.js --quiet    # suppress console output
 *   node scripts/local-sweep.js --json     # print JSON to stdout only
 */
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const WORKSPACE     = path.resolve(__dirname, '..');
const PROJECTS_DIR  = path.join(WORKSPACE, 'GFD Dev Projects');
const BASELINE_PATH = path.join(WORKSPACE, 'storage-baseline.json');
const OUTPUT_PATH   = path.join(WORKSPACE, 'local-sweep.json');
const MEDIA_DROP    = 'Z:\\MediaDrop';

const args      = process.argv.slice(2);
const QUIET     = args.includes('--quiet');
const JSON_ONLY = args.includes('--json');

const log = (...a) => { if (!QUIET && !JSON_ONLY) console.log(...a); };
const startTime = Date.now();

// ─── Helpers ────────────────────────────────────────────────────────────────

function runPs(script) {
    const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
        encoding: 'utf8',
        timeout: 20000,
    });
    return (r.stdout || '').trim();
}

function runGit(gitArgs, cwd) {
    const r = spawnSync('git', gitArgs, {
        cwd,
        encoding: 'utf8',
        timeout: 8000,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    return r.status === 0 ? (r.stdout || '').trim() : null;
}

function runCmd(cmd, cmdArgs) {
    const r = spawnSync(cmd, cmdArgs, {
        encoding: 'utf8',
        timeout: 8000,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
    });
    return (r.stdout || '').trim() || null;
}

function safeJson(str) {
    try { return JSON.parse(str); } catch { return null; }
}

function round1(n) { return Math.round(n * 10) / 10; }

// ─── Drives ──────────────────────────────────────────────────────────────────

function getDrives() {
    log('  → scanning drives…');
    const raw = runPs(
        'Get-PSDrive -PSProvider FileSystem | ' +
        'Where-Object { $_.Used -ne $null } | ' +
        'Select-Object Name, Used, Free | ConvertTo-Json -Compress'
    );
    if (!raw) return [];
    const parsed = safeJson(raw);
    if (!parsed) return [];
    const arr = Array.isArray(parsed) ? parsed : [parsed];

    let baseline = {};
    if (fs.existsSync(BASELINE_PATH)) {
        const b = safeJson(fs.readFileSync(BASELINE_PATH, 'utf8'));
        if (b?.drives) b.drives.forEach(d => { baseline[d.drive] = d.usedGB; });
    }

    const names = { C: 'OS', E: 'WEAVER 4TW', S: 'CultureSherpa', Z: 'WeaveO', O: 'WeaveO', W: 'WeaveO' };

    return arr.filter(d => d && d.Used !== null).map(d => {
        const used_gb  = round1((d.Used || 0) / (1024 ** 3));
        const free_gb  = round1((d.Free || 0) / (1024 ** 3));
        const total_gb = round1(used_gb + free_gb);
        const pct_used = total_gb > 0 ? round1((used_gb / total_gb) * 100) : 0;
        const baseline_used_gb = baseline[d.Name + ':'] ?? null;
        const delta_gb = baseline_used_gb !== null ? round1(used_gb - baseline_used_gb) : null;
        const alert    = pct_used >= 90 ? 'error' : pct_used >= 80 ? 'warn' : 'ok';
        return {
            label: d.Name + ':',
            name: names[d.Name] || d.Name,
            used_gb,
            free_gb,
            total_gb,
            pct_used,
            baseline_used_gb,
            delta_gb,
            alert,
        };
    });
}

// ─── Toolchain ───────────────────────────────────────────────────────────────

function getToolchain() {
    log('  → checking toolchain…');
    const wranglerRaw = runCmd('wrangler', ['--version']);
    const gitRaw = runCmd('git', ['--version']);
    const codeRaw = runCmd('code', ['--version']);
    return {
        node:     runCmd('node', ['-v']),
        npm:      runCmd('npm', ['-v']),
        wrangler: wranglerRaw ? wranglerRaw.replace(/^wrangler\s+/i, '').split('\n')[0] : null,
        git:      gitRaw ? gitRaw.replace('git version ', '') : null,
        code:     codeRaw ? codeRaw.split('\n')[0] : null,
        os:       `${os.type()} ${os.release()}`,
    };
}

// ─── Git repos ───────────────────────────────────────────────────────────────

const BRAND_HINTS = {
    'AI':              { brand: 'aiaimate',       url: 'https://aiaimate.com' },
    'CitizenApproved': { brand: 'citizenapproved', url: 'https://citizenapproved.org' },
    'CultureSherpa':   { brand: 'culturesherpa',  url: 'https://culturesherpa.org' },
    'GFV':             { brand: 'gfv',             url: 'https://goodflippinvibes.com' },
    'Globaldeets':     { brand: 'globaldeets',     url: 'https://globaldeets.com' },
    'GFY':             { brand: 'gfy',             url: null },
    'ThyOwn':          { brand: null,              url: null },
    'SummitView':      { brand: 'summitview',      url: null },
    'Weave':           { brand: null,              url: null },
    'Applio':          { brand: null,              url: null },
    'Foxyana':         { brand: null,              url: null },
};

function getRepoGit(repoPath) {
    if (!fs.existsSync(path.join(repoPath, '.git'))) return null;

    const branch   = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath) || 'unknown';
    const logLine  = runGit(['log', '-1', '--format=%h|%s|%ci'], repoPath);
    let last_commit_hash = null, last_commit_message = null, last_commit_date = null;
    if (logLine) {
        const [h, s, ci] = logLine.split('|');
        last_commit_hash    = h   || null;
        last_commit_message = s   || null;
        last_commit_date    = ci  ? ci.substring(0, 10) : null;
    }

    const statusOut = runGit(['status', '--porcelain'], repoPath) || '';
    const lines     = statusOut.split('\n').filter(Boolean);
    const modified  = lines.filter(l => !l.startsWith('??')).length;
    const untracked = lines.filter(l => l.startsWith('??')).length;

    let ahead = 0, behind = 0;
    const revList = runGit(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], repoPath);
    if (revList) {
        const parts = revList.split(/\s+/);
        ahead  = parseInt(parts[0], 10) || 0;
        behind = parseInt(parts[1], 10) || 0;
    }

    return {
        branch,
        last_commit_hash,
        last_commit_message,
        last_commit_date,
        status:    modified === 0 && untracked === 0 ? 'clean' : 'dirty',
        modified,
        untracked,
        ahead,
        behind,
    };
}

function getRepos() {
    log('  → scanning repositories…');
    const repos = [];

    // Main GFD workspace
    repos.push({
        name:         'goodflippindesign',
        path:         WORKSPACE,
        brand:        'gfd',
        url:          'https://goodflippindesign.com',
        git:          getRepoGit(WORKSPACE),
        has_package:  fs.existsSync(path.join(WORKSPACE, 'package.json')),
        has_wrangler: fs.existsSync(path.join(WORKSPACE, 'wrangler.toml')),
    });

    // GFD Dev Projects
    if (fs.existsSync(PROJECTS_DIR)) {
        const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
            .filter(e => e.isDirectory() && !e.name.startsWith('.'))
            .sort((a, b) => a.name.localeCompare(b.name));

        for (const entry of entries) {
            const projPath = path.join(PROJECTS_DIR, entry.name);
            const hint     = BRAND_HINTS[entry.name] || {};
            repos.push({
                name:         entry.name.toLowerCase(),
                path:         projPath,
                brand:        hint.brand || null,
                url:          hint.url   || null,
                git:          getRepoGit(projPath),
                has_package:  fs.existsSync(path.join(projPath, 'package.json')),
                has_wrangler: fs.existsSync(path.join(projPath, 'wrangler.toml')),
            });
        }
    }

    return repos;
}

// ─── MediaDrop ───────────────────────────────────────────────────────────────

function getMediaDrop() {
    log('  → checking media drop…');
    if (!fs.existsSync(MEDIA_DROP)) {
        return { path: MEDIA_DROP, exists: false, unprocessed_count: 0, by_type: {} };
    }

    const manifestPath = path.join(MEDIA_DROP, '.media-manifest.json');
    let unprocessed_count = 0;
    const by_type = {};

    if (fs.existsSync(manifestPath)) {
        const manifest = safeJson(fs.readFileSync(manifestPath, 'utf8'));
        if (manifest?.files) {
            for (const f of manifest.files) {
                if (!f.processed) {
                    unprocessed_count++;
                    const cat = f.category || 'other';
                    by_type[cat] = (by_type[cat] || 0) + 1;
                }
            }
        }
    } else {
        // Shallow scan if no manifest
        try {
            const files = fs.readdirSync(MEDIA_DROP, { withFileTypes: true })
                .filter(e => e.isFile() && !e.name.startsWith('.'));
            unprocessed_count = files.length;
        } catch { /* permission denied or empty */ }
    }

    return { path: MEDIA_DROP, exists: true, unprocessed_count, by_type };
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

function buildAlerts(drives, repos, mediaDrop) {
    const alerts = [];

    for (const d of drives) {
        if (d.alert === 'error') {
            alerts.push({ level: 'error', category: 'storage', message: `${d.label} is ${d.pct_used}% full — only ${d.free_gb} GB remaining` });
        } else if (d.alert === 'warn') {
            alerts.push({ level: 'warn', category: 'storage', message: `${d.label} is ${d.pct_used}% full — ${d.free_gb} GB remaining` });
        }
        if (d.delta_gb !== null && d.delta_gb > 50) {
            alerts.push({ level: 'info', category: 'storage', message: `${d.label} grew +${d.delta_gb} GB since baseline (${d.baseline_used_gb} → ${d.used_gb} GB)` });
        }
    }

    for (const r of repos) {
        if (!r.git) continue;
        if (r.git.ahead > 0) {
            alerts.push({ level: 'warn', category: 'git', message: `${r.name}: ${r.git.ahead} unpushed commit${r.git.ahead !== 1 ? 's' : ''} on ${r.git.branch}` });
        }
        if (r.git.behind > 0) {
            alerts.push({ level: 'info', category: 'git', message: `${r.name}: ${r.git.behind} commit${r.git.behind !== 1 ? 's' : ''} behind upstream` });
        }
        if (r.git.modified > 0) {
            alerts.push({ level: 'info', category: 'git', message: `${r.name}: ${r.git.modified} modified file${r.git.modified !== 1 ? 's' : ''}` });
        }
    }

    if (mediaDrop.exists && mediaDrop.unprocessed_count > 0) {
        alerts.push({ level: 'info', category: 'media', message: `MediaDrop: ${mediaDrop.unprocessed_count} unprocessed asset${mediaDrop.unprocessed_count !== 1 ? 's' : ''}` });
    }

    return alerts;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
    log('\n🔍 Local sweep starting…');

    const drives    = getDrives();
    const toolchain = getToolchain();
    const repos     = getRepos();
    const mediaDrop = getMediaDrop();
    const alerts    = buildAlerts(drives, repos, mediaDrop);
    const duration_ms = Date.now() - startTime;

    const output = {
        meta: {
            timestamp:   new Date().toISOString(),
            version:     '1.1',
            machine:     os.hostname(),
            duration_ms,
        },
        drives,
        toolchain,
        repos,
        media_drop: mediaDrop,
        alerts,
    };

    if (JSON_ONLY) {
        process.stdout.write(JSON.stringify(output, null, 2) + '\n');
        return;
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

    if (!QUIET) {
        const gitRepos  = repos.filter(r => r.git).length;
        const errAlerts = alerts.filter(a => a.level === 'error');
        const warnAlerts = alerts.filter(a => a.level === 'warn');
        log(`\n✅  Sweep complete in ${duration_ms}ms`);
        log(`    Drives: ${drives.length} | Git repos: ${gitRepos} | Alerts: ${alerts.length} (${errAlerts.length} error, ${warnAlerts.length} warn)`);
        if (errAlerts.length > 0) errAlerts.forEach(a => log(`\n    🔴  ${a.message}`));
        if (warnAlerts.length > 0) warnAlerts.forEach(a => log(`    🟡  ${a.message}`));
        log(`\n    Output → ${OUTPUT_PATH}\n`);
    }
}

main();
