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
  if (q) {
    query += ' AND (title LIKE ? OR description LIKE ? OR tags LIKE ?)';
    const search = `%${q}%`;
    bindings.push(search, search, search);
  }

  query += ' ORDER BY sort_order ASC, created_at DESC LIMIT ? OFFSET ?';
  bindings.push(limit, offset);

  const stmt = bindings.length > 0
    ? env.DB.prepare(query).bind(...bindings)
    : env.DB.prepare(query);

  const { results } = await stmt.all();

  // Also return total count for pagination
  let countQuery = 'SELECT COUNT(*) as total FROM cms_assets WHERE active = 1';
  const countBindings = [];
  if (brand) { countQuery += ' AND brand = ?'; countBindings.push(brand); }
  if (category) { countQuery += ' AND category = ?'; countBindings.push(category); }
  if (mediaType) { countQuery += ' AND media_type = ?'; countBindings.push(mediaType); }

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
    const mediaType = formData.get('media_type') || (
      file.type.startsWith('video') ? 'video' :
      file.type.startsWith('audio') ? 'audio' :
      file.type === 'application/pdf' ? 'document' : 'image'
    );
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const safeFilename = file.name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .toLowerCase();
    const r2Key = `${brand}/${category}/${Date.now()}_${safeFilename}`;

    await env.MEDIA_BUCKET.put(r2Key, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: {
        brand,
        category,
        originalName: file.name,
        uploadedBy: user.id,
      },
    });

    // Persist metadata to D1 cms_assets
    if (env.DB) {
      const assetId = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO cms_assets
           (id, brand, category, title, file_path, media_type, mime_type, file_size, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(assetId, brand, category, title, r2Key, mediaType, file.type, file.size, user.id).run();
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
 * GET /api/cms/media/* — Serve file from R2 (public, cached)
 */
async function handleServeMedia(r2Key, env) {
  if (!env.MEDIA_BUCKET) {
    return errorResponse('R2 not configured', 503);
  }

  const object = await env.MEDIA_BUCKET.get(r2Key);
  if (!object) return errorResponse('File not found', 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('ETag', object.httpEtag);

  return new Response(object.body, { headers });
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

  const [campaignCount, connectionCount] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as total FROM cms_campaigns WHERE active=1').first(),
    env.DB.prepare('SELECT COUNT(*) as total FROM cms_platform_tokens WHERE is_active=1').first(),
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
    storage: storageInfo,
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

/**
 * GET /api/cms/brands — Distinct brands with counts
 */
async function handleListBrands(env) {
  const { results } = await env.DB.prepare(`
    SELECT brand, COUNT(*) as asset_count
    FROM cms_assets WHERE active=1
    GROUP BY brand
    ORDER BY asset_count DESC
  `).all();

  return jsonResponse(results || []);
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
export async function handleCMSRequest(request, env, user) {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/cms', '');
  const method = request.method;

  try {
    // ── Public routes (no auth needed) ───────────────────
    if (path === '/assets' && method === 'GET') {
      return handleListAssets(request, env);
    }

    // Serve media from R2 (public, cached)
    if (path.startsWith('/media/') && method === 'GET') {
      const r2Key = path.replace('/media/', '');
      return handleServeMedia(r2Key, env);
    }

    // Public categories/brands
    if (path === '/categories' && method === 'GET') {
      return handleListCategories(env);
    }
    if (path === '/brands' && method === 'GET') {
      return handleListBrands(env);
    }
    if (path === '/platform-rules' && method === 'GET') {
      return jsonResponse(PLATFORM_RULES);
    }

    // Single asset (public)
    const assetMatch = path.match(/^\/assets\/([^/]+)$/);
    if (assetMatch && method === 'GET') {
      return handleGetAsset(assetMatch[1], env);
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
    if (path === '/social/campaign' && method === 'POST') {
      return handleCreateCampaignSocialPost(request, user, env);
    }
    if (path === '/social/run-now' && method === 'POST') {
      return handleRunSocialPublisherNow(user, env);
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

    return errorResponse('CMS endpoint not found', 404);

  } catch (err) {
    console.error('[CMS Worker]', err);
    return errorResponse('Internal CMS error', 500);
  }
}
