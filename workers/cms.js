/**
 * Cloudflare Worker: CMS — Asset & Content Management
 *
 * Routes under /api/cms/* — all require Clerk admin auth
 * Talks to D1 (cms_assets, cms_social_posts, cms_content, cms_audit_log)
 * Talks to R2 (MEDIA_BUCKET) for binary asset storage
 *
 * Cost: $0 — runs within Cloudflare free tier
 *   D1: 5M reads/day, 100K writes/day, 5 GB storage
 *   R2: 10 GB storage, 1M class-A ops, 10M class-B ops, zero egress
 *   Workers: 100K requests/day
 */

import { handleOAuthRequest } from './oauth.js';

// ────────────────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────────────────

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function logAudit(db, userId, action, targetType, targetId, details) {
  try {
    await db.prepare(`
      INSERT INTO cms_audit_log (user_id, action, target_type, target_id, details)
      VALUES (?, ?, ?, ?, ?)
    `).bind(userId, action, targetType, targetId, JSON.stringify(details || {})).run();
  } catch (e) {
    console.error('Audit log failed:', e.message);
  }
}

const PLATFORM_RULES = {
  instagram: { label: 'Instagram', maxChars: 2200, maxHashtags: 30, defaultFormat: 'portrait' },
  facebook: { label: 'Facebook', maxChars: 63206, maxHashtags: 30, defaultFormat: 'feed' },
  x: { label: 'X', maxChars: 280, maxHashtags: 2, defaultFormat: 'landscape' },
  linkedin: { label: 'LinkedIn', maxChars: 3000, maxHashtags: 5, defaultFormat: 'landscape' },
  pinterest: { label: 'Pinterest', maxChars: 500, maxHashtags: 20, defaultFormat: 'standard' },
  tiktok: { label: 'TikTok', maxChars: 150, maxHashtags: 5, defaultFormat: 'reel' },
  youtube: { label: 'YouTube', maxChars: 5000, maxHashtags: 15, defaultFormat: 'thumbnail' },
};

let campaignSchemaReady = false;

async function ensureCampaignSchema(db) {
  if (campaignSchemaReady) return;

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cms_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand TEXT NOT NULL DEFAULT 'gfd',
      name TEXT NOT NULL,
      objective TEXT DEFAULT '',
      cadence TEXT DEFAULT '',
      platforms TEXT DEFAULT '[]',
      start_date TEXT,
      end_date TEXT,
      status TEXT DEFAULT 'planned',
      notes TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      created_by TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `).run();

  await db.prepare('CREATE INDEX IF NOT EXISTS idx_cms_campaigns_brand ON cms_campaigns(brand)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_cms_campaigns_status ON cms_campaigns(status)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_cms_campaigns_start ON cms_campaigns(start_date)').run();

  // Legacy-safe migration: ignore duplicate-column failures.
  const addColumnStatements = [
    'ALTER TABLE cms_social_posts ADD COLUMN campaign_id INTEGER',
    "ALTER TABLE cms_social_posts ADD COLUMN objective TEXT DEFAULT ''",
    "ALTER TABLE cms_social_posts ADD COLUMN watermark_profile TEXT DEFAULT ''",
  ];
  for (const sql of addColumnStatements) {
    try {
      await db.prepare(sql).run();
    } catch {
      // Column likely already exists.
    }
  }

  campaignSchemaReady = true;
}

// ── NFT schema (lazy-init, same pattern as campaigns) ─────────────────────────
let nftSchemaReady = false;

async function ensureNFTSchema(db) {
  if (nftSchemaReady) return;

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cms_nft_collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand TEXT NOT NULL DEFAULT 'gfv',
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      contract_address TEXT DEFAULT '',
      marketplace_url TEXT DEFAULT '',
      status TEXT DEFAULT 'draft',
      created_by TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `).run();

  await db.prepare('CREATE INDEX IF NOT EXISTS idx_cms_nft_collections_brand ON cms_nft_collections(brand)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_cms_nft_collections_status ON cms_nft_collections(status)').run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cms_nft_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id INTEGER NOT NULL REFERENCES cms_nft_collections(id),
      asset_id TEXT DEFAULT '',
      edition_number INTEGER,
      token_id_onchain TEXT DEFAULT '',
      ipfs_image_cid TEXT DEFAULT '',
      ipfs_metadata_cid TEXT DEFAULT '',
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      external_url TEXT DEFAULT '',
      background_color TEXT DEFAULT '',
      animation_url TEXT DEFAULT '',
      attributes_json TEXT DEFAULT '[]',
      rarity TEXT DEFAULT 'Common',
      rarity_tier INTEGER DEFAULT 1,
      status TEXT DEFAULT 'draft',
      mint_tx_hash TEXT DEFAULT '',
      minted_at TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `).run();

  await db.prepare('CREATE INDEX IF NOT EXISTS idx_cms_nft_tokens_collection ON cms_nft_tokens(collection_id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_cms_nft_tokens_status ON cms_nft_tokens(status)').run();
  try {
    await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_cms_nft_tokens_edition ON cms_nft_tokens(collection_id, edition_number)').run();
  } catch { /* may already exist */ }

  nftSchemaReady = true;
}

function platformRule(platform) {
  return PLATFORM_RULES[platform] || { label: platform, maxChars: 500, maxHashtags: 10, defaultFormat: 'square' };
}

function countHashtags(text) {
  return (text.match(/#[\w\u00C0-\u024F]+/g) || []).length;
}

async function encryptAesGcm(plaintext, keyMaterial) {
  const keyBytes = new TextEncoder().encode(String(keyMaterial).substring(0, 32).padEnd(32, '0'));
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );

  const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

async function decryptAesGcm(ciphertext, keyMaterial) {
  try {
    const keyBytes = new TextEncoder().encode(String(keyMaterial).substring(0, 32).padEnd(32, '0'));
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
    const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch (_e) {
    return null;
  }
}

async function encodeConnectionPayloadForStorage(payloadString, encryptionKey) {
  const raw = String(payloadString || '').trim();
  if (!raw) throw new Error('Token payload cannot be empty');

  // Payloads that do not look like JSON are assumed to already be encrypted.
  if (!raw.startsWith('{')) return raw;

  if (!encryptionKey) {
    return raw;
  }

  return encryptAesGcm(raw, encryptionKey);
}

// ────────────────────────────────────────────────────────────────
//  Asset Handlers
// ────────────────────────────────────────────────────────────────

/**
 * GET /api/cms/assets/analytics — Aggregate asset library stats for the Admin
 * Returns: total, by_status, by_brand, by_media_type, by_category (top 25),
 *          oldest_pending (10), recently_approved (10)
 */
async function handleAssetAnalytics(env) {
  const db = env.DB;

  const [statusRes, brandRes, typeRes, catRes, pendingRes, approvedRes] = await Promise.all([
    db.prepare(
      'SELECT review_status, COUNT(*) as count FROM cms_assets WHERE active=1 GROUP BY review_status ORDER BY count DESC'
    ).all(),
    db.prepare(
      `SELECT brand,
         COUNT(*) as total,
         SUM(CASE WHEN review_status='approved' THEN 1 ELSE 0 END) as approved,
         SUM(CASE WHEN review_status IN ('draft','pending') THEN 1 ELSE 0 END) as pending,
         SUM(CASE WHEN review_status='rejected' THEN 1 ELSE 0 END) as rejected,
         SUM(CASE WHEN featured=1 THEN 1 ELSE 0 END) as featured
       FROM cms_assets WHERE active=1
       GROUP BY brand ORDER BY total DESC`
    ).all(),
    db.prepare(
      'SELECT media_type, COUNT(*) as count FROM cms_assets WHERE active=1 GROUP BY media_type ORDER BY count DESC'
    ).all(),
    db.prepare(
      'SELECT category, COUNT(*) as count FROM cms_assets WHERE active=1 AND category != "" GROUP BY category ORDER BY count DESC LIMIT 25'
    ).all(),
    db.prepare(
      `SELECT id, title, brand, category, media_type, thumbnail_path, created_at
       FROM cms_assets WHERE active=1 AND review_status IN ('draft','pending')
       ORDER BY created_at ASC LIMIT 10`
    ).all(),
    db.prepare(
      `SELECT id, title, brand, category, media_type, thumbnail_path, approved_at
       FROM cms_assets WHERE active=1 AND review_status='approved'
       ORDER BY approved_at DESC LIMIT 10`
    ).all(),
  ]);

  const total = (statusRes.results || []).reduce((s, r) => s + (r.count || 0), 0);

  return jsonResponse({
    total,
    by_status: statusRes.results || [],
    by_brand: brandRes.results || [],
    by_media_type: typeRes.results || [],
    by_category: catRes.results || [],
    oldest_pending: pendingRes.results || [],
    recently_approved: approvedRes.results || [],
  });
}

/**
 * GET /api/cms/automation-center — Queue snapshot + health sweep history aggregate.
 * Returns variant status counts, retry candidates, and last N health sweep runs.
 */
async function handleAutomationCenter(env) {
  const db = env.DB;

  const [queueRes, sweepRunsRes, retryRes, failedBrandRes] = await Promise.all([
    // Queue snapshot: counts by status
    db.prepare(`
      SELECT status, COUNT(*) AS count
      FROM cms_post_variants
      GROUP BY status
      ORDER BY count DESC
    `).all(),

    // Last 8 health sweep run timestamps, with pass/warn/fail summary per run
    db.prepare(`
      SELECT checked_at,
             COUNT(*)                                                          AS total,
             SUM(CASE WHEN overall_status = 'pass' THEN 1 ELSE 0 END)         AS passed,
             SUM(CASE WHEN overall_status = 'warn' THEN 1 ELSE 0 END)         AS warned,
             SUM(CASE WHEN overall_status = 'fail' THEN 1 ELSE 0 END)         AS failed
      FROM health_checks
      GROUP BY checked_at
      ORDER BY checked_at DESC
      LIMIT 8
    `).all(),

    // Retry candidates: failed variants with retry_count < 3, most recent first
    db.prepare(`
      SELECT v.id, v.platform, v.status, v.retry_count, v.error_message,
             sp.brand, sp.content, v.scheduled_at
      FROM cms_post_variants v
      JOIN cms_social_posts sp ON sp.id = v.post_id
      WHERE v.status = 'failed' AND v.retry_count < 3
      ORDER BY v.updated_at DESC
      LIMIT 10
    `).all(),

    // Failed variants grouped by brand — surface alert if any brand has 5+
    db.prepare(`
      SELECT sp.brand, COUNT(*) AS failed_count
      FROM cms_post_variants v
      JOIN cms_social_posts sp ON sp.id = v.post_id
      WHERE v.status = 'failed'
      GROUP BY sp.brand
      ORDER BY failed_count DESC
    `).all(),
  ]);

  // Build queue summary map
  const queue = {};
  for (const row of (queueRes.results || [])) queue[row.status] = row.count;

  // Last sweep timestamp
  const sweepRuns = sweepRunsRes.results || [];
  const lastSweep = sweepRuns[0]?.checked_at || null;

  // Time since last sweep (minutes)
  let minutesSinceLastSweep = null;
  if (lastSweep) {
    const diff = Date.now() - new Date(lastSweep).getTime();
    minutesSinceLastSweep = Math.round(diff / 60000);
  }

  return jsonResponse({
    queue,
    sweep_runs:          sweepRuns,
    last_sweep:          lastSweep,
    minutes_since_sweep: minutesSinceLastSweep,
    retry_candidates:    retryRes.results  || [],
    failed_by_brand:     failedBrandRes.results || [],
  });
}

/**
 * GET /api/cms/assets/usage — Cross-reference cms_assets with cms_post_variants
 * Returns top-20 most-used assets, never-used count, by-platform + by-month breakdown.
 */
async function handleAssetUsage(env) {
  const db = env.DB;

  const [topRes, neverRes, usedCountRes, platformRes, monthRes] = await Promise.all([
    // Top 20 most-used assets
    db.prepare(`
      SELECT a.id, a.title, a.brand, a.media_type, a.category, a.thumbnail_path,
             COUNT(v.id)                                                    AS use_count,
             SUM(CASE WHEN v.status='published' THEN 1 ELSE 0 END)         AS published,
             SUM(CASE WHEN v.status='failed'    THEN 1 ELSE 0 END)         AS failed,
             SUM(CASE WHEN v.status='pending'   THEN 1 ELSE 0 END)         AS pending,
             MAX(v.scheduled_at)                                            AS last_used
      FROM cms_assets a
      JOIN cms_post_variants v ON v.media_asset_id = a.id AND v.media_asset_id != ''
      WHERE a.active = 1
      GROUP BY a.id
      ORDER BY use_count DESC
      LIMIT 20
    `).all(),

    // Assets with zero variant usage
    db.prepare(`
      SELECT COUNT(*) AS count FROM cms_assets a
      WHERE a.active = 1
        AND NOT EXISTS (
          SELECT 1 FROM cms_post_variants v
          WHERE v.media_asset_id = a.id AND v.media_asset_id != ''
        )
    `).first(),

    // Distinct assets that have been used at least once
    db.prepare(`
      SELECT COUNT(DISTINCT a.id) AS count
      FROM cms_assets a
      JOIN cms_post_variants v ON v.media_asset_id = a.id AND v.media_asset_id != ''
      WHERE a.active = 1
    `).first(),

    // Usage broken down by publishing platform
    db.prepare(`
      SELECT v.platform,
             COUNT(v.id)                                                    AS use_count,
             SUM(CASE WHEN v.status='published' THEN 1 ELSE 0 END)         AS published
      FROM cms_post_variants v
      WHERE v.media_asset_id != '' AND v.media_asset_id IS NOT NULL
      GROUP BY v.platform
      ORDER BY use_count DESC
    `).all(),

    // Usage by month — last 6 months
    db.prepare(`
      SELECT strftime('%Y-%m', v.scheduled_at) AS month,
             COUNT(v.id)                        AS count
      FROM cms_post_variants v
      WHERE v.media_asset_id != '' AND v.media_asset_id IS NOT NULL
        AND v.scheduled_at >= datetime('now', '-6 months')
      GROUP BY month
      ORDER BY month DESC
      LIMIT 6
    `).all(),
  ]);

  return jsonResponse({
    top_assets:   topRes.results   || [],
    never_used:   (neverRes?.count  ?? 0),
    used_count:   (usedCountRes?.count ?? 0),
    by_platform:  platformRes.results || [],
    by_month:     monthRes.results  || [],
  });
}

/**
 * GET /api/cms/assets — List/search assets (public-safe, filtered by active=1)
 * Query params: brand, category, media_type, featured, limit, offset, q
 */
async function handleListAssets(request, env) {
  const url = new URL(request.url);
  const brand = url.searchParams.get('brand');
  const category = url.searchParams.get('category');
  const mediaType = url.searchParams.get('media_type');
  const featured = url.searchParams.get('featured');
  const q = url.searchParams.get('q');
  const reviewStatus = url.searchParams.get('review_status');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  let query = 'SELECT * FROM cms_assets WHERE active = 1';
  const bindings = [];

  if (brand) {
    query += ' AND brand = ?';
    bindings.push(brand);
  }
  if (category) {
    query += ' AND category = ?';
    bindings.push(category);
  }
  if (mediaType) {
    query += ' AND media_type = ?';
    bindings.push(mediaType);
  }
  if (featured === '1') {
    query += ' AND featured = 1';
  }
  if (reviewStatus) {
    query += ' AND review_status = ?';
    bindings.push(reviewStatus);
  }
  if (q) {
    query += ' AND (title LIKE ? OR description LIKE ? OR tags LIKE ? OR category LIKE ?)';
    const search = `%${q}%`;
    bindings.push(search, search, search, search);
  }

  query += ' ORDER BY sort_order ASC, created_at DESC LIMIT ? OFFSET ?';
  bindings.push(limit, offset);

  const stmt = bindings.length > 0
    ? env.DB.prepare(query).bind(...bindings)
    : env.DB.prepare(query);

  const { results } = await stmt.all();

  // Count query mirrors all filters so total reflects the filtered result set
  let countQuery = 'SELECT COUNT(*) as total FROM cms_assets WHERE active = 1';
  const countBindings = [];
  if (brand) { countQuery += ' AND brand = ?'; countBindings.push(brand); }
  if (category) { countQuery += ' AND category = ?'; countBindings.push(category); }
  if (mediaType) { countQuery += ' AND media_type = ?'; countBindings.push(mediaType); }
  if (reviewStatus) { countQuery += ' AND review_status = ?'; countBindings.push(reviewStatus); }
  if (q) {
    countQuery += ' AND (title LIKE ? OR description LIKE ? OR tags LIKE ? OR category LIKE ?)';
    const search = `%${q}%`;
    countBindings.push(search, search, search, search);
  }

  const countStmt = countBindings.length > 0
    ? env.DB.prepare(countQuery).bind(...countBindings)
    : env.DB.prepare(countQuery);
  const countResult = await countStmt.first();

  return jsonResponse({
    assets: results || [],
    total: countResult?.total || 0,
    limit,
    offset,
  });
}

/**
 * GET /api/cms/assets/:id — Single asset detail
 */
async function handleGetAsset(id, env) {
  const asset = await env.DB.prepare(
    'SELECT * FROM cms_assets WHERE id = ?'
  ).bind(id).first();

  if (!asset) return errorResponse('Asset not found', 404);
  return jsonResponse(asset);
}

/**
 * POST /api/cms/assets — Create asset metadata (admin)
 * Body: { brand, category, title, description, file_path, media_type, tags, emotions, ... }
 */
async function handleCreateAsset(request, user, env) {
  const data = await request.json();
  const { brand, category, title, file_path, media_type } = data;

  if (!title || !file_path) {
    return errorResponse('title and file_path are required');
  }

  const id = `asset_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO cms_assets (id, brand, category, title, description, file_path, media_type,
      mime_type, file_size, width, height, thumbnail_path, tags, emotions,
      video_embed_url, video_source, featured, sort_order, uploaded_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    brand || 'gfv',
    category || 'uncategorized',
    title,
    data.description || '',
    file_path,
    media_type || 'image',
    data.mime_type || '',
    data.file_size || 0,
    data.width || 0,
    data.height || 0,
    data.thumbnail_path || '',
    JSON.stringify(data.tags || []),
    JSON.stringify(data.emotions || []),
    data.video_embed_url || '',
    data.video_source || '',
    data.featured ? 1 : 0,
    data.sort_order || 100,
    user.id,
    now,
    now
  ).run();

  await logAudit(env.DB, user.id, 'asset.create', 'asset', id, { title, brand, category });

  return jsonResponse({ id, message: 'Asset created' }, 201);
}

/**
 * PUT /api/cms/assets — Update asset metadata (admin)
 * Body: { id, ...fields to update }
 */
