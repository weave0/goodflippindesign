/**
 * Cloudflare Worker: Social Publisher (Cron Trigger)
 *
 * Runs every 15 minutes via Cloudflare Cron Trigger.
 * Reads cms_post_variants where status='pending' AND scheduled_at <= now
 * Formats media per-platform spec, applies watermark URL, posts via platform APIs.
 * Updates D1 with published/failed status + external post URL.
 *
 * Platform APIs:
 *   Instagram/Facebook — Meta Graph API v21  (free, needs Business account)
 *   X/Twitter          — API v2, OAuth2      (free tier: 1,500 writes/month)
 *   LinkedIn           — Posts API + Images API (REST, needs OAuth)
 *   Pinterest          — v5 Pins API          (free, needs developer account)
 *
 * Cost: $0 — Cloudflare free tier (100K Worker requests/day, D1 free reads/writes)
 *
 * Deploy as standalone Worker (not Pages):
 *   wrangler deploy --config wrangler-social.toml
 * Set secrets:
 *   wrangler secret put META_APP_SECRET --config wrangler-social.toml
 *   wrangler secret put X_API_SECRET --config wrangler-social.toml
 *   wrangler secret put LINKEDIN_CLIENT_SECRET --config wrangler-social.toml
 *   wrangler secret put TOKEN_ENCRYPTION_KEY --config wrangler-social.toml
 */

// ──────────────────────────────────────────────────────────────
//  Platform image specs  (width × height in pixels)
// ──────────────────────────────────────────────────────────────

const PLATFORM_SPECS = {
  instagram: {
    square:    { w: 1080, h: 1080, format: 'square',    ratio: '1:1'   },
    portrait:  { w: 1080, h: 1350, format: 'portrait',  ratio: '4:5'   },
    landscape: { w: 1080, h: 566,  format: 'landscape', ratio: '1.91:1' },
    story:     { w: 1080, h: 1920, format: 'story',     ratio: '9:16'  },
    reel:      { w: 1080, h: 1920, format: 'reel',      ratio: '9:16'  },
    maxCaptionChars: 2200,
    maxHashtags: 30,
  },
  facebook: {
    feed:      { w: 1200, h: 628,  format: 'feed',      ratio: '1.91:1' },
    square:    { w: 1080, h: 1080, format: 'square',    ratio: '1:1'   },
    story:     { w: 1080, h: 1920, format: 'story',     ratio: '9:16'  },
    maxCaptionChars: 63206,
    maxHashtags: 30,
  },
  x: {
    landscape: { w: 1200, h: 675,  format: 'landscape', ratio: '16:9'  },
    square:    { w: 1080, h: 1080, format: 'square',    ratio: '1:1'   },
    maxCaptionChars: 280,
    maxHashtags: 2, // X recommends max 2 hashtags
    maxImages: 4,
  },
  linkedin: {
    landscape: { w: 1200, h: 627,  format: 'landscape', ratio: '1.91:1' },
    square:    { w: 1080, h: 1080, format: 'square',    ratio: '1:1'   },
    portrait:  { w: 627,  h: 1200, format: 'portrait',  ratio: '1:2'   },
    maxCaptionChars: 3000,
    maxHashtags: 5,
  },
  pinterest: {
    standard:  { w: 1000, h: 1500, format: 'standard',  ratio: '2:3'   },
    square:    { w: 1000, h: 1000, format: 'square',    ratio: '1:1'   },
    tall:      { w: 1000, h: 2100, format: 'tall',      ratio: '1:2.1' },
    maxCaptionChars: 500,
    maxHashtags: 20,
  },
  tiktok: {
    reel:      { w: 1080, h: 1920, format: 'reel',      ratio: '9:16'  },
    maxCaptionChars: 150,
    maxHashtags: 5,
  },
  youtube: {
    thumbnail: { w: 1280, h: 720,  format: 'thumbnail', ratio: '16:9'  },
    maxCaptionChars: 5000,
    maxHashtags: 15,
  },
  threads: {
    square:    { w: 1080, h: 1080, format: 'square',    ratio: '1:1'   },
    portrait:  { w: 1080, h: 1350, format: 'portrait',  ratio: '4:5'   },
    maxCaptionChars: 500,
    maxHashtags: 10,
  },
};

// ──────────────────────────────────────────────────────────────
//  Token management (stored in D1, encrypted AES-GCM)
// ──────────────────────────────────────────────────────────────

