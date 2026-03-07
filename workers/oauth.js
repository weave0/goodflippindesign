/**
 * OAuth 2.0 Flow Handler for Social Media Platform Connections
 *
 * Supports: Meta (Instagram + Facebook), X (Twitter), LinkedIn,
 *           Pinterest, TikTok, YouTube (Google), Threads
 *
 * Routes:
 *   GET  /api/cms/oauth/authorize/:platform   — Redirect to platform consent screen
 *   GET  /api/cms/oauth/callback/:platform     — Handle redirect, exchange code, store tokens
 *   GET  /api/cms/oauth/status                 — Check if OAuth secrets are configured
 */

// ──────────────────────────────────────────────────────────────
//  Platform OAuth configuration
// ──────────────────────────────────────────────────────────────

const OAUTH_CONFIGS = {
  meta: {
    authorizeUrl: 'https://www.facebook.com/v25.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v25.0/oauth/access_token',
    longLivedUrl: 'https://graph.facebook.com/v25.0/oauth/access_token',
    // instagram_basic + instagram_content_publish deprecated 2024 → instagram_business_* equivalents
    scopes: 'instagram_business_basic,instagram_business_content_publish,pages_show_list,pages_read_engagement,pages_manage_posts,public_profile',
    platforms: ['instagram', 'facebook'],
    label: 'Meta (Instagram + Facebook)',
    envClientId: 'META_APP_ID',
    envClientSecret: 'META_APP_SECRET',
  },
  x: {
    authorizeUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    scopes: 'tweet.read tweet.write users.read offline.access',
    usePKCE: true,
    platforms: ['x'],
    label: 'X (Twitter)',
    envClientId: 'X_CLIENT_ID',
    envClientSecret: 'X_CLIENT_SECRET',
  },
  linkedin: {
    authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scopes: 'openid profile w_member_social',
    platforms: ['linkedin'],
    label: 'LinkedIn',
    envClientId: 'LINKEDIN_CLIENT_ID',
    envClientSecret: 'LINKEDIN_CLIENT_SECRET',
  },
  pinterest: {
    authorizeUrl: 'https://www.pinterest.com/oauth/',
    tokenUrl: 'https://api.pinterest.com/v5/oauth/token',
    scopes: 'boards:read,pins:read,pins:write',
    platforms: ['pinterest'],
    label: 'Pinterest',
    envClientId: 'PINTEREST_APP_ID',
    envClientSecret: 'PINTEREST_APP_SECRET',
  },
  tiktok: {
    authorizeUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    scopes: 'user.info.basic,video.publish',
    platforms: ['tiktok'],
    label: 'TikTok',
    envClientId: 'TIKTOK_CLIENT_KEY',
    envClientSecret: 'TIKTOK_CLIENT_SECRET',
  },
  youtube: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube',
    platforms: ['youtube'],
    label: 'YouTube (Google)',
    envClientId: 'GOOGLE_CLIENT_ID',
    envClientSecret: 'GOOGLE_CLIENT_SECRET',
    extraParams: { access_type: 'offline', prompt: 'consent' },
  },
  threads: {
    authorizeUrl: 'https://threads.net/oauth/authorize',
    tokenUrl: 'https://graph.threads.net/oauth/access_token',
    longLivedUrl: 'https://graph.threads.net/access_token',
    scopes: 'threads_basic,threads_content_publish',
    platforms: ['threads'],
    label: 'Threads',
    envClientId: 'THREADS_APP_ID',
    envClientSecret: 'THREADS_APP_SECRET',
  },
};

// Map individual platforms to their OAuth provider
const PLATFORM_TO_PROVIDER = {};
for (const [provider, config] of Object.entries(OAUTH_CONFIGS)) {
  for (const platform of config.platforms) {
    PLATFORM_TO_PROVIDER[platform] = provider;
  }
}

// ──────────────────────────────────────────────────────────────
//  Crypto helpers — PKCE + signed state
// ──────────────────────────────────────────────────────────────