async function handleUpdateAsset(request, user, env) {
  const data = await request.json();
  if (!data.id) return errorResponse('id required');

  const existing = await env.DB.prepare(
    'SELECT * FROM cms_assets WHERE id = ?'
  ).bind(data.id).first();
  if (!existing) return errorResponse('Asset not found', 404);

  const now = new Date().toISOString();

  await env.DB.prepare(`
    UPDATE cms_assets SET
      brand = ?, category = ?, title = ?, description = ?,
      file_path = ?, media_type = ?, tags = ?, emotions = ?,
      video_embed_url = ?, video_source = ?,
      featured = ?, active = ?, sort_order = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    data.brand ?? existing.brand,
    data.category ?? existing.category,
    data.title ?? existing.title,
    data.description ?? existing.description,
    data.file_path ?? existing.file_path,
    data.media_type ?? existing.media_type,
    JSON.stringify(data.tags || JSON.parse(existing.tags || '[]')),
    JSON.stringify(data.emotions || JSON.parse(existing.emotions || '[]')),
    data.video_embed_url ?? existing.video_embed_url,
    data.video_source ?? existing.video_source,
    data.featured !== undefined ? (data.featured ? 1 : 0) : existing.featured,
    data.active !== undefined ? (data.active ? 1 : 0) : existing.active,
    data.sort_order ?? existing.sort_order,
    now,
    data.id
  ).run();

  await logAudit(env.DB, user.id, 'asset.update', 'asset', data.id, data);

  return jsonResponse({ message: 'Asset updated' });
}

/**
 * DELETE /api/cms/assets?id=... — Soft-delete (set active=0)
 */
async function handleDeleteAsset(request, user, env) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return errorResponse('id required');

  const now = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE cms_assets SET active = 0, updated_at = ? WHERE id = ?'
  ).bind(now, id).run();

  await logAudit(env.DB, user.id, 'asset.delete', 'asset', id, {});

  return jsonResponse({ message: 'Asset deactivated' });
}

/**
 * POST /api/cms/upload — Upload file to R2 (admin)
 * Expects multipart form data with field "file"
 * Returns R2 key for use in asset metadata
 */
async function handleUpload(request, user, env) {
  if (!user) return errorResponse('Unauthorized', 401);
  if (!env.MEDIA_BUCKET) {
    return errorResponse('R2 bucket not configured. Run: wrangler r2 bucket create gfv-media', 503);
  }

  const contentType = request.headers.get('content-type') || '';

  // Handle multipart/form-data
  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return errorResponse('No file provided');
    }

    // 50MB limit (generous for video)
    if (file.size > 50 * 1024 * 1024) {
      return errorResponse('File too large (max 50MB)');
    }

    const brand = formData.get('brand') || 'gfv';
    const category = formData.get('category') || 'uncategorized';
    const title = formData.get('title') || file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    const altText = (formData.get('alt_text') || '').slice(0, 500);
    // Always land as draft regardless of what the client sends — approval is explicit
    const reviewStatus = 'draft';
    // Tags: accept a JSON array string or a comma-separated plain string
    let tagsJson = '[]';
    const rawTags = formData.get('tags') || '';
    if (rawTags) {
      try {
        const parsed = JSON.parse(rawTags);
        tagsJson = JSON.stringify(Array.isArray(parsed) ? parsed : []);
      } catch {
        // Comma-separated fallback
        tagsJson = JSON.stringify(rawTags.split(',').map((t) => t.trim()).filter(Boolean));
      }
    }
    const mediaType = formData.get('media_type') || (
      file.type.startsWith('video') ? 'video' :
      file.type.startsWith('audio') ? 'audio' :
      file.type === 'application/pdf' ? 'document' : 'image'
    );
    const safeFilename = file.name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .toLowerCase();
    const r2Key = `${brand}/${category}/${Date.now()}_${safeFilename}`;

    try {
      await env.MEDIA_BUCKET.put(r2Key, file.stream(), {
        httpMetadata: { contentType: file.type },
        customMetadata: {
          brand,
          category,
          originalName: file.name,
          uploadedBy: user.id,
        },
      });
    } catch (r2Err) {
      console.error('[CMS upload] R2 put failed:', r2Err?.message || r2Err);
      return errorResponse(
        `R2 upload failed: ${r2Err?.message || 'bucket may not exist — run: wrangler r2 bucket create gfv-media'}`,
        502
      );
    }

    // Persist metadata to D1 cms_assets
    if (env.DB) {
      const assetId = crypto.randomUUID();
      try {
        await env.DB.prepare(
          `INSERT INTO cms_assets
             (id, brand, category, title, alt_text, file_path, media_type, mime_type,
              file_size, tags, review_status, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          assetId, brand, category, title, altText, r2Key, mediaType,
          file.type, file.size, tagsJson, reviewStatus, user.id
        ).run();
      } catch (dbErr) {
        console.error('[CMS upload] D1 insert failed:', dbErr?.message || dbErr);
        // File is already in R2 — return success with a warning rather than 500
        return jsonResponse({
          r2Key,
          filename: file.name,
          size: file.size,
          type: file.type,
          url: `/api/cms/media/${r2Key}`,
          warning: `File uploaded to R2 but metadata save failed: ${dbErr?.message || 'schema may need migration'}`,
        }, 201);
      }
    }

    await logAudit(env.DB, user.id, 'upload', 'file', r2Key, {
      filename: file.name,
      size: file.size,
      type: file.type,
    });

    return jsonResponse({
      r2Key,
      filename: file.name,
      size: file.size,
      type: file.type,
      url: `/api/cms/media/${r2Key}`,
    }, 201);
  }

  return errorResponse('Content-Type must be multipart/form-data');
}

/**
 * POST /api/cms/upload-url — Batch-import remote URLs into R2 (admin only)
 * Body: { urls: string[], brand?, category?, tags? }
 * Each URL is fetched server-side, stored in R2, and recorded in cms_assets as draft.
 * Returns: { results: [{ url, ok, r2Key?, error? }] }
 *
 * SSRF protection: only HTTPS, blocks private IP ranges and localhost.
 */
async function handleUploadUrl(request, user, env) {
  if (!user) return errorResponse('Unauthorized', 401);
  if (!env.MEDIA_BUCKET) return errorResponse('R2 bucket not configured', 503);

  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON body'); }

  const rawUrls = Array.isArray(body?.urls) ? body.urls : [];
  if (!rawUrls.length) return errorResponse('urls array is required and must not be empty');
  if (rawUrls.length > 200) return errorResponse('Maximum 200 URLs per batch');

  const brand    = (body.brand    || 'gfv').slice(0, 64).replace(/[^a-zA-Z0-9_-]/g, '');
  const category = (body.category || 'imports').slice(0, 128).replace(/[^a-zA-Z0-9 _-]/g, '') || 'imports';
  const tagsRaw  = body.tags || '';
  let tagsJson = '[]';
  if (tagsRaw) {
    try {
      const parsed = JSON.parse(tagsRaw);
      tagsJson = JSON.stringify(Array.isArray(parsed) ? parsed : []);
    } catch {
      tagsJson = JSON.stringify(String(tagsRaw).split(',').map((t) => t.trim()).filter(Boolean));
    }
  }

  // SSRF block-list: disallow non-HTTPS and private/loopback address spaces
  const SSRF_BLOCKED = /^https?:\/\/(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1|fd[0-9a-f]{2}:)/i;
  const ALLOWED_TYPES = new Set(['image/jpeg','image/png','image/gif','image/webp','image/svg+xml',
    'video/mp4','video/webm','video/quicktime','audio/mpeg','audio/ogg','audio/wav','application/pdf']);

  const results = [];

  for (const rawUrl of rawUrls) {
    const urlStr = String(rawUrl).trim();
    if (!urlStr) { results.push({ url: urlStr, ok: false, error: 'Empty URL' }); continue; }

    // Only allow HTTPS
    if (!urlStr.startsWith('https://')) {
      results.push({ url: urlStr, ok: false, error: 'Only HTTPS URLs are permitted' });
      continue;
    }

    // SSRF check
    if (SSRF_BLOCKED.test(urlStr)) {
      results.push({ url: urlStr, ok: false, error: 'URL targets a private or loopback address' });
      continue;
    }

    let parsedUrl;
    try { parsedUrl = new URL(urlStr); } catch {
      results.push({ url: urlStr, ok: false, error: 'Invalid URL' });
      continue;
    }

    try {
      const resp = await fetch(urlStr, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
      if (!resp.ok) { results.push({ url: urlStr, ok: false, error: `HTTP ${resp.status}` }); continue; }

      const contentType = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!ALLOWED_TYPES.has(contentType)) {
        results.push({ url: urlStr, ok: false, error: `Content-Type '${contentType}' not allowed` });
        continue;
      }

      // 50 MB cap — use Content-Length header as early check, full check after reading
      const clHeader = Number(resp.headers.get('content-length') || 0);
      if (clHeader > 50 * 1024 * 1024) {
        results.push({ url: urlStr, ok: false, error: 'File exceeds 50 MB limit (by Content-Length)' });
        continue;
      }

      const arrayBuffer = await resp.arrayBuffer();
      if (arrayBuffer.byteLength > 50 * 1024 * 1024) {
        results.push({ url: urlStr, ok: false, error: 'File exceeds 50 MB limit' });
        continue;
      }

      const filename = decodeURIComponent(parsedUrl.pathname.split('/').pop() || 'import')
        .replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase() || 'import';
      const ext = filename.includes('.') ? '' : (contentType.split('/')[1] || 'bin');
      const safeFilename = filename + (ext ? '.' + ext : '');
      const r2Key = `${brand}/${category}/${Date.now()}_${safeFilename}`;

      await env.MEDIA_BUCKET.put(r2Key, arrayBuffer, {
        httpMetadata: { contentType },
        customMetadata: { brand, category, sourceUrl: urlStr.slice(0, 500), uploadedBy: user.id },
      });

      if (env.DB) {
        const assetId = crypto.randomUUID();
        const title = filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').slice(0, 255) || 'Imported file';
        const mediaType = contentType.startsWith('video') ? 'video' : contentType.startsWith('audio') ? 'audio'
          : contentType === 'application/pdf' ? 'document' : 'image';
        await env.DB.prepare(
          `INSERT INTO cms_assets
             (id, brand, category, title, alt_text, file_path, media_type, mime_type,
              file_size, tags, review_status, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`
        ).bind(assetId, brand, category, title, '', r2Key, mediaType,
          contentType, arrayBuffer.byteLength, tagsJson, user.id).run();
      }

      await logAudit(env.DB, user.id, 'upload_url', 'file', r2Key, { sourceUrl: urlStr });
      results.push({ url: urlStr, ok: true, r2Key, url_path: `/api/cms/media/${r2Key}` });

    } catch (err) {
      results.push({ url: urlStr, ok: false, error: err?.message || 'Fetch failed' });
    }
  }

  return jsonResponse({ results }, 207);
}

/**
 * GET /api/cms/media/* — Serve file from R2 (authenticated admin/preview only)
 */
