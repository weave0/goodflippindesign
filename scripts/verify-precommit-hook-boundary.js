#!/usr/bin/env node
/**
 * Regression proof for the pre-commit hook cross-project boundary fix.
 *
 * Creates a throwaway, isolated git worktree (no sibling "GFD Dev Projects"
 * checkout — the same situation as any fresh clone or agent worktree), runs
 * .husky/pre-commit's exact logic there against a trivial staged change,
 * and asserts that no CultureSherpa/foreign-project directory was created
 * anywhere as a side effect.
 *
 * Usage: node scripts/verify-precommit-hook-boundary.js
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'gfd-hook-boundary-'));
const worktreeDir = path.join(tmpBase, 'worktree');

function run(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function findForeignDirs(root) {
  // Anything named like the known foreign-project output would be — this
  // isolated worktree must never contain one.
  const hits = [];
  (function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'GFD Dev Projects' || entry.name === 'CultureSherpa') hits.push(full);
        walk(full);
      }
    }
  })(root);
  return hits;
}

let failed = false;
try {
  console.log(`Repo root: ${REPO_ROOT}`);
  console.log(`Creating isolated worktree at: ${worktreeDir}`);
  run('git', ['worktree', 'add', '--detach', worktreeDir, 'HEAD'], REPO_ROOT);

  // No `npm install` step is needed here: the hook shells out only to
  // standard POSIX utilities already present on the runner/dev machine
  // (cp, node, git, date, grep, xargs, stat, awk) — it has no package
  // dependencies of its own to install.
  console.log('Staging a trivial change and running .husky/pre-commit exactly as husky would...');

  fs.writeFileSync(path.join(worktreeDir, 'cache-bust.txt'), 'boundary-proof-run\n');
  run('git', ['add', 'cache-bust.txt'], worktreeDir);

  let hookOutput = '';
  let hookFailed = false;
  try {
    hookOutput = run('sh', ['.husky/pre-commit'], worktreeDir);
  } catch (err) {
    // execFileSync throws on a non-zero exit — capture whatever stdout/
    // stderr it collected before failing rather than letting the error
    // propagate past this script's own reporting and cleanup.
    hookFailed = true;
    hookOutput = `${err.stdout || ''}${err.stderr || ''}`;
    console.error(`.husky/pre-commit exited non-zero: ${err.message}`);
  }

  console.log('--- hook output ---');
  console.log(hookOutput);
  console.log('--- end hook output ---');

  if (hookFailed) {
    failed = true;
    console.error('FAIL: .husky/pre-commit itself exited non-zero inside the isolated worktree.');
  }

  const foreignDirs = findForeignDirs(worktreeDir);
  if (foreignDirs.length > 0) {
    failed = true;
    console.error('FAIL: pre-commit hook created foreign-project directories:');
    for (const dir of foreignDirs) console.error(`  - ${dir}`);
  } else if (!hookFailed) {
    console.log('PASS: no CultureSherpa / "GFD Dev Projects" directory exists anywhere under the isolated worktree.');
  }
} finally {
  try {
    run('git', ['worktree', 'remove', '--force', worktreeDir], REPO_ROOT);
  } catch (cleanupErr) {
    console.error(`Warning: failed to remove temp worktree ${worktreeDir}: ${cleanupErr.message}`);
  }
  fs.rmSync(tmpBase, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
