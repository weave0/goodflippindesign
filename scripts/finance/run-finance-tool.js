#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const [, , toolName, ...toolArgs] = process.argv;

if (!toolName) {
  console.error('Usage: node scripts/finance/run-finance-tool.js <tool-name> [tool args...]');
  process.exit(1);
}

const repoRoot = path.resolve(__dirname, '..', '..');
const localPython = path.join(repoRoot, 'CASHMONEY', '.venv', 'Scripts', 'python.exe');
const repoPython = path.join(repoRoot, '.venv', 'Scripts', 'python.exe');
const scriptFile = toolName.endsWith('.py') ? toolName : `${toolName}.py`;
const scriptPath = path.join(__dirname, scriptFile);

if (!fs.existsSync(scriptPath)) {
  console.error(`Finance tool not found: ${scriptPath}`);
  process.exit(1);
}

let command = 'python';
let commandArgs = [scriptPath, ...toolArgs];
let runtimeSource = 'python on PATH';

if (fs.existsSync(localPython)) {
  command = localPython;
  runtimeSource = 'CASHMONEY .venv';
} else if (fs.existsSync(repoPython)) {
  command = repoPython;
  runtimeSource = 'repo .venv';
} else {
  const pyLauncher = spawnSync('py', ['-3', '--version'], { cwd: repoRoot, stdio: 'ignore' });
  if (!pyLauncher.error && pyLauncher.status === 0) {
    command = 'py';
    commandArgs = ['-3', scriptPath, ...toolArgs];
    runtimeSource = 'py -3 launcher';
  }
}

console.log(`Running ${path.basename(scriptPath)} with ${runtimeSource}`);

const result = spawnSync(command, commandArgs, {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