async function handleServeMedia(r2Key, env) {
  if (!env.MEDIA_BUCKET) {
    return errorResponse('R2 not configured', 503);
  }

  const object = await env.MEDIA_BUCKET.get(r2Key);
  if (!object) return errorResponse('File not found', 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  // Private — instruct browsers and CDN not to cache publicly
  headers.set('Cache-Control', 'private, no-store');
  headers.set('ETag', object.httpEtag);

  return new Response(object.body, { headers });
}

/**
 * GET /api/cms/pub/:r2Key — Serve APPROVED assets publicly (safe for embedding on public pages)
 * Returns 404 for any asset whose review_status != 'approved', so unapproved
 * media can never be served to visitors even if the key leaks.
 *
 * Uses the Cloudflare Cache API so approved assets are served from edge cache
 * on subsequent requests (no D1 or R2 hit).  Cache is purged automatically
 * when/if an asset is rejected via handleReviewAsset.
 */
async function handleServePublicMedia(request, r2Key, env) {
  if (!env.MEDIA_BUCKET) {
    return errorResponse('R2 not configured', 503);
  }

  // ── Cloudflare Cache API lookup ──────────────────────────────
  // Use a normalized cache key URL (strip any QS to avoid cache fragmentation)
  const cacheKey = new Request(new URL('/api/cms/pub/' + r2Key, request.url).toString(), {
    method: 'GET',
  });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // ── Gatecheck — only approved assets may be publicly served ──
  if (env.DB) {
    const asset = await env.DB.prepare(
      'SELECT review_status FROM cms_assets WHERE file_path = ? LIMIT 1'
    ).bind(r2Key).first();
    if (!asset || asset.review_status !== 'approved') {
      return errorResponse('Not found', 404);
    }
  } else {
    // D1 unavailable — fail-safe: refuse rather than expose
    return errorResponse('Media catalog unavailable', 503);
  }

  const object = await env.MEDIA_BUCKET.get(r2Key);
  if (!object) return errorResponse('File not found', 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  // Long cache — new version = new R2 key, so this key never stales while approved
  headers.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
  headers.set('ETag', object.httpEtag);

  const response = new Response(object.body, { headers });
  // Store in Cloudflare edge cache (non-blocking)
  await cache.put(cacheKey, response.clone());
  return response;
}

/**
 * POST /api/cms/assets/bulk-approve — Approve all draft assets matching optional brand/category filters
 * Body: { brand?, category?, confirm: true }
 * Returns: { approved: N }
 */
async function handleBulkApproveAssets(request, user, env) {
  if (!env.DB) return errorResponse('DB not configured', 503);

  let body = {};
  try { body = await request.json(); } catch { /* body is optional */ }

  if (!body.confirm) {
    return errorResponse('Must pass confirm:true to bulk-approve', 400);
  }

  const brandFilter = body.brand || null;
  const categoryFilter = body.category || null;
  const statusFilter = body.from_status || 'draft';

  let query = `UPDATE cms_assets SET review_status='approved', approved_by=?, approved_at=datetime('now'), updated_at=datetime('now') WHERE review_status=?`;
  const bindings = [user.id, statusFilter];

  if (brandFilter) { query += ' AND brand=?'; bindings.push(brandFilter); }
  if (categoryFilter) { query += ' AND category=?'; bindings.push(categoryFilter); }

  const result = await env.DB.prepare(query).bind(...bindings).run();
  const approved = result.meta?.changes || 0;

  await logAudit(env.DB, user.id, 'bulk_approve', 'asset', null, { brand: brandFilter, category: categoryFilter, approved });
  return jsonResponse({ success: true, approved });
}

/**
 * POST /api/cms/assets/:id/approve — Mark an asset as approved for public use
 * POST /api/cms/assets/:id/reject  — Mark an asset as rejected
 */
async function handleReviewAsset(request, assetId, action, user, env) {
  if (!env.DB) return errorResponse('DB not configured', 503);

  const status = action === 'approve' ? 'approved' : 'rejected';
  const result = await env.DB.prepare(
    `UPDATE cms_assets
       SET review_status = ?, approved_by = ?, approved_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`
  ).bind(status, user.id, assetId).run();

  if (!result.meta?.changes) return errorResponse('Asset not found', 404);

  // When rejecting, purge the asset from Cloudflare edge cache so it
  // stops being served publicly without waiting for TTL expiry.
  if (action === 'reject' && env.DB) {
    try {
      const row = await env.DB.prepare('SELECT file_path FROM cms_assets WHERE id = ? LIMIT 1')
        .bind(assetId).first();
      if (row?.file_path) {
        const cacheKey = new Request(
          new URL('/api/cms/pub/' + row.file_path, request.url).toString(),
          { method: 'GET' }
        );
        await caches.default.delete(cacheKey);
      }
    } catch { /* non-fatal — cache TTL will expire it anyway */ }
  }

  await logAudit(env.DB, user.id, action, 'asset', assetId, { review_status: status });
  return jsonResponse({ success: true, review_status: status });
}

// ────────────────────────────────────────────────────────────────
//  Social Post Handlers
// ────────────────────────────────────────────────────────────────

/**
 * GET /api/cms/social — List social posts
 * Query params: brand, platform, status, limit
 */
async function handleListSocialPosts(request, env) {
  const url = new URL(request.url);
  const brand = url.searchParams.get('brand');
  const platform = url.searchParams.get('platform');
  const status = url.searchParams.get('status');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);

  let query = 'SELECT * FROM cms_social_posts WHERE 1=1';
  const bindings = [];

  if (brand) { query += ' AND brand = ?'; bindings.push(brand); }
  if (platform) { query += ' AND platform = ?'; bindings.push(platform); }
  if (status) { query += ' AND status = ?'; bindings.push(status); }

  query += ' ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT ?';
  bindings.push(limit);

  const stmt = bindings.length > 0
    ? env.DB.prepare(query).bind(...bindings)
    : env.DB.prepare(query);
  const { results } = await stmt.all();

  return jsonResponse(results || []);
}

/**
 * POST /api/cms/social — Create social post draft / schedule
 */
async function handleCreateSocialPost(request, user, env) {
  const data = await request.json();
  const { brand, platform, content, scheduled_at } = data;

  if (!platform || !content) {
    return errorResponse('platform and content required');
  }

  const rule = platformRule(platform);
  if (content.length > rule.maxChars) {
    return errorResponse(`Content exceeds ${platform} limit (${content.length}/${rule.maxChars})`);
  }
  if (countHashtags(content) > rule.maxHashtags) {
    return errorResponse(`Too many hashtags for ${platform} (max ${rule.maxHashtags})`);
  }

  const now = new Date().toISOString();
  const status = scheduled_at ? 'scheduled' : 'draft';

  const result = await env.DB.prepare(`
    INSERT INTO cms_social_posts (brand, platform, content, media_ids, scheduled_at, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    brand || 'gfv',
    platform,
    content,
    JSON.stringify(data.media_ids || []),
    scheduled_at || null,
    status,
    user.id,
    now,
    now
  ).run();

  await logAudit(env.DB, user.id, 'social.create', 'social_post', String(result.meta?.last_row_id || ''), { platform, status });

  return jsonResponse({ id: result.meta?.last_row_id, status, message: 'Social post created' }, 201);
}

/**
 * PUT /api/cms/social — Update social post
 */
async function handleUpdateSocialPost(request, user, env) {
  const data = await request.json();
  if (!data.id) return errorResponse('id required');

  const now = new Date().toISOString();
  const status = data.scheduled_at ? 'scheduled' : (data.status || 'draft');

  await env.DB.prepare(`
    UPDATE cms_social_posts SET
      brand = COALESCE(?, brand),
      platform = COALESCE(?, platform),
      content = COALESCE(?, content),
      media_ids = COALESCE(?, media_ids),
      scheduled_at = ?,
      status = ?,
      updated_at = ?
    WHERE id = ?
  `).bind(
    data.brand || null,
    data.platform || null,
    data.content || null,
    data.media_ids ? JSON.stringify(data.media_ids) : null,
    data.scheduled_at || null,
    status,
    now,
    data.id
  ).run();

  await logAudit(env.DB, user.id, 'social.update', 'social_post', String(data.id), data);

  return jsonResponse({ message: 'Social post updated' });
}

/**
 * DELETE /api/cms/social?id=...
 */
async function handleDeleteSocialPost(request, user, env) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return errorResponse('id required');

  await env.DB.prepare('DELETE FROM cms_social_posts WHERE id = ?').bind(id).run();
  await logAudit(env.DB, user.id, 'social.delete', 'social_post', id, {});

  return jsonResponse({ message: 'Social post deleted' });
}

async function handleListSocialVariants(request, env) {
  await ensureCampaignSchema(env.DB);

  const url = new URL(request.url);
  const brand = url.searchParams.get('brand');
  const platform = url.searchParams.get('platform');
  const status = url.searchParams.get('status');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 500);

  let query = `
    SELECT
      v.id, v.post_id, v.platform, v.content, v.media_asset_id, v.format,
      v.char_count, v.hashtags, v.scheduled_at, v.status,
      v.external_url, v.error_message, v.published_at,
      sp.brand, sp.campaign_id,
      c.name as campaign_name,
      a.title as asset_title, a.thumbnail_path, a.file_path
    FROM cms_post_variants v
    JOIN cms_social_posts sp ON sp.id = v.post_id
    LEFT JOIN cms_campaigns c ON c.id = sp.campaign_id
    LEFT JOIN cms_assets a ON a.id = v.media_asset_id
    WHERE 1=1
  `;
  const bindings = [];

  if (brand) { query += ' AND sp.brand = ?'; bindings.push(brand); }
  if (platform) { query += ' AND v.platform = ?'; bindings.push(platform); }
  if (status) { query += ' AND v.status = ?'; bindings.push(status); }

  query += ' ORDER BY COALESCE(v.scheduled_at, v.created_at) DESC LIMIT ?';
  bindings.push(limit);

  const { results } = await env.DB.prepare(query).bind(...bindings).all();
  return jsonResponse(results || []);
}

/**
 * PATCH /api/cms/social/variants/:id — Attach or detach artwork on a variant
 * Body: { media_asset_id: string|null }
 */
async function handlePatchVariant(request, user, env, variantId) {
  if (!env.DB) return errorResponse('DB not configured', 503);
  let body = {};
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }

  const mediaAssetId = body.media_asset_id !== undefined ? body.media_asset_id : undefined;
  if (mediaAssetId === undefined) return errorResponse('media_asset_id is required', 400);

  // Verify variant exists and belongs to a brand the admin can modify
  const variant = await env.DB.prepare('SELECT v.id, sp.brand FROM cms_post_variants v JOIN cms_social_posts sp ON sp.id = v.post_id WHERE v.id = ?').bind(variantId).first();
  if (!variant) return errorResponse('Variant not found', 404);

  // If linking an asset, verify it exists
  let assetTitle = null;
  let thumbnailPath = null;
  if (mediaAssetId) {
    const asset = await env.DB.prepare('SELECT id, title, thumbnail_path, file_path FROM cms_assets WHERE id = ?').bind(mediaAssetId).first();
    if (!asset) return errorResponse('Asset not found', 404);
    assetTitle = asset.title;
    thumbnailPath = asset.thumbnail_path || asset.file_path;
  }

  await env.DB.prepare(
    `UPDATE cms_post_variants SET media_asset_id = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(mediaAssetId || null, variantId).run();

  await logAudit(env.DB, user.id, 'attach_asset', 'variant', variantId, { media_asset_id: mediaAssetId, brand: variant.brand });
  return jsonResponse({ success: true, variant_id: variantId, media_asset_id: mediaAssetId, asset_title: assetTitle, thumbnail_path: thumbnailPath });
}

async function handleCreateCampaignSocialPost(request, user, env) {
  await ensureCampaignSchema(env.DB);

  const data = await request.json();
  const brand = data.brand || 'gfd';
  const baseContent = (data.content || '').trim();
  const platforms = Array.isArray(data.platforms)
    ? data.platforms.map(p => String(p).toLowerCase()).filter(Boolean)
    : [];
  const mediaAssetId = data.media_asset_id || '';
  const scheduledAt = data.scheduled_at || null;

  if (!baseContent) return errorResponse('content is required');
  if (platforms.length === 0) return errorResponse('platforms[] is required');

  const now = new Date().toISOString();
  const hashtagArray = Array.isArray(data.hashtags) ? data.hashtags : [];
  const normalizedHashtags = hashtagArray
    .map(h => String(h || '').trim().replace(/^#/, ''))
    .filter(Boolean);

  const baseStatus = scheduledAt ? 'scheduled' : 'draft';
  const mediaIds = mediaAssetId ? [mediaAssetId] : [];

  const insertPost = await env.DB.prepare(`
    INSERT INTO cms_social_posts (
      brand, platform, content, media_ids, scheduled_at, status,
      created_by, created_at, updated_at, campaign_id, objective, watermark_profile
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    brand,
    'multi',
    baseContent,
    JSON.stringify(mediaIds),
    scheduledAt,
    baseStatus,
    user.id,
    now,
    now,
    data.campaign_id || null,
    data.objective || '',
    data.watermark_profile || (data.watermark_enabled ? 'default' : '')
  ).run();

  const postId = insertPost.meta?.last_row_id;
  const variants = [];

  for (const platform of platforms) {
    const overrides = data.platform_overrides?.[platform] || {};
    const rule = platformRule(platform);
    const format = overrides.format || data.default_format || rule.defaultFormat;
    const content = (overrides.content || baseContent).trim();
    const hashtagString = normalizedHashtags.map(h => `#${h}`).join(' ');
    const composedContent = hashtagString ? `${content}\n\n${hashtagString}` : content;
    const charCount = composedContent.length;

    if (charCount > rule.maxChars) {
      return errorResponse(
        `Content exceeds ${platform} limit (${charCount}/${rule.maxChars}). Use platform overrides.`
      );
    }

    if (normalizedHashtags.length > rule.maxHashtags) {
      return errorResponse(
        `Too many hashtags for ${platform} (${normalizedHashtags.length}/${rule.maxHashtags}).`
      );
    }

    const variantStatus = scheduledAt ? 'pending' : 'draft';
    const insertVariant = await env.DB.prepare(`
      INSERT INTO cms_post_variants (
        post_id, platform, content, media_asset_id, format, char_count,
        hashtags, scheduled_at, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      postId,
      platform,
      composedContent,
      mediaAssetId,
      format,
      charCount,
      JSON.stringify(normalizedHashtags),
      scheduledAt,
      variantStatus,
      now
    ).run();

    variants.push({
      id: insertVariant.meta?.last_row_id,
      platform,
      status: variantStatus,
      format,
      char_count: charCount,
    });
  }

  await logAudit(env.DB, user.id, 'social.campaign.create', 'social_post', String(postId), {
    campaign_id: data.campaign_id || null,
    platforms,
    scheduled_at: scheduledAt,
    watermark_enabled: !!data.watermark_enabled,
  });

  return jsonResponse({
    post_id: postId,
    status: baseStatus,
    variants,
  }, 201);
}

// ────────────────────────────────────────────────────────────────
//  Brand Registry
// ────────────────────────────────────────────────────────────────

const BRAND_DEFINITIONS = {
  gfd:             { name: 'Good Flippin Design',  domain: 'goodflippindesign.com',  color: '#6c63ff', platforms: ['instagram','linkedin','x'] },
  gfv:             { name: 'Good Flippin Vibes',   domain: 'goodflippinvibes.com',   color: '#10b981', platforms: ['instagram','x','facebook','tiktok','pinterest'] },
  aiaimate:        { name: 'AI Aimate',            domain: 'aiaimate.com',           color: '#3b82f6', platforms: ['linkedin','x','youtube'] },
  culturesherpa:   { name: 'CultureSherpa',        domain: 'culturesherpa.org',      color: '#f59e0b', platforms: ['instagram','x','facebook','linkedin'] },
  globaldeets:     { name: 'Global Deets',         domain: 'globaldeets.com',        color: '#8b5cf6', platforms: ['linkedin','x'] },
  citizenapproved: { name: 'CitizenApproved',      domain: 'citizenapproved.org',    color: '#ef4444', platforms: ['instagram','facebook','linkedin','x'] },
};

/**
 * GET /api/cms/brands
 * Returns all brands with workflow config, connection counts, and social account counts.
 */
async function handleListBrands(env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);

  const [connectionsResult, accountsResult, workflowsResult] = await Promise.all([
    env.DB.prepare(`
      SELECT brand, COUNT(*) as connection_count
      FROM cms_platform_tokens WHERE is_active = 1
      GROUP BY brand
    `).all(),
    env.DB.prepare(`
      SELECT brand, COUNT(*) as account_count
      FROM social_accounts
      GROUP BY brand
    `).all(),
    env.DB.prepare('SELECT * FROM brand_workflows').all(),
  ]);

  const connMap = Object.fromEntries((connectionsResult.results || []).map(r => [r.brand, r.connection_count]));
  const accountMap = Object.fromEntries((accountsResult.results || []).map(r => [r.brand, r.account_count]));
  const workflowMap = Object.fromEntries((workflowsResult.results || []).map(r => [r.brand, r]));

  const brands = Object.entries(BRAND_DEFINITIONS).map(([id, def]) => {
    const wf = workflowMap[id] || {};
    return {
      id,
      ...def,
      connection_count: connMap[id] || 0,
      account_count: accountMap[id] || 0,
      workflow: {
        enabled_platforms: safeJSON(wf.enabled_platforms, def.platforms),
        default_cadence: wf.default_cadence || 'weekly',
        require_approval: wf.require_approval || 0,
        auto_cross_post: safeJSON(wf.auto_cross_post, []),
        hashtag_sets: safeJSON(wf.hashtag_sets, {}),
        post_time_utc: wf.post_time_utc || '14:00',
        post_days: safeJSON(wf.post_days, [1,2,3,4,5]),
        timezone: wf.timezone || 'America/New_York',
      },
    };
  });

  return jsonResponse({ brands });
}

function safeJSON(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

// ────────────────────────────────────────────────────────────────
//  Social Accounts (brand × platform handle registry)
// ────────────────────────────────────────────────────────────────

/**
 * GET /api/cms/social-accounts?brand=&platform=
 */
async function handleListSocialAccounts(request, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);

  const url = new URL(request.url);
  const brand = url.searchParams.get('brand');
  const platform = url.searchParams.get('platform');

  let query = 'SELECT * FROM social_accounts WHERE 1=1';
  const params = [];
  if (brand) { query += ' AND brand = ?'; params.push(brand); }
  if (platform) { query += ' AND platform = ?'; params.push(platform); }
  query += ' ORDER BY brand ASC, platform ASC, is_primary DESC';

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return jsonResponse({ accounts: results || [] });
}

/**
 * Compute a stable 16-hex-char fingerprint for a brand+platform+platformUserId triplet.
 * Used to verify that a social_accounts row is bound to the correct cms_platform_tokens entry.
 * SHA-256("brand|platform|platformUserId") → first 16 hex chars.
 */
async function computeTokenFingerprint(brand, platform, platformUserId) {
  const input = `${brand}|${platform}|${platformUserId}`;
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const hex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 16);
}

/**
 * POST /api/cms/social-accounts
 * Body: { brand, platform, handle, display_name?, profile_url?, bio?, followers_count?,
 *         verified?, is_primary?, platform_user_id? }
 */
async function handleUpsertSocialAccount(request, user, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  if (!user) return errorResponse('Unauthorized', 401);

  const data = await request.json().catch(() => null);
  if (!data?.brand || !data?.platform || !data?.handle) {
    return errorResponse('brand, platform, and handle are required', 400);
  }
  if (!BRAND_DEFINITIONS[data.brand]) return errorResponse('Unknown brand', 400);

  const now = new Date().toISOString();
  const platformUserId = data.platform_user_id || '';
  const fingerprint = platformUserId ? await computeTokenFingerprint(data.brand, data.platform, platformUserId) : '';
  const linkStatus = platformUserId ? 'linked' : 'unlinked';

  await env.DB.prepare(`
    INSERT INTO social_accounts (brand, platform, handle, display_name, profile_url, bio,
      followers_count, following_count, post_count, verified, is_primary, last_synced,
      platform_user_id, token_fingerprint, link_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(brand, platform, handle) DO UPDATE SET
      display_name = excluded.display_name,
      profile_url = excluded.profile_url,
      bio = excluded.bio,
      followers_count = excluded.followers_count,
      following_count = excluded.following_count,
      post_count = excluded.post_count,
      verified = excluded.verified,
      is_primary = excluded.is_primary,
      last_synced = excluded.last_synced,
      platform_user_id = CASE WHEN excluded.platform_user_id != '' THEN excluded.platform_user_id ELSE platform_user_id END,
      token_fingerprint = CASE WHEN excluded.token_fingerprint != '' THEN excluded.token_fingerprint ELSE token_fingerprint END,
      link_status = CASE WHEN excluded.platform_user_id != '' THEN excluded.link_status ELSE link_status END,
      updated_at = excluded.updated_at
  `).bind(
    data.brand, data.platform, data.handle,
    data.display_name || '', data.profile_url || '', data.bio || '',
    data.followers_count || 0, data.following_count || 0, data.post_count || 0,
    data.verified ? 1 : 0, data.is_primary !== false ? 1 : 0,
    now, platformUserId, fingerprint, linkStatus, now, now
  ).run();

  await logAudit(env.DB, user.id, 'social.account.upsert', 'social_account',
    `${data.brand}:${data.platform}:${data.handle}`, { brand: data.brand, platform: data.platform });

  return jsonResponse({ ok: true }, 201);
}

/**
 * POST /api/cms/social-accounts/populate
 * Reads all active cms_platform_tokens entries and auto-creates/updates the matching
 * social_accounts rows with platform_user_id = account_id and a verified token_fingerprint.
 * Also writes token_fingerprint + social_account_id back to cms_platform_tokens.
 * Body: { brand? }  — omit brand to populate all brands.
 */
async function handlePopulateSocialAccounts(request, user, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  if (!user) return errorResponse('Unauthorized', 401);

  const body = await request.json().catch(() => ({}));
  const filterBrand = body.brand || null;

  let query = 'SELECT id, brand, platform, account_id, account_label FROM cms_platform_tokens WHERE is_active = 1';
  const params = [];
  if (filterBrand) { query += ' AND brand = ?'; params.push(filterBrand); }
  query += ' ORDER BY brand, platform';

  const { results: tokens } = await env.DB.prepare(query).bind(...params).all();
  if (!tokens?.length) return jsonResponse({ ok: true, populated: 0, accounts: [] });

  const now = new Date().toISOString();
  const populated = [];

  for (const token of tokens) {
    const { id: tokenId, brand, platform, account_id: platformUserId, account_label } = token;
    if (!platformUserId) continue; // skip if no external ID stored

    // Derive a canonical handle: strip leading @ from label, fallback to platformUserId
    const handle = (account_label || '').replace(/^@/, '') || String(platformUserId);
    const displayName = account_label || '';
    const fingerprint = await computeTokenFingerprint(brand, platform, String(platformUserId));

    // Upsert social_accounts by (brand, platform, handle)
    await env.DB.prepare(`
      INSERT INTO social_accounts
        (brand, platform, handle, display_name, platform_user_id, token_fingerprint,
         link_status, last_synced, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'linked', ?, ?, ?)
      ON CONFLICT(brand, platform, handle) DO UPDATE SET
        display_name      = excluded.display_name,
        platform_user_id  = excluded.platform_user_id,
        token_fingerprint = excluded.token_fingerprint,
        link_status       = 'linked',
        last_synced       = excluded.last_synced,
        updated_at        = excluded.updated_at
    `).bind(brand, platform, handle, displayName, String(platformUserId), fingerprint, now, now, now).run();

    // Retrieve the social_account id for back-reference
    const acctRow = await env.DB.prepare(
      'SELECT id FROM social_accounts WHERE brand = ? AND platform = ? AND handle = ?'
    ).bind(brand, platform, handle).first();
    const socialAccountId = acctRow?.id || null;

    // Write fingerprint + social_account_id back to the token row
    await env.DB.prepare(`
      UPDATE cms_platform_tokens
      SET token_fingerprint = ?, social_account_id = ?, updated_at = ?
      WHERE id = ?
    `).bind(fingerprint, socialAccountId, now, tokenId).run();

    populated.push({ brand, platform, handle, platform_user_id: String(platformUserId), fingerprint, social_account_id: socialAccountId });
  }

  await logAudit(env.DB, user.id, 'social.account.populate', 'social_accounts', 'bulk',
    { count: populated.length, brand: filterBrand || 'all' });

  return jsonResponse({ ok: true, populated: populated.length, accounts: populated });
}

/**
 * DELETE /api/cms/social-accounts?id=
 */
async function handleDeleteSocialAccount(request, user, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  if (!user) return errorResponse('Unauthorized', 401);

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse('id required', 400);

  await env.DB.prepare('DELETE FROM social_accounts WHERE id = ?').bind(id).run();
  await logAudit(env.DB, user.id, 'social.account.delete', 'social_account', id, {});
  return jsonResponse({ ok: true });
}

// ────────────────────────────────────────────────────────────────
//  Brand Workflows
// ────────────────────────────────────────────────────────────────

/**
 * GET /api/cms/brand-workflows?brand=
 */
async function handleListBrandWorkflows(request, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);

  const brand = new URL(request.url).searchParams.get('brand');
  let query = 'SELECT * FROM brand_workflows';
  const params = [];
  if (brand) { query += ' WHERE brand = ?'; params.push(brand); }
  query += ' ORDER BY brand ASC';

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return jsonResponse({ workflows: results || [] });
}

/**
 * PUT /api/cms/brand-workflows
 * Body: { brand, enabled_platforms?, default_cadence?, require_approval?,
 *         auto_cross_post?, hashtag_sets?, post_time_utc?, post_days?, timezone?, notes? }
 */
async function handleUpdateBrandWorkflow(request, user, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  if (!user) return errorResponse('Unauthorized', 401);

  const data = await request.json().catch(() => null);
  if (!data?.brand) return errorResponse('brand is required', 400);
  if (!BRAND_DEFINITIONS[data.brand]) return errorResponse('Unknown brand', 400);

  const fields = [];
  const params = [];

  const jsonFields = ['enabled_platforms', 'auto_cross_post', 'post_days', 'hashtag_sets'];
  const scalarFields = ['default_cadence', 'require_approval', 'post_time_utc', 'timezone', 'notes'];

  for (const f of jsonFields) {
    if (data[f] !== undefined) {
      fields.push(`${f} = ?`);
      params.push(typeof data[f] === 'string' ? data[f] : JSON.stringify(data[f]));
    }
  }
  for (const f of scalarFields) {
    if (data[f] !== undefined) {
      fields.push(`${f} = ?`);
      params.push(data[f]);
    }
  }

  if (fields.length === 0) return errorResponse('Nothing to update', 400);

  fields.push('updated_by = ?', 'updated_at = ?');
  params.push(user.id, new Date().toISOString(), data.brand);

  await env.DB.prepare(`UPDATE brand_workflows SET ${fields.join(', ')} WHERE brand = ?`)
    .bind(...params).run();

  await logAudit(env.DB, user.id, 'brand.workflow.update', 'brand_workflow', data.brand, data);
  return jsonResponse({ ok: true });
}

// ────────────────────────────────────────────────────────────────
//  Cross-Brand Syndication
// ────────────────────────────────────────────────────────────────

/**
 * GET /api/cms/cross-posts?source_post_id=&status=
 */
async function handleListCrossPosts(request, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);

  const url = new URL(request.url);
  const sourcePostId = url.searchParams.get('source_post_id');
  const status = url.searchParams.get('status');

  let query = 'SELECT * FROM cross_post_links WHERE 1=1';
  const params = [];
  if (sourcePostId) { query += ' AND source_post_id = ?'; params.push(sourcePostId); }
  if (status) { query += ' AND status = ?'; params.push(status); }
  query += ' ORDER BY created_at DESC LIMIT 100';

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return jsonResponse({ cross_posts: results || [] });
}

/**
 * POST /api/cms/cross-posts
 * Body: { source_post_id, target_brand, adapted_content? }
 * Creates a syndication link — schedules the post for the target brand.
 */
async function handleCreateCrossPost(request, user, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  if (!user) return errorResponse('Unauthorized', 401);

  const data = await request.json().catch(() => null);
  if (!data?.source_post_id || !data?.target_brand) {
    return errorResponse('source_post_id and target_brand are required', 400);
  }
  if (!BRAND_DEFINITIONS[data.target_brand]) return errorResponse('Unknown target brand', 400);

  const now = new Date().toISOString();
  const result = await env.DB.prepare(`
    INSERT OR IGNORE INTO cross_post_links (source_post_id, target_brand, adapted_content, status, created_at)
    VALUES (?, ?, ?, 'queued', ?)
  `).bind(
    String(data.source_post_id),
    data.target_brand,
    data.adapted_content || '',
    now
  ).run();

  await logAudit(env.DB, user.id, 'cross_post.create', 'cross_post_link',
    `${data.source_post_id}→${data.target_brand}`, data);

  return jsonResponse({ ok: true, id: result.meta?.last_row_id }, 201);
}

/**
 * GET /api/cms/ecosystem-calendar?from=&to=&brands=
 * Cross-brand scheduled post calendar view.
 */
async function handleEcosystemCalendar(request, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);

  const url = new URL(request.url);
  const from = url.searchParams.get('from') || new Date().toISOString().slice(0, 10);
  const to = url.searchParams.get('to') || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const brands = url.searchParams.get('brands')?.split(',').filter(Boolean) || Object.keys(BRAND_DEFINITIONS);

  const placeholders = brands.map(() => '?').join(',');
  const { results } = await env.DB.prepare(`
    SELECT
      v.id, v.post_id, v.platform, v.status, v.scheduled_at, v.brand,
      sp.content_body, sp.campaign_id,
      c.name as campaign_name
    FROM cms_post_variants v
    JOIN cms_social_posts sp ON sp.id = v.post_id
    LEFT JOIN cms_campaigns c ON c.id = sp.campaign_id
    WHERE v.brand IN (${placeholders})
      AND v.scheduled_at BETWEEN ? AND ?
      AND v.status IN ('scheduled', 'pending', 'published')
    ORDER BY v.scheduled_at ASC
    LIMIT 500
  `).bind(...brands, from + 'T00:00:00Z', to + 'T23:59:59Z').all();

  return jsonResponse({ events: results || [], from, to, brands });
}

async function handleListConnections(request, env) {
  const url = new URL(request.url);
  const brand = url.searchParams.get('brand');
  const platform = url.searchParams.get('platform');

  let query = `
    SELECT id, brand, platform, account_label, account_id, is_active,
           last_used_at, created_at, updated_at
    FROM cms_platform_tokens
    WHERE 1=1
  `;
  const bindings = [];

  if (brand) { query += ' AND brand = ?'; bindings.push(brand); }
  if (platform) { query += ' AND platform = ?'; bindings.push(platform); }

  query += ' ORDER BY brand ASC, platform ASC, updated_at DESC';

  const { results } = await env.DB.prepare(query).bind(...bindings).all();
  return jsonResponse(results || []);
}

async function handleUpsertConnection(request, user, env) {
  const data = await request.json();
  if (!data.brand || !data.platform || !data.account_id) {
    return errorResponse('brand, platform, and account_id are required');
  }

  const payloadInput = typeof data.payload === 'string'
    ? data.payload
    : JSON.stringify(data.payload || {
      access_token: data.access_token || '',
      refresh_token: data.refresh_token || '',
      expires_at: data.expires_at || '',
      scope: data.scope || '',
    });

  const payload = await encodeConnectionPayloadForStorage(payloadInput, env.TOKEN_ENCRYPTION_KEY);

  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO cms_platform_tokens (
      brand, platform, account_label, account_id, encrypted_payload,
      is_active, updated_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(brand, platform, account_id) DO UPDATE SET
      account_label = excluded.account_label,
      encrypted_payload = excluded.encrypted_payload,
      is_active = 1,
      updated_at = excluded.updated_at
  `).bind(
    data.brand,
    data.platform,
    data.account_label || '',
    data.account_id,
    payload,
    now
  ).run();

  await logAudit(env.DB, user.id, 'social.connection.upsert', 'platform_token', `${data.brand}:${data.platform}:${data.account_id}`, {
    brand: data.brand,
    platform: data.platform,
  });

  return jsonResponse({ message: 'Connection saved' }, 201);
}

async function handleDeleteConnection(request, user, env) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return errorResponse('id required');

  await env.DB.prepare('UPDATE cms_platform_tokens SET is_active = 0, updated_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), id)
    .run();

  await logAudit(env.DB, user.id, 'social.connection.deactivate', 'platform_token', id, {});

  return jsonResponse({ message: 'Connection deactivated' });
}

// Lightweight profile endpoints per platform for token verification
const CONN_TEST_ENDPOINTS = {
  linkedin:  { url: 'https://api.linkedin.com/v2/userinfo', authHeader: true },
  x:         { url: 'https://api.twitter.com/2/users/me', authHeader: true },
  instagram: { url: 'https://graph.instagram.com/me?fields=id,username', authHeader: false },
  facebook:  { url: 'https://graph.facebook.com/me', authHeader: false },
  tiktok:    { url: 'https://open.tiktokapis.com/v2/user/info/?fields=open_id', authHeader: true },
  pinterest: { url: 'https://api.pinterest.com/v5/user_account', authHeader: true },
  youtube:   { url: 'https://www.googleapis.com/youtube/v3/channels?part=id&mine=true', authHeader: true },
};

async function handleTestConnection(request, user, env) {
  const parts = new URL(request.url).pathname.split('/');
  // path: /connections/:id/test
  const id = parts[parts.length - 2];
  if (!id || isNaN(Number(id))) return errorResponse('Invalid connection ID', 400);

  const row = await env.DB.prepare(
    'SELECT * FROM cms_platform_tokens WHERE id = ? AND is_active = 1'
  ).bind(id).first();
  if (!row) return errorResponse('Connection not found', 404);

  // Decrypt payload
  let tokenData = {};
  const raw = row.encrypted_payload || '';
  let plaintext = raw.startsWith('{') ? raw : null;
  if (!plaintext && raw && env.TOKEN_ENCRYPTION_KEY) {
    plaintext = await decryptAesGcm(raw, env.TOKEN_ENCRYPTION_KEY);
  }
  if (plaintext) {
    try { tokenData = JSON.parse(plaintext); } catch (_e) { tokenData = { access_token: plaintext }; }
  }

  const token = tokenData.access_token || tokenData.token || '';
  const now = new Date().toISOString();

  if (!token) {
    return jsonResponse({ ok: false, error: 'No access token in payload', platform: row.platform, checked_at: now });
  }

  // Check expiry before hitting the network
  if (tokenData.expires_at) {
    const exp = new Date(tokenData.expires_at);
    if (!isNaN(exp.getTime()) && exp < new Date()) {
      return jsonResponse({ ok: false, error: 'Token expired at ' + tokenData.expires_at, platform: row.platform, checked_at: now });
    }
  }

  const testDef = CONN_TEST_ENDPOINTS[row.platform.toLowerCase()];
  if (!testDef) {
    return jsonResponse({ ok: null, error: 'No test endpoint for ' + row.platform, platform: row.platform, checked_at: now });
  }

  let testUrl = testDef.url;
  const headers = {};
  if (testDef.authHeader) {
    headers['Authorization'] = 'Bearer ' + token;
  } else {
    testUrl += (testUrl.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(token);
  }

  let ok = false;
  let errorMsg = null;
  try {
    const resp = await fetch(testUrl, { headers, signal: AbortSignal.timeout(8000) });
    ok = resp.status < 400;
    if (!ok) errorMsg = 'HTTP ' + resp.status;
  } catch (e) {
    errorMsg = e.message || 'Request failed';
  }

  if (ok) {
    await env.DB.prepare('UPDATE cms_platform_tokens SET last_used_at = ? WHERE id = ?')
      .bind(now, id).run();
    await logAudit(env.DB, user.id, 'social.connection.test', 'platform_token', id, { result: 'ok', platform: row.platform });
  }

  return jsonResponse({ ok, error: errorMsg, platform: row.platform, account_label: row.account_label, checked_at: now });
}

async function handleListCampaigns(request, env) {
  await ensureCampaignSchema(env.DB);

  const url = new URL(request.url);
  const brand = url.searchParams.get('brand') || 'gfd';
  const status = url.searchParams.get('status');

  let query = `
    SELECT
      c.*,
      COUNT(DISTINCT sp.id) as post_count,
      SUM(CASE WHEN v.status = 'published' THEN 1 ELSE 0 END) as published_variants,
      SUM(CASE WHEN v.status = 'pending' THEN 1 ELSE 0 END) as pending_variants,
      MIN(v.scheduled_at) as next_scheduled_at
    FROM cms_campaigns c
    LEFT JOIN cms_social_posts sp ON sp.campaign_id = c.id
    LEFT JOIN cms_post_variants v ON v.post_id = sp.id
    WHERE c.active = 1 AND c.brand = ?
  `;
  const bindings = [brand];

  if (status) {
    query += ' AND c.status = ?';
    bindings.push(status);
  }

  query += ' GROUP BY c.id ORDER BY COALESCE(c.start_date, c.created_at) DESC';

  const { results } = await env.DB.prepare(query).bind(...bindings).all();

  return jsonResponse((results || []).map((row) => ({
    ...row,
    platforms: JSON.parse(row.platforms || '[]'),
  })));
}

async function handleCreateCampaign(request, user, env) {
  await ensureCampaignSchema(env.DB);

  const data = await request.json();
  if (!data.name) return errorResponse('name is required');

  const now = new Date().toISOString();
  const result = await env.DB.prepare(`
    INSERT INTO cms_campaigns (
      brand, name, objective, cadence, platforms, start_date, end_date,
      status, notes, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    data.brand || 'gfd',
    data.name,
    data.objective || '',
    data.cadence || '',
    JSON.stringify(Array.isArray(data.platforms) ? data.platforms : []),
    data.start_date || null,
    data.end_date || null,
    data.status || 'planned',
    data.notes || '',
    user.id,
    now,
    now
  ).run();

  await logAudit(env.DB, user.id, 'campaign.create', 'campaign', String(result.meta?.last_row_id || ''), {
    name: data.name,
    brand: data.brand || 'gfd',
  });

  return jsonResponse({ id: result.meta?.last_row_id, message: 'Campaign created' }, 201);
}

async function handleUpdateCampaign(request, user, env) {
  await ensureCampaignSchema(env.DB);

  const data = await request.json();
  if (!data.id) return errorResponse('id is required');

  const existing = await env.DB.prepare('SELECT * FROM cms_campaigns WHERE id = ?')
    .bind(data.id)
    .first();
  if (!existing) return errorResponse('Campaign not found', 404);

  const now = new Date().toISOString();

  await env.DB.prepare(`
    UPDATE cms_campaigns SET
      name = ?, objective = ?, cadence = ?, platforms = ?,
      start_date = ?, end_date = ?, status = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    data.name ?? existing.name,
    data.objective ?? existing.objective,
    data.cadence ?? existing.cadence,
    JSON.stringify(Array.isArray(data.platforms) ? data.platforms : JSON.parse(existing.platforms || '[]')),
    data.start_date ?? existing.start_date,
    data.end_date ?? existing.end_date,
    data.status ?? existing.status,
    data.notes ?? existing.notes,
    now,
    data.id
  ).run();

  await logAudit(env.DB, user.id, 'campaign.update', 'campaign', String(data.id), data);

  return jsonResponse({ message: 'Campaign updated' });
}

async function handleDeleteCampaign(request, user, env) {
  await ensureCampaignSchema(env.DB);

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return errorResponse('id is required');

  await env.DB.prepare(
    'UPDATE cms_campaigns SET active = 0, updated_at = ? WHERE id = ?'
  ).bind(new Date().toISOString(), id).run();

  await logAudit(env.DB, user.id, 'campaign.delete', 'campaign', id, {});

  return jsonResponse({ message: 'Campaign archived' });
}

/**
 * POST /api/cms/campaigns/bulk-schedule
 * Body: {
 *   campaign_id: number|null,
 *   brand: string,
 *   platforms: string[],
 *   start_date: 'YYYY-MM-DD',
 *   posts_per_day: number,          // default 2
 *   post_times_utc: string[],       // e.g. ['14:00','20:00']
 *   entries: Array<{
 *     content: string,
 *     hashtags?: string[],
 *     asset_id?: string,
 *     platform_overrides?: Record<string, { content?: string; format?: string }>
 *   }>
 * }
 * Creates one cms_social_posts row + N variant rows (one per platform) for each entry.
 * Uses D1 batch() chunked at 100 for atomicity.
 */
async function handleBulkSchedule(request, user, env) {
  await ensureCampaignSchema(env.DB);

  const data = await request.json().catch(() => null);
  if (!data) return errorResponse('Invalid JSON body', 400);

  const {
    campaign_id = null,
    brand,
    platforms,
    start_date,
    posts_per_day = 2,
    post_times_utc,
    entries,
  } = data;

  if (!brand) return errorResponse('brand is required');
  if (!Array.isArray(platforms) || platforms.length === 0) return errorResponse('platforms[] is required');
  if (!start_date || !/^\d{4}-\d{2}-\d{2}$/.test(start_date)) return errorResponse('start_date must be YYYY-MM-DD');
  if (!Array.isArray(entries) || entries.length === 0) return errorResponse('entries[] is required and must not be empty');

  const ppd = Math.max(1, Math.min(10, parseInt(posts_per_day, 10) || 2));
  const rawTimes = Array.isArray(post_times_utc) && post_times_utc.length
    ? post_times_utc
    : ['14:00', '20:00'];
  // Normalise to HH:MM and slice to ppd slots
  const times = rawTimes
    .map(t => String(t || '14:00').trim().slice(0, 5))
    .slice(0, ppd);
  // Pad if fewer times than ppd (repeat last time)
  while (times.length < ppd) times.push(times[times.length - 1]);

  const now = new Date().toISOString();
  let skippedCount = 0;

  // ── Phase 1: insert parent posts ──────────────────────────────
  const postStatements = [];
  const validEntries = []; // track original indices of non-empty entries

  for (let i = 0; i < entries.length; i++) {
    const entry = typeof entries[i] === 'string'
      ? { content: entries[i] }
      : entries[i];
    const content = (entry.content || '').trim();
    if (!content) { skippedCount++; continue; }

    const dayOffset = Math.floor(validEntries.length / ppd);
    const timeIdx = validEntries.length % ppd;
    const [h, m] = times[timeIdx].split(':').map(Number);
    const dt = new Date(start_date + 'T00:00:00Z');
    dt.setUTCDate(dt.getUTCDate() + dayOffset);
    dt.setUTCHours(h, m || 0, 0, 0);
    const scheduledAt = dt.toISOString();

    const mediaIds = entry.asset_id ? [entry.asset_id] : [];
    postStatements.push(
      env.DB.prepare(`
        INSERT INTO cms_social_posts (
          brand, platform, content, media_ids, scheduled_at, status,
          created_by, created_at, updated_at, campaign_id, objective
        ) VALUES (?, 'multi', ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?)
      `).bind(
        brand, content,
        JSON.stringify(mediaIds),
        scheduledAt,
        user.id, now, now,
        campaign_id || null,
        entry.objective || ''
      )
    );
    validEntries.push({ entry, scheduledAt });
  }

  if (postStatements.length === 0) {
    return errorResponse('All entries were empty — nothing to schedule');
  }

  // Batch insert posts (chunk at 100)
  const CHUNK = 100;
  const postIds = [];
  for (let i = 0; i < postStatements.length; i += CHUNK) {
    const results = await env.DB.batch(postStatements.slice(i, i + CHUNK));
    for (const r of results) {
      postIds.push(r.meta?.last_row_id || null);
    }
  }

  // ── Phase 2: insert variants ──────────────────────────────────
  const variantStatements = [];
  const previewSlots = [];

  for (let idx = 0; idx < validEntries.length; idx++) {
    const postId = postIds[idx];
    if (!postId) continue;

    const { entry, scheduledAt } = validEntries[idx];
    const content = (entry.content || '').trim();
    const hashtags = Array.isArray(entry.hashtags)
      ? entry.hashtags.map(h => String(h).trim().replace(/^#/, '')).filter(Boolean)
      : [];
    const assetId = entry.asset_id || '';

    if (previewSlots.length < 20) {
      previewSlots.push({ slot: idx + 1, scheduled_at: scheduledAt, platforms, content: content.slice(0, 100) });
    }

    for (const platform of platforms) {
      const rule = platformRule(platform);
      const overrides = (entry.platform_overrides || {})[platform] || {};
      const baseContent = (overrides.content || content).trim();
      const hashtagString = hashtags.length ? hashtags.map(h => `#${h}`).join(' ') : '';
      const composedContent = hashtagString
        ? `${baseContent}\n\n${hashtagString}`
        : baseContent;

      // Respect platform char limits — truncate gracefully rather than fail the batch
      const finalContent = composedContent.length > rule.maxChars
        ? composedContent.slice(0, rule.maxChars - 1) + '…'
        : composedContent;

      variantStatements.push(
        env.DB.prepare(`
          INSERT INTO cms_post_variants (
            post_id, platform, content, media_asset_id, format,
            char_count, hashtags, scheduled_at, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        `).bind(
          postId, platform, finalContent, assetId,
          overrides.format || rule.defaultFormat,
          finalContent.length,
          JSON.stringify(hashtags),
          scheduledAt, now
        )
      );
    }
  }

  let variantsCreated = 0;
  for (let i = 0; i < variantStatements.length; i += CHUNK) {
    const results = await env.DB.batch(variantStatements.slice(i, i + CHUNK));
    variantsCreated += results.filter(r => Number(r.meta?.changes) > 0).length;
  }

  await logAudit(env.DB, user.id, 'campaign.bulk.schedule', 'campaign',
    String(campaign_id || 'general'), {
      brand, platforms,
      total_entries: entries.length,
      scheduled_posts: postIds.length,
      created_variants: variantsCreated,
      posts_per_day: ppd,
      start_date,
    });

  return jsonResponse({
    ok: true,
    scheduled_posts: postIds.length,
    created_variants: variantsCreated,
    skipped_empty: skippedCount,
    days_covered: Math.ceil(postIds.length / ppd),
    platforms_per_post: platforms.length,
    preview: previewSlots,
  }, 201);
}

async function handleCampaignCalendar(request, env) {
  await ensureCampaignSchema(env.DB);

  const url = new URL(request.url);
  const brand = url.searchParams.get('brand') || 'gfd';
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');

  const startDate = start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const endDate = end || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString();

  const { results } = await env.DB.prepare(`
    SELECT
      v.id as variant_id,
      v.post_id,
      v.platform,
      v.status,
      v.format,
      v.scheduled_at,
      v.published_at,
      v.external_url,
      v.error_message,
      v.char_count,
      sp.brand,
      sp.campaign_id,
      c.name as campaign_name,
      c.objective as campaign_objective,
      a.id as asset_id,
      a.title as asset_title,
      a.thumbnail_path,
      a.file_path
    FROM cms_post_variants v
    JOIN cms_social_posts sp ON sp.id = v.post_id
    LEFT JOIN cms_campaigns c ON c.id = sp.campaign_id
    LEFT JOIN cms_assets a ON a.id = v.media_asset_id
    WHERE sp.brand = ?
      AND v.scheduled_at IS NOT NULL
      AND v.scheduled_at >= ?
      AND v.scheduled_at < ?
    ORDER BY v.scheduled_at ASC
  `).bind(brand, startDate, endDate).all();

  return jsonResponse({
    start: startDate,
    end: endDate,
    events: results || [],
  });
}

async function handleRunSocialPublisherNow(user, env) {
  if (!env.SOCIAL_PUBLISHER_URL || !env.INTERNAL_SECRET) {
    return errorResponse('SOCIAL_PUBLISHER_URL or INTERNAL_SECRET is not configured', 503);
  }

  const runUrl = `${env.SOCIAL_PUBLISHER_URL.replace(/\/$/, '')}/run-now`;
  const res = await fetch(runUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.INTERNAL_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requested_by: user.id }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return errorResponse(payload.error || 'Failed to trigger social publisher', res.status);
  }

  await logAudit(env.DB, user.id, 'social.publisher.run_now', 'system', 'social-publisher', payload);

  return jsonResponse({
    message: 'Social publisher triggered',
    result: payload,
  });
}

// ────────────────────────────────────────────────────────────────
//  CMS Content (articles / announcements)
// ────────────────────────────────────────────────────────────────

/**
 * GET /api/cms/content — List content
 */
async function handleListContent(request, env) {
  const url = new URL(request.url);
  const brand = url.searchParams.get('brand');
  const contentType = url.searchParams.get('type');
  const status = url.searchParams.get('status') || 'published';

  let query = 'SELECT id, brand, content_type, title, slug, excerpt, status, published_at, created_at FROM cms_content WHERE status = ?';
  const bindings = [status];

  if (brand) { query += ' AND brand = ?'; bindings.push(brand); }
  if (contentType) { query += ' AND content_type = ?'; bindings.push(contentType); }

  query += ' ORDER BY created_at DESC LIMIT 100';

  const { results } = await env.DB.prepare(query).bind(...bindings).all();
  return jsonResponse(results || []);
}

/**
 * POST /api/cms/content — Create content
 */
async function handleCreateContent(request, user, env) {
  const data = await request.json();
  const { brand, content_type, title, body } = data;
  if (!title || !body) return errorResponse('title and body required');

  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const now = new Date().toISOString();
  const publishedAt = data.status === 'published' ? now : null;

  const result = await env.DB.prepare(`
    INSERT INTO cms_content (brand, content_type, title, slug, body, excerpt, featured_image_id, status, author_id, published_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    brand || 'gfv',
    content_type || 'article',
    title,
    slug,
    body,
    data.excerpt || '',
    data.featured_image_id || '',
    data.status || 'draft',
    user.id,
    publishedAt,
    now,
    now
  ).run();

  await logAudit(env.DB, user.id, 'content.create', 'content', String(result.meta?.last_row_id || ''), { title });

  return jsonResponse({ id: result.meta?.last_row_id, slug, message: 'Content created' }, 201);
}

// ────────────────────────────────────────────────────────────────
//  Dashboard Stats
// ────────────────────────────────────────────────────────────────

/**
 * GET /api/cms/stats — Aggregate CMS stats for admin dashboard
 */
async function handleCMSStats(env) {
  await ensureCampaignSchema(env.DB);

  const [assets, social, content] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as total, brand FROM cms_assets WHERE active=1 GROUP BY brand').all(),
    env.DB.prepare("SELECT COUNT(*) as total, status FROM cms_social_posts GROUP BY status").all(),
    env.DB.prepare("SELECT COUNT(*) as total, status FROM cms_content GROUP BY status").all(),
  ]);

  const [
    campaignCount,
    connectionCount,
    pendingReviewCount,
    blogPostCount,
    communityMemberCount,
    characterCount,
    donationsRow,
    donationsMonth,
    openOpsCount,
    recentAudit,
    auditTotal,
  ] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as total FROM cms_campaigns WHERE active=1').first(),
    env.DB.prepare('SELECT COUNT(*) as total FROM cms_platform_tokens WHERE is_active=1').first(),
    env.DB.prepare("SELECT COUNT(*) as total FROM discovered_assets WHERE status='discovered'").first(),
    env.DB.prepare('SELECT COUNT(*) as total FROM blog_posts').first().catch(() => ({ total: 0 })),
    env.DB.prepare('SELECT COUNT(*) as total FROM community_profiles').first().catch(() => ({ total: 0 })),
    // Characters (lazy table — may not exist yet)
    env.DB.prepare("SELECT COUNT(*) as total FROM cms_characters").first().catch(() => ({ total: 0 })),
    // Donations totals
    env.DB.prepare(
      "SELECT COUNT(*) as total, COALESCE(SUM(amount_cents),0) as total_cents FROM cms_donations WHERE status='succeeded'"
    ).first().catch(() => ({ total: 0, total_cents: 0 })),
    // This-month donations
    env.DB.prepare(
      "SELECT COALESCE(SUM(amount_cents),0) as month_cents FROM cms_donations WHERE status='succeeded' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')"
    ).first().catch(() => ({ month_cents: 0 })),
    // Open ops tasks
    env.DB.prepare("SELECT COUNT(*) as total FROM admin_ops WHERE completed_at IS NULL").first().catch(() => ({ total: 0 })),
    // Recent audit log (last 15 entries)
    env.DB.prepare(
      "SELECT id, user_id, action, target_type, target_id, created_at FROM cms_audit_log ORDER BY created_at DESC LIMIT 15"
    ).all().catch(() => ({ results: [] })),
    // Audit log total count
    env.DB.prepare("SELECT COUNT(*) as total FROM cms_audit_log").first().catch(() => ({ total: 0 })),
  ]);

  // R2 usage (if available)
  let storageInfo = null;
  if (env.MEDIA_BUCKET) {
    // R2 doesn't expose bucket-level size directly in Workers,
    // but we can track it from the assets table
    const sizeResult = await env.DB.prepare(
      'SELECT SUM(file_size) as total_bytes, COUNT(*) as file_count FROM cms_assets WHERE active=1'
    ).first();
    storageInfo = {
      totalBytes: sizeResult?.total_bytes || 0,
      fileCount: sizeResult?.file_count || 0,
      freeTierLimit: '10 GB',
    };
  }

  return jsonResponse({
    assets: assets?.results || [],
    social: social?.results || [],
    content: content?.results || [],
    campaigns: campaignCount?.total || 0,
    connections: connectionCount?.total || 0,
    pendingReview: pendingReviewCount?.total || 0,
    blogPosts: blogPostCount?.total || 0,
    communityMembers: communityMemberCount?.total || 0,
    characters: characterCount?.total || 0,
    donations: {
      total: donationsRow?.total || 0,
      totalCents: donationsRow?.total_cents || 0,
      monthCents: donationsMonth?.month_cents || 0,
    },
    openOps: openOpsCount?.total || 0,
    recentAudit: recentAudit?.results || [],
    auditTotal: auditTotal?.total || 0,
    storage: storageInfo,
    assetsByBrand: Object.fromEntries((assets?.results || []).map((r) => [r.brand, Number(r.total || 0)])),
  });
}

// ────────────────────────────────────────────────────────────────
//  Categories / Brands meta
// ────────────────────────────────────────────────────────────────

/**
 * GET /api/cms/categories — Distinct categories with counts
 */
async function handleListCategories(env) {
  const { results } = await env.DB.prepare(`
    SELECT category, brand, COUNT(*) as count
    FROM cms_assets WHERE active=1
    GROUP BY category, brand
    ORDER BY count DESC
  `).all();

  return jsonResponse(results || []);
}

// ────────────────────────────────────────────────────────────────
//  Public Gallery — serves approved assets to gallery.html
//  No auth required. Only review_status='approved' assets exposed.
// ────────────────────────────────────────────────────────────────

/**
 * GET /api/cms/gallery/:brand
 * Returns categories + items in the format gallery.html expects.
 * Items are R2-backed assets (approved only), served via /pub/ presigned URLs.
 */
async function handlePublicGallery(request, brand, env) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 500);

  // Validate brand to prevent injection (only alphanumerics and hyphens)
  if (brand && !/^[a-z0-9-]+$/i.test(brand)) {
    return errorResponse('Invalid brand identifier', 400);
  }

  let query, bindings;
  if (brand && brand !== 'all') {
    query = `SELECT id, brand, title, category, media_type, r2_key, public_url, created_at
             FROM cms_assets
             WHERE review_status = 'approved' AND active = 1 AND brand = ?
             ORDER BY created_at DESC LIMIT ?`;
    bindings = [brand, limit];
  } else {
    query = `SELECT id, brand, title, category, media_type, r2_key, public_url, created_at
             FROM cms_assets
             WHERE review_status = 'approved' AND active = 1
             ORDER BY created_at DESC LIMIT ?`;
    bindings = [limit];
  }

  const { results } = await env.DB.prepare(query).bind(...bindings).all();
  const assets = results || [];

  // Build category list from actual data (preserving insertion order)
  const seenCats = new Set();
  const categories = [];
  for (const asset of assets) {
    const cat = asset.category || 'uncategorized';
    if (!seenCats.has(cat)) {
      seenCats.add(cat);
      categories.push({
        id: cat,
        title: cat.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      });
    }
  }

  // Map asset rows to the catalog item shape gallery.html expects
  const siteBase = env.SITE_BASE_URL ? env.SITE_BASE_URL.replace(/\/$/, '') : '';
  const items = assets.map((a) => {
    const cat = a.category || 'uncategorized';
    // Use public_url if stored; otherwise build from /pub/ route
    const src = a.public_url || (a.r2_key ? `${siteBase}/api/cms/pub/${encodeURIComponent(a.r2_key)}` : null);
    const type = (a.media_type || '').toLowerCase().includes('video') ? 'video' : 'image';
    return {
      id: a.id,
      title: a.title,
      type,
      src,
      href: src,
      brand: a.brand,
      category: cat,
      categories: [cat],
      addedAt: a.created_at,
    };
  });

  return jsonResponse({ categories, items });
}

// ────────────────────────────────────────────────────────────────
//  Donations
// ────────────────────────────────────────────────────────────────

async function ensureDonationsSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cms_donations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stripe_payment_id TEXT UNIQUE,
      amount_cents INTEGER NOT NULL,
      currency TEXT DEFAULT 'usd',
      project TEXT,
      donor_email TEXT,
      donor_name TEXT,
      status TEXT DEFAULT 'succeeded',
      recurring INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
}

async function handleListDonations(request, env) {
  await ensureDonationsSchema(env.DB);
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  const [rows, totals, monthTotals] = await Promise.all([
    env.DB.prepare(`
      SELECT * FROM cms_donations ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).bind(limit, offset).all(),
    env.DB.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(amount_cents),0) as total_cents
      FROM cms_donations WHERE status='succeeded'
    `).first(),
    env.DB.prepare(`
      SELECT COALESCE(SUM(amount_cents),0) as month_cents
      FROM cms_donations
      WHERE status='succeeded'
        AND created_at >= datetime('now','start of month')
    `).first(),
  ]);

  return jsonResponse({
    donations: rows.results || [],
    totalRaised: totals?.total_cents || 0,
    thisMonth: monthTotals?.month_cents || 0,
    count: totals?.count || 0,
  });
}

async function handleRecordDonation(request, user, env) {
  await ensureDonationsSchema(env.DB);
  const body = await request.json();
  const { stripe_payment_id, amount_cents, currency, project, donor_email, donor_name, recurring, status } = body;

  if (!amount_cents || !Number.isInteger(amount_cents) || amount_cents < 1) {
    return errorResponse('amount_cents must be a positive integer');
  }
  const validStatuses = ['succeeded', 'pending', 'failed', 'refunded'];
  const resolvedStatus = validStatuses.includes(status) ? status : 'succeeded';

  await env.DB.prepare(`
    INSERT OR IGNORE INTO cms_donations
      (stripe_payment_id, amount_cents, currency, project, donor_email, donor_name, status, recurring)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    stripe_payment_id || `manual_${Date.now()}`,
    amount_cents,
    currency || 'usd',
    project || 'Good Flippin Design',
    donor_email || null,
    donor_name || null,
    resolvedStatus,
    recurring ? 1 : 0,
  ).run();

  await logAudit(env.DB, user.sub, 'donation_recorded', 'donation', stripe_payment_id || 'manual', `$${(amount_cents/100).toFixed(2)}`);
  return jsonResponse({ ok: true });
}

// ────────────────────────────────────────────────────────────────
//  Admin Ops Board
// ────────────────────────────────────────────────────────────────

async function ensureAdminOpsSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS admin_ops (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'normal',
      brand TEXT DEFAULT 'all',
      area TEXT DEFAULT 'General',
      detail TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT DEFAULT NULL
    )
  `).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_admin_ops_severity ON admin_ops(severity)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_admin_ops_completed ON admin_ops(completed_at)`).run();
}

async function handleAdminOps(request, user, env, method, taskId) {
  await ensureAdminOpsSchema(env.DB);

  if (method === 'GET') {
    const url = new URL(request.url);
    const includeDone = url.searchParams.get('includeDone') === '1';
    const whereClause = includeDone ? '' : `WHERE completed_at IS NULL`;
    const rows = await env.DB.prepare(`
      SELECT * FROM admin_ops
      ${whereClause}
      ORDER BY
        CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        created_at DESC
    `).all();
    return jsonResponse({ tasks: rows.results || [] });
  }

  if (method === 'POST') {
    const body = await request.json();
    const { title, severity = 'normal', brand = 'all', area = 'General', detail = '' } = body;
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return errorResponse('title is required');
    }
    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO admin_ops (id, title, severity, brand, area, detail)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, title.trim().slice(0, 200), severity, brand, area, detail.slice(0, 500)).run();
    const row = await env.DB.prepare(`SELECT * FROM admin_ops WHERE id = ?`).bind(id).first();
    return jsonResponse({ task: row }, 201);
  }

  if (!taskId) return errorResponse('task id required', 400);

  if (method === 'PUT') {
    const body = await request.json();
    const updates = [];
    const binds = [];
    if (body.title !== undefined) { updates.push('title = ?'); binds.push(body.title.trim().slice(0, 200)); }
    if (body.severity !== undefined) { updates.push('severity = ?'); binds.push(body.severity); }
    if (body.detail !== undefined) { updates.push('detail = ?'); binds.push(body.detail.slice(0, 500)); }
    if (body.brand !== undefined) { updates.push('brand = ?'); binds.push(body.brand); }
    if (body.area !== undefined) { updates.push('area = ?'); binds.push(body.area); }
    if (body.completed !== undefined) {
      updates.push('completed_at = ?');
      binds.push(body.completed ? new Date().toISOString() : null);
      if (body.completed) { updates.push('severity = ?'); binds.push('done'); }
    }
    if (updates.length === 0) return errorResponse('no fields to update', 400);
    updates.push('updated_at = ?');
    binds.push(new Date().toISOString());
    binds.push(taskId);
    await env.DB.prepare(`UPDATE admin_ops SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();
    const row = await env.DB.prepare(`SELECT * FROM admin_ops WHERE id = ?`).bind(taskId).first();
    return jsonResponse({ task: row });
  }

  if (method === 'DELETE') {
    await env.DB.prepare(`DELETE FROM admin_ops WHERE id = ?`).bind(taskId).run();
    return jsonResponse({ ok: true });
  }

  return errorResponse('Method not allowed', 405);
}

// ────────────────────────────────────────────────────────────────
//  Character Registry
// ────────────────────────────────────────────────────────────────

async function ensureCharactersSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cms_characters (
      id TEXT PRIMARY KEY,
      brand TEXT NOT NULL DEFAULT 'gfv',
      name TEXT NOT NULL,
      emoji TEXT DEFAULT '',
      description TEXT DEFAULT '',
      pipeline TEXT DEFAULT '',
      tools TEXT DEFAULT '[]',
      stage TEXT DEFAULT 'planned',
      poses TEXT DEFAULT '[]',
      milestones TEXT DEFAULT '[]',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_cms_characters_brand ON cms_characters(brand)`).run();
}

function parseCharacter(row) {
  if (!row) return null;
  try { row.tools = JSON.parse(row.tools || '[]'); } catch (e) { row.tools = []; }
  try { row.poses = JSON.parse(row.poses || '[]'); } catch (e) { row.poses = []; }
  try { row.milestones = JSON.parse(row.milestones || '[]'); } catch (e) { row.milestones = []; }
  return row;
}

async function handleCharacters(request, user, env, method, charId) {
  await ensureCharactersSchema(env.DB);

  if (method === 'GET') {
    if (charId) {
      const row = await env.DB.prepare(`SELECT * FROM cms_characters WHERE id = ?`).bind(charId).first();
      if (!row) return errorResponse('Not found', 404);
      return jsonResponse({ character: parseCharacter(row) });
    }
    const url = new URL(request.url);
    const brand = url.searchParams.get('brand') || null;
    const stmt = brand
      ? env.DB.prepare(`SELECT * FROM cms_characters WHERE brand = ? ORDER BY sort_order ASC, created_at ASC`).bind(brand)
      : env.DB.prepare(`SELECT * FROM cms_characters ORDER BY sort_order ASC, created_at ASC`);
    const rows = await stmt.all();
    return jsonResponse({ characters: (rows.results || []).map(parseCharacter) });
  }

  if (method === 'POST') {
    const body = await request.json();
    const { name, brand = 'gfv', emoji = '', description = '', pipeline = '', tools = [], stage = 'planned', poses = [], milestones = [] } = body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return errorResponse('name is required');
    }
    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO cms_characters (id, brand, name, emoji, description, pipeline, tools, stage, poses, milestones)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, brand, name.trim().slice(0, 100), emoji.slice(0, 10), description.slice(0, 500),
      pipeline.slice(0, 200), JSON.stringify(tools), stage,
      JSON.stringify(poses), JSON.stringify(milestones)
    ).run();
    const row = await env.DB.prepare(`SELECT * FROM cms_characters WHERE id = ?`).bind(id).first();
    return jsonResponse({ character: parseCharacter(row) }, 201);
  }

  if (!charId) return errorResponse('character id required', 400);

  if (method === 'PUT') {
    const body = await request.json();
    const updates = [];
    const binds = [];
    if (body.name !== undefined) { updates.push('name = ?'); binds.push(body.name.trim().slice(0, 100)); }
    if (body.brand !== undefined) { updates.push('brand = ?'); binds.push(body.brand); }
    if (body.emoji !== undefined) { updates.push('emoji = ?'); binds.push(body.emoji.slice(0, 10)); }
    if (body.description !== undefined) { updates.push('description = ?'); binds.push(body.description.slice(0, 500)); }
    if (body.pipeline !== undefined) { updates.push('pipeline = ?'); binds.push(body.pipeline.slice(0, 200)); }
    if (body.tools !== undefined) { updates.push('tools = ?'); binds.push(JSON.stringify(body.tools)); }
    if (body.stage !== undefined) { updates.push('stage = ?'); binds.push(body.stage); }
    if (body.poses !== undefined) { updates.push('poses = ?'); binds.push(JSON.stringify(body.poses)); }
    if (body.milestones !== undefined) { updates.push('milestones = ?'); binds.push(JSON.stringify(body.milestones)); }
    if (body.sort_order !== undefined) { updates.push('sort_order = ?'); binds.push(Number(body.sort_order) || 0); }
    if (updates.length === 0) return errorResponse('no fields to update', 400);
    updates.push('updated_at = ?');
    binds.push(new Date().toISOString());
    binds.push(charId);
    await env.DB.prepare(`UPDATE cms_characters SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();
    const row = await env.DB.prepare(`SELECT * FROM cms_characters WHERE id = ?`).bind(charId).first();
    return jsonResponse({ character: parseCharacter(row) });
  }

  if (method === 'DELETE') {
    await env.DB.prepare(`DELETE FROM cms_characters WHERE id = ?`).bind(charId).run();
    return jsonResponse({ ok: true });
  }

  return errorResponse('Method not allowed', 405);
}

// ────────────────────────────────────────────────────────────────
//  Router
// ────────────────────────────────────────────────────────────────

/**
 * Main CMS router — called from _worker.js for /api/cms/* paths
 * @param {Request} request
 * @param {object} env - Cloudflare bindings (DB, MEDIA_BUCKET)
 * @param {object|null} user - Authenticated Clerk user (null for public routes)
 */

// ── Studio HQ kanban persistence ─────────────────────────────────────────────
async function ensureStudioConfigSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS studio_config (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();
}

async function handleStudioKanbanGet(env) {
  try {
    await ensureStudioConfigSchema(env.DB);
    const row = await env.DB.prepare(`SELECT value FROM studio_config WHERE key = 'kanban'`).first();
    if (!row) return jsonResponse({ items: [] });
    let items = [];
    try { items = JSON.parse(row.value); } catch { items = []; }
    return jsonResponse({ items });
  } catch (err) {
    return errorResponse('Failed to load kanban: ' + err.message, 500);
  }
}

async function handleStudioKanbanPut(request, env) {
  try {
    await ensureStudioConfigSchema(env.DB);
    const body = await request.json();
    const items = body.items;
    if (!Array.isArray(items)) return errorResponse('items must be an array', 400);
    // Validate each item has required fields; strip unknown keys
    const sanitised = items.slice(0, 200).map(function (c) {
      return {
        id:       String(c.id || '').slice(0, 64),
        title:    String(c.title || '').slice(0, 300),
        stage:    ['backlog', 'scoping', 'building', 'review', 'shipped'].includes(c.stage) ? c.stage : 'backlog',
        priority: ['critical', 'high', 'medium', 'low'].includes(c.priority) ? c.priority : 'medium',
        brand:    String(c.brand || 'all').slice(0, 32),
      };
    });
    await env.DB.prepare(
      `INSERT INTO studio_config (key, value, updated_at)
       VALUES ('kanban', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).bind(JSON.stringify(sanitised)).run();
    return jsonResponse({ ok: true, count: sanitised.length });
  } catch (err) {
    return errorResponse('Failed to save kanban: ' + err.message, 500);
  }
}

export async function handleCMSRequest(request, env, user) {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/cms', '');
  const method = request.method;

  try {
    // ── Fully public routes (no auth, no R2 keys exposed) ───────────────────

    // Public categories/brands — safe metadata only
    if (path === '/categories' && method === 'GET') {
      return handleListCategories(env);
    }
    if (path === '/brands' && method === 'GET') {
      return handleListBrands(env);
    }
    if (path === '/platform-rules' && method === 'GET') {
      return jsonResponse(PLATFORM_RULES);
    }

    // Public gallery — returns approved CMS assets for a brand (used by gallery.html)
    const galleryPublicMatch = path.match(/^\/gallery\/([a-z0-9-]+)$/i);
    if (galleryPublicMatch && method === 'GET') {
      return handlePublicGallery(request, galleryPublicMatch[1], env);
    }
    // /gallery with no brand — return all approved assets
    if (path === '/gallery' && method === 'GET') {
      return handlePublicGallery(request, null, env);
    }

    // Serve approved assets to public pages (image overrides, gallery embeds)
    // ONLY serves assets where review_status = 'approved' in D1 — all others 404
    if (path.startsWith('/pub/') && method === 'GET') {
      const r2Key = decodeURIComponent(path.replace('/pub/', ''));
      return handleServePublicMedia(request, r2Key, env);
    }

    // OAuth flows (authorize needs auth, callback is public)
    if (path.startsWith('/oauth/')) {
      return handleOAuthRequest(request, env, user);
    }

    // ── Protected routes (admin only) ────────────────────
    if (!user) {
      return errorResponse('Authentication required', 401);
    }
    if (user.publicMetadata?.role !== 'admin') {
      return errorResponse('Admin access required', 403);
    }

    // Asset CRUD (admin)
    if (path === '/assets' && method === 'GET') {
      return handleListAssets(request, env);
    }

    // Asset analytics report (must come before /assets/:id catch-all)
    if (path === '/assets/analytics' && method === 'GET') {
      return handleAssetAnalytics(env);
    }

    // Asset usage graph — cross-reference assets with post variants
    if (path === '/assets/usage' && method === 'GET') {
      return handleAssetUsage(env);
    }

    // Asset discovery (must come before generic /assets/:id catch-all)
    if (path === '/assets/discover' && method === 'POST') {
      return handleDiscoverAssets(request, env);
    }
    if (path === '/assets/discovered' && method === 'GET') {
      return handleListDiscovered(request, env);
    }

    // Single asset (admin)
    const assetMatch = path.match(/^\/assets\/([^/]+)$/);
    if (assetMatch && method === 'GET' && !['discovered', 'overrides'].includes(assetMatch[1])) {
      return handleGetAsset(assetMatch[1], env);
    }

    // Bulk approve assets (must come before single-asset review route)
    if (path === '/assets/bulk-approve' && method === 'POST') {
      return handleBulkApproveAssets(request, user, env);
    }

    // Asset review — approve or reject
    const reviewMatch = path.match(/^\/assets\/([^/]+)\/(approve|reject)$/);
    if (reviewMatch && method === 'POST') {
      return handleReviewAsset(request, reviewMatch[1], reviewMatch[2], user, env);
    }

    // Authenticated media preview (full-resolution, private cache)
    if (path.startsWith('/media/') && method === 'GET') {
      const r2Key = decodeURIComponent(path.replace('/media/', ''));
      return handleServeMedia(r2Key, env);
    }

    if (path === '/assets' && method === 'POST') {
      return handleCreateAsset(request, user, env);
    }
    if (path === '/assets' && method === 'PUT') {
      return handleUpdateAsset(request, user, env);
    }
    if (path === '/assets' && method === 'DELETE') {
      return handleDeleteAsset(request, user, env);
    }

    // File upload (admin)
    if (path === '/upload' && method === 'POST') {
      return handleUpload(request, user, env);
    }

    // Batch URL import (admin)
    if (path === '/upload-url' && method === 'POST') {
      return handleUploadUrl(request, user, env);
    }

    // Donations (admin)
    if (path === '/donations' && method === 'GET') {
      return handleListDonations(request, env);
    }
    if (path === '/donations' && method === 'POST') {
      return handleRecordDonation(request, user, env);
    }

    // Admin Ops Board
    if (path === '/admin-ops' && method === 'GET') {
      return handleAdminOps(request, user, env, 'GET', null);
    }
    if (path === '/admin-ops' && method === 'POST') {
      return handleAdminOps(request, user, env, 'POST', null);
    }
    const opsIdMatch = path.match(/^\/admin-ops\/([^/]+)$/);
    if (opsIdMatch && method === 'PUT') {
      return handleAdminOps(request, user, env, 'PUT', decodeURIComponent(opsIdMatch[1]));
    }
    if (opsIdMatch && method === 'DELETE') {
      return handleAdminOps(request, user, env, 'DELETE', decodeURIComponent(opsIdMatch[1]));
    }

    // Characters registry (admin)
    if (path === '/characters' && method === 'GET') {
      return handleCharacters(request, user, env, 'GET', null);
    }
    if (path === '/characters' && method === 'POST') {
      return handleCharacters(request, user, env, 'POST', null);
    }
    const charIdMatch = path.match(/^\/characters\/([^/]+)$/);
    if (charIdMatch && method === 'GET') {
      return handleCharacters(request, user, env, 'GET', decodeURIComponent(charIdMatch[1]));
    }
    if (charIdMatch && method === 'PUT') {
      return handleCharacters(request, user, env, 'PUT', decodeURIComponent(charIdMatch[1]));
    }
    if (charIdMatch && method === 'DELETE') {
      return handleCharacters(request, user, env, 'DELETE', decodeURIComponent(charIdMatch[1]));
    }

    // Social posts (admin)
    if (path === '/social' && method === 'GET') {
      return handleListSocialPosts(request, env);
    }
    if (path === '/social' && method === 'POST') {
      return handleCreateSocialPost(request, user, env);
    }
    if (path === '/social' && method === 'PUT') {
      return handleUpdateSocialPost(request, user, env);
    }
    if (path === '/social' && method === 'DELETE') {
      return handleDeleteSocialPost(request, user, env);
    }
    if (path === '/social/variants' && method === 'GET') {
      return handleListSocialVariants(request, env);
    }
    // PATCH /social/variants/:id — update media_asset_id (artwork attachment)
    const variantPatchMatch = path.match(/^\/social\/variants\/([^/]+)$/);
    if (variantPatchMatch && method === 'PATCH') {
      return handlePatchVariant(request, user, env, variantPatchMatch[1]);
    }
    if (path === '/social/campaign' && method === 'POST') {
      return handleCreateCampaignSocialPost(request, user, env);
    }
    if (path === '/social/run-now' && method === 'POST') {
      return handleRunSocialPublisherNow(user, env);
    }

    // ── Brand registry ───────────────────────────────────────
    if (path === '/brands' && method === 'GET') {
      return handleListBrands(env);
    }

    // ── Social account handle registry ───────────────────────
    if (path === '/social-accounts' && method === 'GET') {
      return handleListSocialAccounts(request, env);
    }
    if (path === '/social-accounts/populate' && method === 'POST') {
      return handlePopulateSocialAccounts(request, user, env);
    }
    if (path === '/social-accounts' && method === 'POST') {
      return handleUpsertSocialAccount(request, user, env);
    }
    if (path === '/social-accounts' && method === 'DELETE') {
      return handleDeleteSocialAccount(request, user, env);
    }

    // ── Brand workflows ──────────────────────────────────────
    if (path === '/brand-workflows' && method === 'GET') {
      return handleListBrandWorkflows(request, env);
    }
    if (path === '/brand-workflows' && method === 'PUT') {
      return handleUpdateBrandWorkflow(request, user, env);
    }

    // ── Cross-brand syndication ──────────────────────────────
    if (path === '/cross-posts' && method === 'GET') {
      return handleListCrossPosts(request, env);
    }
    if (path === '/cross-posts' && method === 'POST') {
      return handleCreateCrossPost(request, user, env);
    }
    if (path === '/ecosystem-calendar' && method === 'GET') {
      return handleEcosystemCalendar(request, env);
    }

    // Automation Center — queue + cron sweep aggregate
    if (path === '/automation-center' && method === 'GET') {
      return handleAutomationCenter(env);
    }

    // Platform OAuth/token connections
    if (path === '/connections' && method === 'GET') {
      return handleListConnections(request, env);
    }
    if (path === '/connections' && method === 'POST') {
      return handleUpsertConnection(request, user, env);
    }
    if (path === '/connections' && method === 'DELETE') {
      return handleDeleteConnection(request, user, env);
    }
    if (/^\/connections\/\d+\/test$/.test(path) && method === 'POST') {
      return handleTestConnection(request, user, env);
    }

    // Campaigns and calendar
    if (path === '/campaigns' && method === 'GET') {
      return handleListCampaigns(request, env);
    }
    if (path === '/campaigns' && method === 'POST') {
      return handleCreateCampaign(request, user, env);
    }
    if (path === '/campaigns' && method === 'PUT') {
      return handleUpdateCampaign(request, user, env);
    }
    if (path === '/campaigns' && method === 'DELETE') {
      return handleDeleteCampaign(request, user, env);
    }
    if (path === '/campaigns/calendar' && method === 'GET') {
      return handleCampaignCalendar(request, env);
    }
    if (path === '/campaigns/bulk-schedule' && method === 'POST') {
      return handleBulkSchedule(request, user, env);
    }

    // Content (admin)
    if (path === '/content' && method === 'GET') {
      return handleListContent(request, env);
    }
    if (path === '/content' && method === 'POST') {
      return handleCreateContent(request, user, env);
    }

    // Dashboard stats (admin)
    if (path === '/stats' && method === 'GET') {
      return handleCMSStats(env);
    }

    // ── Discovered asset claim / status update ────────────
    const discoveredClaimMatch = path.match(/^\/assets\/discovered\/(\d+)\/claim$/);
    if (discoveredClaimMatch && method === 'POST') {
      return handleClaimDiscoveredAsset(request, user, env, discoveredClaimMatch[1]);
    }
    const discoveredUpdateMatch = path.match(/^\/assets\/discovered\/(\d+)$/);
    if (discoveredUpdateMatch && method === 'PUT') {
      return handleUpdateDiscoveredStatus(request, user, env, discoveredUpdateMatch[1]);
    }

    // ── Server-side page scanner ──────────────────────────
    if (path === '/scan-page' && method === 'POST') {
      return handleScanPage(request, user, env);
    }

    // ── External image proxy (for discovered asset thumbnails) ────────────
    if (path === '/proxy-img' && method === 'GET') {
      return handleProxyImg(request, env);
    }

    // ── Image overrides (live swap via HTMLRewriter) ──────
    if (path === '/assets/overrides' && method === 'GET') {
      return handleListOverrides(request, env);
    }
    if (path === '/assets/overrides' && method === 'POST') {
      return handleSaveOverride(request, user, env);
    }
    if (path === '/assets/overrides' && method === 'PUT') {
      return handleUpdateOverride(request, user, env);
    }
    if (path === '/assets/overrides' && method === 'DELETE') {
      return handleDeleteOverride(request, user, env);
    }

    // ── Gallery management ─────────────────────────────
    if (path === '/galleries' && method === 'GET') {
      return handleListGalleries(request, env);
    }
    if (path === '/galleries' && method === 'POST') {
      return handleCreateGallery(request, user, env);
    }
    const galleryMatch = path.match(/^\/galleries\/(\d+)$/);
    if (galleryMatch && method === 'PUT') {
      return handleUpdateGallery(request, user, env, parseInt(galleryMatch[1], 10));
    }
    if (galleryMatch && method === 'DELETE') {
      return handleDeleteGallery(user, env, parseInt(galleryMatch[1], 10));
    }
    const galleryItemsMatch = path.match(/^\/galleries\/(\d+)\/items$/);
    if (galleryItemsMatch && method === 'GET') {
      return handleListGalleryItems(env, parseInt(galleryItemsMatch[1], 10));
    }
    if (galleryItemsMatch && method === 'POST') {
      return handleAddGalleryItem(request, user, env, parseInt(galleryItemsMatch[1], 10));
    }
    const galleryReorderMatch = path.match(/^\/galleries\/(\d+)\/items\/reorder$/);
    if (galleryReorderMatch && method === 'PUT') {
      return handleReorderGalleryItems(request, user, env, parseInt(galleryReorderMatch[1], 10));
    }
    const galleryItemDeleteMatch = path.match(/^\/galleries\/(\d+)\/items\/(\d+)$/);
    if (galleryItemDeleteMatch && method === 'DELETE') {
      return handleRemoveGalleryItem(user, env, parseInt(galleryItemDeleteMatch[1], 10), parseInt(galleryItemDeleteMatch[2], 10));
    }

    // ── Cross-site asset sharing ───────────────────────
    const sharesMatch = path.match(/^\/assets\/([^/]+)\/shares$/);
    if (sharesMatch && method === 'GET') {
      return handleGetAssetShares(env, sharesMatch[1]);
    }
    const shareMatch = path.match(/^\/assets\/([^/]+)\/share$/);
    if (shareMatch && method === 'POST') {
      return handleShareAsset(request, user, env, shareMatch[1]);
    }
    const replaceMatch = path.match(/^\/assets\/([^/]+)\/replace$/);
    if (replaceMatch && method === 'POST') {
      return handleReplaceAsset(request, user, env, replaceMatch[1]);
    }

    // ── Site registry ──────────────────────────────────
    if (path === '/sites' && method === 'GET') {
      return handleListSites(env);
    }
    const siteAssetsMatch = path.match(/^\/sites\/([^/]+)\/assets$/);
    if (siteAssetsMatch && method === 'GET') {
      return handleListSiteAssets(request, env, siteAssetsMatch[1]);
    }

    // ── Public gallery feed (used by gallery.html) ────────
    const galleryFeedMatch = path.match(/^\/gallery\/([^/]+)$/);
    if (galleryFeedMatch && method === 'GET') {
      return handleGalleryFeed(galleryFeedMatch[1], env);
    }

    // ── NFT Collections ────────────────────────────────────────────────────────
    if (path === '/nft/collections' && method === 'GET') {
      return handleListNFTCollections(request, env);
    }
    if (path === '/nft/collections' && method === 'POST') {
      return handleCreateNFTCollection(request, user, env);
    }
    if (path === '/nft/collections' && method === 'PUT') {
      return handleUpdateNFTCollection(request, user, env);
    }
    if (path === '/nft/collections' && method === 'DELETE') {
      return handleDeleteNFTCollection(request, user, env);
    }

    // ── NFT Tokens ─────────────────────────────────────────────────────────────
    if (path === '/nft/tokens' && method === 'GET') {
      return handleListNFTTokens(request, env);
    }
    if (path === '/nft/tokens' && method === 'POST') {
      return handleCreateNFTToken(request, user, env);
    }
    if (path === '/nft/tokens' && method === 'PUT') {
      return handleUpdateNFTToken(request, user, env);
    }
    if (path === '/nft/tokens' && method === 'DELETE') {
      return handleDeleteNFTToken(request, user, env);
    }
    const nftMintMatch = path.match(/^\/nft\/tokens\/(\d+)\/mint$/);
    if (nftMintMatch && method === 'POST') {
      return handleMintNFTToken(request, user, env);
    }

    // ── Content Studio ─────────────────────────────────────
    if (path === '/content-studio/registries' && method === 'GET') {
      return handleListRegistries(request, env);
    }
    if (path === '/content-studio/generated' && method === 'GET') {
      return handleListGeneratedAssets(request, env);
    }
    const registryIdMatch = path.match(/^\/content-studio\/registries\/([^/]+)$/);
    if (registryIdMatch && method === 'GET') {
      return handleGetRegistry(registryIdMatch[1], env);
    }
    if (path === '/content-studio/registries' && (method === 'POST' || method === 'PUT')) {
      return handleSaveRegistry(request, user, env);
    }
    if (path === '/content-studio/generate' && method === 'POST') {
      return handleCSGenerateImage(request, user, env);
    }
    if (path === '/content-studio/schedule' && method === 'POST') {
      return handleCSSchedulePost(request, user, env);
    }

    // ── Studio HQ — persistent kanban (GET = read board, PUT = replace board) ──
    if (path === '/studio-kanban' && method === 'GET') {
      return handleStudioKanbanGet(env);
    }
    if (path === '/studio-kanban' && method === 'PUT') {
      return handleStudioKanbanPut(request, env);
    }

    return errorResponse('CMS endpoint not found', 404);

  } catch (err) {
    console.error('[CMS Worker]', err);
    return errorResponse('Internal CMS error', 500);
  }
}

// ────────────────────────────────────────────────────────────────
//  Discover Assets
// ────────────────────────────────────────────────────────────────

/**
 * POST /api/cms/assets/discover
 * Body: { brand, site_domain, page_url, assets: [{url, type, alt}] }
 * Inserts new rows into discovered_assets (IGNORE duplicates via UNIQUE url).
 */
async function handleDiscoverAssets(request, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);

  const body = await request.json().catch(() => null);
  if (!body?.brand || !body?.site_domain || !body?.page_url || !Array.isArray(body?.assets)) {
    return errorResponse('Missing required fields: brand, site_domain, page_url, assets[]', 400);
  }

  const now = new Date().toISOString();
  let inserted = 0;

  for (const asset of body.assets) {
    if (!asset.url) continue;
    try {
      const result = await env.DB.prepare(
        `INSERT OR IGNORE INTO discovered_assets
           (brand, site_domain, page_url, asset_url, asset_type, alt_text, discovered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        body.brand,
        body.site_domain,
        body.page_url,
        asset.url,
        asset.type || 'image',
        asset.alt || '',
        now
      ).run();
      if (result.changes > 0) inserted++;
    } catch (_) {
      // Skip duplicate or malformed rows
    }
  }

  return jsonResponse({ ok: true, inserted, total: body.assets.length });
}

/**
 * GET /api/cms/assets/discovered?brand=&status=&domain=&page=&limit=
 */
async function handleListDiscovered(request, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);

  const url = new URL(request.url);
  const brand = url.searchParams.get('brand');
  const status = url.searchParams.get('status') || 'discovered';
  const domain = url.searchParams.get('domain');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(100, parseInt(url.searchParams.get('limit') || '50', 10));
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM discovered_assets WHERE status = ?';
  const params = [status];

  if (brand) { query += ' AND brand = ?'; params.push(brand); }
  if (domain) { query += ' AND site_domain = ?'; params.push(domain); }

  query += ' ORDER BY discovered_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const results = await env.DB.prepare(query).bind(...params).all();

  // Count total for pagination
  let countQuery = 'SELECT COUNT(*) as total FROM discovered_assets WHERE status = ?';
  const countParams = [status];
  if (brand) { countQuery += ' AND brand = ?'; countParams.push(brand); }
  if (domain) { countQuery += ' AND site_domain = ?'; countParams.push(domain); }
  const countResult = await env.DB.prepare(countQuery).bind(...countParams).first();

  return jsonResponse({ assets: results.results || [], page, limit, total: countResult?.total || 0 });
}

// ────────────────────────────────────────────────────────────────
//  Claim Discovered Asset → promote to cms_assets
// ────────────────────────────────────────────────────────────────

/**
 * POST /api/cms/assets/discovered/:id/claim
 * Body: { title, brand, category, media_type, tags[] }
 * Creates a cms_assets record from the discovered asset's URL and marks it claimed.
 */
async function handleClaimDiscoveredAsset(request, user, env, discoveredId) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  if (!user) return errorResponse('Unauthorized', 401);

  const discovered = await env.DB.prepare(
    'SELECT * FROM discovered_assets WHERE id = ?'
  ).bind(discoveredId).first();
  if (!discovered) return errorResponse('Discovered asset not found', 404);
  if (discovered.status === 'claimed') return errorResponse('Already claimed', 409);

  const body = await request.json().catch(() => ({}));
  const title = body.title || discovered.alt_text || 'Untitled';
  const brand = body.brand || discovered.brand;
  const category = body.category || 'uncategorized';
  const mediaType = body.media_type || discovered.asset_type || 'image';

  const assetId = `asset_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO cms_assets
      (id, brand, category, title, file_path, media_type, tags, uploaded_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    assetId, brand, category, title,
    discovered.asset_url,   // use the live URL as file_path
    mediaType,
    JSON.stringify(body.tags || []),
    user.id, now, now
  ).run();

  await env.DB.prepare(
    'UPDATE discovered_assets SET status = ?, cms_asset_id = ? WHERE id = ?'
  ).bind('claimed', assetId, discoveredId).run();

  await logAudit(env.DB, user.id, 'asset.claim', 'discovered_asset', String(discoveredId), {
    assetId, brand, category, title,
  });

  return jsonResponse({ ok: true, asset_id: assetId, message: 'Asset claimed and added to library' }, 201);
}

/**
 * PUT /api/cms/assets/discovered/:id
 * Body: { status } — update status of a discovered asset (ignore / reset to discovered)
 */
async function handleUpdateDiscoveredStatus(request, user, env, discoveredId) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  if (!user) return errorResponse('Unauthorized', 401);

  const body = await request.json().catch(() => ({}));
  const validStatuses = ['discovered', 'claimed', 'ignored'];
  if (!validStatuses.includes(body.status)) {
    return errorResponse(`status must be one of: ${validStatuses.join(', ')}`);
  }

  await env.DB.prepare(
    'UPDATE discovered_assets SET status = ? WHERE id = ?'
  ).bind(body.status, discoveredId).run();

  return jsonResponse({ ok: true });
}

// ────────────────────────────────────────────────────────────────
//  External image proxy (for discovered asset thumbnails)
// ────────────────────────────────────────────────────────────────

/**
 * GET /api/cms/proxy-img?url=<encoded_url>
 * Admin-only. Fetches an external image server-side and returns it, bypassing
 * browser-level hotlink protection on target sites. Responses cached at the CDN edge.
 * SSRF protection: only http/https, private/loopback IPs blocked.
 */
async function handleProxyImg(request, env) {
  const url = new URL(request.url);
  const externalUrl = url.searchParams.get('url');
  if (!externalUrl) return errorResponse('url parameter required', 400);

  let parsedUrl;
  try {
    parsedUrl = new URL(externalUrl);
  } catch {
    return errorResponse('Invalid URL', 400);
  }

  // SSRF guard — only allow public HTTP/HTTPS
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return errorResponse('Only HTTP/HTTPS URLs are supported', 400);
  }
  const hostname = parsedUrl.hostname.toLowerCase();
  const privatePattern = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1$|fc00:|fe80:)/;
  if (privatePattern.test(hostname)) {
    return errorResponse('Private/loopback URLs are not allowed', 400);
  }

  // Cloudflare Cache API check (keyed on the sanitised external URL)
  const cacheKey = new Request(`https://proxy-cache.gfd.internal/img?u=${encodeURIComponent(externalUrl)}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let resp;
  try {
    resp = await fetch(externalUrl, {
      headers: { 'User-Agent': 'GFD-AssetScanner/1.0' },
      cf: { cacheTtl: 0 },
    });
  } catch (err) {
    return errorResponse('Proxy fetch failed: ' + err.message, 502);
  }

  if (!resp.ok) return errorResponse(`Upstream returned ${resp.status}`, 502);

  const contentType = resp.headers.get('Content-Type') || '';
  if (!contentType.startsWith('image/')) {
    return errorResponse('URL does not point to an image', 400);
  }

  const imageData = await resp.arrayBuffer();
  const proxyResponse = new Response(imageData, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'X-Proxy-Source': externalUrl,
    },
  });

  // Cache asynchronously — best-effort, don't block the response
  cache.put(cacheKey, proxyResponse.clone()).catch(() => {});
  return proxyResponse;
}

// ────────────────────────────────────────────────────────────────
//  Server-side page scanner
// ────────────────────────────────────────────────────────────────

/**
 * POST /api/cms/scan-page
 * Body: { brand, page_url }
 * Worker fetches the page, extracts <img> src URLs, inserts into discovered_assets.
 */
async function handleScanPage(request, user, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  if (!user) return errorResponse('Unauthorized', 401);

  const body = await request.json().catch(() => null);
  if (!body?.brand || !body?.page_url) {
    return errorResponse('brand and page_url are required');
  }

  let pageUrl;
  try {
    pageUrl = new URL(body.page_url);
  } catch {
    return errorResponse('Invalid page_url');
  }

  // Fetch the page HTML (with a reasonable timeout)
  let html;
  try {
    const resp = await fetch(pageUrl.toString(), {
      headers: { 'User-Agent': 'GFD-AssetScanner/1.0' },
      cf: { cacheTtl: 0 },
    });
    if (!resp.ok) return errorResponse(`Page returned HTTP ${resp.status}`, 502);
    html = await resp.text();
  } catch (err) {
    return errorResponse('Failed to fetch page: ' + err.message, 502);
  }

  // Extract all img src attributes (two-pass: capture full tag first, then attrs independently)
  const imgTagRegex = /<img([^>]+)>/gi;
  const srcAttrRegex = /\bsrc=["']([^"']+)["']/i;
  const altAttrRegex = /\balt=["']([^"']*)["']/i;
  const bgUrlRegex = /url\(["']?([^"')]+)["']?\)/gi;
  const foundUrls = new Map(); // url → { alt }

  let match;
  while ((match = imgTagRegex.exec(html)) !== null) {
    const attrs = match[1];
    const srcMatch = srcAttrRegex.exec(attrs);
    if (!srcMatch) continue;
    const src = srcMatch[1];
    const altMatch = altAttrRegex.exec(attrs);
    const alt = altMatch ? altMatch[1] : '';
    if (src && !src.startsWith('data:')) {
      let absUrl;
      try {
        absUrl = new URL(src, pageUrl).toString();
      } catch { continue; }
      foundUrls.set(absUrl, { alt, type: 'image' });
    }
  }
  while ((match = bgUrlRegex.exec(html)) !== null) {
    const src = match[1];
    if (src && !src.startsWith('data:') && src.match(/\.(png|jpg|jpeg|gif|webp|svg|avif)(\?|$)/i)) {
      let absUrl;
      try {
        absUrl = new URL(src, pageUrl).toString();
      } catch { continue; }
      if (!foundUrls.has(absUrl)) foundUrls.set(absUrl, { alt: '', type: 'image' });
    }
  }

  if (foundUrls.size === 0) {
    return jsonResponse({ ok: true, inserted: 0, total: 0, message: 'No images found on page' });
  }

  const now = new Date().toISOString();
  let inserted = 0;

  for (const [assetUrl, meta] of foundUrls) {
    try {
      const result = await env.DB.prepare(
        `INSERT OR IGNORE INTO discovered_assets
           (brand, site_domain, page_url, asset_url, asset_type, alt_text, discovered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(body.brand, pageUrl.hostname, pageUrl.toString(), assetUrl, meta.type, meta.alt, now).run();
      if (result.changes > 0) inserted++;
    } catch { /* skip duplicates */ }
  }

  await logAudit(env.DB, user.id, 'asset.scan', 'page', pageUrl.toString(), {
    brand: body.brand, found: foundUrls.size, inserted,
  });

  return jsonResponse({ ok: true, inserted, total: foundUrls.size });
}

/**
 * GET /api/cms/assets/overrides?domain=&brand=
 * Returns active overrides. Called by _worker.js on every page request.
 * Cached at the edge via Cache-Control.
 */
async function handleListOverrides(request, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);

  const url = new URL(request.url);
  const domain = url.searchParams.get('domain');
  const brand = url.searchParams.get('brand');

  let query = 'SELECT * FROM asset_overrides WHERE active = 1';
  const params = [];

  if (domain) { query += ' AND site_domain = ?'; params.push(domain); }
  if (brand) { query += ' AND brand = ?'; params.push(brand); }

  query += ' ORDER BY created_at DESC';

  const results = await env.DB.prepare(query).bind(...params).all();

  return new Response(JSON.stringify({ overrides: results.results || [] }), {
    headers: {
      'Content-Type': 'application/json',
      // Cache active overrides at edge for 60s; purge via CF API on save
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
    },
  });
}