async function getToken(db, brand, platform, encryptionKey) {
  const row = await db.prepare(`
    SELECT encrypted_payload FROM cms_platform_tokens
    WHERE brand = ? AND platform = ? AND is_active = 1
    ORDER BY created_at DESC LIMIT 1
  `).bind(brand, platform).first();

  if (!row) throw new Error(`No active token for ${brand}/${platform}`);

  try {
    const payload = await decodeStoredPayload(row.encrypted_payload, encryptionKey);
    // Refresh if within 5 minutes of expiry
    if (payload.expires_at && new Date(payload.expires_at) < new Date(Date.now() + 5 * 60 * 1000)) {
      return await refreshToken(db, brand, platform, payload, encryptionKey);
    }
    return payload;
  } catch (e) {
    throw new Error(`Token decrypt failed for ${brand}/${platform}: ${e.message}`);
  }
}

async function decodeStoredPayload(storedPayload, encryptionKey) {
  if (!storedPayload || typeof storedPayload !== 'string') {
    throw new Error('Stored token payload is empty');
  }

  const raw = storedPayload.trim();

  // Backward compatibility: allow legacy plaintext JSON payloads.
  if (raw.startsWith('{')) {
    return JSON.parse(raw);
  }

  const decrypted = await decryptToken(raw, encryptionKey);
  return JSON.parse(decrypted);
}

async function saveToken(db, brand, platform, accountId, accountLabel, payload, encryptionKey) {
  const serialized = JSON.stringify(payload);
  // If no key is configured, fall back to plaintext JSON for compatibility.
  const encrypted = encryptionKey ? await encryptToken(serialized, encryptionKey) : serialized;
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO cms_platform_tokens (brand, platform, account_id, account_label, encrypted_payload, is_active, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(brand, platform, account_id) DO UPDATE SET
      encrypted_payload = excluded.encrypted_payload,
      is_active = 1,
      updated_at = ?
  `).bind(brand, platform, accountId, accountLabel, encrypted, now, now).run();
}

// AES-GCM encrypt/decrypt using Web Crypto (available in all Cloudflare Workers)
async function encryptToken(plaintext, keyMaterial) {
  if (!keyMaterial || typeof keyMaterial !== 'string') {
    throw new Error('TOKEN_ENCRYPTION_KEY is required for token encryption');
  }
  const keyBytes = new TextEncoder().encode(keyMaterial.substring(0, 32).padEnd(32, '0'));
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  const combined = new Uint8Array(iv.byteLength + enc.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(enc), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

async function decryptToken(encrypted, keyMaterial) {
  if (!keyMaterial || typeof keyMaterial !== 'string') {
    throw new Error('TOKEN_ENCRYPTION_KEY is required for encrypted token payloads');
  }
  const keyBytes = new TextEncoder().encode(keyMaterial.substring(0, 32).padEnd(32, '0'));
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  // Normalize base64url → standard base64: oauth.js stores tokens with URL-safe chars (-, _) and no padding
  let normalized = encrypted.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4) normalized += '=';
  const combined = Uint8Array.from(atob(normalized), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(dec);
}

async function refreshToken(db, brand, platform, payload, encryptionKey) {
  if (platform === 'instagram') {
    return await refreshInstagramToken(db, brand, platform, payload, encryptionKey);
  }
  if (platform === 'facebook') {
    return await refreshFacebookToken(db, brand, platform, payload, encryptionKey);
  }
  if (platform === 'x') {
    return await refreshXToken(db, brand, platform, payload, encryptionKey);
  }
  if (platform === 'linkedin') {
    return await refreshLinkedInToken(db, brand, platform, payload, encryptionKey);
  }
  // Pinterest tokens are long-lived (1yr), no refresh needed
  return payload;
}

// ──────────────────────────────────────────────────────────────
//  Meta (Instagram + Facebook) — Graph API v25
// ──────────────────────────────────────────────────────────────

async function refreshInstagramToken(db, brand, platform, payload, encryptionKey) {
  // New Instagram API uses ig_exchange_token at graph.instagram.com
  const url = new URL('https://graph.instagram.com/access_token');
  url.searchParams.set('grant_type', 'ig_refresh_token');
  url.searchParams.set('access_token', payload.access_token);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Instagram token refresh failed');
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  const refreshed = {
    ...payload,
    access_token: data.access_token,
    expires_at: new Date(Date.now() + (data.expires_in || 5184000) * 1000).toISOString(),
  };
  await saveToken(db, brand, platform, payload.ig_user_id, payload.ig_username || payload.ig_user_id, refreshed, encryptionKey);
  return refreshed;
}

async function refreshFacebookToken(db, brand, platform, payload, encryptionKey) {
  const res = await fetch(
    `https://graph.facebook.com/v25.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${payload.app_id}&client_secret=${payload.app_secret}&fb_exchange_token=${payload.access_token}`
  );
  if (!res.ok) throw new Error('Facebook token refresh failed');
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  const refreshed = {
    ...payload,
    access_token: data.access_token,
    expires_at: new Date(Date.now() + (data.expires_in || 5184000) * 1000).toISOString(),
  };
  await saveToken(db, brand, platform, payload.page_id, payload.page_name || payload.page_id, refreshed, encryptionKey);
  return refreshed;
}