function randomBytes(length) {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return arr;
}

function base64urlEncode(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function generatePKCE() {
  const verifier = base64urlEncode(randomBytes(32));
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const challenge = base64urlEncode(digest);
  return { verifier, challenge };
}

/**
 * Create a signed, encrypted state parameter containing session context.
 * Encodes: provider, brand, timestamp, and optionally code_verifier for PKCE.
 */
async function createState(payload, encryptionKey) {
  const raw = JSON.stringify({
    ...payload,
    ts: Date.now(),
    nonce: base64urlEncode(randomBytes(8)),
  });
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(encryptionKey.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  const iv = randomBytes(12);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    keyMaterial,
    new TextEncoder().encode(raw)
  );
  // Pack: iv (12 bytes) + ciphertext
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return base64urlEncode(combined);
}

/**
 * Verify and decrypt a state parameter. Returns null if invalid or expired.
 */
async function verifyState(stateStr, encryptionKey) {
  try {
    const combined = base64urlDecode(stateStr);
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(encryptionKey.padEnd(32, '0').slice(0, 32)),
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      keyMaterial,
      ciphertext
    );
    const payload = JSON.parse(new TextDecoder().decode(decrypted));

    // Reject if state is older than 10 minutes
    if (Date.now() - payload.ts > 10 * 60 * 1000) {
      console.warn('[oauth] State expired');
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────────

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

function redirectResponse(url) {
  return new Response(null, {
    status: 302,
    headers: { Location: url },
  });
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function getCallbackUrl(request, provider) {
  const url = new URL(request.url);
  return `${url.origin}/api/cms/oauth/callback/${provider}`;
}

function getClientCredentials(provider, env) {
  const config = OAUTH_CONFIGS[provider];
  if (!config) return null;
  const clientId = env[config.envClientId];
  const clientSecret = env[config.envClientSecret];
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Encrypt token payload for D1 storage */
async function encryptPayload(payload, encryptionKey) {
  if (!encryptionKey) return JSON.stringify(payload);
  const raw = JSON.stringify(payload);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(encryptionKey.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  const iv = randomBytes(12);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    keyMaterial,
    new TextEncoder().encode(raw)
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return base64urlEncode(combined);
}

// ──────────────────────────────────────────────────────────────
//  Authorize handler — build URL and redirect
// ──────────────────────────────────────────────────────────────

async function handleAuthorize(provider, request, env) {
  const config = OAUTH_CONFIGS[provider];
  if (!config) return errorResponse(`Unknown OAuth provider: ${provider}`, 404);

  const creds = getClientCredentials(provider, env);
  if (!creds) {
    return errorResponse(
      `OAuth not configured for ${config.label}. Set ${config.envClientId} and ${config.envClientSecret} secrets.`,
      503
    );
  }

  const encryptionKey = env.TOKEN_ENCRYPTION_KEY;
  if (!encryptionKey) return errorResponse('TOKEN_ENCRYPTION_KEY not configured', 503);

  const url = new URL(request.url);
  const brand = url.searchParams.get('brand') || 'gfd';
  const redirectUri = getCallbackUrl(request, provider);

  // PKCE (required for X, good practice for others that support it)
  let codeVerifier = null;
  let codeChallenge = null;
  if (config.usePKCE) {
    const pkce = await generatePKCE();
    codeVerifier = pkce.verifier;
    codeChallenge = pkce.challenge;
  }

  // Build state with brand context + optional code_verifier
  const statePayload = { provider, brand };
  if (codeVerifier) statePayload.cv = codeVerifier;
  const state = await createState(statePayload, encryptionKey);

  // Construct authorization URL
  const authUrl = new URL(config.authorizeUrl);

  if (provider === 'tiktok') {
    // TikTok uses client_key instead of client_id
    authUrl.searchParams.set('client_key', creds.clientId);
  } else {
    authUrl.searchParams.set('client_id', creds.clientId);
  }

  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);

  if (provider === 'tiktok') {
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', config.scopes);
  } else if (provider === 'x') {
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', config.scopes);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('force_login', 'true'); // always show account picker
  } else if (provider === 'pinterest') {
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', config.scopes);
  } else {
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', config.scopes);
  }

  // Extra params (e.g., access_type=offline for Google)
  if (config.extraParams) {
    for (const [k, v] of Object.entries(config.extraParams)) {
      authUrl.searchParams.set(k, v);
    }
  }

  return redirectResponse(authUrl.toString());
}

// ──────────────────────────────────────────────────────────────
//  Callback handler — exchange code for tokens, store in D1
// ──────────────────────────────────────────────────────────────

async function handleCallback(provider, request, env) {
  const config = OAUTH_CONFIGS[provider];
  if (!config) return errorResponse(`Unknown OAuth provider: ${provider}`, 404);

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');
  const errorDesc = url.searchParams.get('error_description');

  // Handle denial / error
  if (errorParam) {
    return renderResult('error', config.label, errorDesc || errorParam);
  }

  if (!code || !stateParam) {
    return renderResult('error', config.label, 'Missing authorization code or state parameter.');
  }

  // Verify state
  const encryptionKey = env.TOKEN_ENCRYPTION_KEY;
  const stateData = await verifyState(stateParam, encryptionKey);
  if (!stateData || stateData.provider !== provider) {
    return renderResult('error', config.label, 'Invalid or expired state. Please try connecting again.');
  }

  const brand = stateData.brand || 'gfd';
  const creds = getClientCredentials(provider, env);
  if (!creds) {
    return renderResult('error', config.label, 'OAuth credentials missing on server.');
  }

  const redirectUri = getCallbackUrl(request, provider);

  try {
    let tokenData;
    switch (provider) {
      case 'meta':
        tokenData = await exchangeMeta(code, redirectUri, creds, env);
        break;
      case 'x':
        tokenData = await exchangeX(code, redirectUri, creds, stateData.cv);
        break;
      case 'linkedin':
        tokenData = await exchangeLinkedIn(code, redirectUri, creds);
        break;
      case 'pinterest':
        tokenData = await exchangePinterest(code, redirectUri, creds);
        break;
      case 'tiktok':
        tokenData = await exchangeTikTok(code, redirectUri, creds);
        break;
      case 'youtube':
        tokenData = await exchangeYouTube(code, redirectUri, creds);
        break;
      case 'threads':
        tokenData = await exchangeThreads(code, redirectUri, creds);
        break;
      default:
        return renderResult('error', config.label, 'Provider not implemented.');
    }

    // Store each resolved platform connection
    for (const connection of tokenData.connections) {
      const encPayload = await encryptPayload(connection.payload, encryptionKey);
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
        brand,
        connection.platform,
        connection.label,
        connection.accountId,
        encPayload,
        now
      ).run();
    }

    const platformNames = tokenData.connections.map(c => c.platform).join(', ');
    return renderResult('success', config.label, null, platformNames, tokenData.connections);

  } catch (err) {
    console.error(`[oauth] ${provider} token exchange failed:`, err);
    return renderResult('error', config.label, err.message || 'Token exchange failed.');
  }
}

// ──────────────────────────────────────────────────────────────
//  Platform-specific token exchange implementations
// ──────────────────────────────────────────────────────────────

/**
 * Meta — exchange code for short-lived token, then long-lived token,
 * then enumerate connected IG accounts and Pages.
 */
async function exchangeMeta(code, redirectUri, creds, env) {
  // Step 1: Exchange code for short-lived token
  const tokenUrl = new URL(OAUTH_CONFIGS.meta.tokenUrl);
  tokenUrl.searchParams.set('client_id', creds.clientId);
  tokenUrl.searchParams.set('client_secret', creds.clientSecret);
  tokenUrl.searchParams.set('redirect_uri', redirectUri);
  tokenUrl.searchParams.set('code', code);
  const tokenRes = await fetch(tokenUrl.toString());
  const tokenData = await tokenRes.json();
  if (tokenData.error) throw new Error(tokenData.error.message || tokenData.error);

  // Step 2: Exchange for long-lived token (60-day expiry)
  const llUrl = new URL(OAUTH_CONFIGS.meta.longLivedUrl);
  llUrl.searchParams.set('grant_type', 'fb_exchange_token');
  llUrl.searchParams.set('client_id', creds.clientId);
  llUrl.searchParams.set('client_secret', creds.clientSecret);
  llUrl.searchParams.set('fb_exchange_token', tokenData.access_token);
  const llRes = await fetch(llUrl.toString());
  const llData = await llRes.json();
  if (llData.error) throw new Error(llData.error.message || llData.error);

  const userToken = llData.access_token;
  const expiresAt = new Date(Date.now() + (llData.expires_in || 5184000) * 1000).toISOString();

  // Step 3: Get the user's Pages + Instagram business accounts
  const accountsRes = await fetch(
    `https://graph.facebook.com/v25.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${userToken}`
  );
  const accountsData = await accountsRes.json();
  if (accountsData.error) throw new Error(accountsData.error.message);

  const connections = [];
  const pages = accountsData.data || [];

  for (const page of pages) {
    // Facebook Page connection
    connections.push({
      platform: 'facebook',
      accountId: page.id,
      label: page.name || `Page ${page.id}`,
      payload: {
        access_token: page.access_token,
        page_id: page.id,
        page_name: page.name,
        user_token: userToken,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        expires_at: expiresAt,
      },
    });

    // Instagram Business Account (if linked to this page)
    const igAccount = page.instagram_business_account;
    if (igAccount) {
      connections.push({
        platform: 'instagram',
        accountId: igAccount.id,
        label: igAccount.username ? `@${igAccount.username}` : `IG ${igAccount.id}`,
        payload: {
          access_token: page.access_token,
          ig_user_id: igAccount.id,
          ig_username: igAccount.username || '',
          page_id: page.id,
          page_name: page.name,
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          expires_at: expiresAt,
        },
      });
    }
  }

  if (connections.length === 0) {
    throw new Error('No Facebook Pages found. Ensure your Meta app has the required permissions and your account manages at least one Page.');
  }

  return { connections };
}

/**
 * X (Twitter) — OAuth 2.0 with PKCE, exchange code for tokens.
 */
async function exchangeX(code, redirectUri, creds, codeVerifier) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const basicAuth = btoa(`${creds.clientId}:${creds.clientSecret}`);
  const res = await fetch(OAUTH_CONFIGS.x.tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || 'X token exchange failed');
  }

  // Get user info
  const meRes = await fetch('https://api.twitter.com/2/users/me', {
    headers: { 'Authorization': `Bearer ${data.access_token}` },
  });
  const meData = await meRes.json();
  const username = meData.data?.username || '';
  const userId = meData.data?.id || '';

  return {
    connections: [{
      platform: 'x',
      accountId: userId,
      label: username ? `@${username}` : `X user ${userId}`,
      payload: {
        access_token: data.access_token,
        refresh_token: data.refresh_token || '',
        token_type: data.token_type,
        scope: data.scope,
        expires_at: new Date(Date.now() + (data.expires_in || 7200) * 1000).toISOString(),
        account_id: userId,
        account_label: username ? `@${username}` : '',
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      },
    }],
  };
}

/**
 * LinkedIn — Exchange code, fetch user profile for person URN.
 */
async function exchangeLinkedIn(code, redirectUri, creds) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  });

  const res = await fetch(OAUTH_CONFIGS.linkedin.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || 'LinkedIn token exchange failed');
  }

  // Get user profile for the person URN
  const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { 'Authorization': `Bearer ${data.access_token}` },
  });
  const profile = await profileRes.json();
  const personUrn = profile.sub ? `urn:li:person:${profile.sub}` : '';
  const displayName = profile.name || profile.given_name || '';

  return {
    connections: [{
      platform: 'linkedin',
      accountId: profile.sub || 'me',
      label: displayName || 'LinkedIn Profile',
      payload: {
        access_token: data.access_token,
        refresh_token: data.refresh_token || '',
        person_urn: personUrn,
        display_name: displayName,
        expires_at: new Date(Date.now() + (data.expires_in || 5184000) * 1000).toISOString(),
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      },
    }],
  };
}