/**
 * POST /api/cms/assets/overrides
 * Body: { brand, site_domain, url_pattern, r2_key, label? }
 * Creates a new image override (admin only).
 */
async function handleSaveOverride(request, user, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  if (!user) return errorResponse('Unauthorized', 401);

  const body = await request.json().catch(() => null);
  if (!body?.brand || !body?.site_domain || !body?.url_pattern || !body?.r2_key) {
    return errorResponse('Missing required: brand, site_domain, url_pattern, r2_key', 400);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO asset_overrides (brand, site_domain, url_pattern, r2_key, label, applied_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    body.brand, body.site_domain, body.url_pattern, body.r2_key,
    body.label || '', user.id, now, now
  ).run();

  await logAudit(env.DB, user.id, 'create', 'asset_override', body.url_pattern, body);
  return jsonResponse({ ok: true });
}

/**
 * PUT /api/cms/assets/overrides
 * Body: { id, r2_key?, label?, active? }
 * Updates an existing override (admin only).
 */
async function handleUpdateOverride(request, user, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  if (!user) return errorResponse('Unauthorized', 401);

  const body = await request.json().catch(() => null);
  if (!body?.id) return errorResponse('Missing id', 400);

  const fields = [];
  const params = [];

  if (body.r2_key !== undefined) { fields.push('r2_key = ?'); params.push(body.r2_key); }
  if (body.label !== undefined) { fields.push('label = ?'); params.push(body.label); }
  if (body.active !== undefined) { fields.push('active = ?'); params.push(body.active ? 1 : 0); }

  if (fields.length === 0) return errorResponse('Nothing to update', 400);

  fields.push('updated_at = ?');
  params.push(new Date().toISOString(), body.id);

  await env.DB.prepare(
    `UPDATE asset_overrides SET ${fields.join(', ')} WHERE id = ?`
  ).bind(...params).run();

  await logAudit(env.DB, user.id, 'update', 'asset_override', String(body.id), body);
  return jsonResponse({ ok: true });
}

/**
 * DELETE /api/cms/assets/overrides?id=
 * Hard-deletes an override (admin only).
 */
async function handleDeleteOverride(request, user, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  if (!user) return errorResponse('Unauthorized', 401);

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse('Missing id', 400);

  await env.DB.prepare('DELETE FROM asset_overrides WHERE id = ?').bind(id).run();
  await logAudit(env.DB, user.id, 'delete', 'asset_override', id, {});
  return jsonResponse({ ok: true });
}

// ────────────────────────────────────────────────────────────────
//  Gallery Management
// ────────────────────────────────────────────────────────────────

let gallerySchemaReady = false;

async function ensureGallerySchema(db) {
  if (gallerySchemaReady) return;

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cms_galleries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_domain TEXT NOT NULL,
      gallery_slug TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      cover_asset_id TEXT DEFAULT '',
      brand TEXT NOT NULL DEFAULT 'gfv',
      sort_order INTEGER DEFAULT 100,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(site_domain, gallery_slug)
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cms_gallery_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gallery_id INTEGER NOT NULL REFERENCES cms_galleries(id) ON DELETE CASCADE,
      asset_id TEXT NOT NULL,
      sort_order INTEGER DEFAULT 100,
      caption TEXT DEFAULT '',
      alt_text TEXT DEFAULT '',
      link_url TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      added_at TEXT DEFAULT (datetime('now')),
      UNIQUE(gallery_id, asset_id)
    )
  `).run();

  await db.prepare('CREATE INDEX IF NOT EXISTS idx_gallery_site ON cms_galleries(site_domain)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_gallery_brand ON cms_galleries(brand)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_gitem_gallery ON cms_gallery_items(gallery_id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_gitem_asset ON cms_gallery_items(asset_id)').run();

  gallerySchemaReady = true;
}

// ────────────────────────────────────────────────────────────────
//  Content Studio Handlers
// ────────────────────────────────────────────────────────────────

async function handleListRegistries(request, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  const url = new URL(request.url);
  const brand = url.searchParams.get('brand');
  const type = url.searchParams.get('type');
  let query = 'SELECT id, brand, series_id, type, title, description, scene_count, source_file, created_at FROM cms_prompt_registries WHERE 1=1';
  const params = [];
  if (brand) { query += ' AND brand = ?'; params.push(brand); }
  if (type) { query += ' AND type = ?'; params.push(type); }
  query += ' ORDER BY created_at DESC LIMIT 200';
  const { results } = await env.DB.prepare(query).bind(...params).all();
  return jsonResponse({ registries: results || [] });
}

async function handleGetRegistry(id, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  const row = await env.DB.prepare('SELECT * FROM cms_prompt_registries WHERE id = ?').bind(id).first();
  if (!row) return errorResponse('Registry not found', 404);
  return jsonResponse(row);
}

async function handleListGeneratedAssets(request, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);

  const url = new URL(request.url);
  const registryId = url.searchParams.get('registry_id') || '';
  const sceneNumberRaw = url.searchParams.get('scene_number');

  let query = `
    SELECT
      ga.id,
      ga.registry_id,
      ga.scene_number,
      ga.prompt_index,
      ga.prompt_text,
      ga.asset_id,
      ga.r2_key,
      ga.status,
      ga.created_at,
      a.title AS asset_title,
      a.review_status
    FROM cms_generated_assets ga
    LEFT JOIN cms_assets a ON a.id = ga.asset_id
    WHERE 1 = 1
  `;
  const params = [];

  if (registryId) {
    query += ' AND ga.registry_id = ?';
    params.push(registryId);
  }

  if (sceneNumberRaw !== null && sceneNumberRaw !== '') {
    const sceneNumber = Number.parseInt(sceneNumberRaw, 10);
    if (!Number.isNaN(sceneNumber)) {
      query += ' AND ga.scene_number = ?';
      params.push(sceneNumber);
    }
  }

  query += ' ORDER BY ga.prompt_index ASC, ga.created_at DESC LIMIT 100';

  const { results } = await env.DB.prepare(query).bind(...params).all();
  const assets = (results || []).map((row) => ({
    ...row,
    url: row.r2_key ? `/api/cms/media/${row.r2_key}` : '',
  }));

  return jsonResponse({ assets });
}

async function handleSaveRegistry(request, user, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  let data;
  try { data = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }
  if (!data?.id || !data?.title) return errorResponse('id and title are required', 400);
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO cms_prompt_registries
      (id, brand, series_id, type, title, description, scene_count, scenes_json, source_file, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      brand = excluded.brand, series_id = excluded.series_id, type = excluded.type,
      title = excluded.title, description = excluded.description,
      scene_count = excluded.scene_count, scenes_json = excluded.scenes_json,
      source_file = excluded.source_file, updated_at = excluded.updated_at
  `).bind(
    data.id, data.brand || 'gfv', data.series_id || '', data.type || 'episode',
    data.title, data.description || '',
    (() => { try { return JSON.parse(data.scenes_json || '[]').length; } catch { return 0; } })(),
    data.scenes_json || '[]', data.source_file || '', now, now
  ).run();
  await logAudit(env.DB, user.id, 'content_studio.registry.save', 'registry', data.id, { title: data.title });
  return jsonResponse({ ok: true, id: data.id });
}