/**
 * Post an image to Instagram via Graph API.
 * Two-step: (1) create media container, (2) publish container.
 * @param {object} token - { access_token, ig_user_id }
 * @param {string} imageUrl - publicly accessible URL of the image (served from R2)
 * @param {string} caption
 * @param {string} [mediaType] - IMAGE (default) | REELS | STORIES
 */
async function postInstagram(token, imageUrl, caption, mediaType = 'IMAGE') {
  const igUserId = token.ig_user_id;
  const accessToken = token.access_token;

  // Step 1: Create media container
  const containerRes = await fetch(
    `https://graph.facebook.com/v25.0/${igUserId}/media`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl,
        caption,
        media_type: mediaType,
        access_token: accessToken,
      }),
    }
  );
  const container = await containerRes.json();
  if (!containerRes.ok || container.error) {
    throw new Error(`Instagram container create failed: ${JSON.stringify(container.error || container)}`);
  }

  // Step 2: Poll until container is ready (usually instant for images)
  let ready = false;
  for (let i = 0; i < 10; i++) {
    const statusRes = await fetch(
      `https://graph.facebook.com/v25.0/${container.id}?fields=status_code&access_token=${accessToken}`
    );
    const status = await statusRes.json();
    if (status.status_code === 'FINISHED') { ready = true; break; }
    if (status.status_code === 'ERROR') throw new Error(`Instagram container error: ${JSON.stringify(status)}`);
    await new Promise(r => setTimeout(r, 2000));
  }
  if (!ready) throw new Error('Instagram container not ready after polling');

  // Step 3: Publish
  const publishRes = await fetch(
    `https://graph.facebook.com/v25.0/${igUserId}/media_publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: container.id, access_token: accessToken }),
    }
  );
  const published = await publishRes.json();
  if (!publishRes.ok || published.error) {
    throw new Error(`Instagram publish failed: ${JSON.stringify(published.error || published)}`);
  }

  return {
    external_id: published.id,
    external_url: `https://www.instagram.com/p/${published.id}/`,
  };
}

/**
 * Post a photo to Facebook Page via Graph API.
 * @param {object} token - { access_token, page_id }
 * @param {string} imageUrl
 * @param {string} message
 */
async function postFacebook(token, imageUrl, message) {
  const res = await fetch(
    `https://graph.facebook.com/v25.0/${token.page_id}/photos`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: imageUrl,
        message,
        access_token: token.access_token,
      }),
    }
  );
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Facebook post failed: ${JSON.stringify(data.error || data)}`);
  }

  return {
    external_id: data.post_id || data.id,
    external_url: `https://www.facebook.com/${token.page_id}/posts/${data.post_id || data.id}`,
  };
}

// ──────────────────────────────────────────────────────────────
//  X (Twitter) — API v2, OAuth 2.0 PKCE
// ──────────────────────────────────────────────────────────────

async function refreshXToken(db, brand, platform, payload, encryptionKey) {
  const credentials = btoa(`${payload.client_id}:${payload.client_secret}`);
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: payload.refresh_token,
  });
  const res = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
  if (!res.ok) throw new Error('X token refresh failed');
  const data = await res.json();
  const refreshed = {
    ...payload,
    access_token: data.access_token,
    refresh_token: data.refresh_token || payload.refresh_token,
    expires_at: new Date(Date.now() + (data.expires_in || 7200) * 1000).toISOString(),
  };
  await saveToken(db, brand, platform, payload.account_id, payload.account_label, refreshed, encryptionKey);
  return refreshed;
}