/**
 * Pinterest — Exchange code, get user info.
 */
async function exchangePinterest(code, redirectUri, creds) {
  const basicAuth = btoa(`${creds.clientId}:${creds.clientSecret}`);
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(OAUTH_CONFIGS.pinterest.tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
  const data = await res.json();
  if (!res.ok || data.code) {
    throw new Error(data.message || 'Pinterest token exchange failed');
  }

  // Get user info
  const meRes = await fetch('https://api.pinterest.com/v5/user_account', {
    headers: { 'Authorization': `Bearer ${data.access_token}` },
  });
  const me = await meRes.json();

  // Get default board
  const boardsRes = await fetch('https://api.pinterest.com/v5/boards?page_size=1', {
    headers: { 'Authorization': `Bearer ${data.access_token}` },
  });
  const boards = await boardsRes.json();
  const defaultBoard = boards.items?.[0];

  return {
    connections: [{
      platform: 'pinterest',
      accountId: me.username || 'me',
      label: me.username ? `@${me.username}` : 'Pinterest',
      payload: {
        access_token: data.access_token,
        refresh_token: data.refresh_token || '',
        username: me.username || '',
        default_board_id: defaultBoard?.id || '',
        default_board_name: defaultBoard?.name || '',
        expires_at: new Date(Date.now() + (data.expires_in || 2592000) * 1000).toISOString(),
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      },
    }],
  };
}

/**
 * TikTok — Exchange code using client_key pattern.
 */
async function exchangeTikTok(code, redirectUri, creds) {
  const res = await fetch(OAUTH_CONFIGS.tiktok.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: creds.clientId,
      client_secret: creds.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
  const data = await res.json();
  if (data.error || data.data?.error_code) {
    throw new Error(data.error_description || data.data?.description || 'TikTok token exchange failed');
  }

  const tokenInfo = data.data || data;

  return {
    connections: [{
      platform: 'tiktok',
      accountId: tokenInfo.open_id || 'me',
      label: 'TikTok',
      payload: {
        access_token: tokenInfo.access_token,
        refresh_token: tokenInfo.refresh_token || '',
        open_id: tokenInfo.open_id || '',
        scope: tokenInfo.scope || '',
        expires_at: new Date(Date.now() + (tokenInfo.expires_in || 86400) * 1000).toISOString(),
        refresh_expires_at: new Date(Date.now() + (tokenInfo.refresh_expires_in || 31536000) * 1000).toISOString(),
        client_key: creds.clientId,
        client_secret: creds.clientSecret,
      },
    }],
  };
}

/**
 * YouTube (Google) — Exchange code, get channel info.
 */
async function exchangeYouTube(code, redirectUri, creds) {
  const res = await fetch(OAUTH_CONFIGS.youtube.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || 'Google token exchange failed');
  }

  // Get channel info
  const channelRes = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
    { headers: { 'Authorization': `Bearer ${data.access_token}` } }
  );
  const channelData = await channelRes.json();
  const channel = channelData.items?.[0];

  return {
    connections: [{
      platform: 'youtube',
      accountId: channel?.id || 'me',
      label: channel?.snippet?.title || 'YouTube Channel',
      payload: {
        access_token: data.access_token,
        refresh_token: data.refresh_token || '',
        channel_id: channel?.id || '',
        channel_title: channel?.snippet?.title || '',
        scope: data.scope || '',
        expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      },
    }],
  };
}