async function handleCSGenerateImage(request, user, env) {
  if (!env.OPENAI_API_KEY) return errorResponse('OPENAI_API_KEY not configured', 503);
  if (!env.MEDIA_BUCKET) return errorResponse('R2 MEDIA_BUCKET not configured', 503);
  if (!env.DB) return errorResponse('D1 not configured', 503);

  let data;
  try { data = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }
  if (!data?.prompt_text) return errorResponse('prompt_text is required', 400);

  const { registry_id = '', scene_number = 0, prompt_index = 0, prompt_text, brand = 'gfv' } = data;
  const now = new Date().toISOString();

  // Call DALL-E 3
  const oaiRes = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'dall-e-3', prompt: prompt_text, n: 1, size: '1024x1024', response_format: 'url' }),
  });
  if (!oaiRes.ok) {
    const err = await oaiRes.json().catch(() => ({}));
    return errorResponse(err?.error?.message || 'DALL-E 3 generation failed', 502);
  }
  const oaiData = await oaiRes.json();
  const imageUrl = oaiData?.data?.[0]?.url;
  if (!imageUrl) return errorResponse('No image returned from DALL-E 3', 502);

  // Download and store in R2
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) return errorResponse('Failed to download generated image', 502);
  const imgBuffer = await imgRes.arrayBuffer();
  const r2Key = `${brand}/content-studio/${Date.now()}_s${scene_number}_p${prompt_index}.png`;
  await env.MEDIA_BUCKET.put(r2Key, imgBuffer, { httpMetadata: { contentType: 'image/png' } });

  // Save to cms_assets
  const assetId = `cs_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  await env.DB.prepare(`
    INSERT INTO cms_assets
      (id, brand, category, title, file_path, media_type, mime_type, review_status, uploaded_by, created_at, updated_at)
    VALUES (?, ?, 'content-studio', ?, ?, 'image', 'image/png', 'draft', ?, ?, ?)
  `).bind(
    assetId, brand,
    `CS: scene ${scene_number + 1} prompt ${prompt_index + 1}`,
    r2Key, user.id, now, now
  ).run();

  // Track in cms_generated_assets
  const genId = `gen_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  if (registry_id) {
    await env.DB.prepare(`
      INSERT INTO cms_generated_assets
        (id, registry_id, scene_number, prompt_index, prompt_text, asset_id, r2_key, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'done', ?)
    `).bind(genId, registry_id, scene_number, prompt_index, prompt_text, assetId, r2Key, now).run();
  }

  await logAudit(env.DB, user.id, 'content_studio.generate', 'generated_asset', genId, { registry_id, scene_number, prompt_index });

  return jsonResponse({
    generated_asset_id: genId,
    asset_id: assetId,
    r2_key: r2Key,
    url: `/api/cms/media/${r2Key}`,
  }, 201);
}

