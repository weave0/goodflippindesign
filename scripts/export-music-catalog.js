#!/usr/bin/env node
/**
 * export-music-catalog.js
 * Merges canonical SummitView album JSONs into a single gated catalog file
 * used by the GFD Admin Music Library panel.
 *
 * Usage:  node scripts/export-music-catalog.js
 *         npm run export:music
 *
 * Output: assets/data/gfv-music-catalog.json  (gated in _worker.js — never public)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Source & destination ────────────────────────────────────────────────────
const SUMMITVIEW_DATA = path.resolve(
  __dirname,
  '../GFD Dev Projects/SummitView/data'
);
const OUTPUT_PATH = path.resolve(
  __dirname,
  '../assets/data/gfv-music-catalog.json'
);

// ── Canonical album file list (order = display order within each artist) ───
// djshariff_album_2.json is the enriched canonical version (backup kept as djshariff_album_2.backup.json).
// djzebra_album_1_merged.json is the canonical full version (preferred over djzebra_album_1.json).
const ALBUM_FILES = [
  { file: 'foxyana_album_1.json',         artistId: 'foxyana',   artistName: 'DJ Foxyana'  },
  { file: 'foxyana_album_2.json',         artistId: 'foxyana',   artistName: 'DJ Foxyana'  },
  { file: 'djshariff_album_1.json',       artistId: 'djshariff', artistName: 'DJ Shariff'  },
  { file: 'djshariff_album_2.json',       artistId: 'djshariff', artistName: 'DJ Shariff'  },
  { file: 'djshariff_album_3.json',       artistId: 'djshariff', artistName: 'DJ Shariff'  },
  { file: 'djzebra_album_1_merged.json',  artistId: 'djzebra',   artistName: 'DJ Z'        },
  { file: 'dross_album_1.json',           artistId: 'dross',     artistName: 'Heavy Moose' },
  { file: 'dross_album_2.json',           artistId: 'dross',     artistName: 'Heavy Moose' },
  { file: 'aardvarco_album_1.json',       artistId: 'aardvarco', artistName: 'Aardvarco'   },
  { file: 'redleopard_album_1.json',      artistId: 'redleopard',artistName: 'Red Leopard' },
  { file: 'redleopard_album_2.json',      artistId: 'redleopard',artistName: 'Red Leopard' },
];

// ── Artist display order ────────────────────────────────────────────────────
const ARTIST_ORDER = ['foxyana','djshariff','djzebra','dross','aardvarco','redleopard'];

// ── Studio prompt-HTML filename convention ──────────────────────────────────
// SummitView generates output/<albumId>_prompts.html for each album.
function studioPath(albumId) {
  return albumId + '_prompts.html';
}

// ── Field extractors ────────────────────────────────────────────────────────
function compactTrack(t) {
  return {
    n:        t.trackNumber  ?? t.n    ?? 0,
    title:    t.title        || '',
    bpm:      t.bpm          ?? null,
    duration: t.duration     || '',
    key:      t.key          || '',
    role:     t.role         || '',
  };
}

function compactAlbum(raw, artistId) {
  const tracks = Array.isArray(raw.tracks) ? raw.tracks.map(compactTrack) : [];
  return {
    albumId:      raw.albumId     || '',
    title:        raw.title       || '',
    artistId:     raw.brandId     || artistId,
    description:  raw.description || '',
    trackCount:   tracks.length,
    tracks,
    albumArtPrompt:      raw.albumArt?.prompt        || null,
    albumArtNegPrompt:   raw.albumArt?.negativePrompt|| null,
    studioPath:   studioPath(raw.albumId || ''),
  };
}

// ── Main ────────────────────────────────────────────────────────────────────
function run() {
  if (!fs.existsSync(SUMMITVIEW_DATA)) {
    console.error('ERROR: SummitView data directory not found:', SUMMITVIEW_DATA);
    process.exit(1);
  }

  // Ensure output directory exists
  const outDir = path.dirname(OUTPUT_PATH);
  fs.mkdirSync(outDir, { recursive: true });

  // Read and group albums by artist
  const artistMap = {}; // artistId → { id, name, albums: [] }

  for (const entry of ALBUM_FILES) {
    const filePath = path.join(SUMMITVIEW_DATA, entry.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`WARN: file not found, skipping — ${entry.file}`);
      continue;
    }

    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (err) {
      console.warn(`WARN: could not parse ${entry.file} — ${err.message}`);
      continue;
    }

    const aid = entry.artistId;
    if (!artistMap[aid]) {
      artistMap[aid] = { id: aid, name: entry.artistName, albums: [] };
    }
    artistMap[aid].albums.push(compactAlbum(raw, aid));
    console.log(`  ✓ ${entry.file}  →  ${raw.title || '(no title)'}  (${Array.isArray(raw.tracks) ? raw.tracks.length : 0} tracks)`);
  }

  // Build ordered artists list
  const artists = ARTIST_ORDER
    .filter(aid => artistMap[aid])
    .map(aid  => artistMap[aid]);

  const totalAlbums = artists.reduce((sum, a) => sum + a.albums.length, 0);
  const totalTracks = artists.reduce((sum, a) => a.albums.reduce((s, al) => s + al.trackCount, sum), 0);

  const catalog = {
    _meta: {
      exported_at:   new Date().toISOString(),
      source:        'GFD Dev Projects/SummitView/data',
      total_artists: artists.length,
      total_albums:  totalAlbums,
      total_tracks:  totalTracks,
    },
    artists,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(catalog, null, 2), 'utf-8');

  const sizeKB = (fs.statSync(OUTPUT_PATH).size / 1024).toFixed(1);
  console.log('');
  console.log(`Catalog written → ${OUTPUT_PATH}`);
  console.log(`  Artists: ${artists.length}  Albums: ${totalAlbums}  Tracks: ${totalTracks}  Size: ${sizeKB} KB`);
}

run();