/**
 * Post a tweet with optional image.
 * Requires: tweet.write + offline.access + media.upload scopes
 */
async function postX(token, imageUrl, text) {
  const headers = {
    'Authorization': `Bearer ${token.access_token}`,
    'Content-Type': 'application/json',
  };

  let mediaId = null;
  if (imageUrl) {
    // Step 1: Upload media via v1.1 (v2 media upload still uses v1.1 endpoint)
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error('Failed to fetch image for X upload');
    const imgBytes = await imgRes.arrayBuffer();
    const totalBytes = imgBytes.byteLength;

    // INIT
    const initParams = new URLSearchParams({
      command: 'INIT',
      total_bytes: String(totalBytes),
      media_type: 'image/jpeg',
      media_category: 'tweet_image',
    });
    const initRes = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token.access_token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: initParams,
    });
    const init = await initRes.json();
    if (!initRes.ok) throw new Error(`X media INIT failed: ${JSON.stringify(init)}`);
    mediaId = init.media_id_string;

    // APPEND (send in one chunk for images < 5MB)
    const formData = new FormData();
    formData.append('command', 'APPEND');
    formData.append('media_id', mediaId);
    formData.append('segment_index', '0');
    formData.append('media', new Blob([imgBytes], { type: 'image/jpeg' }));
    await fetch('https://upload.twitter.com/1.1/media/upload.json', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token.access_token}` },
      body: formData,
    });

    // FINALIZE
    const finalizeParams = new URLSearchParams({ command: 'FINALIZE', media_id: mediaId });
    await fetch('https://upload.twitter.com/1.1/media/upload.json', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token.access_token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: finalizeParams,
    });
  }

  // Step 2: Create tweet
  const tweetBody = { text };
  if (mediaId) tweetBody.media = { media_ids: [mediaId] };

  const tweetRes = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers,
    body: JSON.stringify(tweetBody),
  });
  const tweet = await tweetRes.json();
  if (!tweetRes.ok || tweet.errors) {
    throw new Error(`X post failed: ${JSON.stringify(tweet.errors || tweet)}`);
  }

  return {
    external_id: tweet.data.id,
    external_url: `https://x.com/i/web/status/${tweet.data.id}`,
  };
}

// ──────────────────────────────────────────────────────────────
//  LinkedIn — Versioned REST APIs (Posts + Images)
// ──────────────────────────────────────────────────────────────

const LINKEDIN_API_VERSION = '202401';

async function refreshLinkedInToken(db, brand, platform, payload, encryptionKey) {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: payload.refresh_token,
    client_id: payload.client_id,
    client_secret: payload.client_secret,
  });
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  if (!res.ok) throw new Error('LinkedIn token refresh failed');
  const data = await res.json();
  const refreshed = {
    ...payload,
    access_token: data.access_token,
    refresh_token: data.refresh_token || payload.refresh_token,
    expires_at: new Date(Date.now() + (data.expires_in || 5184000) * 1000).toISOString(),
  };
  await saveToken(db, brand, platform, payload.account_id, payload.account_label, refreshed, encryptionKey);
  return refreshed;
}

/**
 * Post to LinkedIn via versioned REST APIs.
 * - Text-only: POST /rest/posts
 * - Image: POST /rest/images?action=initializeUpload → PUT uploadUrl → POST /rest/posts
 */