async function handleCSSchedulePost(request, user, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);

  let data;
  try { data = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }
  if (!data?.generated_asset_id) return errorResponse('generated_asset_id is required', 400);
  if (!Array.isArray(data.platforms) || !data.platforms.length) return errorResponse('platforms[] required', 400);
  if (!data.scheduled_at) return errorResponse('scheduled_at required', 400);

  const { generated_asset_id, platforms, caption = '', scheduled_at, brand = 'gfv' } = data;
  const now = new Date().toISOString();

  // Look up asset_id from cms_generated_assets
  const genRow = await env.DB.prepare('SELECT asset_id FROM cms_generated_assets WHERE id = ?').bind(generated_asset_id).first();
  const assetId = genRow?.asset_id || '';

  const postResult = await env.DB.prepare(`
    INSERT INTO cms_social_posts
      (brand, platform, content, media_ids, scheduled_at, status, created_by, created_at, updated_at)
    VALUES (?, 'multi', ?, ?, ?, 'scheduled', ?, ?, ?)
  `).bind(brand, caption, JSON.stringify(assetId ? [assetId] : []), scheduled_at, user.id, now, now).run();
  const postId = String(postResult.meta?.last_row_id || '');

  const variants = [];
  for (const platform of platforms) {
    const rule = platformRule(platform);
    const composed = caption.length > rule.maxChars ? caption.slice(0, rule.maxChars - 1) + '\u2026' : caption;
    const varResult = await env.DB.prepare(`
      INSERT INTO cms_post_variants
        (post_id, platform, content, media_asset_id, format, char_count, hashtags, scheduled_at, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, '[]', ?, 'pending', ?)
    `).bind(postId, platform, composed, assetId, rule.defaultFormat, composed.length, scheduled_at, now).run();
    variants.push({ id: varResult.meta?.last_row_id, platform, status: 'pending' });
  }

  await logAudit(env.DB, user.id, 'content_studio.schedule', 'social_post', postId, { platforms, scheduled_at });
  return jsonResponse({ post_id: postId, variants }, 201);
}

