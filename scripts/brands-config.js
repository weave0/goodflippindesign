/**
 * brands-config.js — Single source of truth for the GFV/GFD ecosystem.
 *
 * Every brand, platform, handle, color, and capability lives here.
 * Import this in admin.html (inline JSON), workers, and scripts.
 * Updating a handle or adding a platform → change it in ONE place.
 */

const ECOSYSTEM = {
  version: '2.0.0',

  // ─── Brand definitions ────────────────────────────────────────────────────
  brands: {
    gfd: {
      id: 'gfd',
      name: 'Good Flippin Design',
      shortName: 'GFD',
      domain: 'goodflippindesign.com',
      adminUrl: 'https://goodflippindesign.com/admin.html',
      color: '#6c63ff',
      accent: '#a78bfa',
      tagline: 'Strategy-first web + AI consulting',
      voice: 'authoritative, sharp, slightly irreverent — consultant who ships',
      audience: 'CTOs, founders, ops leaders, fellow developers',
      contentPillars: ['case studies', 'dev insights', 'AI strategy', 'behind-the-build'],
      platforms: ['instagram', 'linkedin', 'x'],
      handles: {
        instagram: '@goodflippindesign',
        linkedin: 'good-flippin-design',
        x: '@goodflippindesign',
      },
    },
    gfv: {
      id: 'gfv',
      name: 'Good Flippin Vibes',
      shortName: 'GFV',
      domain: 'goodflippinvibes.com',
      adminUrl: 'https://goodflippindesign.com/admin.html?brand=gfv',
      color: '#10b981',
      accent: '#34d399',
      tagline: 'Creative wellness + community',
      voice: 'warm, playful, humanizing — permission to be yourself',
      audience: 'creatives, wellness seekers, community builders',
      contentPillars: ['community vibes', 'wellness rituals', 'art + photography', 'music + culture'],
      platforms: ['instagram', 'x', 'facebook', 'tiktok', 'pinterest'],
      handles: {
        instagram: '@goodflippinvibes',
        x: '@goodflippinvibes',
        facebook: 'Good Flippin Vibes',
        tiktok: '@goodflippinvibes',
        pinterest: '@goodflippinvibes',
      },
    },
    aiaimate: {
      id: 'aiaimate',
      name: 'AI Aimate',
      shortName: 'Aimate',
      domain: 'aiaimate.com',
      adminUrl: 'https://goodflippindesign.com/admin.html?brand=aiaimate',
      color: '#3b82f6',
      accent: '#93c5fd',
      tagline: 'AI education platform',
      voice: 'curious, accessible, forward-looking — democratizing AI',
      audience: 'early adopters, professionals learning AI, technical teams',
      contentPillars: ['AI tutorials', 'model comparisons', 'use cases', 'industry applications'],
      platforms: ['linkedin', 'x', 'youtube'],
      handles: {
        linkedin: 'ai-aimate',
        x: '@aiaimate',
        youtube: '@aiaimate',
      },
    },
    culturesherpa: {
      id: 'culturesherpa',
      name: 'CultureSherpa',
      shortName: 'Sherpa',
      domain: 'culturesherpa.org',
      adminUrl: 'https://goodflippindesign.com/admin.html?brand=culturesherpa',
      color: '#f59e0b',
      accent: '#fcd34d',
      tagline: 'Interactive cultural atlas',
      voice: 'scholarly yet accessible, wonder-driven, globally curious',
      audience: 'travelers, educators, anthropology enthusiasts, global business teams',
      contentPillars: ['cultural spotlights', 'geographic data viz', 'travel insights', 'anthropology'],
      platforms: ['instagram', 'x', 'pinterest'],
      handles: {
        instagram: '@culturesherpa',
        x: '@culturesherpa',
        pinterest: '@culturesherpa',
      },
    },
    globaldeets: {
      id: 'globaldeets',
      name: 'Global Deets',
      shortName: 'GDeets',
      domain: 'globaldeets.com',
      adminUrl: 'https://goodflippindesign.com/admin.html?brand=globaldeets',
      color: '#8b5cf6',
      accent: '#c4b5fd',
      tagline: 'Project portfolio hub',
      voice: 'data-driven, precise, portfolio-ready',
      audience: 'enterprise clients, procurement teams, technical evaluators',
      contentPillars: ['project case studies', 'data visualizations', 'BI dashboards', 'tech stack spotlights'],
      platforms: ['linkedin', 'x'],
      handles: {
        linkedin: 'global-deets',
        x: '@globaldeets',
      },
    },
  },

  // ─── Platform definitions ─────────────────────────────────────────────────
  platforms: {
    instagram: {
      id: 'instagram',
      label: 'Instagram',
      icon: 'IG',
      color: '#e1306c',
      maxChars: 2200,
      maxHashtags: 30,
      optimalHashtags: 5,
      formats: ['square', 'portrait', 'landscape', 'reel', 'story'],
      defaultFormat: 'square',
      linkInBio: true,         // can't post links in captions
      supportsReels: true,
    },
    x: {
      id: 'x',
      label: 'X (Twitter)',
      icon: 'X',
      color: '#000000',
      maxChars: 280,
      maxHashtags: 2,
      optimalHashtags: 1,
      formats: ['landscape', 'square'],
      defaultFormat: 'landscape',
      linkInBio: false,
      supportsThreads: true,
    },
    linkedin: {
      id: 'linkedin',
      label: 'LinkedIn',
      icon: 'LI',
      color: '#0a66c2',
      maxChars: 3000,
      maxHashtags: 5,
      optimalHashtags: 3,
      formats: ['landscape', 'square', 'portrait'],
      defaultFormat: 'landscape',
      linkInBio: false,
      supportsArticles: true,
    },
    facebook: {
      id: 'facebook',
      label: 'Facebook',
      icon: 'FB',
      color: '#1877f2',
      maxChars: 63206,
      maxHashtags: 10,
      optimalHashtags: 3,
      formats: ['landscape', 'square', 'portrait'],
      defaultFormat: 'landscape',
    },
    tiktok: {
      id: 'tiktok',
      label: 'TikTok',
      icon: 'TT',
      color: '#000000',
      maxChars: 2200,
      maxHashtags: 20,
      optimalHashtags: 5,
      formats: ['portrait'],
      defaultFormat: 'portrait',
      videoOnly: true,
    },
    youtube: {
      id: 'youtube',
      label: 'YouTube',
      icon: 'YT',
      color: '#ff0000',
      maxChars: 5000,
      maxHashtags: 15,
      optimalHashtags: 5,
      formats: ['landscape'],
      defaultFormat: 'landscape',
      supportsShorts: true,
    },
    pinterest: {
      id: 'pinterest',
      label: 'Pinterest',
      icon: 'PN',
      color: '#e60023',
      maxChars: 500,
      maxHashtags: 20,
      optimalHashtags: 10,
      formats: ['portrait', 'square'],
      defaultFormat: 'portrait',
      evergreen: true,          // pins have long shelf life
    },
  },

  // ─── Cross-brand co-marketing partnerships ────────────────────────────────
  // When gfd publishes a "behind-the-build" post, it can auto-suggest sharing to gfv.
  crossPostSuggestions: {
    gfd: {
      'behind-the-build': ['gfv'],
      'ai-strategy': ['aiaimate'],
      'case-study': ['globaldeets'],
    },
    gfv: {
      'art-photography': ['gfd'],
      'community-vibes': ['gfd', 'aiaimate'],
    },
    aiaimate: {
      'ai-tutorials': ['gfd', 'globaldeets'],
    },
    culturesherpa: {
      'cultural-spotlights': ['gfv'],
    },
  },

  // ─── Helpers ──────────────────────────────────────────────────────────────
  brandIds: () => Object.keys(ECOSYSTEM.brands),
  platformIds: () => Object.keys(ECOSYSTEM.platforms),
  brandsArray: () => Object.values(ECOSYSTEM.brands),
  platformsArray: () => Object.values(ECOSYSTEM.platforms),
  getBrand: (id) => ECOSYSTEM.brands[id] || null,
  getPlatform: (id) => ECOSYSTEM.platforms[id] || null,

  /** All platforms used by any brand — for building full matrix */
  allActivePlatforms: () => {
    const seen = new Set();
    for (const b of Object.values(ECOSYSTEM.brands)) {
      b.platforms.forEach((p) => seen.add(p));
    }
    return [...seen];
  },
};

// Node.js / Cloudflare Worker + browser compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ECOSYSTEM };
} else if (typeof globalThis !== 'undefined') {
  globalThis.ECOSYSTEM = ECOSYSTEM;
}