async function postLinkedIn(token, imageUrl, commentary) {
  const authorUrn = token.person_urn; // urn:li:person:XXXXXX
  const authHeader = `Bearer ${token.access_token}`;

  if (!token?.access_token) throw new Error('LinkedIn token missing access_token');
  if (!authorUrn) throw new Error('LinkedIn token missing person_urn');

  const restHeaders = {
    'Authorization': authHeader,
    'Linkedin-Version': LINKEDIN_API_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
  };

  // Text-only post (no media attached)
  if (!imageUrl) {
    const postRes = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: { ...restHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author: authorUrn,
        commentary,
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      }),
    });

    if (!postRes.ok) {
      const errText = await postRes.text().catch(() => '');
      throw new Error(`LinkedIn post failed (${postRes.status}): ${errText.substring(0, 500)}`);
    }

    const postId = postRes.headers.get('x-restli-id') || '';
    if (!postId) throw new Error('LinkedIn post succeeded but x-restli-id header was missing');

    return {
      external_id: postId,
      external_url: `https://www.linkedin.com/feed/update/${postId}/`,
    };
  }

  // Step 1: Initialize image upload
  const initRes = await fetch('https://api.linkedin.com/rest/images?action=initializeUpload', {
    method: 'POST',
    headers: { ...restHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: authorUrn,
      },
    }),
  });
  const initData = await initRes.json().catch(() => ({}));
  if (!initRes.ok) {
    throw new Error(`LinkedIn initializeUpload failed (${initRes.status}): ${JSON.stringify(initData).substring(0, 500)}`);
  }

  const uploadUrl = initData.value?.uploadUrl;
  const imageUrn = initData.value?.image;
  if (!uploadUrl || !imageUrn) throw new Error('LinkedIn initializeUpload: missing uploadUrl or image URN');

  // Step 2: Upload the binary (PUT) to uploadUrl
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to fetch image for LinkedIn (${imgRes.status})`);
  const imgBytes = await imgRes.arrayBuffer();
  const imgContentType = imgRes.headers.get('Content-Type') || 'application/octet-stream';

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Authorization': authHeader,
      'Content-Type': imgContentType,
    },
    body: imgBytes,
  });
  if (!uploadRes.ok) {
    const uploadText = await uploadRes.text().catch(() => '');
    throw new Error(`LinkedIn image upload failed (${uploadRes.status}): ${uploadText.substring(0, 300)}`);
  }

  // Step 3: Create post referencing the Image URN
  const postRes = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: { ...restHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      author: authorUrn,
      commentary,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      content: {
        media: {
          id: imageUrn,
        },
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
  });

  if (!postRes.ok) {
    const errText = await postRes.text().catch(() => '');
    throw new Error(`LinkedIn post failed (${postRes.status}): ${errText.substring(0, 500)}`);
  }

  const postId = postRes.headers.get('x-restli-id') || '';
  if (!postId) throw new Error('LinkedIn post succeeded but x-restli-id header was missing');

  return {
    external_id: postId,
    external_url: `https://www.linkedin.com/feed/update/${postId}/`,
  };
}

// ──────────────────────────────────────────────────────────────
//  Pinterest — v5 Pins API
// ──────────────────────────────────────────────────────────────

async function postPinterest(token, imageUrl, title, description, boardId, link = '') {
  const res = await fetch('https://api.pinterest.com/v5/pins', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      board_id: boardId || token.default_board_id,
      title,
      description,
      link: link || undefined,
      media_source: { source_type: 'image_url', url: imageUrl },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Pinterest pin failed: ${JSON.stringify(data)}`);

  return {
    external_id: data.id,
    external_url: data.url || `https://www.pinterest.com/pin/${data.id}/`,
  };
}

/**
 * Threads — 2-step: create media container, then publish.
 */
async function postThreads(token, imageUrl, text) {
  const userId = token.threads_user_id;
  const accessToken = token.access_token;
  const baseUrl = `https://graph.threads.net/v1.0/${userId}`;

  // Step 1: Create container
  const containerBody = {
    text,
    access_token: accessToken,
  };
  if (imageUrl) {
    containerBody.media_type = 'IMAGE';
    containerBody.image_url = imageUrl;
  } else {
    containerBody.media_type = 'TEXT';
  }

  const containerRes = await fetch(`${baseUrl}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(containerBody),
  });
  const containerData = await containerRes.json();
  if (!containerRes.ok || containerData.error) {
    throw new Error(`Threads container creation failed: ${containerData.error?.message || JSON.stringify(containerData)}`);
  }

  const creationId = containerData.id;

  // Step 2: Publish the container
  const publishRes = await fetch(`${baseUrl}/threads_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: creationId, access_token: accessToken }),
  });
  const publishData = await publishRes.json();
  if (!publishRes.ok || publishData.error) {
    throw new Error(`Threads publish failed: ${publishData.error?.message || JSON.stringify(publishData)}`);
  }

  const postId = publishData.id;
  return {
    external_id: postId,
    external_url: `https://www.threads.net/post/${postId}`,
  };
}