/**
 * GET /api/cms/galleries?site=&brand=
 */
async function handleListGalleries(request, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  await ensureGallerySchema(env.DB);

  const url = new URL(request.url);
  const site = url.searchParams.get('site');
  const brand = url.searchParams.get('brand');

  let query = 'SELECT g.*, (SELECT COUNT(*) FROM cms_gallery_items gi WHERE gi.gallery_id = g.id AND gi.active = 1) as item_count FROM cms_galleries g WHERE g.active = 1';
  const params = [];

  if (site) { query += ' AND g.site_domain = ?'; params.push(site); }
  if (brand) { query += ' AND g.brand = ?'; params.push(brand); }
  query += ' ORDER BY g.sort_order ASC, g.title ASC';

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return jsonResponse({ galleries: results || [] });
}

/**
 * POST /api/cms/galleries
 * Body: { site_domain, gallery_slug, title, description?, brand?, cover_asset_id?, sort_order? }
 */
async function handleCreateGallery(request, user, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  await ensureGallerySchema(env.DB);

  const data = await request.json();
  if (!data.site_domain || !data.gallery_slug || !data.title) {
    return errorResponse('site_domain, gallery_slug, and title are required');
  }

  const now = new Date().toISOString();
  const result = await env.DB.prepare(`
    INSERT INTO cms_galleries (site_domain, gallery_slug, title, description, cover_asset_id, brand, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    data.site_domain, data.gallery_slug, data.title,
    data.description || '', data.cover_asset_id || '',
    data.brand || 'gfv', data.sort_order || 100, now, now
  ).run();

  await logAudit(env.DB, user.id, 'gallery.create', 'gallery', String(result.meta?.last_row_id || ''), data);
  return jsonResponse({ id: result.meta?.last_row_id, message: 'Gallery created' }, 201);
}

/**
 * PUT /api/cms/galleries/:id
 * Body: { title?, description?, cover_asset_id?, sort_order?, active? }
 */
async function handleUpdateGallery(request, user, env, galleryId) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  await ensureGallerySchema(env.DB);

  const data = await request.json();
  const fields = [];
  const params = [];

  if (data.title !== undefined) { fields.push('title = ?'); params.push(data.title); }
  if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description); }
  if (data.cover_asset_id !== undefined) { fields.push('cover_asset_id = ?'); params.push(data.cover_asset_id); }
  if (data.sort_order !== undefined) { fields.push('sort_order = ?'); params.push(data.sort_order); }
  if (data.active !== undefined) { fields.push('active = ?'); params.push(data.active ? 1 : 0); }

  if (fields.length === 0) return errorResponse('Nothing to update', 400);
  fields.push('updated_at = ?');
  params.push(new Date().toISOString(), galleryId);

  await env.DB.prepare(`UPDATE cms_galleries SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run();
  await logAudit(env.DB, user.id, 'gallery.update', 'gallery', String(galleryId), data);
  return jsonResponse({ message: 'Gallery updated' });
}

/**
 * DELETE /api/cms/galleries/:id
 */
async function handleDeleteGallery(user, env, galleryId) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  await ensureGallerySchema(env.DB);

  await env.DB.prepare('UPDATE cms_galleries SET active = 0, updated_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), galleryId).run();
  await logAudit(env.DB, user.id, 'gallery.delete', 'gallery', String(galleryId), {});
  return jsonResponse({ message: 'Gallery deactivated' });
}

/**
 * GET /api/cms/galleries/:id/items
 * Returns gallery items joined with asset metadata, ordered by sort_order.
 */
async function handleListGalleryItems(env, galleryId) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  await ensureGallerySchema(env.DB);

  const { results } = await env.DB.prepare(`
    SELECT gi.id as item_id, gi.sort_order, gi.caption, gi.alt_text, gi.link_url, gi.added_at,
           a.id as asset_id, a.brand, a.category, a.title, a.file_path, a.media_type,
           a.mime_type, a.file_size, a.width, a.height, a.thumbnail_path, a.tags, a.featured
    FROM cms_gallery_items gi
    JOIN cms_assets a ON gi.asset_id = a.id
    WHERE gi.gallery_id = ? AND gi.active = 1
    ORDER BY gi.sort_order ASC, gi.added_at ASC
  `).bind(galleryId).all();

  return jsonResponse({ items: results || [] });
}