/**
 * Threads — exchange code for short-lived token, then long-lived token,
 * then fetch user profile (id, username).
 */
async function exchangeThreads(code, redirectUri, creds) {
  // Step 1: Exchange code for short-lived token
  const tokenRes = await fetch(OAUTH_CONFIGS.threads.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || tokenData.error_type) {
    throw new Error(tokenData.error_message || tokenData.error_type || 'Threads token exchange failed');
  }

  // Step 2: Exchange for long-lived token (60-day expiry)
  const llUrl = new URL(OAUTH_CONFIGS.threads.longLivedUrl);
  llUrl.searchParams.set('grant_type', 'th_exchange_token');
  llUrl.searchParams.set('client_secret', creds.clientSecret);
  llUrl.searchParams.set('access_token', tokenData.access_token);
  const llRes = await fetch(llUrl.toString());
  const llData = await llRes.json();
  if (!llRes.ok || llData.error_type) {
    throw new Error(llData.error_message || llData.error_type || 'Threads long-lived token exchange failed');
  }

  const accessToken = llData.access_token;
  const expiresAt = new Date(Date.now() + (llData.expires_in || 5184000) * 1000).toISOString();

  // Step 3: Fetch profile
  const profileRes = await fetch(
    `https://graph.threads.net/v1.0/me?fields=id,username&access_token=${accessToken}`
  );
  const profile = await profileRes.json();
  const userId = profile.id || String(tokenData.user_id);
  const username = profile.username || userId;

  return {
    connections: [{
      platform: 'threads',
      accountId: userId,
      label: `@${username}`,
      payload: {
        access_token: accessToken,
        threads_user_id: userId,
        username,
        expires_at: expiresAt,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      },
    }],
  };
}