// ──────────────────────────────────────────────────────────────
//  TikTok Content Posting API v2
//  Uses PULL_FROM_URL: TikTok fetches media directly from R2
// ──────────────────────────────────────────────────────────────
async function postTikTok(token, mediaUrl, text) {
  const accessToken = token.access_token;
  const BASE = 'https://open.tiktokapis.com/v2';

  if (mediaUrl) {
    // Video post via PULL_FROM_URL (TikTok fetches the file from your URL)
    const initRes = await fetch(`${BASE}/post/publish/video/init/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: text.substring(0, 150),
          privacy_level: 'FOLLOWER_OF_CREATOR',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: mediaUrl,
        },
      }),
    });
    const initData = await initRes.json();
    if (!initRes.ok || initData.error?.code !== 'ok') {
      throw new Error(`TikTok video init failed: ${initData.error?.message || JSON.stringify(initData)}`);
    }

    const publishId = initData.data?.publish_id;
    return {
      external_id: publishId || 'pending',
      external_url: `https://www.tiktok.com/`, // final URL available after processing
    };
  } else {
    // Text-only post via direct post API (TikTok allows text posts for some accounts)
    const postRes = await fetch(`${BASE}/post/publish/content/init/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: text.substring(0, 150),
          privacy_level: 'FOLLOWER_OF_CREATOR',
          disable_comment: false,
        },
        source_info: { source: 'FILE_UPLOAD', video_size: 0, chunk_size: 0, total_chunk_count: 0 },
        post_mode: 'DIRECT_POST',
        media_type: 'VIDEO',
      }),
    });
    const postData = await postRes.json();
    if (!postRes.ok || postData.error?.code !== 'ok') {
      throw new Error(`TikTok text post failed: ${postData.error?.message || JSON.stringify(postData)}`);
    }
    return {
      external_id: postData.data?.publish_id || 'pending',
      external_url: 'https://www.tiktok.com/',
    };
  }
}

// ──────────────────────────────────────────────────────────────
//  YouTube Data API v3 — Community post or video description
//  Community posts require youtube.force-ssl scope and
//  are available for channels with 500+ subscribers.
//  Video upload is initiated here as a resumable upload to R2 URL.
// ──────────────────────────────────────────────────────────────
async function postYouTube(token, mediaUrl, text) {
  const accessToken = token.access_token;
  const BASE = 'https://www.googleapis.com';

  if (mediaUrl) {
    // Initiate a resumable upload: fetch video from R2 and upload to YouTube
    // Step 1: Request upload session
    const title = text.substring(0, 100);
    const description = text.substring(0, 5000);

    const initRes = await fetch(
      `${BASE}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': 'video/*',
        },
        body: JSON.stringify({
          snippet: {
            title,
            description,
            categoryId: '22', // People & Blogs
          },
          status: {
            privacyStatus: 'public',
            selfDeclaredMadeForKids: false,
          },
        }),
      }
    );

    if (!initRes.ok) {
      const errText = await initRes.text();
      throw new Error(`YouTube upload init failed (${initRes.status}): ${errText}`);
    }

    // The upload session URL is in the Location header
    const uploadUrl = initRes.headers.get('Location');
    if (!uploadUrl) {
      throw new Error('YouTube did not return an upload session URL');
    }

    // Step 2: Fetch video from R2 and stream to YouTube
    const videoRes = await fetch(mediaUrl);
    if (!videoRes.ok) {
      throw new Error(`Could not fetch video from R2: ${videoRes.status}`);
    }

    const contentType = videoRes.headers.get('Content-Type') || 'video/mp4';
    const contentLength = videoRes.headers.get('Content-Length');

    const uploadHeaders = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': contentType,
    };
    if (contentLength) uploadHeaders['Content-Length'] = contentLength;

    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: uploadHeaders,
      body: videoRes.body,
      duplex: 'half',
    });

    if (!uploadRes.ok && uploadRes.status !== 308) {
      const errText = await uploadRes.text();
      throw new Error(`YouTube upload failed (${uploadRes.status}): ${errText}`);
    }

    const uploadData = await uploadRes.json().catch(() => ({}));
    const videoId = uploadData.id;
    return {
      external_id: videoId || 'pending',
      external_url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : 'https://studio.youtube.com',
    };
  } else {
    // Community post (text only) — requires channel with community post feature
    const communityRes = await fetch(
      `${BASE}/youtube/v3/communityPosts?part=snippet`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          snippet: {
            type: 'textOriginalPost',
            textOriginalPost: { text: text.substring(0, 5000) },
          },
        }),
      }
    );

    if (!communityRes.ok) {
      const errText = await communityRes.text();
      // Community posts may not be available on all channels
      throw new Error(`YouTube community post failed (${communityRes.status}): ${errText}`);
    }

    const communityData = await communityRes.json();
    const postId = communityData.id;
    return {
      external_id: postId,
      external_url: postId ? `https://www.youtube.com/post/${postId}` : 'https://studio.youtube.com',
    };
  }
}

// ──────────────────────────────────────────────────────────────
//  Content formatter (char limits, hashtag truncation)
// ──────────────────────────────────────────────────────────────

function formatContent(content, platform) {
  const spec = PLATFORM_SPECS[platform] || {};
  const maxChars = spec.maxCaptionChars || 500;
  const maxHashtags = spec.maxHashtags || 10;

  // Extract hashtags from content
  const hashtagRegex = /#[\w\u00C0-\u024F]+/g;
  const hashtags = content.match(hashtagRegex) || [];
  const textWithout = content.replace(hashtagRegex, '').trim();

  // Truncate hashtags
  const allowedHashtags = hashtags.slice(0, maxHashtags).join(' ');
  let formatted = `${textWithout}\n\n${allowedHashtags}`.trim();

  // Truncate total to char limit (preserve hashtags, cut the body)
  if (formatted.length > maxChars) {
    const ellipsis = '...';
    const hashtagLen = allowedHashtags.length + 2; // +2 for \n\n
    const bodyMax = maxChars - hashtagLen - ellipsis.length;
    formatted = `${textWithout.substring(0, bodyMax)}${ellipsis}\n\n${allowedHashtags}`.trim();
  }

  // X-specific: no line breaks after the text for cleaner display
  if (platform === 'x') {
    formatted = formatted.replace(/\n\n/g, ' ');
  }

  return { text: formatted, hashtags, charCount: formatted.length };
}

// ──────────────────────────────────────────────────────────────
//  Build a public R2 media URL for the variant's format
// ──────────────────────────────────────────────────────────────

function buildMediaUrl(baseUrl, assetId, format) {
  // R2 public URL pattern: /api/cms/media/{assetId}-{format}.jpg
  // The format-resized + watermarked version is keyed by assetId+format in R2
  if (!baseUrl || !assetId) return null;
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/api/cms/media/${assetId}-${format}.jpg`;
}

// ──────────────────────────────────────────────────────────────
//  Main publish dispatcher
// ──────────────────────────────────────────────────────────────

async function publishVariant(variant, db, env) {
  const { id, platform, content, media_asset_id, format } = variant;
  const brand = variant.brand || 'gfv';

  const now = new Date().toISOString();
  await db.prepare(
    'UPDATE cms_post_variants SET status=?, updated_at=? WHERE id=?'
  ).bind('publishing', now, id).run();

  try {
    // Get token (throws if not configured)
    const token = await getToken(db, brand, platform, env.TOKEN_ENCRYPTION_KEY);

    // Build media URL (if media attached)
    const mediaUrl = media_asset_id
      ? buildMediaUrl(env.SITE_BASE_URL, media_asset_id, format || 'square')
      : null;

    // Format content per platform
    const { text } = formatContent(content, platform);

    let result;
    switch (platform) {
      case 'instagram':
        result = await postInstagram(token, mediaUrl, text);
        break;
      case 'facebook':
        result = await postFacebook(token, mediaUrl, text);
        break;
      case 'x':
        result = await postX(token, mediaUrl, text);
        break;
      case 'linkedin':
        result = await postLinkedIn(token, mediaUrl, text);
        break;
      case 'pinterest':
        result = await postPinterest(token, mediaUrl, text.substring(0, 100), text, token.default_board_id);
        break;
      case 'threads':
        result = await postThreads(token, mediaUrl, text);
        break;
      case 'tiktok':
        result = await postTikTok(token, mediaUrl, text);
        break;
      case 'youtube':
        result = await postYouTube(token, mediaUrl, text);
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    // Record success
    await db.prepare(`
      UPDATE cms_post_variants SET
        status='published', external_id=?, external_url=?,
        published_at=?, error_message='', updated_at=?
      WHERE id=?
    `).bind(result.external_id, result.external_url, now, now, id).run();

    // Update parent post status if all variants are done
    await updateParentPostStatus(db, variant.post_id);

    console.log(`[social-publisher] Published ${platform} variant ${id}: ${result.external_url}`);
    return { success: true, platform, id, url: result.external_url };

  } catch (err) {
    const errorMsg = err.message || String(err);
    console.error(`[social-publisher] Failed ${platform} variant ${id}: ${errorMsg}`);

    const MAX_RETRIES = 3;
    const retryCount = (variant.retry_count || 0) + 1;
    const willRetry = retryCount <= MAX_RETRIES;

    if (willRetry) {
      // Exponential backoff: 15 min × 2^(attempt-1) → 15, 30, 60 min
      const backoffMs = 15 * 60 * 1000 * Math.pow(2, retryCount - 1);
      const retryAt = new Date(Date.now() + backoffMs).toISOString();
      console.warn(`[social-publisher] Scheduling retry ${retryCount}/${MAX_RETRIES} for variant ${id} at ${retryAt}`);
      await db.prepare(
        'UPDATE cms_post_variants SET status=\'pending\', retry_count=?, scheduled_at=?, error_message=?, updated_at=? WHERE id=?'
      ).bind(retryCount, retryAt, errorMsg.substring(0, 500), now, id).run();
    } else {
      await db.prepare(
        'UPDATE cms_post_variants SET status=\'failed\', retry_count=?, error_message=?, updated_at=? WHERE id=?'
      ).bind(retryCount, errorMsg.substring(0, 500), now, id).run();
    }

    return { success: false, platform, id, error: errorMsg, willRetry };
  }
}

async function updateParentPostStatus(db, postId) {
  const { results } = await db.prepare(`
    SELECT status FROM cms_post_variants WHERE post_id=?
  `).bind(postId).all();

  if (!results || results.length === 0) return;

  const statuses = results.map(r => r.status);
  const allDone = statuses.every(s => s === 'published' || s === 'failed');
  const anyPublished = statuses.some(s => s === 'published');

  if (allDone) {
    const parentStatus = anyPublished ? 'published' : 'failed';
    const now = new Date().toISOString();
    await db.prepare(`
      UPDATE cms_social_posts SET status=?, published_at=COALESCE(published_at,?), updated_at=? WHERE id=?
    `).bind(parentStatus, now, now, postId).run();
  }
}

// ──────────────────────────────────────────────────────────────
//  Cron handler — runs every 15 minutes
// ──────────────────────────────────────────────────────────────

async function runScheduler(env) {
  const db = env.DB;
  const now = new Date().toISOString();

  // Fetch all pending variants due for publishing
  const { results: due } = await db.prepare(`
    SELECT v.*, sp.brand
    FROM cms_post_variants v
    JOIN cms_social_posts sp ON sp.id = v.post_id
    WHERE v.status = 'pending'
      AND v.scheduled_at IS NOT NULL
      AND v.scheduled_at <= ?
    ORDER BY v.scheduled_at ASC
    LIMIT 20
  `).bind(now).all();

  if (!due || due.length === 0) {
    console.log('[social-publisher] No posts due for publishing');
    return { published: 0 };
  }

  console.log(`[social-publisher] ${due.length} variants due for publishing`);

  const results = await Promise.allSettled(
    due.map(variant => publishVariant(variant, db, env))
  );

  const succeeded = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
  const failed = results.length - succeeded;

  console.log(`[social-publisher] Cron complete: ${succeeded} published, ${failed} failed`);

  return {
    processed: results.length,
    published: succeeded,
    failed,
  };
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

function unauthorized() {
  return json({ error: 'Unauthorized' }, 401);
}

function isAuthorizedRequest(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  if (!env.INTERNAL_SECRET) return false;
  return authHeader === `Bearer ${env.INTERNAL_SECRET}`;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduler(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      return json({ ok: true, service: 'social-publisher', time: new Date().toISOString() }, 200, {
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      });
    }

    if (url.pathname === '/run-now' && request.method === 'POST') {
      if (!isAuthorizedRequest(request, env)) return unauthorized();

      try {
        const result = await runScheduler(env);
        return json({ ok: true, ...result }, 200, {
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
        });
      } catch (error) {
        return json({ ok: false, error: error.message || String(error) }, 500, {
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
        });
      }
    }

    return json({ error: 'Not found' }, 404, {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    });
  },
};