/**
 * POST /api/cms/galleries/:id/items
 * Body: { asset_id, sort_order?, caption?, alt_text?, link_url? }
 */
async function handleAddGalleryItem(request, user, env, galleryId) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  await ensureGallerySchema(env.DB);

  const data = await request.json();
  if (!data.asset_id) return errorResponse('asset_id required');

  const result = await env.DB.prepare(`
    INSERT OR IGNORE INTO cms_gallery_items (gallery_id, asset_id, sort_order, caption, alt_text, link_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(galleryId, data.asset_id, data.sort_order || 100, data.caption || '', data.alt_text || '', data.link_url || '').run();

  await logAudit(env.DB, user.id, 'gallery.item.add', 'gallery_item', data.asset_id, { galleryId });
  return jsonResponse({ id: result.meta?.last_row_id, message: 'Item added to gallery' }, 201);
}

/**
 * PUT /api/cms/galleries/:id/items/reorder
 * Body: { items: [{ item_id: number, sort_order: number }] }
 */
async function handleReorderGalleryItems(request, user, env, galleryId) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  await ensureGallerySchema(env.DB);

  const data = await request.json();
  if (!Array.isArray(data.items)) return errorResponse('items array required');

  for (const item of data.items) {
    if (item.item_id && item.sort_order !== undefined) {
      await env.DB.prepare(
        'UPDATE cms_gallery_items SET sort_order = ? WHERE id = ? AND gallery_id = ?'
      ).bind(item.sort_order, item.item_id, galleryId).run();
    }
  }

  await logAudit(env.DB, user.id, 'gallery.reorder', 'gallery', String(galleryId), { count: data.items.length });
  return jsonResponse({ message: 'Gallery reordered' });
}

/**
 * DELETE /api/cms/galleries/:id/items/:itemId
 */
async function handleRemoveGalleryItem(user, env, galleryId, itemId) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  await ensureGallerySchema(env.DB);

  await env.DB.prepare('UPDATE cms_gallery_items SET active = 0 WHERE id = ? AND gallery_id = ?')
    .bind(itemId, galleryId).run();
  await logAudit(env.DB, user.id, 'gallery.item.remove', 'gallery_item', String(itemId), { galleryId });
  return jsonResponse({ message: 'Item removed from gallery' });
}

// ────────────────────────────────────────────────────────────────
//  Cross-Site Asset Sharing & Replacement
// ────────────────────────────────────────────────────────────────

/**
 * POST /api/cms/assets/:id/share
 * Body: { target_brand, target_gallery_id?, new_category? }
 * Creates a copy reference of the asset for another brand/gallery.
 */
async function handleShareAsset(request, user, env, assetId) {
  if (!env.DB) return errorResponse('D1 not configured', 503);

  const data = await request.json();
  if (!data.target_brand) return errorResponse('target_brand required');

  // Fetch the source asset
  const source = await env.DB.prepare('SELECT * FROM cms_assets WHERE id = ?').bind(assetId).first();
  if (!source) return errorResponse('Source asset not found', 404);

  // Create a shared copy with new brand
  const newId = `shared_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO cms_assets (id, brand, category, title, description, file_path, media_type,
      mime_type, file_size, width, height, thumbnail_path, tags, emotions,
      video_embed_url, video_source, featured, sort_order, uploaded_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    newId, data.target_brand, data.new_category || source.category,
    source.title, source.description || '',
    source.file_path,  // Same R2 file — no duplication
    source.media_type, source.mime_type || '', source.file_size || 0,
    source.width || 0, source.height || 0, source.thumbnail_path || '',
    source.tags || '[]', source.emotions || '[]',
    source.video_embed_url || '', source.video_source || '',
    0, 100, user.id, now, now
  ).run();

  // Optionally add to a target gallery
  if (data.target_gallery_id) {
    await ensureGallerySchema(env.DB);
    await env.DB.prepare(
      'INSERT OR IGNORE INTO cms_gallery_items (gallery_id, asset_id, sort_order) VALUES (?, ?, ?)'
    ).bind(data.target_gallery_id, newId, 100).run();
  }

  await logAudit(env.DB, user.id, 'asset.share', 'asset', assetId, {
    sharedAs: newId, targetBrand: data.target_brand,
  });

  return jsonResponse({ id: newId, message: 'Asset shared', source_id: assetId }, 201);
}

/**
 * GET /api/cms/assets/:id/shares
 * Returns list of brands that already have a copy of this asset (same file_path).
 */
async function handleGetAssetShares(env, assetId) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  const source = await env.DB.prepare(
    'SELECT file_path, brand FROM cms_assets WHERE id = ?'
  ).bind(assetId).first();
  if (!source) return errorResponse('Asset not found', 404);
  const { results } = await env.DB.prepare(
    'SELECT DISTINCT brand FROM cms_assets WHERE file_path = ? AND brand != ? AND active = 1'
  ).bind(source.file_path, source.brand).all();
  return jsonResponse({ brands: (results || []).map(r => r.brand) });
}

/**
 * POST /api/cms/assets/:id/replace
 * Replaces the R2 binary for an existing asset.
 * Expects multipart form data with field "file".
 * Keeps the same R2 key so CDN URLs stay valid; purges cache.
 */
async function handleReplaceAsset(request, user, env, assetId) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  if (!env.MEDIA_BUCKET) return errorResponse('R2 not configured', 503);

  const asset = await env.DB.prepare('SELECT * FROM cms_assets WHERE id = ?').bind(assetId).first();
  if (!asset) return errorResponse('Asset not found', 404);

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return errorResponse('Content-Type must be multipart/form-data');
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file || typeof file === 'string') return errorResponse('No file provided');

  const r2Key = asset.file_path;

  // Overwrite the R2 object with the new file (same key = instant URL update)
  await env.MEDIA_BUCKET.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: {
      replacedBy: user.id,
      replacedAt: new Date().toISOString(),
      originalName: file.name,
    },
  });

  // Bump version and update metadata
  const now = new Date().toISOString();
  const newVersion = (asset.version || 1) + 1;
  await env.DB.prepare(`
    UPDATE cms_assets SET
      mime_type = ?, file_size = ?, version = ?, updated_at = ?
    WHERE id = ?
  `).bind(file.type, file.size, newVersion, now, assetId).run();

  await logAudit(env.DB, user.id, 'asset.replace', 'asset', assetId, {
    filename: file.name, size: file.size, version: newVersion,
  });

  return jsonResponse({
    message: 'Asset replaced',
    r2Key,
    version: newVersion,
    url: `/api/cms/media/${r2Key}`,
  });
}

// ────────────────────────────────────────────────────────────────
//  Site Registry (ecosystem asset overview)
// ────────────────────────────────────────────────────────────────

/**
 * GET /api/cms/sites
 * Returns ecosystem sites with their asset counts from both cms_assets and discovered_assets.
 */
async function handleListSites(env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);

  // Count assets per brand in the asset library
  const brandCounts = await env.DB.prepare(
    'SELECT brand, COUNT(*) as count FROM cms_assets WHERE active = 1 GROUP BY brand'
  ).all();

  // Count discovered assets per site
  let discoveredCounts = { results: [] };
  try {
    discoveredCounts = await env.DB.prepare(
      "SELECT site_domain, COUNT(*) as count FROM discovered_assets WHERE status != 'ignored' GROUP BY site_domain"
    ).all();
  } catch {
    // discovered_assets table may not exist yet
  }

  // Count gallery items per site
  let galleryCounts = { results: [] };
  try {
    galleryCounts = await env.DB.prepare(
      'SELECT g.site_domain, COUNT(gi.id) as count FROM cms_galleries g LEFT JOIN cms_gallery_items gi ON gi.gallery_id = g.id AND gi.active = 1 WHERE g.active = 1 GROUP BY g.site_domain'
    ).all();
  } catch {
    // gallery tables may not exist yet
  }

  // Merge into a site registry
  const siteMap = {};
  for (const row of (brandCounts.results || [])) {
    const domain = brandToDomain(row.brand);
    if (!siteMap[domain]) siteMap[domain] = { domain, brand: row.brand, libraryAssets: 0, discoveredAssets: 0, galleryItems: 0 };
    siteMap[domain].libraryAssets = row.count;
  }
  for (const row of (discoveredCounts.results || [])) {
    if (!siteMap[row.site_domain]) siteMap[row.site_domain] = { domain: row.site_domain, brand: '', libraryAssets: 0, discoveredAssets: 0, galleryItems: 0 };
    siteMap[row.site_domain].discoveredAssets = row.count;
  }
  for (const row of (galleryCounts.results || [])) {
    if (!siteMap[row.site_domain]) siteMap[row.site_domain] = { domain: row.site_domain, brand: '', libraryAssets: 0, discoveredAssets: 0, galleryItems: 0 };
    siteMap[row.site_domain].galleryItems = row.count;
  }

  return jsonResponse({ sites: Object.values(siteMap) });
}

function brandToDomain(brand) {
  const map = {
    gfv: 'goodflippinvibes.com',
    gfd: 'goodflippindesign.com',
    aiaimate: 'aiaimate.com',
    culturesherpa: 'culturesherpa.org',
    citizenapproved: 'citizenapproved.org',
  };
  return map[brand] || brand;
}

/**
 * GET /api/cms/sites/:domain/assets?page=&limit=
 * Returns discovered assets for a specific site.
 */
async function handleListSiteAssets(request, env, domain) {
  if (!env.DB) return errorResponse('D1 not configured', 503);

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(100, parseInt(url.searchParams.get('limit') || '50', 10));
  const offset = (page - 1) * limit;

  let results = { results: [] };
  try {
    results = await env.DB.prepare(
      'SELECT * FROM discovered_assets WHERE site_domain = ? ORDER BY discovered_at DESC LIMIT ? OFFSET ?'
    ).bind(domain, limit, offset).all();
  } catch {
    // Table may not exist
  }

  let total = { total: 0 };
  try {
    total = await env.DB.prepare(
      'SELECT COUNT(*) as total FROM discovered_assets WHERE site_domain = ?'
    ).bind(domain).first();
  } catch {
    // Table may not exist
  }

  return jsonResponse({ assets: results.results || [], total: total?.total || 0, page, limit });
}

// ── Public Gallery Feed ───────────────────────────────────────────────
// GET /api/cms/gallery/:brand
// Returns assets in a format compatible with gallery.html's catalog loader.
// No auth required — safe to call from public pages.
async function handleGalleryFeed(brand, env) {
  const rows = await env.DB.prepare(
    `SELECT id, title, file_path, media_type, mime_type, category, brand, tags, created_at
     FROM cms_assets
     WHERE brand = ? AND active = 1
     ORDER BY created_at DESC
     LIMIT 300`
  ).bind(brand).all();

  const items = (rows.results || []).map((r) => ({
    id: String(r.id),
    title: r.title || '',
    src: r.file_path ? `/api/cms/media/${encodeURIComponent(r.file_path)}` : null,
    href: r.file_path ? `/api/cms/media/${encodeURIComponent(r.file_path)}` : null,
    type: r.media_type || 'image',
    brand: r.brand || brand,
    category: r.category || 'uncategorized',
    tags: r.tags ? r.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    addedAt: r.created_at || null,
  }));

  // Derive unique category list from items
  const categorySet = new Set(items.map((i) => i.category));
  const categories = Array.from(categorySet).sort();

  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=60',
    'Access-Control-Allow-Origin': '*',
  });

  return new Response(JSON.stringify({ brand, categories, items }), { status: 200, headers });
}

// ────────────────────────────────────────────────────────────────
//  NFT Collections
// ────────────────────────────────────────────────────────────────

async function handleListNFTCollections(request, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  await ensureNFTSchema(env.DB);

  const url = new URL(request.url);
  const brand = url.searchParams.get('brand');

  let query = `
    SELECT c.*,
      (SELECT COUNT(*) FROM cms_nft_tokens t WHERE t.collection_id = c.id) as token_count,
      (SELECT COUNT(*) FROM cms_nft_tokens t WHERE t.collection_id = c.id AND t.status = 'minted') as minted_count
    FROM cms_nft_collections c
  `;
  const params = [];
  if (brand) { query += ' WHERE c.brand = ?'; params.push(brand); }
  query += ' ORDER BY c.created_at DESC';

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return jsonResponse({ collections: results || [] });
}

async function handleCreateNFTCollection(request, user, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  await ensureNFTSchema(env.DB);

  let data;
  try { data = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }
  if (!data?.name) return errorResponse('name is required', 400);
  if (!data?.brand) return errorResponse('brand is required', 400);

  const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const now = new Date().toISOString();

  const result = await env.DB.prepare(`
    INSERT INTO cms_nft_collections
      (brand, slug, name, description, contract_address, marketplace_url, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    data.brand, slug, data.name,
    data.description || '', data.contract_address || '', data.marketplace_url || '',
    data.status || 'draft', user.id, now, now
  ).run();

  await logAudit(env.DB, user.id, 'nft_collection.create', 'nft_collection', String(result.meta?.last_row_id), { brand: data.brand, name: data.name });
  return jsonResponse({ id: result.meta?.last_row_id, slug, name: data.name }, 201);
}

async function handleUpdateNFTCollection(request, user, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  await ensureNFTSchema(env.DB);

  let data;
  try { data = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }
  if (!data?.id) return errorResponse('id is required', 400);

  const now = new Date().toISOString();
  const fields = ['name', 'description', 'contract_address', 'marketplace_url', 'status'];
  const updates = fields.filter(f => data[f] !== undefined);
  if (!updates.length) return errorResponse('No updatable fields provided', 400);

  const setClauses = updates.map(f => `${f} = ?`).join(', ');
  const values = updates.map(f => data[f]);

  await env.DB.prepare(`UPDATE cms_nft_collections SET ${setClauses}, updated_at = ? WHERE id = ?`)
    .bind(...values, now, data.id).run();

  await logAudit(env.DB, user.id, 'nft_collection.update', 'nft_collection', String(data.id), { updates });
  return jsonResponse({ success: true, id: data.id });
}

async function handleDeleteNFTCollection(request, user, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  await ensureNFTSchema(env.DB);

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return errorResponse('id is required', 400);

  // Refuse deletion if any token is already minted/listed on-chain
  const mintedCheck = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM cms_nft_tokens WHERE collection_id = ? AND status IN ('minted', 'listed')`
  ).bind(id).first();
  if (mintedCheck?.cnt > 0) return errorResponse('Cannot delete collection with minted tokens', 409);

  await env.DB.prepare('DELETE FROM cms_nft_tokens WHERE collection_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM cms_nft_collections WHERE id = ?').bind(id).run();
  await logAudit(env.DB, user.id, 'nft_collection.delete', 'nft_collection', String(id), {});
  return jsonResponse({ success: true, deleted_id: id });
}

// ────────────────────────────────────────────────────────────────
//  NFT Tokens
// ────────────────────────────────────────────────────────────────

async function handleListNFTTokens(request, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  await ensureNFTSchema(env.DB);

  const url = new URL(request.url);
  const collectionId = url.searchParams.get('collection_id');
  const status = url.searchParams.get('status');

  let query = `
    SELECT t.*, c.name as collection_name, c.brand
    FROM cms_nft_tokens t
    JOIN cms_nft_collections c ON c.id = t.collection_id
  `;
  const conditions = [];
  const params = [];
  if (collectionId) { conditions.push('t.collection_id = ?'); params.push(collectionId); }
  if (status) { conditions.push('t.status = ?'); params.push(status); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY t.edition_number ASC, t.id ASC';

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return jsonResponse({ tokens: results || [] });
}

async function handleCreateNFTToken(request, user, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  await ensureNFTSchema(env.DB);

  let data;
  try { data = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }
  if (!data?.collection_id) return errorResponse('collection_id is required', 400);
  if (!data?.name) return errorResponse('name is required', 400);

  const now = new Date().toISOString();

  // Auto-assign next edition number if not explicitly set
  let edition = data.edition_number ?? null;
  if (edition === null) {
    const maxRow = await env.DB.prepare(
      'SELECT MAX(edition_number) as max_ed FROM cms_nft_tokens WHERE collection_id = ?'
    ).bind(data.collection_id).first();
    edition = (maxRow?.max_ed ?? 0) + 1;
  }

  const result = await env.DB.prepare(`
    INSERT INTO cms_nft_tokens
      (collection_id, asset_id, edition_number, name, description, external_url,
       background_color, animation_url, attributes_json, rarity, rarity_tier, status,
       ipfs_image_cid, ipfs_metadata_cid, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    data.collection_id,
    data.asset_id || '',
    edition,
    data.name,
    data.description || '',
    data.external_url || '',
    data.background_color || '',
    data.animation_url || '',
    typeof data.attributes === 'object' ? JSON.stringify(data.attributes) : (data.attributes_json || '[]'),
    data.rarity || 'Common',
    data.rarity_tier ?? 1,
    data.status || 'draft',
    data.ipfs_image_cid || '',
    data.ipfs_metadata_cid || '',
    now, now
  ).run();

  await logAudit(env.DB, user.id, 'nft_token.create', 'nft_token', String(result.meta?.last_row_id), { collection_id: data.collection_id, edition });
  return jsonResponse({ id: result.meta?.last_row_id, edition_number: edition, name: data.name }, 201);
}

async function handleUpdateNFTToken(request, user, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  await ensureNFTSchema(env.DB);

  let data;
  try { data = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }
  if (!data?.id) return errorResponse('id is required', 400);

  const now = new Date().toISOString();
  const fields = ['name', 'description', 'external_url', 'background_color', 'animation_url',
                  'attributes_json', 'rarity', 'rarity_tier', 'status', 'ipfs_image_cid',
                  'ipfs_metadata_cid', 'token_id_onchain', 'mint_tx_hash', 'minted_at', 'asset_id'];
  const updates = fields.filter(f => data[f] !== undefined);

  // Normalize attributes array → JSON string
  if (data.attributes !== undefined && data.attributes_json === undefined) {
    data.attributes_json = JSON.stringify(data.attributes);
    if (!updates.includes('attributes_json')) updates.push('attributes_json');
  }

  if (!updates.length) return errorResponse('No updatable fields provided', 400);

  const setClauses = updates.map(f => `${f} = ?`).join(', ');
  const values = updates.map(f => data[f]);

  await env.DB.prepare(`UPDATE cms_nft_tokens SET ${setClauses}, updated_at = ? WHERE id = ?`)
    .bind(...values, now, data.id).run();

  await logAudit(env.DB, user.id, 'nft_token.update', 'nft_token', String(data.id), { updates });
  return jsonResponse({ success: true, id: data.id });
}

async function handleDeleteNFTToken(request, user, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  await ensureNFTSchema(env.DB);

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return errorResponse('id is required', 400);

  const row = await env.DB.prepare('SELECT status FROM cms_nft_tokens WHERE id = ?').bind(id).first();
  if (!row) return errorResponse('Token not found', 404);
  if (['minted', 'listed'].includes(row.status)) return errorResponse('Cannot delete minted or listed token', 409);

  await env.DB.prepare('DELETE FROM cms_nft_tokens WHERE id = ?').bind(id).run();
  await logAudit(env.DB, user.id, 'nft_token.delete', 'nft_token', String(id), {});
  return jsonResponse({ success: true, deleted_id: id });
}

async function handleMintNFTToken(request, user, env) {
  if (!env.DB) return errorResponse('D1 not configured', 503);
  await ensureNFTSchema(env.DB);

  const tokenIdMatch = new URL(request.url).pathname.match(/\/nft\/tokens\/(\d+)\/mint$/);
  const id = tokenIdMatch ? tokenIdMatch[1] : null;
  if (!id) return errorResponse('Token ID required in path', 400);

  let data;
  try { data = await request.json(); } catch { data = {}; }

  const row = await env.DB.prepare('SELECT status FROM cms_nft_tokens WHERE id = ?').bind(id).first();
  if (!row) return errorResponse('Token not found', 404);
  if (row.status === 'minted') return errorResponse('Token is already minted', 409);

  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE cms_nft_tokens
    SET status = 'minted', token_id_onchain = ?, mint_tx_hash = ?, ipfs_image_cid = ?,
        ipfs_metadata_cid = ?, minted_at = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    data.token_id_onchain || '',
    data.mint_tx_hash || '',
    data.ipfs_image_cid || '',
    data.ipfs_metadata_cid || '',
    now, now, id
  ).run();

  await logAudit(env.DB, user.id, 'nft_token.mint', 'nft_token', String(id), { tx_hash: data.mint_tx_hash });
  return jsonResponse({ success: true, id, minted_at: now });
}
