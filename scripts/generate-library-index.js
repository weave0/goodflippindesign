/* eslint-disable no-console */

const fs = require('node:fs');
const path = require('node:path');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function fileExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function extractMarkdownMetadata(markdown) {
  const lines = markdown.split(/\r?\n/);

  let title = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      title = trimmed.replace(/^#\s+/, '').trim();
      break;
    }
  }

  let description = '';
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('#')) continue;
    if (line.startsWith('```')) {
      // skip code blocks
      while (i < lines.length && !lines[i].trim().startsWith('```')) i += 1;
      continue;
    }
    description = line;
    break;
  }

  return { title, description };
}

function toSlug(input) {
  return String(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const allowlistPath = path.join(repoRoot, 'docs', 'LIBRARY_ALLOWLIST.json');
  const outputPath = path.join(repoRoot, 'assets', 'data', 'library-index.json');

  if (!fileExists(allowlistPath)) {
    console.error('Missing allowlist:', allowlistPath);
    process.exit(1);
  }

  const allowlist = readJson(allowlistPath);
  if (!Array.isArray(allowlist) || allowlist.length === 0) {
    console.error('Allowlist is empty or invalid.');
    process.exit(1);
  }

  const items = [];
  for (const rel of allowlist) {
    const normalizedRel = rel.replace(/\\/g, '/');
    const abs = path.join(repoRoot, normalizedRel);

    if (!fileExists(abs)) {
      console.warn('Skipping missing file:', normalizedRel);
      continue;
    }

    const stat = fs.statSync(abs);
    const raw = fs.readFileSync(abs, 'utf8');
    const { title, description } = extractMarkdownMetadata(raw);

    const fallbackTitle = path.basename(normalizedRel);
    const finalTitle = title || fallbackTitle;

    items.push({
      id: `doc-${toSlug(normalizedRel)}`,
      type: 'doc',
      title: finalTitle,
      description: description || 'A curated document from the GFD library.',
      href: `/${normalizedRel}`,
      path: normalizedRel,
      updatedAt: stat.mtime.toISOString().slice(0, 10)
    });
  }

  items.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({
    version: 1,
    generatedAt: new Date().toISOString(),
    items
  }, null, 2) + '\n');

  console.log('Wrote', outputPath);
  console.log('Items:', items.length);
}

main();
