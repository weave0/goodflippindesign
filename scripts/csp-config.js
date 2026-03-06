/**
 * GFD Ecosystem - Central CSP & Security Headers Config
 *
 * Single source of truth for Content Security Policy across all sites.
 * Run `node scripts/generate-csp.js` to regenerate all output files.
 *
 * Platforms supported:
 *   cloudflare-pages → generates Cloudflare _headers file
 *   cloudfront       → generates AWS CloudFront response headers policy JSON
 */

'use strict';

// ─── Shared Source Sets ───────────────────────────────────────────────────────
// Reusable domain groups referenced by multiple sites

const SHARED = {
  fontStyle: ['https://fonts.googleapis.com'],
  fontSrc: ['https://fonts.gstatic.com'],
  analytics: [
    'https://www.googletagmanager.com',
    'https://www.google-analytics.com',
    'https://analytics.google.com',
    'https://region1.google-analytics.com',
    'https://plausible.io',
  ],
  cloudflare: [
    'https://cloudflareinsights.com',
    'https://*.cloudflareinsights.com',
    'https://static.cloudflareinsights.com',
  ],
  sentry: [
    'https://*.ingest.sentry.io',
    'https://*.ingest.us.sentry.io',
  ],
  stripe: {
    script: ['https://js.stripe.com'],
    connect: ['https://api.stripe.com'],
    frame: ['https://js.stripe.com', 'https://hooks.stripe.com'],
  },
  clerk: {
    script: ['https://cdn.clerk.dev', 'https://clerk.goodflippinvibes.com'],
    connect: [
      'https://clerk.goodflippinvibes.com',
      'https://api.clerk.com',
    ],
    frame: ['https://accounts.goodflippinvibes.com'],
  },
  cdnLibs: [
    'https://d3js.org',
    'https://cdn.quilljs.com',
    'https://unpkg.com',
    'https://cdnjs.cloudflare.com',
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net',
  ],
};

// ─── Site Definitions ─────────────────────────────────────────────────────────

const SITES = {

  // ── Good Flippin Design (goodflippindesign.com) ──────────────────────────
  gfd: {
    name: 'Good Flippin Design',
    platform: 'cloudflare-pages',
    outputPath: '_headers', // relative to repo root

    csp: {
      'default-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'", ...SHARED.fontStyle],
      'font-src': ["'self'", ...SHARED.fontSrc],
      'img-src': ["'self'", 'https:', 'data:'],
      'script-src': [
        "'self'",
        "'unsafe-inline'",
        ...SHARED.cloudflare,
        'https://www.googletagmanager.com',
        'https://www.google-analytics.com',
        'https://plausible.io',
        ...SHARED.stripe.script,
        ...SHARED.clerk.script,
        'https://www.instagram.com',  // Instagram embed.js
      ],
      'connect-src': [
        "'self'",
        'https://cloudflareinsights.com',
        'https://*.cloudflareinsights.com',
        'https://formspree.io',
        ...SHARED.stripe.connect,
        'https://gfd-stripe.weave0.workers.dev', // Stripe payments CF Worker (replaces AWS Lambda)
        'https://www.google-analytics.com',
        'https://analytics.google.com',
        'https://region1.google-analytics.com',
        'https://plausible.io',
        'https://gfd-auth.weave0.workers.dev',
        ...SHARED.clerk.connect,
        'https://www.instagram.com',   // Instagram embed API
      ],
      'frame-src': [...SHARED.stripe.frame, ...SHARED.clerk.frame, 'https://www.instagram.com', 'https://www.facebook.com'],
    },

    // Non-CSP security headers
    securityHeaders: {
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
    },

    // Link preconnect headers (only for resources the page actually uses)
    linkHeaders: [
      '<https://fonts.googleapis.com>; rel=preconnect; crossorigin',
      '<https://fonts.gstatic.com>; rel=preconnect; crossorigin',
    ],

    // Cache-control rules per path pattern
    cacheRules: [
      { path: '/*.html',  value: 'public, max-age=0, must-revalidate' },
      // NOTE: Do NOT use `immutable` for /assets/* — logos and images are updated
      // between deployments. `immutable` causes edge nodes to cache stale content
      // permanently. Use stale-while-revalidate instead.
      { path: '/assets/*', value: 'public, max-age=86400, stale-while-revalidate=604800' },
      { path: '/*.woff2',  value: 'public, max-age=31536000, immutable' },
      { path: '/*.woff',   value: 'public, max-age=31536000, immutable' },
    ],
  },

  // ── CultureSherpa (culturesherpa.org) ────────────────────────────────────
  culturesherpa: {
    name: 'CultureSherpa',
    platform: 'cloudfront',
    // Output relative to THIS script's location (scripts/); adjust to absolute if needed
    outputPath: 'GFD Dev Projects/CultureSherpa/cloudfront-headers-policy-generated.json',
    // CloudFront policy metadata
    cloudfront: {
      policyName: 'CultureSherpa-Website-CSP-generated',
      comment: 'Auto-generated by scripts/generate-csp.js — do not edit manually',
    },

    csp: {
      'default-src': ["'self'"],
      'script-src': [
        "'self'",
        "'unsafe-inline'",
        ...SHARED.cdnLibs,
        'https://accounts.google.com',
      ],
      'style-src': [
        "'self'",
        "'unsafe-inline'",
        ...SHARED.fontStyle,
        ...SHARED.cdnLibs,
        'https://accounts.google.com',
      ],
      'img-src': ["'self'", 'data:', 'https:'],
      'font-src': [
        "'self'",
        'data:',
        ...SHARED.fontSrc,
        'https://cdnjs.cloudflare.com',
      ],
      'connect-src': [
        "'self'",
        'https://unpkg.com',
        'https://*.basemaps.cartocdn.com',
        // 62p7kwc2jh API Gateway deleted 2026-02-23 (was pointing to nonexistent Lambda)
        'https://ms2ffkzdoolhryqmmws7dxezzu0mgegt.lambda-url.us-east-1.on.aws',
        'https://hr3gjmuapsa3jbbzepuo35sonu0lyrfz.lambda-url.us-east-1.on.aws',
        'https://psbfpk2cuya7s37vuv3rqthjyq0ewjxt.lambda-url.us-east-1.on.aws',
        ...SHARED.sentry,
        'https://culturesherpa-1754407998.s3.amazonaws.com',
        'https://*.s3.us-east-1.amazonaws.com',
        'https://accounts.google.com',
        'https://www.googleapis.com',
      ],
      'frame-src': ['https://accounts.google.com'],
      'worker-src': ["'self'", 'blob:'],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
    },

    // CloudFront security header settings (non-CSP)
    cloudFrontSecurityConfig: {
      XSSProtection: { Override: true, Protection: true, ModeBlock: true },
      FrameOptions: { Override: true, FrameOption: 'SAMEORIGIN' },
      ReferrerPolicy: { Override: true, ReferrerPolicy: 'no-referrer-when-downgrade' },
      ContentTypeOptions: { Override: true },
      StrictTransportSecurity: {
        Override: true,
        IncludeSubdomains: true,
        AccessControlMaxAgeSec: 31536000,
      },
    },
  },

};

module.exports = { SITES, SHARED };