// ──────────────────────────────────────────────────────────────
//  Status endpoint — which providers have secrets configured
// ──────────────────────────────────────────────────────────────

function handleOAuthStatus(env) {
  const status = {};
  for (const [provider, config] of Object.entries(OAUTH_CONFIGS)) {
    const creds = getClientCredentials(provider, env);
    status[provider] = {
      configured: !!creds,
      label: config.label,
      platforms: config.platforms,
    };
  }
  return jsonResponse({ providers: status, encryptionReady: !!env.TOKEN_ENCRYPTION_KEY });
}

// ──────────────────────────────────────────────────────────────
//  Result page rendered after callback
// ──────────────────────────────────────────────────────────────

function renderResult(type, providerLabel, errorMsg, platformNames, connections) {
  const isSuccess = type === 'success';
  const iconSVG = isSuccess
    ? '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="16 8 10.5 14 8 11.5"></polyline></svg>'
    : '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';

  const connectionList = isSuccess && connections
    ? connections.map(c => `<div class="conn-item"><span class="conn-platform">${escapeHtmlBasic(c.platform)}</span> <span class="conn-label">${escapeHtmlBasic(c.label)}</span></div>`).join('')
    : '';

  return htmlResponse(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isSuccess ? 'Connected' : 'Connection Failed'} — GFD Command Center</title>
  <meta name="robots" content="noindex, nofollow">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', system-ui, sans-serif; background: #070b15; color: #f4f6fb; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 2rem; }
    .card { max-width: 480px; width: 100%; background: rgba(16,24,44,0.72); border: 1px solid rgba(255,255,255,0.08); border-radius: 18px; padding: 2.5rem 2rem; text-align: center; backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); box-shadow: 0 20px 55px rgba(0,0,0,0.35); animation: fadeUp 0.4s ease both; }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
    .icon { margin-bottom: 1.2rem; }
    h1 { font-size: 1.35rem; font-weight: 650; margin-bottom: 0.5rem; }
    .subtitle { color: #a7b2cc; font-size: 0.92rem; margin-bottom: 1.4rem; line-height: 1.5; }
    .error-msg { color: #f87171; background: rgba(248,113,113,0.08); padding: 0.8rem 1rem; border-radius: 10px; font-size: 0.85rem; margin-bottom: 1.4rem; text-align: left; word-break: break-word; }
    .conn-list { margin-bottom: 1.6rem; text-align: left; }
    .conn-item { display: flex; align-items: center; gap: 0.6rem; padding: 0.55rem 0.8rem; background: rgba(16,24,44,0.6); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; margin-bottom: 0.4rem; font-size: 0.88rem; }
    .conn-platform { background: linear-gradient(135deg, #fbbf24, #22d3ee, #a855f7); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; font-weight: 600; text-transform: capitalize; min-width: 80px; }
    .conn-label { color: #a7b2cc; }
    .btn { display: inline-flex; align-items: center; justify-content: center; padding: 0.7rem 1.6rem; border-radius: 10px; font-size: 0.9rem; font-weight: 550; cursor: pointer; border: none; text-decoration: none; transition: transform 0.15s ease, opacity 0.15s ease; }
    .btn:hover { transform: translateY(-1px); opacity: 0.92; }
    .btn-primary { background: linear-gradient(135deg, #fbbf24, #22d3ee); color: #070b15; }
    .btn-secondary { background: rgba(255,255,255,0.06); color: #f4f6fb; border: 1px solid rgba(255,255,255,0.1); margin-left: 0.6rem; }
    .actions { display: flex; justify-content: center; gap: 0.6rem; flex-wrap: wrap; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${iconSVG}</div>
    <h1>${isSuccess ? 'Successfully Connected' : 'Connection Failed'}</h1>
    <p class="subtitle">${isSuccess
      ? `${escapeHtmlBasic(providerLabel)} is now linked. The scheduler will automatically post to ${escapeHtmlBasic(platformNames)}.`
      : `Could not connect ${escapeHtmlBasic(providerLabel)}.`
    }</p>
    ${!isSuccess && errorMsg ? `<div class="error-msg">${escapeHtmlBasic(errorMsg)}</div>` : ''}
    ${connectionList ? `<div class="conn-list">${connectionList}</div>` : ''}
    <div class="actions">
      <a class="btn btn-primary" href="/admin.html">Back to Command Center</a>
      ${!isSuccess ? `<a class="btn btn-secondary" href="javascript:history.back()">Try Again</a>` : ''}
    </div>
  </div>
  <script>
    // Notify the opener (admin.html) to refresh connections
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: 'oauth-complete', success: ${isSuccess} }, window.location.origin);
    }
  </script>
</body>
</html>`, isSuccess ? 200 : 400);
}

function escapeHtmlBasic(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ──────────────────────────────────────────────────────────────
//  Main router export
// ──────────────────────────────────────────────────────────────

/**
 * Handle all /api/cms/oauth/* requests.
 * @param {Request} request
 * @param {object} env
 * @param {object|null} user - Clerk user (required for authorize, not for callback)
 */
export async function handleOAuthRequest(request, env, user) {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/cms/oauth', '');

  // GET /status — public, check which providers are configured
  if (path === '/status' && request.method === 'GET') {
    return handleOAuthStatus(env);
  }

  // GET /authorize/:provider — requires auth (admin only)
  const authorizeMatch = path.match(/^\/authorize\/([a-z]+)$/);
  if (authorizeMatch && request.method === 'GET') {
    if (!user) return errorResponse('Authentication required', 401);
    if (user.publicMetadata?.role !== 'admin') return errorResponse('Admin access required', 403);
    return handleAuthorize(authorizeMatch[1], request, env);
  }

  // GET /callback/:provider — public (platform redirects here, no Clerk session)
  const callbackMatch = path.match(/^\/callback\/([a-z]+)$/);
  if (callbackMatch && request.method === 'GET') {
    return handleCallback(callbackMatch[1], request, env);
  }

  return errorResponse('OAuth endpoint not found', 404);
}
