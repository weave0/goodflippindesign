                (function () {
                    'use strict';

                    let currentBrand = 'gfd';
                    const API = '/api/cms';
                    const ALL_PLATFORMS = ['instagram', 'facebook', 'x', 'linkedin', 'pinterest', 'tiktok', 'youtube'];
                    const PLATFORM_ORDER = ALL_PLATFORMS;

                    // Brand definitions (mirrors brands-config.js for in-browser use)
                    const BRAND_DEFS = {
                        gfd: {
                            name: 'Good Flippin Design', shortName: 'GFD', color: '#6c63ff',
                            platforms: ['instagram', 'linkedin', 'x'],
                            hashtags: ['design', 'webdesign', 'ux', 'ui', 'branding', 'creative', 'tech', 'digitaldesign', 'goodflippindesign', 'goodvibes', 'art', 'love'],
                            highVolumeTags: ['art', 'love', 'goodvibes', 'design', 'creative'],
                        },
                        gfv: {
                            name: 'Good Flippin Vibes', shortName: 'GFV', color: '#10b981',
                            platforms: ['instagram', 'x', 'facebook', 'tiktok', 'pinterest'],
                            hashtags: ['art', 'love', 'goodvibes', 'vibes', 'positivity', 'creative', 'inspiration', 'music', 'culture', 'cultura', 'lifestyle', 'joy', 'energy', 'wellness', 'goodflippingvibes'],
                            highVolumeTags: ['art', 'love', 'goodvibes', 'culture', 'cultura', 'vibes', 'positivity'],
                        },
                        aiaimate: {
                            name: 'AI Aimate', shortName: 'Aimate', color: '#3b82f6',
                            platforms: ['linkedin', 'x', 'youtube'],
                            hashtags: ['ai', 'artificialintelligence', 'machinelearning', 'tech', 'innovation', 'future', 'aiart', 'automation', 'deeplearning', 'generativeai', 'aiaimate', 'art', 'creative'],
                            highVolumeTags: ['ai', 'art', 'tech', 'innovation', 'future'],
                        },
                        culturesherpa: {
                            name: 'CultureSherpa', shortName: 'CultureSherpa', color: '#f59e0b',
                            platforms: ['linkedin', 'x', 'instagram', 'facebook'],
                            hashtags: ['culture', 'cultura', 'travel', 'diversity', 'globalcitizen', 'worldcultures', 'heritage', 'multicultural', 'history', 'culturesherpa', 'art', 'love', 'goodvibes', 'explore'],
                            highVolumeTags: ['culture', 'cultura', 'travel', 'art', 'love', 'goodvibes', 'diversity'],
                            platformHashtags: {
                                instagram: ['culture', 'art', 'travel', 'love', 'history', 'beautiful', 'photography', 'explore', 'world', 'people', 'diversity', 'heritage', 'indigenous', 'traditions', 'multicultural', 'globalcitizen', 'worldcultures', 'culturesherpa', 'culturalheritage', 'anthropology', 'folklore', 'humanstories', 'cultureiseverywhere', 'culturaleducation', 'educate', 'goodvibes', 'culturaldiversity', 'exploreculture', 'ethnicculture', 'cultureislife'],
                                linkedin: ['CultureSherpa', 'CulturalIntelligence', 'DEI', 'GlobalMindset', 'CrossCulturalCommunication', 'Anthropology', 'WorldCultures', 'CulturalHeritage'],
                                x: ['CultureSherpa', 'WorldCultures', 'History', 'Diversity', 'Culture'],
                                facebook: ['CultureSherpa', 'WorldCultures', 'Diversity', 'Heritage', 'Culture'],
                            },
                        },
                        globaldeets: {
                            name: 'Global Deets', shortName: 'GlobalDeets', color: '#8b5cf6',
                            platforms: ['linkedin', 'x'],
                            hashtags: ['data', 'analytics', 'businessintelligence', 'insights', 'strategy', 'enterprise', 'tech', 'bi', 'dashboard', 'globaldeets', 'datavisualization'],
                            highVolumeTags: ['data', 'tech', 'analytics', 'strategy'],
                        },
                        citizenapproved: {
                            name: 'CitizenApproved', shortName: 'CitApproved', color: '#ef4444',
                            platforms: ['instagram', 'x', 'linkedin'],
                            hashtags: ['civictech', 'democracy', 'community', 'civic', 'government', 'publicservice', 'voters', 'citizenapproved', 'love', 'goodvibes'],
                            highVolumeTags: ['community', 'love', 'goodvibes', 'civic'],
                        },
                    };

                    // ── Ecosystem & Quick-Launch registries ──────────────────────────
                    // checks: { ga4, sentry, csp, ci, tests, onerror, monitor }
                    // true = confirmed ✓ | false = confirmed ✗ | null = unknown/N/A
                    const SITE_REGISTRY = [
                        {
                            id: 'gfd', name: 'Good Flippin Design', domain: 'goodflippindesign.com', purpose: 'Main portfolio + consultancy', hosting: 'cf-pages', liveUrl: 'https://goodflippindesign.com', adminUrl: 'https://dash.cloudflare.com/?to=/:account/pages/view/goodflippindesign', color: '#6c63ff', repo: 'weave0/goodflippindesign', notes: 'Primary site. All workers live here.',
                            checks: { ga4: true, sentry: true, csp: true, ci: true, tests: true, onerror: true, monitor: true }
                        },
                        {
                            id: 'gfv', name: 'Good Flippin Vibes', domain: 'goodflippinvibes.com', purpose: 'Wellness platform · origin brand', hosting: 'cf-pages', liveUrl: 'https://goodflippinvibes.com', adminUrl: 'https://dash.cloudflare.com/?to=/:account/pages/view/good-flippin-vibes', color: '#10b981', repo: 'weave0/good-flippin-vibes', notes: 'Vite build. Uses Plausible analytics. onerror + HSTS added 2026-03-13.',
                            checks: { ga4: true, sentry: false, csp: true, ci: true, tests: false, onerror: true, monitor: true }
                        },
                        {
                            id: 'aiaimate', name: 'AI Aimate', domain: 'aiaimate.com', purpose: 'AI education platform (Next.js)', hosting: 'vercel', liveUrl: 'https://aiaimate.com', adminUrl: 'https://vercel.com/weave0/portal', color: '#3b82f6', repo: 'weave0/aiaimate', notes: '⚠️ Vercel — not CF. ErrorMonitor component added 2026-03-13. Needs Sentry + test suite.',
                            checks: { ga4: true, sentry: false, csp: true, ci: true, tests: false, onerror: true, monitor: true }
                        },
                        {
                            id: 'culturesherpa', name: 'CultureSherpa', domain: 'culturesherpa.org', purpose: 'Interactive cultural atlas', hosting: 'cf-pages', liveUrl: 'https://culturesherpa.org', adminUrl: 'https://dash.cloudflare.com/?to=/:account/pages/view/culturesherpa', color: '#f59e0b', repo: 'weave0/CultureSherpa', notes: 'Astro + Python API. GA4 (G-WM6Q66W9W0) confirmed. onerror inline script added to BaseLayout 2026-03-13.',
                            checks: { ga4: true, sentry: false, csp: true, ci: true, tests: false, onerror: true, monitor: true }
                        },
                        {
                            id: 'citizenapproved', name: 'CitizenApproved', domain: 'citizenapproved.org', purpose: 'Civic engagement platform', hosting: 'cf-pages', liveUrl: 'https://citizenapproved.org', adminUrl: 'https://dash.cloudflare.com/?to=/:account/pages/view/citizenapproved', color: '#ef4444', repo: 'weave0/CitizenApproved', notes: 'Next.js + TS. GA4 (G-WM6Q66W9W0) confirmed in layout. ErrorMonitor component added 2026-03-13.',
                            checks: { ga4: true, sentry: false, csp: true, ci: true, tests: false, onerror: true, monitor: true }
                        },
                        {
                            id: 'globaldeets', name: 'GlobalDeets', domain: 'globaldeets.com', purpose: 'Portfolio project hub', hosting: 'cf-pages', liveUrl: 'https://globaldeets.com', adminUrl: 'https://dash.cloudflare.com/?to=/:account/pages/view/globaldeets', color: '#8b5cf6', repo: 'weave0/globaldeets', notes: 'Password-gated. GA4 was already present. Added onerror, updated CSP (jsdelivr), and CI workflow 2026-03-13.',
                            checks: { ga4: true, sentry: false, csp: true, ci: true, tests: false, onerror: true, monitor: true }
                        },
                        {
                            id: 'brettleeweaver', name: 'Brett Lee Weaver', domain: 'www.brettleeweaver.com', purpose: 'Personal site / brand hub', hosting: 'cf-pages', liveUrl: 'https://www.brettleeweaver.com', adminUrl: 'https://dash.cloudflare.com', color: '#c084fc', repo: 'weave0/brettleeweaver', notes: 'Cloudflare-hosted personal showcase. Created repo 2026-03-13. GA4 + onerror + _headers (CSP/HSTS/X-Frame) + CI added. Connect to CF Pages to deploy.',
                            checks: { ga4: true, sentry: false, csp: true, ci: true, tests: false, onerror: true, monitor: true }
                        },
                        {
                            id: 'minnesotapeace', name: 'MN Peace', domain: 'minnesotapeace.com', purpose: 'Jamie Rigling mediation (consolidated from jamierigling.com)', hosting: 'cf-pages', liveUrl: 'https://minnesotapeace.com', adminUrl: 'https://dash.cloudflare.com', color: '#38bdf8', repo: 'weave0/jamie-mediation', notes: 'Canonical home for Jamie Rigling Mediation. jamierigling.com + GFD inline page sunsetted 2026-03-15. GA4 + onerror + _headers + CI.',
                            checks: { ga4: true, sentry: false, csp: true, ci: true, tests: false, onerror: true, monitor: true }
                        },
                        {
                            id: 'thyown', name: 'ThyOwn', domain: null, purpose: 'In development · Python', hosting: 'undeployed', liveUrl: null, adminUrl: null, color: '#64748b', repo: null, notes: 'No repo, not deployed.',
                            checks: { ga4: null, sentry: null, csp: null, ci: null, tests: null, onerror: null, monitor: null }
                        },
                        {
                            id: 'summitview', name: 'SummitView', domain: null, purpose: 'In development · Python', hosting: 'undeployed', liveUrl: null, adminUrl: null, color: '#1abc9c', repo: 'weave0/SummitView', notes: 'Has GitHub repo, not deployed.',
                            checks: { ga4: null, sentry: null, csp: null, ci: null, tests: null, onerror: null, monitor: null }
                        },
                        {
                            id: 'weave', name: 'Weave', domain: null, purpose: 'In development · Python', hosting: 'undeployed', liveUrl: null, adminUrl: null, color: '#94a3b8', repo: null, notes: 'Exploratory Python project.',
                            checks: { ga4: null, sentry: null, csp: null, ci: null, tests: null, onerror: null, monitor: null }
                        },
                    ];

                    const QUICK_LINKS = [
                        { label: 'Cloudflare Dashboard', icon: '🔶', url: 'https://dash.cloudflare.com', group: 'Hosting' },
                        { label: 'CF Pages', icon: '📄', url: 'https://dash.cloudflare.com/?to=/:account/pages', group: 'Hosting' },
                        { label: 'CF Workers', icon: '⚙️', url: 'https://dash.cloudflare.com/?to=/:account/workers', group: 'Hosting' },
                        { label: 'CF D1 Database', icon: '🗄️', url: 'https://dash.cloudflare.com/?to=/:account/d1', group: 'Hosting' },
                        { label: 'CF R2 Storage', icon: '🪣', url: 'https://dash.cloudflare.com/?to=/:account/r2', group: 'Hosting' },
                        { label: 'Vercel (aiaimate)', icon: '▲', url: 'https://vercel.com/weave0/portal', group: 'Dev' },
                        { label: 'GitHub Repos', icon: '🐙', url: 'https://github.com/weave0', group: 'Dev' },
                        { label: 'Clerk Auth', icon: '🔐', url: 'https://dashboard.clerk.com', group: 'Auth' },
                        { label: 'Stripe', icon: '💳', url: 'https://dashboard.stripe.com', group: 'Payments' },
                        { label: 'Formspree', icon: '📬', url: 'https://formspree.io/forms', group: 'Forms' },
                        { label: 'GA4 Analytics', icon: '📈', url: 'https://analytics.google.com', group: 'Analytics' },
                        { label: 'Sentry', icon: '🐛', url: 'https://sentry.io', group: 'Monitoring' },
                    ];

                    // Maps each platform to its OAuth provider key
                    const PLATFORM_TO_PROVIDER = {
                        instagram: 'instagram', facebook: 'facebook', x: 'x',
                        linkedin: 'linkedin', pinterest: 'pinterest',
                        tiktok: 'tiktok', youtube: 'youtube', threads: 'threads',
                    };

                    const PROVIDER_INFO = {
                        instagram: { label: 'Instagram', platforms: ['instagram'] },
                        facebook: { label: 'Facebook', platforms: ['facebook'] },
                        x: { label: 'X (Twitter)', platforms: ['x'] },
                        linkedin: { label: 'LinkedIn', platforms: ['linkedin'] },
                        pinterest: { label: 'Pinterest', platforms: ['pinterest'] },
                        tiktok: { label: 'TikTok', platforms: ['tiktok'] },
                        youtube: { label: 'YouTube', platforms: ['youtube'] },
                        threads: { label: 'Threads', platforms: ['threads'] },
                    };

                    const state = {
                        clerk: null,
                        mediaToken: '',
                        uploadQueue: [],
                        selectedLibraryIds: new Set(),
                        currentView: 'overview',
                        assets: [],
                        campaigns: [],
                        variants: [],
                        allConnections: [],
                        connections: [],
                        socialAccounts: [],
                        brandWorkflows: {},
                        platformRules: {},
                        oauthStatus: {},
                        selectedPlatforms: new Set(['linkedin', 'x']),
                        selectedAssetId: '',
                        calendarDate: new Date(),
                        crossPostBrands: new Set(),
                        dripEntries: [],
                        dripSelectedPlatforms: new Set(['linkedin', 'x', 'instagram', 'facebook']),
                        dripPostsPerDay: 2,
                        dripTimes: ['14:00', '20:00'],
                        discoveredAssets: [],
                        discoveredPage: 1,
                        discoveredTotal: 0,
                        overrides: [],
                        galleries: [],
                        selectedGalleryId: null,
                        galleryItems: [],
                        csRegistries: [],
                        csCurrentRegistry: null,
                        csCurrentScene: 0,
                        csPromptStudioBaseUrl: '',
                        lastHealthMap: {},
                        mlCatalog: null,
                    };

                    function $(id) {
                        return document.getElementById(id);
                    }

                    function debounce(fn, delay) {
                        let t;
                        return function (...args) {
                            clearTimeout(t);
                            t = setTimeout(() => fn.apply(this, args), delay);
                        };
                    }

                    function escapeHtml(str) {
                        const div = document.createElement('div');
                        div.textContent = str || '';
                        return div.innerHTML;
                    }

                    const PROMPT_STUDIO_BASES = [
                        'http://localhost:5000',
                        'http://localhost:5050',
                    ];

                    function toast(msg, type = 'success') {
                        const el = $('toast');
                        el.className = type + ' show';
                        el.textContent = msg;
                        window.clearTimeout(el._timer);
                        el._timer = window.setTimeout(() => {
                            el.classList.remove('show');
                        }, 3000);
                    }

                    function toIsoFromLocal(localValue) {
                        if (!localValue) return null;
                        return new Date(localValue).toISOString();
                    }

                    function localFromIso(isoValue) {
                        if (!isoValue) return '';
                        const d = new Date(isoValue);
                        const pad = (n) => String(n).padStart(2, '0');
                        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                    }

                    function formatDateTime(value) {
                        if (!value) return '-';
                        return new Date(value).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                        });
                    }

                    // Returns the base /api/cms/media/... path (no token). Used for data-r2 attr
                    // so the token-refresh sweep can patch img src without a full re-render.
                    function assetBase(asset) {
                        const path = asset.thumbnail_path || asset.file_path || '';
                        if (!path) return '';
                        if (path.startsWith('http://') || path.startsWith('https://')) return path;
                        return '/api/cms/media/' + path.split('/').map(encodeURIComponent).join('/');
                    }

                    // Returns the full src URL with the current session token appended as ?t=
                    function assetUrl(asset) {
                        const base = assetBase(asset);
                        if (!base) return '';
                        if (base.startsWith('http')) return base; // external URL — no token needed
                        return state.mediaToken ? base + '?t=' + encodeURIComponent(state.mediaToken) : base;
                    }

                    async function refreshMediaToken() {
                        try {
                            if (state.clerk?.session) {
                                const newToken = await state.clerk.session.getToken() || '';
                                if (newToken && newToken !== state.mediaToken) {
                                    state.mediaToken = newToken;
                                    // Patch any already-rendered media img srcs so stale tokens
                                    // don't cause 401s on lazy-loaded images after the JWT expires.
                                    const enc = encodeURIComponent(newToken);
                                    document.querySelectorAll('img[data-r2]').forEach((img) => {
                                        const base = img.getAttribute('data-r2');
                                        if (base) img.src = base + '?t=' + enc;
                                    });
                                    // Also repatch proxy thumbnails in the Review Queue
                                    document.querySelectorAll('img[data-proxy-url]').forEach((img) => {
                                        const extUrl = img.getAttribute('data-proxy-url');
                                        if (extUrl) img.src = `/api/cms/proxy-img?url=${encodeURIComponent(extUrl)}&t=${enc}`;
                                    });
                                }
                            }
                        } catch { /* silently keep existing token */ }
                    }

                    async function api(path, opts = {}, _retry = false) {
                        const headers = {
                            ...(opts.headers || {}),
                        };

                        // Always get a fresh token — Clerk SDK caches internally and auto-refreshes
                        // before expiry so this is cheap (no extra network call when token is still valid)
                        if (state.clerk?.session) {
                            try {
                                const freshToken = await state.clerk.session.getToken();
                                if (freshToken) headers.Authorization = 'Bearer ' + freshToken;
                            } catch (tokenErr) {
                                console.warn('[api] Could not get Clerk token:', tokenErr);
                            }
                        }

                        let body = opts.body;
                        if (body && typeof body === 'object' && !(body instanceof FormData)) {
                            headers['Content-Type'] = 'application/json';
                            body = JSON.stringify(body);
                        }

                        // Accept full paths (e.g. /api/blog) in addition to /api/cms-relative paths
                        const url = path.startsWith('/api/') ? path : API + path;
                        const res = await fetch(url, {
                            ...opts,
                            headers,
                            body,
                        });

                        // On 401, force a session reload and retry once so a recovered session works
                        if (res.status === 401 && !_retry && state.clerk?.session) {
                            try {
                                await state.clerk.session.reload();
                                return api(path, opts, true);
                            } catch { /* fall through — surface the real error below */ }
                        }

                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) {
                            const msg = data.error || data.message || `${res.status} ${res.statusText}`;
                            throw new Error(msg);
                        }
                        return data;
                    }

                    async function initAuth() {
                        try {
                            state.clerk = window.Clerk;
                            await state.clerk.load();

                            if (!state.clerk.user) {
                                state.clerk.openSignIn({ redirectUrl: window.location.href });
                                return;
                            }

                            let role = state.clerk.user.publicMetadata?.role;
                            if (role !== 'admin') {
                                // First sign-in: trigger server-side admin role assignment for whitelisted emails
                                // Uses /api/profile — a real authenticated endpoint that calls ensureAdminRole()
                                try {
                                    const token = await state.clerk.session.getToken();
                                    await fetch('/api/profile', { headers: { Authorization: 'Bearer ' + token } });
                                    await state.clerk.user.reload();
                                    role = state.clerk.user.publicMetadata?.role;
                                } catch (e) { /* server role assignment unavailable */ }
                            }
                            if (role !== 'admin') {
                                $('auth-loading').classList.add('hide');
                                $('auth-denied').classList.remove('hide');
                                return;
                            }

                            $('user-email').textContent = state.clerk.user.primaryEmailAddress?.emailAddress || 'admin';

                            $('auth-gate').style.display = 'none';
                            $('admin-app').style.display = 'block';

                            await boot();
                        } catch (err) {
                            $('auth-loading').textContent = 'Auth failed. Check Clerk configuration.';
                            console.error('[admin auth]', err);
                        }
                    }

                    async function boot() {
                        bindUI();
                        await refreshMediaToken();
                        setInterval(refreshMediaToken, 55 * 1000); // Clerk short-lived JWTs; refresh before expiry
                        // Live countdown for next scheduled post (refreshes every 30s)
                        setInterval(function () {
                            if (state.currentView !== 'overview') return;
                            const upcoming2 = [...state.variants]
                                .filter((r) => r.scheduled_at && new Date(r.scheduled_at) > new Date())
                                .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
                            const tel = $('ov-next-post-timer');
                            if (tel) tel.textContent = upcoming2[0] ? '&#9201; ' + formatCountdown(upcoming2[0].scheduled_at) : '';
                        }, 30000);
                        await refreshAll();
                        renderPlatformPicker();
                        renderBrandSwitcher();
                        initDripBuilder();
                        updateComposerCounters();
                        initCommandPalette();
                        initKeyboardShortcuts();
                        wireSocialFeed();
                        // Pre-load DCC data so Overview Today's Cultures hero is populated on login
                        if (window.__adminPanels?.['daily-cultures']) {
                            window.__adminPanels['daily-cultures']();
                        }
                        // Mission Control panels
                        renderEcosystemMap();
                        renderQuickLaunch();
                        initOpsBoard();
                        // Background pre-fetch CI status so Overview KPI is populated on load
                        // (public repo — no PAT needed; calls ecoFetchCIRuns which is hoisted)
                        (async function prefetchCIStatus() {
                            const ciEl = $('kpi-ci-failures');
                            if (!ciEl) return;
                            let totalFail = 0;
                            for (const r of ECO_REPOS) {
                                const d = await ecoFetchCIRuns(r.owner, r.repo);
                                if (d.runs) totalFail += d.runs.filter(x => x.conclusion === 'failure').length;
                            }
                            if (ciEl.textContent === '—') {
                                ciEl.textContent = String(totalFail);
                                ciEl.className = 'kpi-value ' + (totalFail === 0 ? 'emerald' : totalFail <= 2 ? 'gold' : 'rose');
                            }
                        })();
                    }

                    // ── Command Palette ──────────────────────────────────────────────
                    function initCommandPalette() {
                        const NAV_ITEMS = Object.entries(PAGE_CONTEXTS).map(([view, ctx]) => ({
                            type: 'view',
                            view,
                            num: document.querySelector(`.nav-btn[data-view="${view}"] .nav-num`)?.textContent || '',
                            icon: document.querySelector(`.nav-btn[data-view="${view}"] .nav-icon`)?.innerHTML || '',
                            label: ctx.name,
                            group: 'Panels',
                        }));

                        const PROJECT_ITEMS = SITE_REGISTRY
                            .filter(s => s.liveUrl)
                            .map(s => ({
                                type: 'project',
                                view: null,
                                url: s.liveUrl,
                                num: '↗',
                                icon: '',
                                label: s.name,
                                sub: s.domain,
                                group: 'Projects',
                            }));

                        const ACTION_ITEMS = [
                            { type: 'action', view: null, num: '▶', icon: '', label: 'Run Ecosystem Sweep', group: 'Actions', action: () => { $('eco-sweep-btn')?.click(); logActivity('Sweep', 'Triggered ecosystem sweep via command palette'); } },
                            { type: 'action', view: null, num: '⬇', icon: '', label: 'Export Studio Manifest', group: 'Actions', action: exportStudioManifest },
                            { type: 'action', view: null, num: '+', icon: '', label: 'Add Ops Flag', group: 'Actions', action: () => { navigateToView('overview'); setTimeout(() => $('ops-add-title')?.focus(), 250); } },
                            { type: 'action', view: null, num: '⟳', icon: '', label: 'Refresh All Data', group: 'Actions', action: () => { $('refresh-btn')?.click(); } },
                        ];

                        const ALL_ITEMS = [...NAV_ITEMS, ...PROJECT_ITEMS, ...ACTION_ITEMS];

                        const wrap = $('cmd-palette-wrap');
                        const input = $('cmd-input');
                        const list = $('cmd-results');
                        let selected = 0;
                        let filtered = [];

                        function renderItem(it, i) {
                            const selAttr = i === 0 ? 'true' : 'false';
                            const cls = it.type === 'action' ? ' cmd-item--action' : it.type === 'project' ? ' cmd-item--project' : '';
                            const sub = it.sub ? `<span class="cmd-item-sub">${escapeHtml(it.sub)}</span>` : '';
                            return `<div class="cmd-item${cls}" data-idx="${i}" aria-selected="${selAttr}" role="option">` +
                                `<span class="cmd-item-num">${escapeHtml(it.num)}</span>` +
                                `<span class="cmd-item-icon">${it.icon}</span>` +
                                `<span class="cmd-item-label">${escapeHtml(it.label)}</span>` +
                                sub +
                                `</div>`;
                        }

                        function render(items) {
                            filtered = items;
                            selected = 0;
                            if (!items.length) {
                                list.innerHTML = '<div class="cmd-section-label">No matches found</div>';
                                return;
                            }
                            // Group results
                            const groups = {};
                            items.forEach((it, i) => {
                                if (!groups[it.group]) groups[it.group] = [];
                                groups[it.group].push({ it, i });
                            });
                            list.innerHTML = Object.entries(groups).map(([grp, entries]) =>
                                `<div class="cmd-section-group">${escapeHtml(grp)}</div>` +
                                entries.map(({ it, i }) => renderItem(it, i)).join('')
                            ).join('');

                            list.querySelectorAll('.cmd-item').forEach((el) => {
                                el.addEventListener('click', () => activateItem(filtered[parseInt(el.dataset.idx, 10)]));
                            });
                        }

                        function activateItem(it) {
                            if (!it) return;
                            closeCmd();
                            if (it.type === 'view') {
                                navigateToView(it.view);
                            } else if (it.type === 'project' && it.url) {
                                logActivity('Open', it.label, 'external');
                                window.open(it.url, '_blank', 'noopener');
                            } else if (it.type === 'action' && it.action) {
                                it.action();
                            }
                        }

                        function updateSelection(newIdx) {
                            const items = list.querySelectorAll('.cmd-item');
                            if (!items.length) return;
                            items[selected]?.setAttribute('aria-selected', 'false');
                            selected = (newIdx + items.length) % items.length;
                            items[selected]?.setAttribute('aria-selected', 'true');
                            items[selected]?.scrollIntoView({ block: 'nearest' });
                        }

                        function openCmd() {
                            render(ALL_ITEMS);
                            input.value = '';
                            wrap.classList.add('active');
                            requestAnimationFrame(() => input.focus());
                        }

                        function closeCmd() {
                            wrap.classList.remove('active');
                            input.value = '';
                        }

                        input.addEventListener('input', () => {
                            const q = input.value.trim().toLowerCase();
                            render(q ? ALL_ITEMS.filter(it =>
                                it.label.toLowerCase().includes(q) ||
                                it.num.toLowerCase().includes(q) ||
                                (it.sub || '').toLowerCase().includes(q) ||
                                it.group.toLowerCase().includes(q)
                            ) : ALL_ITEMS);
                        });

                        input.addEventListener('keydown', (e) => {
                            if (e.key === 'ArrowDown') { e.preventDefault(); updateSelection(selected + 1); }
                            else if (e.key === 'ArrowUp') { e.preventDefault(); updateSelection(selected - 1); }
                            else if (e.key === 'Enter') {
                                activateItem(filtered[selected]);
                            } else if (e.key === 'Escape') { closeCmd(); }
                        });

                        // Close on backdrop click
                        wrap.addEventListener('click', (e) => { if (e.target === wrap) closeCmd(); });

                        // Open button in topbar
                        const cmdKBtn = $('cmd-k-btn');
                        if (cmdKBtn) cmdKBtn.addEventListener('click', openCmd);

                        // Expose for keyboard shortcut
                        window.__openCmdPalette = openCmd;
                    }

                    // ── Keyboard shortcuts ───────────────────────────────────────────
                    function initKeyboardShortcuts() {
                        const VIEWS = [
                            'overview', 'connections', 'planner', 'composer', 'social-feed',
                            'library', 'drip', 'review-queue', 'overrides', 'galleries',
                            'content-studio', 'ecosystem', 'blog-manager', 'storage',
                            'donations', 'analytics', 'community', 'notifications', 'characters', 'daily-cultures',
                            'nft-studio', 'brands',
                            'music-library',
                        ];

                        document.addEventListener('keydown', (e) => {
                            // Ignore when typing in inputs / textareas / contenteditable
                            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) ||
                                e.target.isContentEditable) return;

                            // Ctrl+K or Cmd+K — command palette
                            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                                e.preventDefault();
                                window.__openCmdPalette?.();
                                return;
                            }

                            // Alt+1..9 → panels 1-9; Alt+Shift+1..9 → panels 10-18
                            if (e.altKey && !e.ctrlKey && !e.metaKey) {
                                const n = parseInt(e.key, 10);
                                if (!isNaN(n) && n >= 1 && n <= 9) {
                                    e.preventDefault();
                                    const idx = e.shiftKey ? n + 8 : n - 1;
                                    const view = VIEWS[idx];
                                    if (view) navigateToView(view);
                                }
                            }
                        });
                    }

                    function bindUI() {
                        document.querySelectorAll('.nav-btn').forEach((btn) => {
                            btn.addEventListener('click', () => {
                                navigateToView(btn.dataset.view);
                            });
                        });

                        const ecoRefresh = $('eco-refresh-btn');
                        if (ecoRefresh) ecoRefresh.addEventListener('click', refreshEcosystem);

                        $('refresh-btn').addEventListener('click', refreshAll);
                        $('manual-run-btn').addEventListener('click', runQueueNow);
                        $('sign-out-btn').addEventListener('click', () => state.clerk.signOut({ redirectUrl: '/' }));

                        $('open-campaign-modal').addEventListener('click', () => {
                            $('campaign-id').value = '';
                            $('campaign-modal-title').textContent = 'New Campaign';
                            $('campaign-name').value = '';
                            $('campaign-cadence').value = 'weekly';
                            $('campaign-start').value = '';
                            $('campaign-end').value = '';
                            $('campaign-objective').value = '';
                            openModal('campaign-modal');
                        });
                        $('open-connection-modal').addEventListener('click', () => {
                            renderOAuthProviderGrid();
                            openModal('connection-modal');
                        });
                        $('open-handle-modal').addEventListener('click', () => openModal('handle-modal'));
                        $('open-workflow-modal').addEventListener('click', () => openModal('workflow-modal'));
                        $('save-campaign-btn').addEventListener('click', saveCampaign);
                        $('save-connection-btn').addEventListener('click', saveConnection);
                        $('save-handle-btn').addEventListener('click', saveHandle);
                        $('save-workflow-btn').addEventListener('click', saveWorkflow);
                        $('submit-composer').addEventListener('click', schedulePostSet);

                        // Connection modal tab switching
                        document.querySelectorAll('.conn-tab').forEach((tab) => {
                            tab.addEventListener('click', () => {
                                document.querySelectorAll('.conn-tab').forEach((t) => t.classList.remove('active'));
                                document.querySelectorAll('.conn-tab-panel').forEach((p) => p.classList.remove('active'));
                                tab.classList.add('active');
                                $('conn-tab-' + tab.dataset.connTab).classList.add('active');
                            });
                        });

                        // Listen for OAuth callback completion (postMessage from popup/redirect)
                        window.addEventListener('message', (ev) => {
                            if (ev.origin !== window.location.origin) return;
                            if (ev.data?.type === 'oauth-complete') {
                                closeModal('connection-modal');
                                toast(ev.data.success ? 'Platform connected via OAuth' : 'OAuth connection failed', ev.data.success ? 'success' : 'error');
                                refreshAll();
                            }
                        });

                        // Check for OAuth result in URL (for same-window redirect flows)
                        const urlParams = new URLSearchParams(window.location.search);
                        if (urlParams.get('oauth') === 'success') {
                            toast('Platform connected via OAuth', 'success');
                            window.history.replaceState({}, '', window.location.pathname);
                            refreshAll();
                        } else if (urlParams.get('oauth') === 'error') {
                            toast('OAuth connection failed', 'error');
                            window.history.replaceState({}, '', window.location.pathname);
                        }

                        $('calendar-prev').addEventListener('click', async () => {
                            state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() - 1, 1);
                            await loadCalendar();
                        });

                        $('calendar-next').addEventListener('click', async () => {
                            state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() + 1, 1);
                            await loadCalendar();
                        });

                        $('composer-content').addEventListener('input', () => { updateComposerCounters(); renderPostPreviews(); });
                        $('composer-hashtags').addEventListener('input', () => { updateComposerCounters(); renderPostPreviews(); });

                        $('library-search').addEventListener('input', debounce(reloadLibrary, 350));
                        $('library-brand').addEventListener('change', reloadLibrary);
                        $('library-category').addEventListener('input', debounce(reloadLibrary, 350));
                        $('library-type').addEventListener('change', reloadLibrary);
                        $('library-status').addEventListener('change', reloadLibrary);
                        $('library-select-all').addEventListener('change', (ev) => {
                            const checked = ev.target.checked;
                            document.querySelectorAll('.asset-check').forEach((cb) => {
                                cb.checked = checked;
                                const id = cb.dataset.checkId;
                                if (checked) state.selectedLibraryIds.add(id);
                                else state.selectedLibraryIds.delete(id);
                            });
                            const bab = $('batch-approve-btn');
                            if (bab) {
                                const n = state.selectedLibraryIds.size;
                                bab.hidden = n === 0;
                                bab.textContent = `Approve Selected (${n})`;
                            }
                        });
                        $('batch-approve-btn').addEventListener('click', batchApproveSelected);

                        $('lib-prev-btn')?.addEventListener('click', () => { state.libPage = Math.max(0, (state.libPage || 0) - 1); loadAssets().then(renderLibrary); });
                        $('lib-next-btn')?.addEventListener('click', () => { state.libPage = (state.libPage || 0) + 1; loadAssets().then(renderLibrary); });

                        $('bulk-approve-all-btn').addEventListener('click', async () => {
                            const brand = $('library-status').value !== 'approved' ? currentBrand : null;
                            const brandLabel = brand ? ` for <strong>${brand}</strong>` : ' across all brands';
                            const draftFilter = $('library-status').value || 'draft';
                            if (draftFilter === 'approved') {
                                return toast('Already filtered to approved assets — switch filter to Draft first.', 'warn');
                            }
                            showConfirm(`Bulk-approve ALL draft assets${brandLabel}? This will mark every matching asset as approved.`, async () => {
                                try {
                                    const body = { confirm: true, from_status: 'draft' };
                                    if (brand) body.brand = brand;
                                    const result = await api('/assets/bulk-approve', { method: 'POST', body: JSON.stringify(body) });
                                    toast(`${result.approved} asset${result.approved === 1 ? '' : 's'} approved`, 'success');
                                    await loadAssets();
                                    renderLibrary();
                                } catch (err) {
                                    toast(err.message || 'Bulk approve failed', 'error');
                                }
                            });
                        });

                        // ── Bulk Ingest ──────────────────────────────────────────────
                        // Populate bulk-brand select from BRAND_DEFS
                        const bulkBrand = $('bulk-brand');
                        Object.entries(BRAND_DEFS).forEach(([id, def]) => {
                            const opt = document.createElement('option');
                            opt.value = id;
                            opt.textContent = def.shortName;
                            if (id === currentBrand) opt.selected = true;
                            bulkBrand.appendChild(opt);
                        });

                        $('bulk-cancel-btn').addEventListener('click', clearBulkQueue);
                        $('bulk-upload-btn').addEventListener('click', commitBulkUpload);
                        initBulkBrandListener();

                        // ── Asset Edit Modal ─────────────────────────────────────────
                        $('asset-edit-save-btn').addEventListener('click', saveAssetEdit);
                        $('asset-edit-delete-btn').addEventListener('click', () => deleteAsset($('asset-edit-id').value));

                        // ── Site Overrides ───────────────────────────────────────────
                        $('open-override-modal').addEventListener('click', () => openOverrideModal());
                        $('save-override-btn').addEventListener('click', saveOverride);
                        $('overrides-refresh-btn').addEventListener('click', async () => {
                            await loadOverrides();
                            renderOverrides();
                        });
                        $('override-filter-brand').addEventListener('change', async () => {
                            await loadOverrides();
                            renderOverrides();
                        });
                        $('override-filter-domain').addEventListener('input', async () => {
                            await loadOverrides();
                            renderOverrides();
                        });

                        // ── Review Queue ─────────────────────────────────────────────
                        $('rq-refresh-btn').addEventListener('click', async () => {
                            state.discoveredPage = 1;
                            await loadDiscoveredAssets();
                            renderReviewQueue();
                            updateReviewBadge();
                        });
                        $('rq-filter-brand').addEventListener('change', async () => {
                            state.discoveredPage = 1;
                            await loadDiscoveredAssets();
                            renderReviewQueue();
                        });
                        $('rq-filter-status').addEventListener('change', async () => {
                            state.discoveredPage = 1;
                            await loadDiscoveredAssets();
                            renderReviewQueue();
                        });
                        $('rq-scan-btn').addEventListener('click', () => {
                            const url = $('rq-scan-url').value.trim();
                            const brand = $('rq-scan-brand').value;
                            if (url) scanPage(brand, url);
                        });
                        document.querySelectorAll('.rq-quick-scan').forEach((btn) => {
                            btn.addEventListener('click', () => scanPage(btn.dataset.brand, btn.dataset.url));
                        });
                        $('claim-asset-confirm-btn').addEventListener('click', confirmClaimAsset);

                        // ── Upload Dropzone Setup ────────────────────────────────────
                        initUploadZone();
                        initUrlImport();

                        // ── Post Preview Toggle ───────────────────────────────────────
                        const previewToggle = $('preview-toggle');
                        const previewPanel = $('composer-preview-panel');
                        if (previewToggle && previewPanel) {
                            previewToggle.addEventListener('click', () => {
                                const isOpen = previewToggle.getAttribute('aria-expanded') === 'true';
                                previewToggle.setAttribute('aria-expanded', String(!isOpen));
                                previewPanel.style.display = isOpen ? 'none' : 'block';
                                if (!isOpen) renderPostPreviews();
                            });
                        }

                        // ── Getting Started Panel ────────────────────────────────────
                        const gsPanel = $('getting-started');
                        if (gsPanel) {
                            $('gs-dismiss')?.addEventListener('click', () => {
                                sessionStorage.setItem('gs-dismissed', '1');
                                gsPanel.classList.add('d-none');
                            });
                            document.querySelectorAll('[data-view-shortcut]').forEach((btn) => {
                                btn.addEventListener('click', () => navigateToView(btn.dataset.viewShortcut));
                            });
                        }

                        document.querySelectorAll('[data-open-daily-cultures]').forEach((btn) => {
                            btn.addEventListener('click', () => openDailyCultureCalendar());
                        });

                        document.querySelectorAll('[data-open-brand-studio]').forEach((btn) => {
                            btn.addEventListener('click', () => openBrandStudio(btn.dataset.openBrandStudio));
                        });

                        document.querySelectorAll('[data-open-brand-gallery]').forEach((btn) => {
                            btn.addEventListener('click', () => openBrandGallery(btn.dataset.openBrandGallery));
                        });

                        // ── Drip Builder ─────────────────────────────────────────────
                        $('drip-add-entry').addEventListener('click', () => addDripEntry());
                        $('drip-import-json-btn').addEventListener('click', () => openModal('drip-import-modal'));
                        $('drip-import-confirm').addEventListener('click', importDripJSON);
                        $('drip-clear-entries').addEventListener('click', () => {
                            if (state.dripEntries.length === 0) return;
                            showConfirm('Clear all ' + state.dripEntries.length + ' drip entries?', () => {
                                state.dripEntries = [];
                                renderDripEntries();
                                updateDripSummary();
                            });
                        });
                        $('drip-preview-btn').addEventListener('click', generateDripPreview);
                        $('drip-confirm-btn').addEventListener('click', confirmDripSchedule);

                        document.querySelectorAll('.ppd-pill').forEach((pill) => {
                            pill.addEventListener('click', () => {
                                state.dripPostsPerDay = Number(pill.dataset.ppd);
                                document.querySelectorAll('.ppd-pill').forEach((p) => p.classList.remove('active'));
                                pill.classList.add('active');
                                while (state.dripTimes.length < state.dripPostsPerDay) {
                                    state.dripTimes.push('12:00');
                                }
                                renderDripTimes();
                                updateDripSummary();
                            });
                        });

                        $('drip-start-date').addEventListener('change', updateDripSummary);
                        $('drip-campaign').addEventListener('change', updateDripSummary);

                        // ── Gallery panel button wiring ─────────────────────────────
                        $('open-gallery-modal')?.addEventListener('click', () => openGalleryModal());
                        $('save-gallery-btn')?.addEventListener('click', saveGallery);
                        $('gallery-add-btn')?.addEventListener('click', () => {
                            const assetId = $('gallery-add-asset')?.value;
                            if (!assetId) { toast('Select an asset first.', 'warn'); return; }
                            addGalleryItem(state.selectedGalleryId, assetId);
                        });
                        $('gallery-filter-brand')?.addEventListener('change', async () => {
                            await loadGalleries();
                            renderGalleriesList();
                        });

                        document.querySelectorAll('[data-close-modal]').forEach((btn) => {
                            btn.addEventListener('click', () => closeModal(btn.getAttribute('data-close-modal')));
                        });

                        document.querySelectorAll('.modal-wrap').forEach((wrap) => {
                            wrap.addEventListener('click', (ev) => {
                                if (ev.target === wrap) wrap.classList.remove('active');
                            });
                        });

                        // ── Content Studio button wiring ─────────────────────────────
                        $('cs-refresh-btn')?.addEventListener('click', loadContentStudioRegistries);
                        $('cs-new-registry-btn')?.addEventListener('click', () => {
                            $('cs-registry-id').value = '';
                            $('cs-registry-modal-title').textContent = 'New Prompt Registry';
                            ['cs-reg-id-field', 'cs-reg-series', 'cs-reg-title', 'cs-reg-description', 'cs-reg-scenes'].forEach((id) => {
                                $(`${id}`).value = '';
                            });
                            $('cs-reg-brand').value = currentBrand;
                            $('cs-reg-type').value = 'episode';
                            openModal('cs-registry-modal');
                        });
                        $('cs-import-btn')?.addEventListener('click', () => openModal('cs-import-modal'));
                        $('cs-open-summitview-hub-btn')?.addEventListener('click', async () => {
                            const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                            if (!isLocalHost) {
                                toast('SummitView hub is local-only (not publicly hosted). Use “Sync Local” to import registries into GFD.', 'info');
                                openCSSyncModal();
                                return;
                            }

                            const localHubPath = '/GFD%20Dev%20Projects/SummitView/output/index.html';
                            try {
                                const res = await fetch(localHubPath, { method: 'HEAD' });
                                if (res.ok) {
                                    window.open(localHubPath, '_blank', 'noopener');
                                    return;
                                }
                            } catch {
                                // Fall through to Prompt Studio detection.
                            }

                            try {
                                const { baseUrl } = await detectPromptStudio();
                                window.open(baseUrl, '_blank', 'noopener');
                                toast('SummitView hub not found. Opened Prompt Studio instead.', 'info');
                            } catch {
                                toast('SummitView hub not available. Start SummitView (make prompt-studio) and/or serve SummitView output locally.', 'warn');
                            }
                        });
                        $('cs-sync-btn')?.addEventListener('click', openCSSyncModal);
                        $('cs-sync-import-btn')?.addEventListener('click', importFromPromptStudio);
                        $('cs-prev-scene')?.addEventListener('click', () => {
                            if (state.csCurrentScene > 0) { state.csCurrentScene--; renderCSScene(); }
                        });
                        $('cs-next-scene')?.addEventListener('click', () => {
                            let scenes = [];
                            try { scenes = JSON.parse(state.csCurrentRegistry?.scenes_json || '[]'); } catch { scenes = []; }
                            if (state.csCurrentScene < scenes.length - 1) { state.csCurrentScene++; renderCSScene(); }
                        });
                        $('cs-save-registry-btn')?.addEventListener('click', saveCSRegistry);
                        $('cs-do-import-btn')?.addEventListener('click', importCSJSON);
                        $('cs-schedule-submit-btn')?.addEventListener('click', submitCSSchedule);
                        $('cs-brand-filter')?.addEventListener('change', loadContentStudioRegistries);
                        $('cs-type-filter')?.addEventListener('change', loadContentStudioRegistries);
                    }

                    async function refreshAll() {
                        await Promise.all([
                            loadPlatformRules(),
                            loadOAuthStatus(),
                            loadStats(),
                            loadConnections(),
                            loadSocialAccounts(),
                            loadBrandWorkflows(),
                            loadAssets(),
                            loadCampaigns(),
                            loadVariants(),
                            loadDiscoveredAssets(),
                            loadOverrides(),
                            loadGalleries(),
                            loadContentStudioRegistries(),
                        ]);

                        await loadCalendar();
                        renderOverview();
                        renderEcosystemMatrix();
                        renderHandlesTable();
                        renderCampaigns();
                        renderCampaignSelect();
                        renderLibrary();
                        renderComposerAssets();
                        updateComposerCounters();
                        renderCrossPostPicker();
                        renderBrandSwitcher();
                        renderDripCampaignSelect();
                        renderReviewQueue();
                        updateReviewBadge();
                        renderOverrides();
                        renderGalleriesList();
                        renderCSRegistriesTable();
                    }

                    async function loadPlatformRules() {
                        state.platformRules = await api('/platform-rules');
                    }

                    async function loadOAuthStatus() {
                        try {
                            const data = await api('/oauth/status');
                            state.oauthStatus = data.providers || {};
                        } catch {
                            state.oauthStatus = {};
                        }
                    }

                    function renderOAuthProviderGrid() {
                        const grid = $('oauth-provider-grid');
                        const note = $('oauth-status-note');
                        const providers = Object.keys(PROVIDER_INFO);
                        let unconfiguredCount = 0;

                        grid.innerHTML = providers.map((provider) => {
                            const info = PROVIDER_INFO[provider];
                            const oauth = state.oauthStatus[provider];
                            const configured = oauth?.configured || false;
                            const connectedPlatforms = info.platforms.filter((p) =>
                                state.connections.some((c) => c.platform === p && Number(c.is_active) === 1)
                            );
                            const isConnected = connectedPlatforms.length > 0;

                            if (!configured) unconfiguredCount++;

                            const cls = isConnected ? 'connected' : configured ? 'configured' : 'not-configured';
                            const statusText = isConnected ? 'Connected' : configured ? 'Click to connect' : 'Not configured';

                            return `
                        <button class="oauth-provider-btn ${cls}" data-oauth-provider="${provider}" ${!configured ? 'disabled' : ''}>
                            <span class="oauth-dot"></span>
                            <span class="oauth-label">${escapeHtml(info.label)}</span>
                            <span class="oauth-status">${statusText}</span>
                        </button>
                    `;
                        }).join('');

                        if (unconfiguredCount > 0) {
                            note.textContent = `${unconfiguredCount} provider(s) need OAuth secrets configured on the server. Use the Manual Token tab for those platforms.`;
                        } else {
                            note.textContent = '';
                        }

                        grid.querySelectorAll('[data-oauth-provider]').forEach((btn) => {
                            if (btn.disabled) return;
                            btn.addEventListener('click', () => startOAuthFlow(btn.dataset.oauthProvider));
                        });
                    }

                    async function startOAuthFlow(provider) {
                        const token = await state.clerk?.session?.getToken();
                        const tokenParam = token ? `&t=${encodeURIComponent(token)}` : '';
                        const url = `${API}/oauth/authorize/${encodeURIComponent(provider)}?brand=${encodeURIComponent(currentBrand)}${tokenParam}`;
                        // Open in same tab — the callback page has a "Back to Command Center" link
                        window.location.href = url;
                    }

                    async function loadStats() {
                        const stats = await api('/stats');
                        const assetTotal = (stats.assets || []).reduce((sum, row) => sum + Number(row.total || 0), 0);
                        const socialRows = stats.social || [];
                        const scheduled = socialRows.find((row) => row.status === 'scheduled')?.total || 0;
                        const published = socialRows.find((row) => row.status === 'published')?.total || 0;

                        $('kpi-assets').textContent = assetTotal;
                        $('kpi-scheduled').textContent = scheduled;
                        $('kpi-campaigns').textContent = Number(stats.campaigns || 0);
                        $('kpi-connections').textContent = Number(stats.connections || 0);
                        $('kpi-published').textContent = published;
                        $('kpi-pending-review').textContent = Number(stats.pendingReview || 0);
                        if (stats.storage) {
                            const bytes = Number(stats.storage.totalBytes || 0);
                            const gb = bytes / (1024 ** 3);
                            const mb = bytes / (1024 ** 2);
                            $('kpi-storage').textContent = gb >= 1
                                ? gb.toFixed(2) + ' GB'
                                : mb >= 1
                                    ? mb.toFixed(1) + ' MB'
                                    : Math.round(bytes / 1024) + ' KB';
                        }

                        // Blog posts + community members from augmented stats
                        if (stats.blogPosts !== undefined) {
                            const el = $('kpi-blog-posts');
                            if (el) el.textContent = Number(stats.blogPosts);
                        }
                        if (stats.communityMembers !== undefined) {
                            const el = $('kpi-community-members');
                            if (el) el.textContent = Number(stats.communityMembers);
                        }
                        // Characters count
                        if (stats.characters !== undefined) {
                            const el = $('kpi-characters');
                            if (el) el.textContent = Number(stats.characters);
                        }
                        // Donations total raised
                        if (stats.donations !== undefined) {
                            const el = $('kpi-donations');
                            if (el) {
                                const dollars = (Number(stats.donations.totalCents || 0) / 100).toFixed(0);
                                el.textContent = '$' + Number(dollars).toLocaleString();
                            }
                        }
                        // Server audit log
                        if (stats.recentAudit) {
                            renderServerAuditLog(stats.recentAudit, Number(stats.auditTotal || 0));
                        }

                        updateGettingStarted();
                        checkSiteUptime();
                    }

                    async function checkSiteUptime() {
                        const sites = [
                            'https://goodflippinvibes.com',
                            'https://goodflippindesign.com',
                            'https://www.culturesherpa.org',
                        ];
                        const checks = sites.map(url =>
                            fetch(url, { method: 'HEAD', mode: 'no-cors', signal: AbortSignal.timeout(5000) })
                                .then(() => true)
                                .catch(() => false)
                        );
                        const results = await Promise.allSettled(checks);
                        const online = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
                        const el = $('kpi-sites-online');
                        if (el) {
                            el.textContent = online + '/' + sites.length;
                            el.className = 'kpi-value ' + (online === sites.length ? 'emerald' : online > 0 ? 'gold' : 'rose');
                        }
                        // CI failures — pre-fetched in boot(); tooltip is for 0-state clarity
                        const ciEl = $('kpi-ci-failures');
                        if (ciEl && ciEl.textContent === '—') {
                            ciEl.title = 'Pre-fetching CI status from GitHub…';
                        }
                    }

                    async function loadConnections() {
                        const allConnections = await api('/connections');
                        state.allConnections = Array.isArray(allConnections) ? allConnections : [];
                        state.connections = state.allConnections.filter((connection) => connection.brand === currentBrand);
                    }

                    // ── Social Feed ──────────────────────────────────────────────────
                    let sfPlatformFilter = 'all';
                    let sfStatusFilter = '';
                    let sfBrandFilter = '';
                    let sfViewMode = 'posts';
                    const SF_LIMIT = 40;

                    async function loadSocialFeed(append) {
                        const grid = $('sf-grid');
                        const empty = $('sf-empty');
                        const footer = $('sf-footer');
                        if (!grid) return;

                        if (!append) {
                            grid.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted);font-size:0.85rem">Loading posts\u2026</div>';
                            empty?.classList.add('d-none');
                            footer?.classList.add('d-none');
                        }

                        const params = new URLSearchParams({ brand: sfBrandFilter || currentBrand, limit: String(SF_LIMIT) });
                        if (sfPlatformFilter !== 'all') params.set('platform', sfPlatformFilter);
                        if (sfStatusFilter) params.set('status', sfStatusFilter);

                        try {
                            const posts = await api('/social?' + params.toString());
                            if (!append) grid.innerHTML = '';

                            if (!posts || posts.length === 0) {
                                if (!append) empty?.classList.remove('d-none');
                                footer?.classList.add('d-none');
                                return;
                            }

                            empty?.classList.add('d-none');

                            posts.forEach((post) => {
                                const card = document.createElement('div');
                                card.className = 'sf-card';
                                card.setAttribute('role', 'listitem');
                                card.dataset.id = String(post.id);

                                const platform = String(post.platform || '').toLowerCase();
                                const status = String(post.status || 'draft').toLowerCase();
                                const caption = String(post.content || '');
                                const short = caption.length > 150 ? caption.slice(0, 150) + '\u2026' : caption;

                                let dateStr = '';
                                const ts = post.scheduled_at || post.created_at;
                                if (ts) {
                                    try { dateStr = new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { }
                                }

                                const mediaHTML = `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M2 14l5-5 4 4 3-3 5 5"/><circle cx="15" cy="8" r="2"/></svg>`;

                                card.innerHTML =
                                    '<div class="sf-card-header">' +
                                    '<span class="sf-platform-badge ' + escapeHtml(platform) + '">' + escapeHtml(post.platform || 'Unknown') + '</span>' +
                                    '<span class="sf-brand-badge">' + escapeHtml(post.brand || '') + '</span>' +
                                    '<span class="sf-status-badge ' + escapeHtml(status) + '">' + escapeHtml(status) + '</span>' +
                                    '<span class="sf-date">' + escapeHtml(dateStr) + '</span>' +
                                    '</div>' +
                                    '<div class="sf-card-media">' + mediaHTML + '</div>' +
                                    '<div class="sf-card-body"><p class="sf-caption">' + escapeHtml(short || '\u2014') + '</p></div>' +
                                    '<div class="sf-card-actions">' +
                                    '<button class="btn btn-micro" data-sf-edit="' + Number(post.id) + '">Edit</button>' +
                                    '<button class="btn btn-micro btn-danger" data-sf-delete="' + Number(post.id) + '">Delete</button>' +
                                    '</div>';

                                grid.appendChild(card);
                            });

                            footer?.classList[posts.length >= SF_LIMIT ? 'remove' : 'add']('d-none');
                        } catch (err) {
                            grid.innerHTML = '<div style="padding:2rem;color:var(--accent-rose)">' + escapeHtml(String(err.message)) + '</div>';
                        }
                    }

                    // Exposed to inline onclick (within this IIFE scope via window assignments below)
                    function sfEditPost(id) {
                        switchView('composer');
                        toast('Opening in Post Composer\u2026', 'info');
                    }

                    function sfDeletePost(id) {
                        showConfirm('Delete this post? This cannot be undone.', async () => {
                            try {
                                await api('/social?id=' + id, { method: 'DELETE' });
                                const card = document.querySelector('.sf-card[data-id="' + id + '"]');
                                if (card) card.remove();
                                toast('Post deleted.', 'success');
                            } catch (err) {
                                toast(err.message, 'error');
                            }
                        });
                    }

                    document.addEventListener('click', function (e) {
                        const editBtn = e.target.closest('[data-sf-edit]');
                        if (editBtn) { sfEditPost(Number(editBtn.dataset.sfEdit)); return; }
                        const deleteBtn = e.target.closest('[data-sf-delete]');
                        if (deleteBtn) { sfDeletePost(Number(deleteBtn.dataset.sfDelete)); }
                    });

                    function wireSocialFeed() {
                        document.querySelectorAll('.sf-tab').forEach((btn) => {
                            btn.addEventListener('click', () => {
                                document.querySelectorAll('.sf-tab').forEach((t) => {
                                    t.classList.remove('active');
                                    t.setAttribute('aria-selected', 'false');
                                });
                                btn.classList.add('active');
                                btn.setAttribute('aria-selected', 'true');
                                sfPlatformFilter = btn.dataset.platform || 'all';
                                sfViewMode === 'kits' ? loadPostKits() : loadSocialFeed();
                            });
                        });

                        document.querySelectorAll('.sf-mode-btn').forEach((btn) => {
                            btn.addEventListener('click', () => {
                                switchSfViewMode(btn.dataset.sfMode || 'posts');
                            });
                        });

                        const sfBrandSel = $('sf-brand-filter');
                        if (sfBrandSel) sfBrandSel.addEventListener('change', () => {
                            sfBrandFilter = sfBrandSel.value;
                            sfViewMode === 'kits' ? loadPostKits() : loadSocialFeed();
                        });

                        const sfSel = $('sf-status-filter');
                        if (sfSel) sfSel.addEventListener('change', () => {
                            sfStatusFilter = sfSel.value;
                            sfViewMode === 'kits' ? loadPostKits() : loadSocialFeed();
                        });

                        const sfMore = $('sf-load-more');
                        if (sfMore) sfMore.addEventListener('click', () => loadSocialFeed(true));

                        const skMore = $('sk-load-more');
                        if (skMore) skMore.addEventListener('click', () => loadPostKits(true));

                        // Copy-to-clipboard delegation for post kits (wired once)
                        const skGrid = $('sk-grid');
                        if (skGrid) {
                            skGrid.addEventListener('click', (e) => {
                                const copyBtn = e.target.closest('.sk-copy-btn');
                                if (copyBtn) {
                                    const text = copyBtn.dataset.copy || '';
                                    navigator.clipboard.writeText(text).then(() => {
                                        copyBtn.textContent = 'Copied!';
                                        copyBtn.classList.add('copied');
                                        setTimeout(() => { copyBtn.textContent = 'Copy Caption'; copyBtn.classList.remove('copied'); }, 2000);
                                    }).catch(() => toast('Could not copy to clipboard.', 'error'));
                                    return;
                                }
                                const attachBtn = e.target.closest('.sk-attach-btn');
                                if (attachBtn) {
                                    const card = attachBtn.closest('.sk-card');
                                    openAssetPicker(card?.dataset.variantId || '', card?.dataset.variantBrand || '');
                                }
                            });
                        }

                        // ── Asset Picker ────────────────────────────────────────────
                        let _apVariantId = '';
                        let _apSelectedAssetId = '';

                        function openAssetPicker(variantId, brand) {
                            _apVariantId = variantId;
                            _apSelectedAssetId = '';
                            const modal = $('asset-picker-modal');
                            if (!modal) return;
                            // Pre-fill brand filter to match the variant's brand
                            const brandSel = $('asset-picker-brand');
                            if (brandSel && brand) brandSel.value = brand;
                            modal.classList.remove('d-none');
                            searchAssets();
                            $('asset-picker-search')?.focus();
                        }

                        async function searchAssets() {
                            const grid = $('asset-picker-grid');
                            if (!grid) return;
                            grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:2rem;font-size:0.85rem">Loading…</div>';

                            const q = ($('asset-picker-search')?.value || '').trim();
                            const brand = $('asset-picker-brand')?.value || '';
                            const category = $('asset-picker-category')?.value || '';
                            const params = new URLSearchParams({ limit: '80' });
                            if (q) params.set('q', q);
                            if (brand) params.set('brand', brand);
                            if (category) params.set('category', category);

                            try {
                                const data = await api('/assets?' + params.toString());
                                const assets = data.assets || [];
                                $('asset-picker-count').textContent = `${assets.length} asset${assets.length !== 1 ? 's' : ''} shown`;

                                if (assets.length === 0) {
                                    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:2rem;font-size:0.85rem">No assets found. Try a different search or bulk-approve drafts in the Storage panel.</div>';
                                    return;
                                }

                                grid.innerHTML = '';
                                assets.forEach((asset) => {
                                    const item = document.createElement('div');
                                    item.className = 'ap-asset-item';
                                    item.setAttribute('role', 'option');
                                    item.setAttribute('aria-selected', 'false');
                                    item.dataset.assetId = asset.id;
                                    // Construct public URL — works for approved assets only
                                    const thumbSrc = asset.thumbnail_path
                                        ? `/api/cms/pub/${encodeURIComponent(asset.thumbnail_path)}`
                                        : (asset.file_path ? `/api/cms/pub/${encodeURIComponent(asset.file_path)}` : '');

                                    if (thumbSrc) {
                                        item.innerHTML = `<img class="ap-asset-thumb" src="${escapeHtml(thumbSrc)}" alt="${escapeHtml(asset.title || 'asset')}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="ap-asset-thumb" style="display:none;align-items:center;justify-content:center;color:var(--text-muted);font-size:1.5rem">&#128247;</div><div class="ap-asset-label" title="${escapeHtml(asset.title || '')}">${escapeHtml(asset.title || asset.id)}</div>`;
                                    } else {
                                        item.innerHTML = `<div class="ap-asset-thumb" style="display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:1.5rem">&#128247;</div><div class="ap-asset-label" title="${escapeHtml(asset.title || '')}">${escapeHtml(asset.title || asset.id)}</div>`;
                                    }

                                    item.addEventListener('click', async () => {
                                        // Single-click to select + immediately attach
                                        grid.querySelectorAll('.ap-asset-item').forEach((el) => {
                                            el.classList.remove('selected');
                                            el.setAttribute('aria-selected', 'false');
                                        });
                                        item.classList.add('selected');
                                        item.setAttribute('aria-selected', 'true');
                                        _apSelectedAssetId = asset.id;

                                        // ── Blog picker mode ──────────────────────────────
                                        const modal = $('asset-picker-modal');
                                        if (modal && modal.dataset.blogPicker) {
                                            const pubUrl = thumbSrc || '';
                                            if (_blogImagePickerMode === 'featured') {
                                                setValue('blog-featured-image-url', pubUrl);
                                                updateFeaturedImagePreview(pubUrl);
                                                toast('Featured image set.', 'success');
                                            } else if (_blogImagePickerMode === 'insert') {
                                                const ta = $('blog-post-content');
                                                if (ta) insertMarkdown(ta, 'image', { url: pubUrl, alt: asset.title || 'image' });
                                                toast('Image inserted into content.', 'success');
                                            }
                                            closeBlogImagePicker();
                                            return;
                                        }
                                        // ── Normal post-kit attachment mode ──────────────
                                        await attachAsset(asset.id, asset.title, asset.thumbnail_path || asset.file_path);
                                    });

                                    grid.appendChild(item);
                                });
                            } catch (err) {
                                grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--accent-rose);padding:2rem;font-size:0.85rem">${escapeHtml(err.message)}</div>`;
                            }
                        }

                        async function attachAsset(assetId, assetTitle, thumbnailPath) {
                            if (!_apVariantId) return;
                            try {
                                const result = await api(`/social/variants/${encodeURIComponent(_apVariantId)}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ media_asset_id: assetId }),
                                });
                                // Update the card UI without full reload
                                const card = skGrid?.querySelector(`.sk-card[data-variant-id="${CSS.escape(_apVariantId)}"]`);
                                if (card) {
                                    const existing = card.querySelector('.sk-artwork, .sk-artwork-placeholder');
                                    if (existing && thumbnailPath) {
                                        const thumbSrc = `/api/cms/pub/${encodeURIComponent(thumbnailPath)}`;
                                        const img = document.createElement('img');
                                        img.className = 'sk-artwork';
                                        img.src = thumbSrc;
                                        img.alt = assetTitle || 'Post artwork';
                                        img.loading = 'lazy';
                                        existing.replaceWith(img);
                                    }
                                    const attachBtn = card.querySelector('.sk-attach-btn');
                                    if (attachBtn) attachBtn.innerHTML = '&#128247;';
                                }
                                closeAssetPicker();
                                toast(`Artwork attached: ${assetTitle || assetId}`, 'success');
                            } catch (err) {
                                toast(`Failed to attach: ${err.message}`, 'error');
                            }
                        }

                        function closeAssetPicker() {
                            $('asset-picker-modal')?.classList.add('d-none');
                            _apVariantId = '';
                            _apSelectedAssetId = '';
                        }

                        $('asset-picker-close')?.addEventListener('click', closeAssetPicker);
                        $('asset-picker-cancel')?.addEventListener('click', closeAssetPicker);
                        $('asset-picker-modal')?.addEventListener('click', (e) => {
                            if (e.target === $('asset-picker-modal')) closeAssetPicker();
                        });
                        $('asset-picker-search-btn')?.addEventListener('click', searchAssets);
                        $('asset-picker-search')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') searchAssets(); });
                        $('asset-picker-detach')?.addEventListener('click', async () => {
                            if (!_apVariantId) return;
                            try {
                                await api(`/social/variants/${encodeURIComponent(_apVariantId)}`, {
                                    method: 'PATCH', body: JSON.stringify({ media_asset_id: null }),
                                });
                                const card = skGrid?.querySelector(`.sk-card[data-variant-id="${CSS.escape(_apVariantId)}"]`);
                                if (card) {
                                    const existing = card.querySelector('.sk-artwork, .sk-artwork-placeholder');
                                    if (existing) {
                                        const ph = document.createElement('div');
                                        ph.className = 'sk-artwork-placeholder';
                                        ph.innerHTML = '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M2 14l5-5 4 4 3-3 5 5"/><circle cx="15" cy="8" r="2"/></svg>';
                                        existing.replaceWith(ph);
                                    }
                                    const attachBtn = card.querySelector('.sk-attach-btn');
                                    if (attachBtn) attachBtn.innerHTML = '+ Art';
                                }
                                closeAssetPicker();
                                toast('Artwork detached.', 'success');
                            } catch (err) { toast(`Failed: ${err.message}`, 'error'); }
                        });
                    }

                    function switchSfViewMode(mode) {
                        sfViewMode = mode;
                        // Sync toggle buttons
                        document.querySelectorAll('.sf-mode-btn').forEach((b) => {
                            b.classList.toggle('active', b.dataset.sfMode === mode);
                        });
                        const postsVisible = mode === 'posts';
                        // Reset Posts containers — let loadSocialFeed manage visibility
                        if (postsVisible) {
                            [$('sk-grid'), $('sk-empty'), $('sk-footer')].forEach((el) => el?.classList.add('d-none'));
                            loadSocialFeed();
                        } else {
                            // Hide Posts, show Kits
                            [$('sf-grid'), $('sf-empty'), $('sf-footer')].forEach((el) => el?.classList.add('d-none'));
                            [$('sk-grid'), $('sk-empty'), $('sk-footer')].forEach((el) => el?.classList.add('d-none'));
                            loadPostKits();
                        }
                    }

                    const SK_LIMIT = 40;
                    async function loadPostKits(append) {
                        const grid = $('sk-grid');
                        const empty = $('sk-empty');
                        const footer = $('sk-footer');
                        if (!grid) return;

                        if (!append) {
                            grid.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted);font-size:0.85rem">Loading post kits\u2026</div>';
                            empty?.classList.add('d-none');
                            footer?.classList.add('d-none');
                        }

                        const params = new URLSearchParams({ brand: sfBrandFilter || currentBrand, limit: String(SK_LIMIT) });
                        if (sfPlatformFilter !== 'all') params.set('platform', sfPlatformFilter);
                        if (sfStatusFilter) params.set('status', sfStatusFilter);

                        try {
                            const kits = await api('/social/variants?' + params.toString());
                            if (!append) grid.innerHTML = '';

                            if (!kits || kits.length === 0) {
                                if (!append) empty?.classList.remove('d-none');
                                footer?.classList.add('d-none');
                                return;
                            }

                            empty?.classList.add('d-none');

                            kits.forEach((kit) => {
                                const card = document.createElement('div');
                                card.className = 'sk-card';
                                card.setAttribute('role', 'listitem');
                                card.dataset.variantId = kit.id || '';
                                card.dataset.variantBrand = kit.brand || '';

                                const platform = String(kit.platform || '').toLowerCase();
                                const status = String(kit.status || 'draft').toLowerCase();
                                const caption = String(kit.content || '');
                                const hashtags = (() => {
                                    try {
                                        const raw = kit.hashtags;
                                        if (!raw) return '';
                                        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                                        return Array.isArray(parsed)
                                            ? parsed.map(h => '#' + String(h).replace(/^#/, '')).join(' ')
                                            : String(raw);
                                    } catch { return String(kit.hashtags || ''); }
                                })();

                                const copyText = [caption, hashtags].filter(Boolean).join('\n\n');

                                const statusClass = status === 'published' ? 'emerald'
                                    : status === 'scheduled' ? 'gold'
                                        : status === 'failed' ? 'rose' : '';

                                const thumbHTML = kit.thumbnail_path
                                    ? `<img class="sk-artwork" src="${escapeHtml(kit.thumbnail_path)}" alt="${escapeHtml(kit.asset_title || 'Post artwork')}" loading="lazy">`
                                    : `<div class="sk-artwork-placeholder"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M2 14l5-5 4 4 3-3 5 5"/><circle cx="15" cy="8" r="2"/></svg></div>`;

                                card.innerHTML =
                                    `<div class="sk-platform-stripe ${escapeHtml(platform)}" aria-hidden="true"></div>` +
                                    '<div class="sk-card-header">' +
                                    `<span class="sf-platform-badge ${escapeHtml(platform)}">${escapeHtml(kit.platform || 'Unknown')}</span>` +
                                    `<span class="sf-brand-badge">${escapeHtml(kit.brand || '')}</span>` +
                                    (kit.campaign_name ? `<span style="font-size:0.62rem;color:var(--text-muted)">${escapeHtml(kit.campaign_name)}</span>` : '') +
                                    (statusClass ? `<span class="sk-status" style="margin-left:auto;background:rgba(var(--status-bg,255,255,255),0.08);color:var(--text-muted)">${escapeHtml(status)}</span>` : '') +
                                    '</div>' +
                                    thumbHTML +
                                    '<div class="sk-card-body">' +
                                    `<p class="sk-caption">${escapeHtml(caption || '\u2014')}</p>` +
                                    (hashtags ? `<p class="sk-hashtags">${escapeHtml(hashtags)}</p>` : '') +
                                    '</div>' +
                                    '<div class="sk-card-footer">' +
                                    `<span class="sf-status-badge ${escapeHtml(status)}">${escapeHtml(status)}</span>` +
                                    `<button class="sk-copy-btn" data-copy="${escapeHtml(copyText)}" title="Copy caption + hashtags to clipboard">Copy Caption</button>` +
                                    `<button class="sk-attach-btn" title="${kit.media_asset_id ? 'Change artwork' : 'Attach artwork'}" aria-label="Attach artwork to this post kit">${kit.media_asset_id ? '&#128247;' : '&#43; Art'}</button>` +
                                    '</div>';

                                grid.appendChild(card);
                            });

                            // Copy buttons handled via event delegation wired in wireSocialFeed()
                            footer?.classList[kits.length >= SK_LIMIT ? 'remove' : 'add']('d-none');
                        } catch (err) {
                            grid.innerHTML = '<div style="padding:2rem;color:var(--accent-rose)">' + escapeHtml(String(err.message)) + '</div>';
                        }
                    }
                    // ── End Social Feed ──────────────────────────────────────────────

                    async function loadSocialAccounts() {
                        try {
                            const data = await api('/social-accounts');
                            state.socialAccounts = data.accounts || [];
                        } catch {
                            state.socialAccounts = [];
                        }
                    }

                    async function loadBrandWorkflows() {
                        try {
                            const data = await api('/brand-workflows');
                            state.brandWorkflows = {};
                            for (const wf of (data.workflows || [])) {
                                state.brandWorkflows[wf.brand] = wf;
                            }
                        } catch {
                            state.brandWorkflows = {};
                        }
                    }

                    const LIB_PAGE_SIZE = 48;

                    async function loadAssets() {
                        const q = $('library-search')?.value.trim() || '';
                        const brand = $('library-brand')?.value || currentBrand;
                        const category = $('library-category')?.value.trim() || '';
                        const mediaType = $('library-type')?.value || '';
                        const reviewStatus = $('library-status')?.value || '';
                        const page = state.libPage || 0;

                        let url = '/assets?limit=' + LIB_PAGE_SIZE + '&offset=' + (page * LIB_PAGE_SIZE);
                        if (brand) url += '&brand=' + encodeURIComponent(brand);
                        if (q) url += '&q=' + encodeURIComponent(q);
                        if (category) url += '&category=' + encodeURIComponent(category);
                        if (mediaType) url += '&media_type=' + encodeURIComponent(mediaType);
                        if (reviewStatus) url += '&review_status=' + encodeURIComponent(reviewStatus);

                        const data = await api(url);
                        state.assets = data.assets || [];
                        state.assetTotal = data.total || 0;
                        state.assetLimit = data.limit || LIB_PAGE_SIZE;
                        state.assetOffset = data.offset || 0;
                    }

                    async function loadDiscoveredAssets() {
                        const brand = $('rq-filter-brand')?.value || '';
                        const status = $('rq-filter-status')?.value || 'discovered';
                        const page = state.discoveredPage || 1;
                        let url = '/assets/discovered?status=' + encodeURIComponent(status) + '&page=' + page + '&limit=24';
                        if (brand) url += '&brand=' + encodeURIComponent(brand);
                        try {
                            const data = await api(url);
                            state.discoveredAssets = data.assets || [];
                            state.discoveredTotal = data.total || 0;
                        } catch {
                            state.discoveredAssets = [];
                        }
                    }

                    function updateReviewBadge() {
                        const pending = state.discoveredAssets.length;
                        const badge = $('review-badge');
                        if (!badge) return;
                        if (pending > 0) {
                            badge.textContent = pending;
                            badge.classList.remove('d-none');
                        } else {
                            badge.classList.add('d-none');
                        }
                    }

                    function renderReviewQueue() {
                        const grid = $('rq-grid');
                        if (!grid) return;
                        const pendingCount = $('rq-pending-count');
                        if (pendingCount) pendingCount.textContent = state.discoveredAssets.length + ' pending';

                        if (!state.discoveredAssets.length) {
                            grid.innerHTML = '<p class="text-muted">No assets found for these filters. Try scanning a page below or change the status filter.</p>';
                            $('rq-pagination').innerHTML = '';
                            return;
                        }

                        grid.innerHTML = state.discoveredAssets.map((asset) => {
                            const isImage = (asset.asset_type || 'image') === 'image';
                            const proxyThumb = isImage && state.mediaToken
                                ? `/api/cms/proxy-img?url=${encodeURIComponent(asset.asset_url)}&t=${encodeURIComponent(state.mediaToken)}`
                                : '';
                            const domain = escapeHtml(asset.site_domain || '');
                            const alt = escapeHtml(asset.alt_text || '');
                            const isClaimed = asset.status === 'claimed';
                            const isIgnored = asset.status === 'ignored';
                            return `
                        <article class="rq-card" data-da-id="${asset.id}">
                            <div class="rq-thumb-wrap">
                                ${proxyThumb
                                    ? `<img class="rq-thumb" src="${proxyThumb}" data-proxy-url="${escapeHtml(asset.asset_url)}" alt="${alt}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
                                    : ''}
                                <div class="rq-thumb-placeholder"${proxyThumb ? ' style="display:none"' : ''}>${escapeHtml((asset.asset_type || 'IMG').toUpperCase())}</div>
                                ${domain ? `<span class="rq-domain-badge">${domain}</span>` : ''}
                            </div>
                            <div class="rq-meta">
                                <div class="text-strong">${alt || '(no alt text)'}</div>
                                <div class="rq-url">${escapeHtml(asset.asset_url)}</div>
                                <div class="mt-03 text-muted">${escapeHtml(formatDateTime(asset.discovered_at))}</div>
                                ${isClaimed ? '<span class="tag ok mt-03">Claimed</span>' : ''}
                                ${isIgnored ? '<span class="tag mt-03">Ignored</span>' : ''}
                            </div>
                            <div class="rq-actions">
                                ${!isClaimed ? `<button class="btn btn-micro btn-primary" data-claim-da="${asset.id}">Claim</button>` : ''}
                                ${!isIgnored && !isClaimed ? `<button class="btn btn-micro btn-warn" data-ignore-da="${asset.id}">Ignore</button>` : ''}
                                ${isIgnored ? `<button class="btn btn-micro" data-undiscover-da="${asset.id}">Reset</button>` : ''}
                            </div>
                        </article>
                    `;
                        }).join('');

                        grid.querySelectorAll('[data-claim-da]').forEach((btn) => {
                            btn.addEventListener('click', () => openClaimModal(btn.dataset.claimDa));
                        });
                        grid.querySelectorAll('[data-ignore-da]').forEach((btn) => {
                            btn.addEventListener('click', () => updateDiscoveredStatus(btn.dataset.ignoreDa, 'ignored'));
                        });
                        grid.querySelectorAll('[data-undiscover-da]').forEach((btn) => {
                            btn.addEventListener('click', () => updateDiscoveredStatus(btn.dataset.undiscoverDa, 'discovered'));
                        });

                        renderRQPagination();
                    }

                    function renderRQPagination() {
                        const pag = $('rq-pagination');
                        if (!pag) return;
                        const limit = 24;
                        const total = state.discoveredTotal || state.discoveredAssets.length;
                        const pages = Math.ceil(total / limit);
                        if (pages <= 1) { pag.innerHTML = ''; return; }

                        const cur = state.discoveredPage || 1;
                        let html = '';
                        if (cur > 1) html += `<button class="btn btn-secondary btn-micro rq-page-btn" data-page="${cur - 1}">&#8592; Prev</button>`;
                        html += `<span class="text-muted" style="font-size:0.78rem">Page ${cur} / ${pages}</span>`;
                        if (cur < pages) html += `<button class="btn btn-secondary btn-micro rq-page-btn" data-page="${cur + 1}">Next &#8594;</button>`;
                        pag.innerHTML = html;
                        pag.querySelectorAll('.rq-page-btn').forEach((btn) => {
                            btn.addEventListener('click', async () => {
                                state.discoveredPage = Number(btn.dataset.page);
                                await loadDiscoveredAssets();
                                renderReviewQueue();
                            });
                        });
                    }

                    async function scanPage(brand, pageUrl) {
                        const btn = $('rq-scan-btn');
                        btn.disabled = true;
                        btn.textContent = 'Scanning…';
                        try {
                            const result = await api('/scan-page', {
                                method: 'POST',
                                body: { brand, page_url: pageUrl },
                            });
                            const added = result.inserted || 0;
                            toast(`Scanned ${escapeHtml(pageUrl)} — ${added} new assets queued`, 'success');
                            state.discoveredPage = 1;
                            $('rq-filter-status').value = 'discovered';
                            await loadDiscoveredAssets();
                            renderReviewQueue();
                            updateReviewBadge();
                        } catch (err) {
                            toast('Scan failed: ' + err.message, 'error');
                        } finally {
                            btn.disabled = false;
                            btn.textContent = 'Scan Page';
                        }
                    }

                    function openClaimModal(discoveredId) {
                        const asset = state.discoveredAssets.find((a) => String(a.id) === String(discoveredId));
                        if (!asset) return;

                        $('claim-asset-id').value = asset.id;
                        $('claim-asset-url').textContent = asset.asset_url;
                        $('claim-asset-title').value = asset.alt_text || '';
                        $('claim-asset-brand').value = asset.brand || currentBrand;
                        $('claim-asset-media-type').value = asset.asset_type || 'image';
                        $('claim-asset-tags').value = '';
                        $('claim-asset-category').value = 'uncategorized';

                        const preview = $('claim-asset-preview');
                        if (asset.asset_type === 'image' || !asset.asset_type) {
                            preview.innerHTML = `<img src="${escapeHtml(asset.asset_url)}" alt="preview" style="max-height:120px;max-width:100%;border-radius:6px;object-fit:contain">`;
                        } else {
                            preview.innerHTML = `<span class="tag">${escapeHtml((asset.asset_type || 'file').toUpperCase())}</span>`;
                        }

                        openModal('claim-asset-modal');
                    }

                    async function confirmClaimAsset() {
                        const id = $('claim-asset-id').value;
                        if (!id) return;

                        const rawTags = $('claim-asset-tags').value;
                        const tags = rawTags.split(',').map((t) => t.trim()).filter(Boolean);

                        try {
                            await api('/assets/discovered/' + encodeURIComponent(id) + '/claim', {
                                method: 'POST',
                                body: {
                                    title: $('claim-asset-title').value.trim() || 'Untitled',
                                    brand: $('claim-asset-brand').value,
                                    category: $('claim-asset-category').value,
                                    media_type: $('claim-asset-media-type').value,
                                    tags,
                                },
                            });
                            toast('Asset claimed and added to library', 'success');
                            closeModal('claim-asset-modal');
                            state.discoveredPage = 1;
                            await Promise.all([loadDiscoveredAssets(), loadAssets()]);
                            renderReviewQueue();
                            renderLibrary();
                            updateReviewBadge();
                        } catch (err) {
                            toast(err.message, 'error');
                        }
                    }

                    async function updateDiscoveredStatus(id, newStatus) {
                        try {
                            await api('/assets/discovered/' + encodeURIComponent(id), {
                                method: 'PUT',
                                body: { status: newStatus },
                            });
                            const asset = state.discoveredAssets.find((a) => String(a.id) === String(id));
                            if (asset) asset.status = newStatus;
                            renderReviewQueue();
                            updateReviewBadge();
                        } catch (err) {
                            toast(err.message, 'error');
                        }
                    }

                    async function loadCampaigns() {
                        state.campaigns = await api('/campaigns?brand=' + encodeURIComponent(currentBrand));
                    }

                    async function loadVariants() {
                        state.variants = await api('/social/variants?brand=' + encodeURIComponent(currentBrand) + '&limit=250');
                    }

                    async function loadCalendar() {
                        const d = state.calendarDate;
                        const start = new Date(d.getFullYear(), d.getMonth(), 1);
                        const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
                        const data = await api('/campaigns/calendar?brand=' + encodeURIComponent(currentBrand) + '&start=' + encodeURIComponent(start.toISOString()) + '&end=' + encodeURIComponent(end.toISOString()));
                        renderCalendar(data.events || [], start);
                    }

                    function formatCountdown(iso) {
                        const diff = Math.floor((new Date(iso) - Date.now()) / 1000);
                        if (diff <= 0) return 'now';
                        if (diff < 60) return 'in ' + diff + 's';
                        if (diff < 3600) return 'in ' + Math.floor(diff / 60) + 'm ' + (diff % 60) + 's';
                        if (diff < 86400) return 'in ' + Math.floor(diff / 3600) + 'h ' + Math.floor((diff % 3600) / 60) + 'm';
                        return 'in ' + Math.floor(diff / 86400) + 'd ' + Math.floor((diff % 86400) / 3600) + 'h';
                    }

                    function renderHealthAlertBanner() {
                        const el = $('overview-health-alert');
                        if (!el) return;
                        const downSites = Object.values(state.lastHealthMap).filter((r) => !r.ok);
                        if (downSites.length === 0) { el.style.display = 'none'; return; }
                        el.style.display = 'flex';
                        el.innerHTML = '<span style="font-size:1.1rem">&#9888;</span>' +
                            '<span><strong>' + downSites.length + ' site' + (downSites.length > 1 ? 's' : '') + ' down:</strong> ' +
                            downSites.map((r) => escapeHtml((r.url || '').replace('https://', '')) + ' (HTTP&nbsp;' + (r.status_code || '?') + ')').join(', ') +
                            '</span>' +
                            '<button class="btn btn-micro alert-dismiss" onclick="document.getElementById(\'overview-health-alert\').style.display=\'none\'">Dismiss</button>';
                    }

                    async function testConnectionById(connId) {
                        try {
                            const result = await api('/connections/' + connId + '/test', { method: 'POST' });
                            toast((result.ok ? '&#10003; ' : '&#10005; ') + escapeHtml(result.platform || '') + ': ' +
                                (result.ok ? 'token valid' : (result.error || 'failed')),
                                result.ok ? 'success' : 'error');
                            if (result.ok) {
                                const conn = state.allConnections.find((c) => String(c.id) === String(connId));
                                if (conn) conn.last_used_at = result.checked_at;
                                renderOverview();
                            }
                        } catch (err) {
                            toast('Test failed: ' + escapeHtml(err.message), 'error');
                        }
                    }

                    async function testPublishPinterestById(connId) {
                        if (!confirm('Pinterest does not have a draft mode. This will create a REAL public pin titled "Test pin (delete me)" on your first board. Continue?')) {
                            return;
                        }
                        try {
                            const result = await api('/connections/' + connId + '/test-publish', { method: 'POST' });
                            if (result.ok) {
                                const url = (result.pin && result.pin.url) || '';
                                const board = (result.board && result.board.name) || '?';
                                toast('&#10003; Pinned to ' + escapeHtml(board) + '. <a href="' + escapeHtml(url) + '" target="_blank" rel="noopener" style="color:#fff;text-decoration:underline">Open pin to delete</a>', 'success');
                                console.log('[test-publish] pinterest result:', result);
                            } else {
                                toast('&#10005; Pinterest publish failed: ' + escapeHtml(result.error || JSON.stringify(result.body || {})), 'error');
                                console.error('[test-publish] pinterest failure:', result);
                            }
                        } catch (err) {
                            toast('Test publish failed: ' + escapeHtml(err.message), 'error');
                        }
                    }

                    function renderOverview() {
                        const queueBody = $('overview-queue');
                        const now = new Date();
                        const upcoming = [...state.variants]
                            .filter((row) => row.scheduled_at)
                            .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
                            .slice(0, 12);

                        // Next scheduled post countdown
                        const nextUp = upcoming.find((r) => new Date(r.scheduled_at) > now);
                        const timerEl = $('ov-next-post-timer');
                        if (timerEl) {
                            if (nextUp) {
                                timerEl.textContent = '&#9201; ' + formatCountdown(nextUp.scheduled_at);
                                timerEl.title = (nextUp.platform || '') + ' \u00b7 ' + (nextUp.campaign_name || 'General');
                            } else {
                                timerEl.textContent = '';
                            }
                        }

                        queueBody.innerHTML = upcoming.length
                            ? upcoming.map((row) => `
                        <tr>
                            <td>${escapeHtml(formatDateTime(row.scheduled_at))}</td>
                            <td>${escapeHtml(row.campaign_name || 'General')}</td>
                            <td><span class="tag ok">${escapeHtml(row.platform)}</span></td>
                            <td>${statusTag(row.status)}</td>
                        </tr>
                    `).join('')
                            : '<tr><td colspan="4">No queued variants yet.</td></tr>';

                        const connectionSummary = $('overview-connections');

                        connectionSummary.innerHTML = PLATFORM_ORDER.map((platform) => {
                            const activeConnections = state.allConnections.filter((c) => c.platform === platform && Number(c.is_active) === 1);
                            const conn = activeConnections[0] || null;
                            const connectedCount = activeConnections.length;
                            const connected = connectedCount > 0;
                            const metaText = connectedCount > 1
                                ? escapeHtml(String(connectedCount) + ' active brands')
                                : conn
                                    ? escapeHtml((BRAND_DEFS[conn.brand]?.shortName || conn.brand || '').toUpperCase() + (conn.account_label ? ' · ' + conn.account_label : ''))
                                    : '';
                            const meta = metaText
                                ? '<span style="font-size:0.7rem;color:var(--text-muted);margin-left:4px">' + metaText + '</span>'
                                : '';
                            const lastTested = connectedCount === 1 && conn && conn.last_used_at
                                ? '<span style="font-size:0.7rem;color:var(--text-muted);margin-left:4px" title="' + escapeHtml(conn.last_used_at) + '">tested ' + escapeHtml(relTimeFromIso(conn.last_used_at)) + '</span>'
                                : '';
                            const testBtn = connectedCount === 1 && conn && conn.id
                                ? '<button class="btn btn-micro ov-conn-test-btn" data-conn-id="' + conn.id + '" style="padding:1px 5px;font-size:0.68rem;margin-left:4px" title="Test token" aria-label="Test ' + escapeHtml(platform) + ' token">&#128268;</button>'
                                : '';
                            const pinTestBtn = (platform === 'pinterest' && connectedCount >= 1 && conn && conn.id)
                                ? '<button class="btn btn-micro ov-conn-pinpub-btn" data-conn-id="' + conn.id + '" style="padding:1px 5px;font-size:0.68rem;margin-left:2px" title="Send a real test pin (you delete after)" aria-label="Send test pin">&#128204;</button>'
                                : '';
                            return `<div class="overview-conn-row">
                        <span class="overview-conn-name">${escapeHtml(platform)}</span>
                        <div style="display:flex;align-items:center;gap:2px;flex-wrap:wrap">
                            <span class="tag ${connected ? 'ok' : 'fail'}">${connected ? 'connected' : 'missing'}</span>
                            ${meta}${lastTested}${testBtn}${pinTestBtn}
                        </div>
                    </div>`;
                        }).join('');

                        // Wire test buttons
                        connectionSummary.querySelectorAll('.ov-conn-test-btn').forEach((btn) => {
                            btn.addEventListener('click', async () => {
                                btn.textContent = '&#8987;';
                                btn.disabled = true;
                                await testConnectionById(btn.dataset.connId);
                                btn.textContent = '&#128268;';
                                btn.disabled = false;
                            });
                        });
                        connectionSummary.querySelectorAll('.ov-conn-pinpub-btn').forEach((btn) => {
                            btn.addEventListener('click', async () => {
                                btn.textContent = '&#8987;';
                                btn.disabled = true;
                                await testPublishPinterestById(btn.dataset.connId);
                                btn.textContent = '&#128204;';
                                btn.disabled = false;
                            });
                        });

                        // Append env-secret status rows (read from window.ENV injected by _worker.js)
                        const sentryOk = !!(window.ENV && window.ENV.SENTRY_DSN);
                        const stripeOk = !!(window.ENV && window.ENV.STRIPE_PUBLISHABLE_KEY);
                        connectionSummary.innerHTML += `
                    <div class="overview-conn-row" style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px">
                        <span class="overview-conn-name">Sentry</span>
                        <span class="tag ${sentryOk ? 'ok' : 'warn'}" title="${sentryOk ? 'SENTRY_DSN is set' : 'SENTRY_DSN not set \u2014 run: wrangler secret put SENTRY_DSN'}">${sentryOk ? 'active' : 'not set'}</span>
                    </div>
                    <div class="overview-conn-row">
                        <span class="overview-conn-name">Stripe key</span>
                        <span class="tag ${stripeOk ? 'ok' : 'warn'}" title="${stripeOk ? 'STRIPE_PUBLISHABLE_KEY is set' : 'STRIPE_PUBLISHABLE_KEY not set'}">${stripeOk ? 'active' : 'not set'}</span>
                    </div>
                `;

                        const assetsBody = $('overview-assets');
                        const recentAssets = [...state.assets]
                            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
                            .slice(0, 10);

                        assetsBody.innerHTML = recentAssets.length
                            ? recentAssets.map((asset) => `
                        <tr>
                            <td>${escapeHtml(asset.title)}</td>
                            <td>${escapeHtml(asset.category || '-')}</td>
                            <td>${escapeHtml(asset.media_type || '-')}</td>
                            <td>${escapeHtml(formatDateTime(asset.created_at))}</td>
                        </tr>
                    `).join('')
                            : '<tr><td colspan="4">No assets available.</td></tr>';

                        renderGapFlags();
                        renderHealthAlertBanner();
                    }

                    // ── Gap Flags ─────────────────────────────────────────────────────
                    // Centralized gap registry — add new items here as gaps are found.
                    // severity: 'blocker' | 'quality' | 'hygiene' | 'done'
                    const GAP_FLAGS = [
                        // ── Social Media ───────────────────────────────────────────────
                        {
                            id: 'social-hashtags', severity: 'done', brand: 'all', area: 'Social Media',
                            title: 'Brand hashtag sets wired to composer',
                            detail: 'Each brand auto-populates its hashtag bank (incl. #art, #love, #goodvibes, #culture, #cultura) when selected.'
                        },
                        {
                            id: 'social-artwork-r2', severity: 'done', brand: 'gfv', area: 'Social Media',
                            title: 'GFV social art imported to R2 (279 files, 15 series)',
                            detail: '✅ 279 GFV art files uploaded to R2 bucket gfv-media with 0 failures. ✅ sync-config.json updated with 15 per-series source entries (art-gfv-sheriff through art-gfv-wii-todd), all recursive:false for selective import. ✅ D1 cms_assets registry now has 1,129 total records. Series: Sheriff(60), Luminous(58), Posters(26), 80s Ideas(17), Mascot(14), Street Life(14), Oscars(10), Zebra(10), PIckleFish(16), Abstract(8), Comedy(8), Chill Bee\'s(7), Paddy Dill(13), Flippin Rocky(8), Wii Todd(10). Categories: sheriff/luminous/posters/80s-ideas/mascot/street-life/oscars/zebra/picklfish/abstract/comedy/chill-bees/paddy-dill/flippin-rocky/wii-todd.'
                        },
                        {
                            id: 'social-post-kits', severity: 'done', brand: 'all', area: 'Social Media',
                            title: 'Post Kit asset picker built (2026-03-17)',
                            detail: 'PATCH /api/social/variants/:id wired. Asset picker modal in Post Kits panel — search by brand/category/keyword, single-click attaches R2 asset to variant, thumbnail updates in-place. Detach also supported.'
                        },
                        {
                            id: 'asset-intel-report', severity: 'done', brand: 'gfd', area: 'Admin',
                            title: 'Asset Intelligence panel — advanced reporting (2026-03-22)',
                            detail: 'Panel #27 added to Intelligence group. GET /api/cms/assets/analytics runs 6 parallel D1 queries: total/by_status/by_brand (approved+pending+rejected+featured)/by_media_type/by_category(top25)/oldest_pending(10)/recently_approved(10). KPI strip, media-type tag cloud, category cloud, brand breakdown table with approval %, one-click approve on oldest-pending queue, recently-approved audit trail. Phase 4 charter: Advanced reporting and diagnostics. Commit af4b04c.'
                        },
                        {
                            id: 'library-search-intelligence', severity: 'done', brand: 'gfd', area: 'Admin',
                            title: 'Asset Library — server-side search + pagination (2026-03-22)',
                            detail: 'Library panel upgraded from client-side 120-asset filter to full server-side search across all 1,129 D1 assets. Filters: brand, category, media_type, review_status, q (LIKE on title/description/tags/category). 48-per-page pagination with prev/next controls. Backend handleListAssets count query now mirrors all active filters. Phase 4 charter item: Richer asset intelligence and search. Commit 5880d25.'
                        },
                        {
                            id: 'social-platform-oauth', severity: 'quality', brand: 'all', area: 'Social Media',
                            title: 'OAuth coverage still incomplete — Pinterest is live, other networks still need credentials or token setup',
                            detail: 'OAuth server is implemented in workers/oauth.js for Instagram, Facebook, X, LinkedIn, Pinterest, TikTok, and YouTube. Pinterest is now configured and connected for GFV. Remaining setup work is platform-specific: Instagram/Facebook need META_APP_ID + META_APP_SECRET, TikTok needs TIKTOK_CLIENT_ID + TIKTOK_CLIENT_SECRET, LinkedIn needs LINKEDIN_CLIENT_ID + LINKEDIN_CLIENT_SECRET. Use the admin portal Connections panel to complete OAuth once each provider secret pair is present.'
                        },
                        // ── CultureSherpa ──────────────────────────────────────────────
                        {
                            id: 'cs-src-stubs', severity: 'done', brand: 'culturesherpa', area: 'CultureSherpa',
                            title: 'Orphaned src/ deleted (2026-03-17)',
                            detail: 'Deleted src/config/admin.ts (57 lines, superseded by website-astro/src/lib/admin-client.ts which is more complete and actively imported) and src/pages/test.astro (50B, invalid @import syntax, never compiled — website build is website-astro/ only). CS commit 09103dc22.'
                        },
                        {
                            id: 'cs-d1-schemas', severity: 'done', brand: 'culturesherpa', area: 'CultureSherpa',
                            title: 'D1 schemas audited — all applied (2026-03-17)',
                            detail: 'All 8 schema files audited against live D1 tables. cms.sql, media-platform.sql, console.sql, community.sql, health.sql, nft.sql, cms-social.sql all applied. account-links.sql is ALTER TABLE migrations (confirming social_accounts has platform_user_id, token_fingerprint, link_status). cms_donations not a top-level table — self-created via ensureDonationsSchema() on first donation (CREATE TABLE IF NOT EXISTS in cms.js). Orphan tables badges, daily_check_ins, gratitude_entries, mood_entries, user_badges, wellness_insights applied directly without a schema file — benign (feature tables, no missing code paths).'
                        },
                        {
                            id: 'cs-api-auth-stubs', severity: 'done', brand: 'culturesherpa', area: 'CultureSherpa',
                            title: 'CS authz.py X-User-Id bypass fixed (2026-03-17)',
                            detail: 'All API endpoints in celebrations.py, cultural_images.py, s3_upload.py already had @require_roles("admin"). Fixed critical bypass: X-User-Id header now requires matching X-Internal-Secret env var — external callers can no longer spoof admin identity. RBAC_DISABLED still available for local dev (not present in prod).'
                        },
                        {
                            id: 'cs-coming-soon-tabs', severity: 'done', brand: 'culturesherpa', area: 'CultureSherpa',
                            title: 'CS: Empty-profile state improved + orphaned tabs clarified (2026-03-17)',
                            detail: 'CultureRenderer.astro:451 empty state improved: removed generic heading, added region+languages meta line, added "Help expand this profile" → /contribute CTA and "← Back to Explore" link. fallbackSummary still shown when available. ConnectTab.astro + ResearchTab.astro are orphaned components (not imported anywhere in site) — dead code, not user-visible.'
                        },
                        {
                            id: 'cs-celebrations-stubs', severity: 'done', brand: 'culturesherpa', area: 'CultureSherpa',
                            title: 'CS celebrations: S3 upload + Add Family dialog wired (2026-03-17)',
                            detail: 'handleImageUpload() now POSTs to /api/admin/image/presign (Lambda route in lambda_handler_minimal.py:1574) with {cultureName, imageType:"hero", contentType}, PUTs file directly to signed S3 URL, then POSTs /api/admin/image/confirm; stores CloudFront publicUrl in edit-hero-image (not data URL). btn-add-family now opens a modal (Family Name + Culture Reference + Description), slugifies familyId, and POSTs a seed celebration to /api/celebrations then reloads via loadCelebrations().'
                        },
                        {
                            id: 'cs-profile-password-stub', severity: 'done', brand: 'culturesherpa', area: 'CultureSherpa',
                            title: 'CS profile: password change + settings toast fixed (2026-03-17)',
                            detail: 'Password change now calls ${ADMIN_API}/api/user/password (Lambda backend, where /api/user/password route exists). "Settings Saved" alert() replaced with inline showToast(). admin_backend.py has PUT /api/user/password with bcrypt verify + DynamoDB update.'
                        },
                        {
                            id: 'cs-worklist-stub', severity: 'done', brand: 'culturesherpa', area: 'CultureSherpa',
                            title: 'quality.astro worklist is live data (2026-03-17)',
                            detail: 'Misnamed variable was already backed by real /api/enrichment/queue Lambda endpoint (route exists at admin_backend.py:3862). Renamed stubWorklist → worklist throughout quality.astro. CS commit 98805a45b.'
                        },
                        {
                            id: 'cs-invalidation-stub', severity: 'done', brand: 'culturesherpa', area: 'CultureSherpa',
                            title: 'CS: CloudFront cache invalidation implemented (2026-03-17)',
                            detail: 'api/cloudfront/invalidate.json.ts now calls CloudFront API directly via @aws-sdk/client-cloudfront (installed). Uses CS_AWS_ACCESS_KEY_ID + CS_AWS_SECRET_ACCESS_KEY + CS_AWS_REGION env vars. CreateInvalidationCommand with Date.now() CallerReference. Returns invalidationId, status, createTime. 501 stub + commented-out code removed.'
                        },
                        // ── GFV / goodflippinvibes.com ────────────────────────────────
                        {
                            id: 'gfv-stubs', severity: 'done', brand: 'gfv', area: 'GFV',
                            title: 'goodflippinvibes.com stubs — audited + profanity list expanded',
                            detail: 'Audit complete 2026-03-18. Real issue found: workers/auth.js profanity list was only 2 terms ([spam, test-profanity]) — expanded to 27 terms matching GFD (spam signals + slurs). GFV commit 4cbdfbc. science-enhancer.js Progressive Reading Methods are commented-out TODO stubs (not user-visible). All other hits are HTML ::placeholder attrs or Cloudflare DO .get() API calls (not unimplemented features).'
                        },
                        // ── AIAimate ──────────────────────────────────────────────────
                        {
                            id: 'aiaimate-stubs', severity: 'done', brand: 'aiaimate', area: 'AIAimate',
                            title: 'aiaimate.com stubs — audited, graceful degradation confirmed',
                            detail: 'Audit complete 2026-03-18. app/api/ask/route.ts generateAnswer() uses provider=stub graceful degradation when OPENAI_API_KEY absent — correct behavior, not broken. AskAISection.tsx shows (Set OPENAI_API_KEY for AI-generated answers) to users when stub. No broken user-visible stubs. Activate: set OPENAI_API_KEY + AI_PROVIDER=openai in Vercel dashboard.'
                        },
                        // ── Admin Portal ───────────────────────────────────────────────
                        {
                            id: 'admin-auth-gate', severity: 'done', brand: 'gfd', area: 'Admin',
                            title: 'admin.html edge auth — session cookie gate in _worker.js',
                            detail: '_worker.js lines 130–137 check for __session or __client_uat cookies on /admin.html requests and redirect unauthenticated visitors to /?auth_required=admin.'
                        },
                        {
                            id: 'admin-profanity', severity: 'done', brand: 'gfd', area: 'Admin',
                            title: 'Profanity filter — 27 terms (slurs + spam triggers)',
                            detail: 'workers/auth.js lines 268–278 block 27 terms including common slurs, explicit language, and spam triggers. Test sentinel test-profanity retained for CI.'
                        },
                        // ── Ops / Monitoring ──────────────────────────────────────────
                        {
                            id: 'sentry-dsn', severity: 'done', brand: 'gfd', area: 'Ops',
                            title: 'Sentry DSN configured (2026-03-13)',
                            detail: 'wrangler pages secret put SENTRY_DSN — uploaded to goodflippindesign production. Browser SDK injected by _worker.js; server-side boundary in auth.js. Active.'
                        },
                        {
                            id: 'sentry-ecosystem', severity: 'done', brand: 'all', area: 'Ops',
                            title: 'Sentry SDK wired across all 3 pending projects (2026-03-17)',
                            detail: '✅ CultureSherpa: SentryTracking.astro now imports @sentry/browser directly (was @sentry/astro — caused module specifier error in static builds). Added <SentryTracking /> to BaseLayout.astro. Activate: set PUBLIC_SENTRY_DSN. ✅ AIAimate: @sentry/nextjs@10.44.0 installed; sentry.client.config.ts + sentry.server.config.ts + sentry.edge.config.ts created; next.config.mjs wrapped with withSentryConfig. Activate: set NEXT_PUBLIC_SENTRY_DSN in Vercel dashboard. ✅ CitizenApproved: @sentry/browser installed; SentryInit.tsx client component (dynamic import, DSN-guarded) in src/app/layout.tsx. Activate: set NEXT_PUBLIC_SENTRY_DSN in Cloudflare Pages dashboard.'
                        },
                        {
                            id: 'ga4-ecosystem', severity: 'done', brand: 'all', area: 'Ops',
                            title: 'GA4 confirmed across all 8 monitored sites (2026-03-17)',
                            detail: 'CultureSherpa: G-EDHFZ472P7 in BaseLayout.astro + AdminLayout.astro. CitizenApproved: G-WM6Q66W9W0 in src/app/layout.tsx. GlobalDeets hardened (2026-03-13). GFD/GFV/AIAimate/Jamie/MN Peace all confirmed. Full ecosystem covered.'
                        },
                        {
                            id: 'globaldeets-hardening', severity: 'done', brand: 'globaldeets', area: 'Ops',
                            title: 'GlobalDeets hardened — GA4, onerror, CSP, CI added (2026-03-13)',
                            detail: 'GA4 was already present. Added window.onerror + unhandledrejection → js_error, updated CSP in _headers to include cdn.jsdelivr.net, created .github/workflows/ci.yml (validates GA4, HSTS, onerror on push/PR).'
                        },
                        {
                            id: 'brettleeweaver-monitoring', severity: 'done', brand: 'all', area: 'Ops',
                            title: 'brettleeweaver.com — GA4 + onerror + _headers + CI added (2026-03-13)',
                            detail: 'Created private repo weave0/brettleeweaver from live source. Added GA4 (G-WM6Q66W9W0), window.onerror → GA4 js_error, _headers with CSP/HSTS/X-Frame-Options, and CI workflow. Connect repo to Cloudflare Pages to deploy. Sentry + tests still pending.'
                        },
                        {
                            id: 'minnesotapeace-monitoring', severity: 'done', brand: 'all', area: 'Ops',
                            title: 'minnesotapeace.com — GA4 + onerror + _headers added (2026-03-13)',
                            detail: 'Deployed from weave0/jamie-mediation. Added GA4 (G-WM6Q66W9W0), window.onerror + unhandledrejection → js_error GA4 event, and _headers file with CSP/HSTS/X-Frame-Options/Referrer-Policy. Pushed to main 2026-03-13.'
                        },
                        {
                            id: 'citizenapproved-monitor', severity: 'done', brand: 'citizenapproved', area: 'Ops',
                            title: 'CitizenApproved added to health-check.yml (2026-03-13)',
                            detail: 'citizenapproved.org added to 6-hour GitHub Actions health sweep. Total monitored sites: 8.'
                        },
                        {
                            id: 'branch-protection', severity: 'done', brand: 'gfd', area: 'Ops',
                            title: 'Branch protection enforced on goodflippindesign (2026-03-15)',
                            detail: 'main branch requires PR + "CI - Tests (Cost Optimized) / Run Tests" status check. Require approvals enabled. jamie-mediation + SummitView still need rules if they gain CI workflows.'
                        },
                        {
                            id: 'contact-form-e2e', severity: 'done', brand: 'gfd', area: 'Ops',
                            title: 'Contact form verified end-to-end',
                            detail: 'Formspree xgvgzjbw confirmed live: POST returns {"ok":true} HTTP 200. GA4 form_submit event fires on success. Handler in index.html ~L5787.'
                        },
                        // ── Hygiene / Orphaned Files ──────────────────────────────────
                        {
                            id: 'orphan-html', severity: 'done', brand: 'gfd', area: 'Hygiene',
                            title: 'Orphaned HTML files cleaned up',
                            detail: 'ga-test-enhanced.html, test-ga.html, oauth-diagnostic.html, globaldeets-live-snapshot.html, main.html, globaldeets-phase1-live.html have all been removed from the repository.'
                        },
                        {
                            id: 'jamie-mediation-placement', severity: 'done', brand: 'gfd', area: 'Hygiene',
                            title: 'Jamie Mediation consolidated to minnesotapeace.com (2026-03-15)',
                            detail: 'jamierigling.com (dead DNS) + GFD-inline jamie-rigling-mediation.html sunsetted. Canonical deploy is minnesotapeace.com from weave0/jamie-mediation via CF Pages. Duplicate brand entry removed from admin. GFD-local file deleted.'
                        },
                        {
                            id: 'gallery-page', severity: 'done', brand: 'gfd', area: 'Hygiene',
                            title: 'gallery.html — nav link exists, CMS endpoint live',
                            detail: 'gallery.html is linked from main nav (desktop + mobile). /api/cms/gallery/:brand endpoint added to cms.js returning approved assets. No automated tests yet.'
                        },
                        // ── Recent completions (2026-03-12) ────────────────────────────
                        {
                            id: 'stripe-webhook', severity: 'done', brand: 'gfd', area: 'Ops',
                            title: 'Stripe webhook implemented',
                            detail: 'handleStripeWebhook() in workers/auth.js at POST /api/stripe/webhook. Web Crypto HMAC-SHA256 verifies STRIPE_WEBHOOK_SECRET. Handles payment_intent.succeeded/failed + charge.refunded.'
                        },
                        {
                            id: 'd1-schema-social', severity: 'done', brand: 'gfd', area: 'Ops',
                            title: 'D1 schema files complete',
                            detail: 'd1-schema-cms-social.sql covers social_accounts, brand_workflows, discovered_assets, cross_post_links, cms_prompt_registries, cms_generated_assets. d1-schema-nft.sql covers cms_nft_collections + cms_nft_tokens.'
                        },
                        {
                            id: 'feature-flags-injection', severity: 'done', brand: 'gfd', area: 'Ops',
                            title: 'Feature flags injected via _worker.js',
                            detail: 'ENABLE_COMMUNITY, ENABLE_BLOG_CMS, ENABLE_DONATIONS, ENABLE_AI_FEATURES now included in window.ENV injection. Can be toggled via Cloudflare secret (default ON for community/blog/donations).'
                        },
                        {
                            id: 'admin-jwt-hardening', severity: 'done', brand: 'gfd', area: 'Admin',
                            title: 'Admin edge: JWT format validation added',
                            detail: '_worker.js now checks that __session cookie value starts with "ey" (base64url JWT header) and is >20 chars, preventing cookie spoofing with arbitrary values.'
                        },
                        // ── Recent completions (2026-03-14) ────────────────────────────
                        {
                            id: 'characters-d1-api', severity: 'done', brand: 'gfd', area: 'Admin',
                            title: 'Characters panel — D1 persistence + Add Modal (2026-03-14)',
                            detail: 'cms_characters D1 table + handleCharacters() CRUD in cms.js. Characters panel rewritten API-first (localStorage fallback). Add Character modal with name, emoji, brand, stage, pipeline, tools fields. Pose/milestone status cycles write back to D1.'
                        },
                        {
                            id: 'donations-modal', severity: 'done', brand: 'gfd', area: 'Admin',
                            title: 'Donations panel — Record Donation modal + status field (2026-03-14)',
                            detail: 'Record Donation modal added to Donations panel (donor name, amount, payment ID, status). handleRecordDonation() in cms.js accepts status field. KPI strip now shows total raised from D1.'
                        },
                        {
                            id: 'analytics-enhanced', severity: 'done', brand: 'gfd', area: 'Admin',
                            title: 'Analytics panel — Delivery Rate KPI + Brand Breakdown table (2026-03-14)',
                            detail: 'Analytics panel gained Delivery Rate KPI (emerald ≥90% / gold ≥70% / rose below), tag cloud rows for platform + brand, and a Brand Performance Breakdown table with published/failed/scheduled/delivery-rate per brand. Stats call bumped to last 50 variants.'
                        },
                        {
                            id: 'audit-log-viewer', severity: 'done', brand: 'gfd', area: 'Admin',
                            title: 'Server Audit Log viewer in Overview (2026-03-14)',
                            detail: 'Overview panel now renders last 15 cms_audit_log rows (action, target, user, time). Refresh button calls /api/cms/stats. /api/cms/stats augmented with characters count, donations totals, open ops count, audit total, and recentAudit rows.'
                        },
                        // ── Phase 4 gaps (identified 2026-03-17) ──────────────────────
                        {
                            id: 'characters-panel-shell', severity: 'done', brand: 'gfd', area: 'Admin',
                            title: 'Characters panel — full CRUD UI complete (2026-03-22)',
                            detail: 'Static Sheriff placeholder replaced with fully dynamic rendering. All characters rendered from D1 via registryCache. Each card now has Edit button (opens pre-filled modal → PUT /characters/:id, preserves poses/milestones) and Delete button (confirm → DELETE /characters/:id). openEditModal() added. Save handler branches on char-modal-id presence for create vs update.'
                        },
                        {
                            id: 'community-donate-tests', severity: 'done', brand: 'gfd', area: 'Ops',
                            title: 'community-portal.html and donate.html — test suites complete (2026-03-19)',
                            detail: 'community-portal.html: 39/39 passing (a11y, responsive, auth flow). donate.html: 24/24 passing. Both suites run as part of the full npm test suite (235 tests total, 99.6% pass rate). Added 2026-03-19.'
                        },
                        {
                            id: 'asset-intake-sop', severity: 'done', brand: 'all', area: 'Ops',
                            title: 'ASSET_INTAKE_SOP.md created (2026-03-17)',
                            detail: 'Workstream A deliverable: naming convention (brand-category-descriptor.ext), E:\\art drop directory standard (16 brand folders, 2,232 files), sync-config.json pipeline docs, R2 bucket structure, D1 registration schema, step-by-step for new series/brand.'
                        },
                        {
                            id: 'adr-log', severity: 'done', brand: 'all', area: 'Ops',
                            title: 'ADR.md created — 15 architecture decision records (2026-03-17)',
                            detail: 'Workstream G deliverable: ADR-001 through ADR-015 covering vanilla stack, Cloudflare edge-first, D1, R2, Clerk, Stripe, Formspree, window.ENV injection, test strategy, WCAG, CSP, monorepo, graceful degradation, GPU animation policy.'
                        },
                        {
                            id: 'docs-hub-panel', severity: 'done', brand: 'gfd', area: 'Admin',
                            title: 'Documentation Hub panel added to admin (view #25) (2026-03-17)',
                            detail: 'Charter §10 essential module — was the only missing one. Nav button #25, view-docs section with 4 grouped panels: Architecture & Strategy (charter, ADR, roadmaps), Operations & SOPs (intake SOP, dev guide, contributing, inquiry flow), Platform & Media (architecture, vision, pipeline, animation), Status & Audits (status, dashboard, audits, security, brand pack). All links open in new tab with rel=noopener.'
                        },
                    ];

                    function renderBrandHealth() {
                        const strip = $('brand-health-strip');
                        if (!strip) return;
                        const brandTotals = {};
                        GAP_FLAGS.forEach((f) => {
                            if (f.severity === 'done') return;
                            const brands = f.brand === 'all' ? ['all'] : f.brand.split(',').map((b) => b.trim());
                            brands.forEach((b) => {
                                if (!brandTotals[b]) brandTotals[b] = { blockers: 0, quality: 0 };
                                if (f.severity === 'blocker') brandTotals[b].blockers++;
                                else brandTotals[b].quality++;
                            });
                        });
                        const order = ['gfd', 'gfv', 'culturesherpa', 'aiaimate', 'globaldeets', 'citizenapproved', 'all'];
                        const pills = order.filter((b) => brandTotals[b]).map((b) => {
                            const d = brandTotals[b];
                            const label = b === 'all' ? 'All Brands' : (BRAND_DEFS[b]?.shortName || b);
                            const color = BRAND_DEFS[b]?.color || '#a0a0a0';
                            const blockerHtml = d.blockers ? `<span class="bhp-blocker">${d.blockers}&thinsp;&#10005;</span>` : '';
                            const qualityHtml = d.quality ? `<span class="bhp-quality">${d.quality}&thinsp;&#9651;</span>` : '';
                            return `<span class="bhp" style="background:${color}18;border-color:${color}38"><span class="bhp-name">${escapeHtml(label)}</span>${blockerHtml}${qualityHtml}</span>`;
                        });
                        strip.innerHTML = pills.length ? pills.join('') : '<span class="text-muted" style="font-size:0.75rem">No open gaps &#10003;</span>';
                    }

                    function renderGapFlags() {
                        const list = $('gap-flags-list');
                        const updated = $('gap-flags-updated');
                        if (!list) return;
                        renderBrandHealth();

                        const order = { blocker: 0, quality: 1, hygiene: 2, done: 3 };
                        const sorted = [...GAP_FLAGS].sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));

                        const severityLabel = { blocker: '&#10005; Blocker', quality: '&#9651; Quality', hygiene: '&#128197; Hygiene', done: '&#10003; Done' };
                        const severityClass = { blocker: 'flag-blocker', quality: 'flag-quality', hygiene: 'flag-hygiene', done: 'flag-done' };

                        const counts = GAP_FLAGS.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; }, {});
                        if (updated) {
                            updated.textContent = `${counts.blocker || 0} blockers · ${(counts.quality || 0) + (counts.hygiene || 0)} quality/hygiene · ${counts.done || 0} done`;
                        }

                        list.innerHTML = sorted.map(f => `
                    <div class="gap-flag ${severityClass[f.severity] || ''}">
                        <div class="gap-flag-head">
                            <span class="gap-severity">${severityLabel[f.severity] || f.severity}</span>
                            <span class="gap-area">${escapeHtml(f.area)}</span>
                            ${f.brand !== 'all' ? `<span class="gap-brand">${escapeHtml(f.brand.split(',').join(' · '))}</span>` : ''}
                        </div>
                        <div class="gap-title">${escapeHtml(f.title)}</div>
                        <div class="gap-detail">${escapeHtml(f.detail)}</div>
                    </div>
                `).join('');
                    }

                    function updateGettingStarted() {
                        const panel = $('getting-started');
                        if (!panel) return;
                        // Dismissed for this session?
                        if (sessionStorage.getItem('gs-dismissed') === '1') return;

                        const assets = Number($('kpi-assets').textContent || 0);
                        const scheduled = Number($('kpi-scheduled').textContent || 0);
                        const campaigns = Number($('kpi-campaigns').textContent || 0);
                        const conns = Number($('kpi-connections').textContent || 0);

                        const allZero = assets === 0 && scheduled === 0 && campaigns === 0 && conns === 0;
                        panel.classList.toggle('d-none', !allZero);

                        // Mark completed steps
                        if (assets > 0) $('gs-step-1')?.classList.add('gs-done');
                        if (campaigns > 0) $('gs-step-2')?.classList.add('gs-done');
                        if (conns > 0) $('gs-step-3')?.classList.add('gs-done');
                        if (scheduled > 0) $('gs-step-4')?.classList.add('gs-done');
                    }



                    function renderEcosystemMatrix() {
                        const head = $('eco-matrix-head');
                        const body = $('eco-matrix-body');
                        if (!head || !body) return;

                        const activePlatforms = ALL_PLATFORMS;

                        // Header row: blank corner + platform names
                        head.innerHTML = '<tr><th>Brand</th>' +
                            activePlatforms.map((p) => `<th>${escapeHtml(p)}</th>`).join('') +
                            '</tr>';

                        const rows = Object.entries(BRAND_DEFS).map(([brandId, brandDef]) => {
                            const cells = activePlatforms.map((platform) => {
                                const isEnabled = brandDef.platforms.includes(platform);

                                if (!isEnabled) {
                                    return `<td><div class="eco-cell"><button class="eco-cell-btn n-a" disabled aria-label="N/A">—</button></div></td>`;
                                }

                                // Check for an active connection (token)
                                const conn = state.allConnections.find(
                                    (c) => c.brand === brandId && c.platform === platform && Number(c.is_active) === 1
                                );
                                // Check for a registered handle
                                const handle = state.socialAccounts.find(
                                    (a) => a.brand === brandId && a.platform === platform
                                );

                                const isConnected = Boolean(conn);
                                const label = conn?.account_label || 'connected';
                                const handleText = handle?.handle ? escapeHtml(handle.handle) : '';

                                return `<td>
                            <div class="eco-cell">
                                <button class="eco-cell-btn ${isConnected ? 'connected' : ''}"
                                    data-matrix-brand="${escapeHtml(brandId)}"
                                    data-matrix-platform="${escapeHtml(platform)}"
                                    title="${isConnected ? ('Edit connection: ' + escapeHtml(conn.account_label || '')) : ('Connect ' + escapeHtml(platform) + ' for ' + escapeHtml(brandDef.name))}"
                                    aria-label="${isConnected ? 'Edit' : 'Connect'} ${platform} for ${brandDef.name}">
                                    <span class="eco-status-dot"></span>
                                    <span>${isConnected ? escapeHtml(label) : 'connect'}</span>
                                </button>
                                ${handleText ? `<span class="eco-cell-handle">${handleText}</span>` : ''}
                                ${isConnected && conn && conn.id ? `<button class="eco-cell-test-btn btn btn-micro" data-conn-id="${escapeHtml(String(conn.id))}" data-platform="${escapeHtml(platform)}" style="font-size:0.68rem;padding:1px 5px;margin-top:2px;width:100%" title="Test access token" aria-label="Test ${escapeHtml(platform)} token">&#128268; Test</button>` : ''}
                            </div>
                        </td>`;
                            }).join('');

                            return `<tr>
                        <td>
                            <span class="eco-brand-dot" style="background:${brandDef.color}"></span>
                            ${escapeHtml(brandDef.name)}
                        </td>
                        ${cells}
                    </tr>`;
                        }).join('');

                        body.innerHTML = rows;

                        // Wire up matrix cell clicks → prefill connection modal
                        body.querySelectorAll('[data-matrix-brand]').forEach((btn) => {
                            btn.addEventListener('click', () => {
                                const platform = btn.dataset.matrixPlatform;
                                // Switch to manual tab and prefill
                                document.querySelectorAll('.conn-tab').forEach((t) => t.classList.remove('active'));
                                document.querySelectorAll('.conn-tab-panel').forEach((p) => p.classList.remove('active'));
                                document.querySelector('[data-conn-tab="manual"]').classList.add('active');
                                $('conn-tab-manual').classList.add('active');
                                $('conn-platform').value = platform;
                                renderOAuthProviderGrid();
                                openModal('connection-modal');
                            });
                        });

                        // Wire up test buttons
                        body.querySelectorAll('.eco-cell-test-btn').forEach((btn) => {
                            btn.addEventListener('click', async (e) => {
                                e.stopPropagation();
                                btn.innerHTML = '&#8987; Testing…';
                                btn.disabled = true;
                                await testConnectionById(btn.dataset.connId);
                                btn.innerHTML = '&#128268; Test';
                                btn.disabled = false;
                            });
                        });
                    }

                    function renderHandlesTable() {
                        const body = $('handles-table');
                        if (!body) return;

                        if (state.socialAccounts.length === 0) {
                            body.innerHTML = '<tr><td colspan="7" class="text-muted">No handles registered yet. Click "Register Handle" to add one.</td></tr>';
                            return;
                        }

                        body.innerHTML = state.socialAccounts.map((acct) => `
                    <tr>
                        <td>
                            <span class="eco-brand-dot" style="background:${escapeHtml(BRAND_DEFS[acct.brand]?.color || '#888')}"></span>
                            ${escapeHtml(BRAND_DEFS[acct.brand]?.name || acct.brand)}
                        </td>
                        <td>${escapeHtml(acct.platform)}</td>
                        <td><strong>${escapeHtml(acct.handle)}</strong></td>
                        <td>${Number(acct.followers_count || 0).toLocaleString()}</td>
                        <td>${acct.verified ? '✓' : '—'}</td>
                        <td>${acct.last_synced ? escapeHtml(formatDateTime(acct.last_synced)) : '—'}</td>
                        <td>
                            <button class="btn btn-danger" style="font-size:0.72rem;padding:0.2rem 0.55rem;" data-delete-handle="${acct.id}"
                                aria-label="Delete handle ${acct.handle}">Delete</button>
                        </td>
                    </tr>
                `).join('');

                        body.querySelectorAll('[data-delete-handle]').forEach((btn) => {
                            btn.addEventListener('click', () => deleteHandle(btn.getAttribute('data-delete-handle')));
                        });
                    }

                    function renderCampaigns() {
                        const body = $('campaign-table');
                        body.innerHTML = state.campaigns.length
                            ? state.campaigns.map((row) => `
                        <tr>
                            <td>
                                <div class="text-strong">${escapeHtml(row.name)}</div>
                                <div class="text-note">${escapeHtml(row.objective || '')}</div>
                            </td>
                            <td>${escapeHtml((row.start_date || '').slice(0, 10) || '-')}${row.end_date ? ' to ' + escapeHtml(row.end_date.slice(0, 10)) : ''}</td>
                            <td>${statusTag(row.status)}</td>
                            <td>${Number(row.post_count || 0)}</td>
                            <td class="row-actions">
                                <button class="btn btn-micro" data-edit-campaign="${row.id}" aria-label="Edit campaign">Edit</button>
                                <button class="btn btn-danger btn-micro" data-delete-campaign="${row.id}" aria-label="Delete campaign">Delete</button>
                            </td>
                        </tr>
                    `).join('')
                            : '<tr><td colspan="5">No campaigns created yet.</td></tr>';

                        body.querySelectorAll('[data-edit-campaign]').forEach((btn) => {
                            const campaign = state.campaigns.find((c) => String(c.id) === btn.dataset.editCampaign);
                            if (campaign) btn.addEventListener('click', () => editCampaign(campaign));
                        });
                        body.querySelectorAll('[data-delete-campaign]').forEach((btn) => {
                            btn.addEventListener('click', () => deleteCampaign(btn.dataset.deleteCampaign));
                        });
                    }

                    function renderCampaignSelect() {
                        const select = $('composer-campaign');
                        select.innerHTML = '<option value="">General (no campaign)</option>' +
                            state.campaigns.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
                    }

                    function renderCrossPostPicker() {
                        const picker = $('crosspost-brand-picker');
                        if (!picker) return;
                        const otherBrands = Object.entries(BRAND_DEFS).filter(([id]) => id !== currentBrand);
                        if (otherBrands.length === 0) {
                            picker.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem">No other brands configured.</span>';
                            return;
                        }
                        picker.innerHTML = otherBrands.map(([id, def]) => `
                    <button type="button" class="crosspost-pill ${state.crossPostBrands.has(id) ? 'active' : ''}"
                        data-cp-brand="${escapeHtml(id)}" style="--brand-color:${escapeHtml(def.color)}">
                        ${escapeHtml(def.shortName || def.name)}
                    </button>
                `).join('');
                        picker.querySelectorAll('[data-cp-brand]').forEach((btn) => {
                            btn.addEventListener('click', () => {
                                const b = btn.dataset.cpBrand;
                                if (state.crossPostBrands.has(b)) {
                                    state.crossPostBrands.delete(b);
                                } else {
                                    state.crossPostBrands.add(b);
                                }
                                renderCrossPostPicker();
                            });
                        });
                    }

                    function renderPlatformPicker() {
                        const picker = $('platform-picker');
                        picker.innerHTML = PLATFORM_ORDER.map((platform) => `
                    <button type="button" class="platform-pill ${state.selectedPlatforms.has(platform) ? 'active' : ''}" data-platform="${platform}">
                        ${escapeHtml(platform)}
                    </button>
                `).join('');

                        picker.querySelectorAll('[data-platform]').forEach((btn) => {
                            btn.addEventListener('click', () => {
                                const platform = btn.getAttribute('data-platform');
                                if (state.selectedPlatforms.has(platform)) {
                                    state.selectedPlatforms.delete(platform);
                                } else {
                                    state.selectedPlatforms.add(platform);
                                }
                                renderPlatformPicker();
                                updateComposerCounters();
                            });
                        });
                    }

                    function renderComposerAssets() {
                        const container = $('composer-assets');
                        const candidates = state.assets.filter((a) => ['image', 'video'].includes(a.media_type)).slice(0, 80);

                        container.innerHTML = candidates.length
                            ? candidates.map((asset) => {
                                const isActive = state.selectedAssetId === asset.id;
                                const image = assetUrl(asset);
                                const imageBase = assetBase(asset);
                                return `
                            <article class="asset-card ${isActive ? 'active' : ''}" data-asset-id="${asset.id}">
                                <img class="asset-thumb" src="${escapeHtml(image)}" data-r2="${escapeHtml(imageBase)}" alt="${escapeHtml(asset.title)}" loading="lazy">
                                <div class="asset-meta">
                                    <div class="text-strong">${escapeHtml(asset.title)}</div>
                                    <div>${escapeHtml(asset.media_type || '')}</div>
                                </div>
                            </article>
                        `;
                            }).join('')
                            : '<p class="text-muted">Upload image/video assets first, then schedule from this panel.</p>';

                        container.querySelectorAll('[data-asset-id]').forEach((card) => {
                            card.addEventListener('click', () => {
                                state.selectedAssetId = card.getAttribute('data-asset-id');
                                renderComposerAssets();
                                renderPostPreviews();
                            });
                        });
                    }

                    function renderPostPreviews() {
                        const scroll = $('preview-scroll');
                        if (!scroll) return;
                        const panel = $('composer-preview-panel');
                        if (!panel || panel.style.display === 'none') return;

                        const content = ($('composer-content').value || '').trim();
                        const hashtagRaw = ($('composer-hashtags').value || '').trim();
                        const hashtags = hashtagRaw.split(',').map((h) => h.trim().replace(/^#/, '')).filter(Boolean);
                        const tagString = hashtags.map((h) => '#' + h).join(' ');
                        const fullText = tagString ? `${content}\n\n${tagString}` : content;

                        const selectedAsset = state.assets.find((a) => String(a.id) === String(state.selectedAssetId));
                        const imgSrc = selectedAsset ? assetUrl(selectedAsset) : '';

                        const platforms = [...state.selectedPlatforms];
                        if (!platforms.length) {
                            scroll.innerHTML = '<p class="text-muted" style="font-size:0.8rem">Select at least one platform above to see previews.</p>';
                            return;
                        }

                        const PLATFORM_META = {
                            instagram: { label: 'Instagram', color: '#e1306c', maxChars: 2200, cls: 'preview-ig' },
                            x: { label: 'X', color: '#1d9bf0', maxChars: 280, cls: 'preview-x' },
                            linkedin: { label: 'LinkedIn', color: '#0a66c2', maxChars: 3000, cls: 'preview-li' },
                            facebook: { label: 'Facebook', color: '#1877f2', maxChars: 63206, cls: 'preview-fb' },
                            tiktok: { label: 'TikTok', color: '#ee1d52', maxChars: 2200, cls: 'preview-tt' },
                            pinterest: { label: 'Pinterest', color: '#bd081c', maxChars: 500, cls: 'preview-pin' },
                            youtube: { label: 'YouTube', color: '#ff0000', maxChars: 5000, cls: 'preview-yt' },
                            threads: { label: 'Threads', color: '#101010', maxChars: 500, cls: 'preview-th' },
                        };

                        const brandHandle = (BRAND_DEFS[currentBrand]?.shortName || currentBrand).toLowerCase();

                        scroll.innerHTML = platforms.map((p) => {
                            const meta = PLATFORM_META[p] || { label: p, color: '#6c63ff', maxChars: 500, cls: 'preview-x' };
                            const rules = state.platformRules[p] || {};
                            const limit = Number(rules.maxChars || meta.maxChars);
                            const count = fullText.length;
                            const over = count > limit;

                            const imgHtml = imgSrc
                                ? `<img src="${escapeHtml(imgSrc)}" alt="post preview" loading="lazy">`
                                : `<div style="padding:1.5rem;text-align:center">No artwork selected<br><small style="opacity:0.5">Pick an asset below</small></div>`;

                            const displayCaption = content.length > 140
                                ? escapeHtml(content.slice(0, 140)) + '&hellip;'
                                : escapeHtml(content) || '<em style="opacity:0.35">Caption will appear here&hellip;</em>';
                            const displayTags = tagString.length > 90
                                ? escapeHtml(tagString.slice(0, 90)) + '&hellip;'
                                : escapeHtml(tagString);

                            return `
                        <div class="preview-card ${escapeHtml(meta.cls)}">
                            <div class="preview-hdr">
                                <span class="preview-badge" style="background:${escapeHtml(meta.color)}22;color:${escapeHtml(meta.color)}">${escapeHtml(meta.label)}</span>
                                <span>@${escapeHtml(brandHandle)}</span>
                            </div>
                            <div class="preview-img">${imgHtml}</div>
                            <div class="preview-body">
                                <div class="preview-caption">${displayCaption}</div>
                                ${displayTags ? `<div class="preview-tags">${displayTags}</div>` : ''}
                                <div class="preview-stat${over ? ' over' : ''}">${count.toLocaleString()} / ${limit.toLocaleString()} chars${over ? ' &mdash; OVER LIMIT' : ''}</div>
                            </div>
                        </div>
                    `;
                        }).join('');
                    }
                    function initUrlImport() {
                        const modal = $('url-import-modal');
                        if (!modal) return;

                        // Populate brand select (same brands as bulk-brand)
                        const brandSel = $('url-import-brand');
                        if (brandSel && typeof BRANDS !== 'undefined') {
                            Object.entries(BRANDS).forEach(([id, def]) => {
                                const opt = document.createElement('option');
                                opt.value = id;
                                opt.textContent = def.shortName || id;
                                if (id === currentBrand) opt.selected = true;
                                brandSel.appendChild(opt);
                            });
                        }

                        function openModal() {
                            modal.classList.remove('d-none');
                            const ta = $('url-import-textarea');
                            if (ta) ta.focus();
                        }
                        function closeModal() {
                            modal.classList.add('d-none');
                            $('url-import-progress').classList.add('d-none');
                            $('url-import-bar').style.width = '0%';
                            $('url-import-results').innerHTML = '';
                            $('url-import-submit').disabled = false;
                            $('url-import-submit').textContent = '\u21d2 Start Import';
                        }

                        $('import-urls-btn').addEventListener('click', (ev) => { ev.stopPropagation(); openModal(); });
                        $('url-import-close').addEventListener('click', closeModal);
                        $('url-import-cancel').addEventListener('click', closeModal);
                        modal.addEventListener('click', (ev) => { if (ev.target === modal) closeModal(); });

                        $('url-import-submit').addEventListener('click', async () => {
                            const ta = $('url-import-textarea');
                            const urls = (ta.value || '').split('\n').map((u) => u.trim()).filter(Boolean);
                            if (!urls.length) { toast('Paste at least one URL.', 'info'); return; }
                            if (urls.length > 200) { toast('Max 200 URLs per batch.', 'error'); return; }

                            const brand = $('url-import-brand').value || currentBrand;
                            const category = ($('url-import-category').value.trim() || 'imports');
                            const tagsRaw = $('url-import-tags').value.trim();

                            const submitBtn = $('url-import-submit');
                            submitBtn.disabled = true;
                            submitBtn.textContent = 'Importing\u2026';

                            const progressWrap = $('url-import-progress');
                            const bar = $('url-import-bar');
                            const counter = $('url-import-counter');
                            const resultList = $('url-import-results');
                            progressWrap.classList.remove('d-none');
                            resultList.innerHTML = '';
                            counter.textContent = '0 / ' + urls.length;

                            // Split into batches of 20 to avoid timeout
                            const BATCH = 20;
                            let done = 0; let ok = 0; let fail = 0;

                            for (let i = 0; i < urls.length; i += BATCH) {
                                const chunk = urls.slice(i, i + BATCH);
                                let results = [];
                                try {
                                    const res = await api('/upload-url', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ urls: chunk, brand, category, tags: tagsRaw }),
                                    });
                                    results = res.results || [];
                                } catch (err) {
                                    // Tag all in chunk as failed
                                    results = chunk.map((u) => ({ url: u, ok: false, error: err.message || 'Request failed' }));
                                }

                                results.forEach((r) => {
                                    done++;
                                    const li = document.createElement('li');
                                    li.style.cssText = 'padding:2px 0;display:flex;gap:.5rem;align-items:flex-start';
                                    if (r.ok) {
                                        ok++;
                                        li.innerHTML = `<span style="color:var(--success)">✓</span><span style="word-break:break-all;opacity:.7">${escapeHtml(r.url)}</span>`;
                                    } else {
                                        fail++;
                                        li.innerHTML = `<span style="color:var(--error)">✗</span><span style="word-break:break-all"><span style="opacity:.7">${escapeHtml(r.url)}</span> <span style="color:var(--error)">&mdash; ${escapeHtml(r.error || 'failed')}</span></span>`;
                                    }
                                    resultList.appendChild(li);
                                    resultList.scrollTop = resultList.scrollHeight;
                                });

                                counter.textContent = done + ' / ' + urls.length;
                                bar.style.width = Math.round((done / urls.length) * 100) + '%';
                            }

                            submitBtn.textContent = 'Done';
                            toast(`Import complete — ${ok} succeeded, ${fail} failed.`, fail > 0 ? 'error' : 'success');
                            await loadAssets();
                            renderLibrary();
                        });
                    }

                    function initUploadZone() {
                        const zone = $('upload-zone');
                        const input = $('upload-input');
                        const folderInput = $('folder-input');
                        const folderBtn = $('import-folder-btn');
                        if (!zone || !input) return;

                        zone.addEventListener('click', (ev) => {
                            if (ev.target === folderBtn || ev.target === folderInput) return;
                            if (ev.target !== input) input.click();
                        });
                        zone.addEventListener('keydown', (ev) => {
                            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); input.click(); }
                        });
                        input.addEventListener('change', () => handleUploadFiles(Array.from(input.files)));

                        if (folderBtn && folderInput) {
                            folderBtn.addEventListener('click', (ev) => { ev.stopPropagation(); folderInput.click(); });
                            folderInput.addEventListener('change', () => { handleUploadFiles(Array.from(folderInput.files)); folderInput.value = ''; });
                        }

                        zone.addEventListener('dragover', (ev) => { ev.preventDefault(); zone.classList.add('drag-over'); });
                        zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
                        zone.addEventListener('drop', (ev) => {
                            ev.preventDefault();
                            zone.classList.remove('drag-over');
                            const files = Array.from(ev.dataTransfer.files);
                            if (files.length) handleUploadFiles(files);
                        });
                    }

                    // Stage files in the bulk panel instead of uploading immediately.
                    // Users can set shared brand/category/tags before confirming.
                    function handleUploadFiles(files) {
                        if (!files.length) return;

                        // Add new files (skip exact-name duplicates already staged)
                        const existingNames = new Set(state.uploadQueue.map((f) => f.name));
                        files.forEach((f) => { if (!existingNames.has(f.name)) state.uploadQueue.push(f); });

                        renderBulkStage();

                        // reset file input
                        const input = $('upload-input');
                        if (input) input.value = '';
                    }

                    function renderBulkStage() {
                        const panel = $('bulk-stage');
                        const fileList = $('bulk-file-list');
                        const countEl = $('bulk-stage-count');
                        const uploadBtn = $('bulk-upload-btn');

                        if (!state.uploadQueue.length) {
                            panel.classList.add('d-none');
                            return;
                        }

                        panel.classList.remove('d-none');
                        const n = state.uploadQueue.length;
                        countEl.textContent = n + ' file' + (n !== 1 ? 's' : '') + ' staged';
                        uploadBtn.textContent = 'Upload ' + n + ' File' + (n !== 1 ? 's' : '');

                        // Sync bulk-brand to currentBrand if no user selection yet
                        const bulkBrand = $('bulk-brand');
                        if (!bulkBrand.dataset.userChanged) bulkBrand.value = currentBrand;

                        fileList.innerHTML = state.uploadQueue.map((f, i) => {
                            const typeIcon = f.type.startsWith('video') ? '🎬' : f.type.startsWith('audio') ? '🔊' : f.type === 'application/pdf' ? '📄' : '🖼';
                            return `<li class="bulk-file-item">
                        <span>${typeIcon}</span>
                        <span title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
                        <button class="bulk-remove" data-qi="${i}" title="Remove from batch" aria-label="Remove ${escapeHtml(f.name)}">&times;</button>
                    </li>`;
                        }).join('');

                        fileList.querySelectorAll('.bulk-remove').forEach((btn) => {
                            btn.addEventListener('click', () => {
                                state.uploadQueue.splice(Number(btn.dataset.qi), 1);
                                renderBulkStage();
                            });
                        });
                    }

                    // Mark bulk-brand as user-changed so we don't auto-reset it
                    function initBulkBrandListener() {
                        const el = $('bulk-brand');
                        if (el) el.addEventListener('change', () => { el.dataset.userChanged = '1'; });
                    }

                    function clearBulkQueue() {
                        state.uploadQueue = [];
                        renderBulkStage();
                        const el = $('bulk-brand');
                        if (el) delete el.dataset.userChanged;
                    }

                    async function commitBulkUpload() {
                        const files = [...state.uploadQueue];
                        if (!files.length) return;

                        const brand = $('bulk-brand').value || currentBrand;
                        const category = ($('bulk-category').value.trim() || 'uploads');
                        const tagsRaw = $('bulk-tags').value.trim();
                        const tags = tagsRaw ? JSON.stringify(tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)) : '[]';

                        // Clear queue immediately to avoid double-submit
                        clearBulkQueue();

                        const list = $('upload-progress-list');

                        for (const file of files) {
                            const id = 'up-' + Math.random().toString(36).slice(2);
                            const li = document.createElement('li');
                            li.className = 'upload-item';
                            li.id = id;
                            li.innerHTML = `
                        <span class="upload-item-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
                        <div class="upload-bar-wrap"><div class="upload-bar" id="${id}-bar" style="width:0%"></div></div>
                        <span class="upload-item-status" id="${id}-st">Uploading&hellip;</span>
                    `;
                            list.appendChild(li);

                            try {
                                const bar = $(id + '-bar');
                                const st = $(id + '-st');
                                if (bar) bar.style.width = '30%';

                                const form = new FormData();
                                form.append('file', file);
                                form.append('title', file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
                                form.append('brand', brand);
                                form.append('category', category);
                                form.append('tags', tags);
                                form.append('review_status', 'draft');
                                form.append('media_type', file.type.startsWith('video') ? 'video' : file.type.startsWith('audio') ? 'audio' : file.type === 'application/pdf' ? 'document' : 'image');

                                await api('/upload', { method: 'POST', body: form });

                                if (bar) bar.style.width = '100%';
                                if (st) { st.textContent = '✓'; st.classList.add('ok'); }
                            } catch (err) {
                                const bar = $(id + '-bar');
                                const st = $(id + '-st');
                                if (bar) bar.style.width = '100%';
                                if (st) { st.textContent = err.message || 'Upload failed'; st.classList.add('err'); }
                            }

                            setTimeout(() => { const el = $(id); if (el) el.remove(); }, 6000);
                        }

                        await loadAssets();
                        renderLibrary();
                    }

                    function reloadLibrary() {
                        state.libPage = 0;
                        loadAssets().then(renderLibrary);
                    }

                    function renderLibrary() {
                        const list = state.assets;

                        // Reset selection on each re-render (stale IDs no longer in view)
                        state.selectedLibraryIds.clear();

                        const grid = $('library-grid');
                        if (!list || !list.length) {
                            grid.innerHTML = '<p class="text-muted">No assets matched your filter.</p>';
                            const bab = $('batch-approve-btn');
                            if (bab) bab.hidden = true;
                            renderLibPagination();
                            return;
                        }

                        grid.innerHTML = list.map((asset) => {
                            const reviewStatus = asset.review_status || 'draft';
                            const reviewBadge = `<span class="asset-status-badge ${reviewStatus}">${reviewStatus}</span>`;
                            let tags = [];
                            try { tags = JSON.parse(asset.tags || '[]'); } catch { tags = []; }
                            const tagHtml = tags.slice(0, 4).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
                            const thumb = assetUrl(asset);
                            const thumbBase = assetBase(asset);
                            const isVideo = asset.media_type === 'video';
                            return `
                        <article class="asset-card" data-asset-id="${asset.id}">
                            <label class="asset-check-wrap" title="Select for batch action">
                                <input type="checkbox" class="asset-check" data-check-id="${escapeHtml(String(asset.id))}" aria-label="Select ${escapeHtml(asset.title)}">
                            </label>
                            ${thumb
                                    ? (isVideo
                                        ? `<div class="asset-thumb-wrap"><video class="asset-thumb" src="${escapeHtml(thumb)}" muted preload="none"></video><span class="asset-type-badge">VIDEO</span></div>`
                                        : `<div class="asset-thumb-wrap"><img class="asset-thumb" src="${escapeHtml(thumb)}" data-r2="${escapeHtml(thumbBase)}" alt="${escapeHtml(asset.title)}" loading="lazy"><span class="asset-type-badge">${escapeHtml((asset.media_type || 'file').toUpperCase())}</span></div>`)
                                    : `<div class="asset-thumb-wrap asset-no-thumb"><span class="asset-type-badge">${escapeHtml((asset.media_type || 'file').toUpperCase())}</span></div>`}
                            <div class="asset-meta">
                                <div class="text-strong">${escapeHtml(asset.title)}</div>
                                <div class="text-note">${escapeHtml(asset.category || '-')}${asset.featured ? ' &nbsp;&#9733;' : ''}</div>
                                ${tagHtml ? `<div class="asset-tags mt-03">${tagHtml}</div>` : ''}
                                <div class="mt-03">${reviewBadge}</div>
                            </div>
                            <div class="asset-actions">
                                <button class="btn btn-micro" data-use-asset="${asset.id}" title="Use in Composer">Use</button>
                                <button class="btn btn-micro" data-edit-asset="${asset.id}" title="Edit metadata">Edit</button>
                                ${reviewStatus !== 'approved'
                                    ? `<button class="btn btn-micro btn-success-soft" data-approve-asset="${asset.id}" title="Approve for public use">&#10003;</button>`
                                    : `<button class="btn btn-micro" data-reject-asset="${asset.id}" title="Revoke approval">&times;</button>`}
                                <button class="btn btn-micro btn-danger-soft" data-delete-asset="${asset.id}" title="Delete">Del</button>
                            </div>
                        </article>
                    `;
                        }).join('');

                        // Wire per-card checkboxes
                        const updateBatchBtn = () => {
                            const bab = $('batch-approve-btn');
                            const sal = $('library-select-all');
                            if (!bab) return;
                            const n = state.selectedLibraryIds.size;
                            bab.hidden = n === 0;
                            bab.textContent = `Approve Selected (${n})`;
                            if (sal) sal.indeterminate = n > 0 && n < list.length;
                            if (sal) sal.checked = n === list.length && list.length > 0;
                        };
                        grid.querySelectorAll('.asset-check').forEach((cb) => {
                            cb.addEventListener('change', () => {
                                const id = cb.dataset.checkId;
                                if (cb.checked) state.selectedLibraryIds.add(id);
                                else state.selectedLibraryIds.delete(id);
                                updateBatchBtn();
                            });
                        });

                        grid.querySelectorAll('[data-edit-asset]').forEach((btn) => {
                            btn.addEventListener('click', (ev) => {
                                ev.stopPropagation();
                                const asset = state.assets.find((a) => String(a.id) === btn.dataset.editAsset);
                                if (asset) openAssetEditModal(asset);
                            });
                        });
                        grid.querySelectorAll('[data-approve-asset]').forEach((btn) => {
                            btn.addEventListener('click', (ev) => {
                                ev.stopPropagation();
                                reviewAsset(btn.dataset.approveAsset, 'approve');
                            });
                        });
                        grid.querySelectorAll('[data-reject-asset]').forEach((btn) => {
                            btn.addEventListener('click', (ev) => {
                                ev.stopPropagation();
                                reviewAsset(btn.dataset.rejectAsset, 'reject');
                            });
                        });
                        grid.querySelectorAll('[data-delete-asset]').forEach((btn) => {
                            btn.addEventListener('click', (ev) => {
                                ev.stopPropagation();
                                deleteAsset(btn.dataset.deleteAsset);
                            });
                        });
                        grid.querySelectorAll('[data-use-asset]').forEach((btn) => {
                            btn.addEventListener('click', (ev) => {
                                ev.stopPropagation();
                                state.selectedAssetId = btn.dataset.useAsset;
                                switchView('composer');
                                renderComposerAssets();
                                toast('Asset selected — add a caption and schedule it', 'success');
                            });
                        });

                        renderLibPagination();
                    }

                    function renderLibPagination() {
                        const total = state.assetTotal || 0;
                        const page = state.libPage || 0;
                        const pageSize = LIB_PAGE_SIZE;
                        const totalPages = Math.ceil(total / pageSize);
                        const paginationEl = $('lib-pagination');
                        const prevBtn = $('lib-prev-btn');
                        const nextBtn = $('lib-next-btn');
                        const infoEl = $('lib-page-info');

                        if (!paginationEl) return;

                        if (total <= pageSize) {
                            paginationEl.classList.add('d-none');
                            return;
                        }
                        paginationEl.classList.remove('d-none');
                        paginationEl.style.display = 'flex';

                        const from = page * pageSize + 1;
                        const to = Math.min((page + 1) * pageSize, total);
                        if (infoEl) infoEl.textContent = `${from}–${to} of ${total}`;
                        if (prevBtn) prevBtn.disabled = page === 0;
                        if (nextBtn) nextBtn.disabled = page >= totalPages - 1;
                    }

                    function renderCalendar(events, monthStart) {
                        const title = monthStart.toLocaleString('en-US', { month: 'long', year: 'numeric' });
                        $('calendar-title').textContent = 'Calendar - ' + title;

                        const firstWeekday = monthStart.getDay();
                        const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();

                        const eventMap = {};
                        events.forEach((event) => {
                            const day = new Date(event.scheduled_at).getDate();
                            if (!eventMap[day]) eventMap[day] = [];
                            eventMap[day].push(event);
                        });

                        const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                        const cells = labels.map((l) => `<div class="day-label">${l}</div>`);

                        for (let i = 0; i < firstWeekday; i++) {
                            cells.push('<div class="day-cell empty"></div>');
                        }

                        for (let day = 1; day <= daysInMonth; day++) {
                            const rows = (eventMap[day] || []).slice(0, 3);
                            const moreCount = (eventMap[day] || []).length - rows.length;
                            const itemsHtml = rows.map((row) => `<div class="day-item">${escapeHtml(row.platform)} - ${escapeHtml((row.campaign_name || 'General').slice(0, 22))}</div>`).join('');
                            const moreHtml = moreCount > 0 ? `<div class="day-item">+${moreCount} more</div>` : '';
                            cells.push(`<div class="day-cell"><div class="day-num">${day}</div>${itemsHtml}${moreHtml}</div>`);
                        }

                        $('calendar-grid').innerHTML = cells.join('');
                    }

                    function updateComposerCounters() {
                        const content = $('composer-content').value || '';
                        const hashtagRaw = $('composer-hashtags').value || '';
                        const hashtags = hashtagRaw
                            .split(',')
                            .map((h) => h.trim().replace(/^#/, ''))
                            .filter(Boolean);

                        const fullText = hashtags.length ? `${content} \n\n${hashtags.map((h) => '#' + h).join(' ')} ` : content;
                        const counters = [];

                        for (const platform of state.selectedPlatforms) {
                            const rules = state.platformRules[platform] || { maxChars: 500, maxHashtags: 10 };
                            const count = fullText.length;
                            const over = count > Number(rules.maxChars || 500) || hashtags.length > Number(rules.maxHashtags || 10);
                            counters.push(`<div class="counter ${over ? 'over' : ''}"><span>${escapeHtml(platform)}</span><span>${count}/${rules.maxChars || 500} chars, ${hashtags.length}/${rules.maxHashtags || 10} hashtags</span></div>`);
                        }

                        $('composer-counters').innerHTML = counters.length
                            ? counters.join('')
                            : '<div class="counter over"><span>Select at least one platform</span><span>-</span></div>';
                    }

                    function statusTag(status) {
                        const cls = status === 'published'
                            ? 'ok'
                            : status === 'failed'
                                ? 'fail'
                                : 'warn';
                        return `<span class="tag ${cls}">${escapeHtml(status || 'unknown')}</span>`;
                    }

                    function switchView(view) {
                        state.currentView = view;
                        document.querySelectorAll('.nav-btn').forEach((btn) => {
                            btn.classList.toggle('active', btn.dataset.view === view);
                        });
                        document.querySelectorAll('.view').forEach((el) => {
                            el.classList.toggle('active', el.id === 'view-' + view);
                        });
                        updatePageContext(view);
                        logActivity('Navigate', PAGE_CONTEXTS[view]?.name || view);
                    }

                    function loadViewData(view) {
                        if (!view) return;
                        if (view === 'ecosystem') {
                            refreshEcosystem();
                        }
                        if (view === 'social-feed') {
                            if (typeof switchSfViewMode === 'function') {
                                if (sfViewMode === 'kits') loadPostKits();
                                else loadSocialFeed();
                            } else {
                                loadSocialFeed();
                            }
                        }
                        if (window.__adminPanels?.[view]) {
                            window.__adminPanels[view]();
                        }
                    }

                    function navigateToView(view) {
                        switchView(view);
                        loadViewData(view);
                    }
                    // Expose to global scope so inline onclick attributes can reach it
                    window.navigateToView = navigateToView;

                    // ── Page context map ────────────────────────────────────────────
                    const PAGE_CONTEXTS = {
                        overview: { name: 'Overview', title: 'Overview', sub: 'Global stats, platform connections, and quick-start guide for your content pipeline.' },
                        connections: { name: 'Platform Connect', title: 'Platform Connect', sub: 'Manage OAuth tokens, social handles, and per-brand platform authentication.' },
                        planner: { name: 'Campaign Planner', title: 'Campaign Planner', sub: 'Schedule yearly campaigns, set objectives, and view your content calendar.' },
                        composer: { name: 'Post Composer', title: 'Post Composer', sub: 'Draft and schedule posts across all platforms with per-channel character limits.' },
                        'social-feed': { name: 'Social Gallery', title: 'Social Post Gallery', sub: 'All scheduled, published, and draft posts organized by platform across your brand ecosystem.' },
                        library: { name: 'Asset Library', title: 'Asset Library', sub: 'Upload, tag, and manage media assets stored in Cloudflare R2.' },
                        drip: { name: 'Drip Builder', title: 'Drip Builder', sub: 'Build time-delayed drip sequences for automated multi-touch campaigns.' },
                        'review-queue': { name: 'Review Queue', title: 'Review Queue', sub: 'Approve, reject, or edit scraped content before it enters the publishing pipeline.' },
                        overrides: { name: 'Site Overrides', title: 'Site Overrides', sub: 'Manage per-domain redirect rules and link override records.' },
                        galleries: { name: 'Gallery Manager', title: 'Gallery Manager', sub: 'Curate and publish image galleries to your ecosystem sites.' },
                        'content-studio': { name: 'Story Studio', title: 'Story & Culture Post Studio', sub: 'Manage CultureSherpa culture-post registries, prompt scenes, and scheduled story assets across brands.' },
                        ecosystem: { name: 'Ecosystem Health', title: 'Ecosystem Health', sub: 'Monitor CI/CD status, uptime, and cross-brand site health across all properties.' },
                        'blog-manager': { name: 'Blog Manager', title: 'Blog Manager', sub: 'Create and publish blog posts with live markdown preview and full CMS control.' },
                        storage: { name: 'Storage Intel', title: 'Storage Intelligence', sub: 'Analyze local disk usage, identify hot spots, and track cleanup actions.' },
                        donations: { name: 'Donations', title: 'Donations', sub: 'View Stripe donation transactions and configure webhook delivery to D1.' },
                        analytics: { name: 'Analytics', title: 'Publishing Analytics', sub: 'Platform performance breakdown, variant delivery stats, and campaign metrics.' },
                        community: { name: 'Community', title: 'Community Members', sub: 'Browse, search, and review registered community members and their activity.' },
                        notifications: { name: 'Queue Health', title: 'Queue Health', sub: 'Monitor the social publishing queue, retry failed variants, and trigger manual runs.' },
                        characters: { name: 'Characters', title: 'Character Registry', sub: 'Animation character roster, pose inventory, and pipeline status.' },
                        'daily-cultures': { name: 'Daily Calendar', title: 'Daily Culture Calendar', sub: 'Two featured cultures every day — morning & evening rotations for CultureSherpa.' },
                        'nft-studio': { name: 'NFT Studio', title: 'NFT Studio', sub: 'Manage NFT collections, token registry, rarity tiers, IPFS metadata, and on-chain mint records.' },
                        'brands': { name: 'Brands', title: 'Brand Registry', sub: 'Overview of all brands in the ecosystem \u2014 social accounts, workflow counts, and external links.' },
                        'projects': { name: 'Projects', title: 'Projects', sub: 'All ecosystem repositories \u2014 CI status, last commit, open PRs, and branch protection.' },
                        'deployments': { name: 'Deployments', title: 'Deployments', sub: 'Recent deployments across all ecosystem repos \u2014 workflow runs, success rates, and timing.' },
                        'settings': { name: 'Settings', title: 'Settings & Integrations', sub: 'Integration health, environment variable status, and configuration overview.' },
                        'docs': { name: 'Documentation', title: 'Documentation Hub', sub: 'Central index of all project documentation, SOPs, and architecture records.' },
                        'studio-hq': { name: 'Studio HQ', title: 'Studio Management Platform', sub: 'Priority signals, build pipeline, self-advisor insights, and ecosystem architecture — all zero compute cost.' },
                        'automation': { name: 'Automation', title: 'Automation Center', sub: 'Publishing queue snapshot, health sweep history, and one-click retry for failed post variants.' },
                        'ai-utils': { name: 'AI Utils', title: 'AI Utilities', sub: 'Generate platform-optimised captions for any library asset via Cloudflare Workers AI (Llama 3 8B · free tier · $0).' },
                        'music-library': { name: 'Music Library', title: 'GFV Music Library', sub: 'SummitView music catalog — browse artists, albums, and tracks. Open the per-album prompt studio or pre-fill the Post Composer.' },
                    };

                    function updatePageContext(view) {
                        const ctx = PAGE_CONTEXTS[view];
                        if (!ctx) return;
                        const heading = $('topbar-heading');
                        const subheading = $('topbar-subheading');
                        const section = $('topbar-section-name');
                        if (heading) heading.textContent = ctx.title;
                        if (subheading) subheading.textContent = ctx.sub;
                        if (section) section.textContent = ctx.name;
                    }

                    function openModal(id) {
                        $(id).classList.add('active');
                    }

                    function closeModal(id) {
                        $(id).classList.remove('active');
                    }

                    function showConfirm(msg, onConfirm) {
                        $('confirm-msg').textContent = msg;
                        $('confirm-ok-btn').onclick = () => { closeModal('confirm-modal'); onConfirm(); };
                        openModal('confirm-modal');
                    }

                    function editCampaign(campaign) {
                        $('campaign-modal-title').textContent = 'Edit Campaign';
                        $('campaign-id').value = campaign.id;
                        $('campaign-name').value = campaign.name || '';
                        $('campaign-cadence').value = campaign.cadence || 'weekly';
                        $('campaign-start').value = (campaign.start_date || '').slice(0, 10);
                        $('campaign-end').value = (campaign.end_date || '').slice(0, 10);
                        $('campaign-objective').value = campaign.objective || '';
                        openModal('campaign-modal');
                    }

                    async function deleteCampaign(id) {
                        showConfirm('Archive this campaign? Posts remain but the campaign will be hidden.', async () => {
                            try {
                                await api('/campaigns?id=' + encodeURIComponent(id), { method: 'DELETE' });
                                toast('Campaign archived', 'success');
                                await loadCampaigns();
                                renderCampaigns();
                                renderCampaignSelect();
                            } catch (err) {
                                toast(err.message, 'error');
                            }
                        });
                    }

                    async function saveCampaign() {
                        try {
                            const existingId = $('campaign-id').value;
                            const payload = {
                                brand: currentBrand,
                                name: $('campaign-name').value.trim(),
                                cadence: $('campaign-cadence').value,
                                start_date: $('campaign-start').value || null,
                                end_date: $('campaign-end').value || null,
                                objective: $('campaign-objective').value.trim(),
                                status: 'planned',
                                platforms: [...state.selectedPlatforms],
                            };

                            if (!payload.name) {
                                throw new Error('Campaign name is required');
                            }

                            if (existingId) {
                                await api('/campaigns', { method: 'PUT', body: { ...payload, id: Number(existingId) } });
                            } else {
                                await api('/campaigns', { method: 'POST', body: payload });
                            }
                            closeModal('campaign-modal');
                            $('campaign-id').value = '';
                            $('campaign-modal-title').textContent = 'New Campaign';
                            $('campaign-name').value = '';
                            $('campaign-objective').value = '';
                            toast(existingId ? 'Campaign updated' : 'Campaign created', 'success');
                            await refreshAll();
                        } catch (err) {
                            toast(err.message, 'error');
                        }
                    }

                    async function saveConnection() {
                        try {
                            const expiresLocal = $('conn-expires-at').value;
                            const payload = {
                                brand: currentBrand,
                                platform: $('conn-platform').value,
                                account_label: $('conn-label').value.trim(),
                                account_id: $('conn-account-id').value.trim(),
                                payload: {
                                    access_token: $('conn-access-token').value.trim(),
                                    refresh_token: $('conn-refresh-token').value.trim(),
                                    expires_at: expiresLocal ? new Date(expiresLocal).toISOString() : '',
                                },
                            };

                            if (!payload.account_id || !payload.payload.access_token) {
                                throw new Error('Account ID and access token are required');
                            }

                            await api('/connections', { method: 'POST', body: payload });
                            closeModal('connection-modal');
                            $('conn-label').value = '';
                            $('conn-account-id').value = '';
                            $('conn-access-token').value = '';
                            $('conn-refresh-token').value = '';
                            $('conn-expires-at').value = '';
                            toast('Platform connection saved', 'success');
                            await refreshAll();
                        } catch (err) {
                            toast(err.message, 'error');
                        }
                    }

                    async function disconnectConnection(id) {
                        showConfirm('Deactivate this connection profile?', async () => {
                            try {
                                await api('/connections?id=' + encodeURIComponent(id), { method: 'DELETE' });
                                toast('Connection deactivated', 'success');
                                await refreshAll();
                            } catch (err) {
                                toast(err.message, 'error');
                            }
                        });
                    }

                    async function saveHandle() {
                        const brand = $('handle-brand').value;
                        const platform = $('handle-platform').value;
                        const handle = $('handle-username').value.trim();
                        if (!brand || !platform || !handle) {
                            toast('Brand, platform, and handle are required', 'error');
                            return;
                        }
                        try {
                            await api('/social-accounts', {
                                method: 'POST',
                                body: {
                                    brand,
                                    platform,
                                    handle,
                                    display_name: $('handle-display-name').value.trim(),
                                    profile_url: $('handle-profile-url').value.trim(),
                                    followers_count: parseInt($('handle-followers').value, 10) || 0,
                                    bio: $('handle-bio').value.trim(),
                                },
                            });
                            toast('Handle registered', 'success');
                            closeModal('handle-modal');
                            await loadSocialAccounts();
                            renderEcosystemMatrix();
                            renderHandlesTable();
                        } catch (err) {
                            toast(err.message, 'error');
                        }
                    }

                    async function deleteHandle(id) {
                        showConfirm('Delete this handle record?', async () => {
                            try {
                                await api('/social-accounts?id=' + encodeURIComponent(id), { method: 'DELETE' });
                                toast('Handle removed', 'success');
                                await loadSocialAccounts();
                                renderEcosystemMatrix();
                                renderHandlesTable();
                            } catch (err) {
                                toast(err.message, 'error');
                            }
                        });
                    }

                    async function saveWorkflow() {
                        const brand = $('workflow-brand').value;
                        if (!brand) { toast('Select a brand', 'error'); return; }
                        try {
                            await api('/brand-workflows', {
                                method: 'PUT',
                                body: {
                                    brand,
                                    default_cadence: $('workflow-cadence').value,
                                    require_approval: $('workflow-require-approval').checked ? 1 : 0,
                                    post_time_utc: $('workflow-post-time').value || '14:00',
                                    notes: $('workflow-notes').value.trim(),
                                },
                            });
                            toast('Workflow saved', 'success');
                            closeModal('workflow-modal');
                            await loadBrandWorkflows();
                        } catch (err) {
                            toast(err.message, 'error');
                        }
                    }

                    async function schedulePostSet() {
                        try {
                            const platforms = [...state.selectedPlatforms];
                            if (!platforms.length) throw new Error('Select at least one platform');
                            if (!state.selectedAssetId) throw new Error('Select one media asset');

                            const content = $('composer-content').value.trim();
                            if (!content) throw new Error('Caption is required');

                            const scheduledLocal = $('composer-schedule').value;
                            if (!scheduledLocal) throw new Error('Schedule time is required');

                            const hashtags = $('composer-hashtags').value
                                .split(',')
                                .map((h) => h.trim())
                                .filter(Boolean);

                            const payload = {
                                brand: currentBrand,
                                campaign_id: $('composer-campaign').value ? Number($('composer-campaign').value) : null,
                                content,
                                platforms,
                                media_asset_id: state.selectedAssetId,
                                hashtags,
                                scheduled_at: toIsoFromLocal(scheduledLocal),
                                watermark_enabled: $('composer-watermark').checked,
                                watermark_profile: $('composer-watermark').checked ? 'default' : '',
                            };

                            const result = await api('/social/campaign', { method: 'POST', body: payload });
                            const postId = result?.post_id || result?.id;
                            if (postId && state.crossPostBrands.size > 0) {
                                for (const targetBrand of state.crossPostBrands) {
                                    try {
                                        await api('/cross-posts', { method: 'POST', body: { source_post_id: postId, target_brand: targetBrand } });
                                    } catch (e) {
                                        console.warn('[cross-post] failed for', targetBrand, e);
                                    }
                                }
                                toast(`Scheduled + queued for ${state.crossPostBrands.size} brand(s)`, 'success');
                            } else {
                                toast('Post set scheduled', 'success');
                            }
                            state.crossPostBrands.clear();
                            $('composer-content').value = '';
                            $('composer-hashtags').value = '';
                            updateComposerCounters();
                            await refreshAll();
                        } catch (err) {
                            toast(err.message, 'error');
                        }
                    }

                    async function runQueueNow() {
                        try {
                            const result = await api('/social/run-now', { method: 'POST' });
                            const published = result?.result?.published ?? 0;
                            const failed = result?.result?.failed ?? 0;
                            toast(`Queue run complete: ${published} published, ${failed} failed`, 'success');
                            await loadVariants();
                            renderOverview();
                        } catch (err) {
                            toast(err.message, 'error');
                        }
                    }

                    // ════════════════════════════════════════════════════════════════
                    // ASSET MANAGEMENT
                    // ════════════════════════════════════════════════════════════════

                    async function openAssetEditModal(asset) {
                        $('asset-edit-id').value = asset.id;
                        $('asset-edit-title').value = asset.title || '';
                        $('asset-edit-category').value = asset.category || 'uploads';
                        $('asset-edit-media-type').value = asset.media_type || 'image';
                        $('asset-edit-featured').checked = Boolean(Number(asset.featured));
                        $('asset-edit-description').value = asset.description || '';

                        let tags = [];
                        try { tags = JSON.parse(asset.tags || '[]'); } catch { tags = []; }
                        $('asset-edit-tags').value = tags.join(', ');

                        // Fetch brands that already have a copy of this asset
                        const sharedBrands = new Set();
                        try {
                            const sharesData = await api('/assets/' + encodeURIComponent(asset.id) + '/shares');
                            if (sharesData?.brands) sharesData.brands.forEach(b => sharedBrands.add(b));
                        } catch { /* graceful degradation if endpoint unavailable */ }

                        // Initialize cross-brand share chips
                        const homeBrand = asset.brand || currentBrand;
                        document.querySelectorAll('#asset-edit-brand-share [data-share-brand]').forEach((chip) => {
                            const chipBrand = chip.dataset.shareBrand;
                            if (chipBrand === homeBrand) {
                                chip.classList.add('active');
                                chip.title = 'Home brand';
                                chip.disabled = true;
                            } else if (sharedBrands.has(chipBrand)) {
                                chip.classList.add('active');
                                chip.title = 'Already shared to ' + chipBrand;
                                chip.disabled = true;
                            } else {
                                chip.classList.remove('active');
                                chip.disabled = false;
                                chip.title = 'Share to ' + chipBrand;
                                chip.onclick = () => { chip.classList.toggle('active'); };
                            }
                        });

                        // Show approve/reject button in modal footer
                        const reviewPanel = $('asset-edit-review-actions');
                        const rs = asset.review_status || 'draft';
                        if (rs !== 'approved') {
                            reviewPanel.innerHTML = `<button class="btn btn-success-soft" id="asset-edit-approve-btn">&#10003; Approve for public use</button>`;
                            $('asset-edit-approve-btn').onclick = () => { reviewAsset(asset.id, 'approve'); closeModal('asset-edit-modal'); };
                        } else {
                            reviewPanel.innerHTML = `<button class="btn btn-secondary" id="asset-edit-reject-btn">&times; Revoke approval</button>`;
                            $('asset-edit-reject-btn').onclick = () => { reviewAsset(asset.id, 'reject'); closeModal('asset-edit-modal'); };
                        }

                        openModal('asset-edit-modal');
                    }

                    async function saveAssetEdit() {
                        const id = $('asset-edit-id').value;
                        if (!id) return;

                        const rawTags = $('asset-edit-tags').value;
                        const tags = rawTags
                            .split(',')
                            .map((t) => t.trim())
                            .filter(Boolean);

                        try {
                            await api('/assets', {
                                method: 'PUT',
                                body: {
                                    id,
                                    title: $('asset-edit-title').value.trim(),
                                    category: $('asset-edit-category').value,
                                    media_type: $('asset-edit-media-type').value,
                                    featured: $('asset-edit-featured').checked,
                                    description: $('asset-edit-description').value.trim(),
                                    tags,
                                },
                            });

                            // Share to any newly-toggled brands (non-disabled active chips)
                            const sharePromises = [];
                            document.querySelectorAll('#asset-edit-brand-share [data-share-brand]:not([disabled])').forEach((chip) => {
                                if (chip.classList.contains('active')) {
                                    sharePromises.push(
                                        api('/assets/' + encodeURIComponent(id) + '/share', {
                                            method: 'POST',
                                            body: { target_brand: chip.dataset.shareBrand },
                                        }).catch(() => { /* share already exists is fine */ })
                                    );
                                }
                            });
                            if (sharePromises.length) await Promise.all(sharePromises);

                            toast('Asset updated', 'success');
                            closeModal('asset-edit-modal');
                            await loadAssets();
                            renderLibrary();
                            renderComposerAssets();
                        } catch (err) {
                            toast(err.message, 'error');
                        }
                    }

                    async function batchApproveSelected() {
                        const ids = [...state.selectedLibraryIds];
                        if (!ids.length) return;
                        showConfirm(`Approve ${ids.length} selected asset${ids.length === 1 ? '' : 's'} for public use ? `, async () => {
                            try {
                                // Run approvals in parallel — max 6 in-flight at once to avoid rate limits
                                const batch = 6;
                                for (let i = 0; i < ids.length; i += batch) {
                                    await Promise.all(
                                        ids.slice(i, i + batch).map((id) =>
                                            api('/assets/' + encodeURIComponent(id) + '/approve', { method: 'POST' })
                                                .then(() => {
                                                    const asset = state.assets.find((a) => String(a.id) === String(id));
                                                    if (asset) asset.review_status = 'approved';
                                                })
                                                .catch(() => { /* individual failures don't abort the batch */ })
                                        )
                                    );
                                }
                                state.selectedLibraryIds.clear();
                                renderLibrary();
                                toast(`${ids.length} asset${ids.length === 1 ? '' : 's'} approved`, 'success');
                            } catch (err) {
                                toast(err.message || 'Batch approve failed', 'error');
                            }
                        });
                    }

                    async function reviewAsset(id, action) {
                        try {
                            const result = await api('/assets/' + encodeURIComponent(id) + '/' + action, { method: 'POST' });
                            const label = action === 'approve' ? 'approved for public use' : 'approval revoked';
                            // Update local state so UI refreshes without a full reload
                            const asset = state.assets.find((a) => String(a.id) === String(id));
                            if (asset) asset.review_status = result.review_status || (action === 'approve' ? 'approved' : 'rejected');
                            renderLibrary();
                            toast('Asset ' + label, 'success');
                        } catch (err) {
                            toast(err.message, 'error');
                        }
                    }

                    async function deleteAsset(id) {
                        showConfirm('Permanently delete this asset? This cannot be undone.', async () => {
                            try {
                                await api('/assets?id=' + encodeURIComponent(id), { method: 'DELETE' });
                                toast('Asset deleted', 'success');
                                if ($('asset-edit-id').value === String(id)) closeModal('asset-edit-modal');
                                await loadAssets();
                                renderLibrary();
                                renderComposerAssets();
                                if (state.selectedAssetId === String(id)) state.selectedAssetId = '';
                            } catch (err) {
                                toast(err.message, 'error');
                            }
                        });
                    }


                    // ════════════════════════════════════════════════════════════════
                    // BRAND SWITCHER
                    // ════════════════════════════════════════════════════════════════

                    function renderBrandSwitcher() {
                        const sw = $('brand-switcher');
                        if (!sw) return;
                        sw.innerHTML = Object.entries(BRAND_DEFS).map(([id, def]) => `
                            <button type="button" class="brand-pill ${id === currentBrand ? 'active' : ''}" data-brand="${escapeHtml(id)}" style="--pill-color:${escapeHtml(def.color)}">${escapeHtml(def.shortName)}</button>
                        `).join('');
                        sw.querySelectorAll('[data-brand]').forEach((btn) => {
                            btn.addEventListener('click', () => switchBrand(btn.dataset.brand));
                        });
                    }

                    function switchBrand(id) {
                        if (!BRAND_DEFS[id]) return;
                        currentBrand = id;
                        const def = BRAND_DEFS[id];
                        const pill = $('active-brand-pill');
                        if (pill) pill.textContent = def.shortName;
                        renderBrandSwitcher();
                        state.selectedPlatforms = new Set(def.platforms || ['x']);
                        state.dripSelectedPlatforms = new Set(def.platforms || ['x']);
                        // Auto-populate composer hashtags with brand defaults
                        const hashtagInput = $('composer-hashtags');
                        if (hashtagInput && def.hashtags && def.hashtags.length) {
                            hashtagInput.value = def.hashtags.join(', ');
                            hashtagInput.dispatchEvent(new Event('input'));
                        }
                        renderPlatformPicker();
                        renderDripPlatformPicker();
                        return refreshAll();
                    }

                    async function openBrandStudio(id) {
                        if (!BRAND_DEFS[id]) return;
                        await switchBrand(id);
                        switchView('content-studio');
                        const brandFilter = $('cs-brand-filter');
                        const typeFilter = $('cs-type-filter');
                        if (brandFilter) brandFilter.value = id;
                        if (typeFilter) typeFilter.value = '';
                        await loadContentStudioRegistries();
                        toast(BRAND_DEFS[id].name + ' story studio ready.', 'info');
                    }

                    async function openBrandGallery(id) {
                        if (!BRAND_DEFS[id]) return;
                        await switchBrand(id);
                        switchView('social-feed');
                        sfPlatformFilter = 'all';
                        sfStatusFilter = '';
                        sfBrandFilter = id;
                        const brandFilter = $('sf-brand-filter');
                        if (brandFilter) brandFilter.value = id;
                        const statusFilter = $('sf-status-filter');
                        if (statusFilter) statusFilter.value = '';
                        document.querySelectorAll('.sf-tab').forEach((tab) => {
                            const active = (tab.dataset.platform || '') === 'all';
                            tab.classList.toggle('active', active);
                            tab.setAttribute('aria-selected', active ? 'true' : 'false');
                        });
                        // Open directly to Post Kits view — shows artwork + copy-ready captions
                        switchSfViewMode('kits');
                        toast(BRAND_DEFS[id].name + ' post kits ready.', 'info');
                    }

                    async function openDailyCultureCalendar() {
                        await switchBrand('culturesherpa');
                        navigateToView('daily-cultures');
                        toast('CultureSherpa daily calendar ready.', 'info');
                    }

                    // ════════════════════════════════════════════════════════════════
                    // DRIP BUILDER
                    // ════════════════════════════════════════════════════════════════

                    function initDripBuilder() {
                        const startInput = $('drip-start-date');
                        if (startInput && !startInput.value) {
                            startInput.value = new Date().toISOString().slice(0, 10);
                        }
                        renderDripPlatformPicker();
                        renderDripTimes();
                        renderDripCampaignSelect();
                        renderDripEntries();
                        updateDripSummary();
                    }

                    function renderDripPlatformPicker() {
                        const picker = $('drip-platform-picker');
                        if (!picker) return;
                        const def = BRAND_DEFS[currentBrand] || {};
                        const brandPlatforms = def.platforms || ALL_PLATFORMS;
                        // Sync state with current brand defaults on first render
                        if (state.dripSelectedPlatforms.size === 0) {
                            state.dripSelectedPlatforms = new Set(brandPlatforms);
                        }
                        picker.innerHTML = brandPlatforms.map((p) => `
                        <button type="button" class="platform-pill ${state.dripSelectedPlatforms.has(p) ? 'active' : ''}" data-drip-platform="${escapeHtml(p)}">${escapeHtml(p)}</button>
                        `).join('');
                        picker.querySelectorAll('[data-drip-platform]').forEach((btn) => {
                            btn.addEventListener('click', () => {
                                const p = btn.dataset.dripPlatform;
                                if (state.dripSelectedPlatforms.has(p)) {
                                    state.dripSelectedPlatforms.delete(p);
                                } else {
                                    state.dripSelectedPlatforms.add(p);
                                }
                                renderDripPlatformPicker();
                                updateDripSummary();
                            });
                        });
                    }

                    function renderDripTimes() {
                        const row = $('drip-times-row');
                        if (!row) return;
                        row.innerHTML = state.dripTimes.map((t, i) => `
                        <span class="drip-time-chip"><input type="time" value="${escapeHtml(t)}" data-time-idx="${i}"><button type="button" class="remove-time-btn" data-time-idx="${i}" title="Remove">×</button></span>
                        `).join('') + '<button type="button" class="btn btn-micro" id="drip-add-time">+ Time</button>';
                        row.querySelectorAll('input[data-time-idx]').forEach((el) => {
                            el.addEventListener('change', () => {
                                state.dripTimes[Number(el.dataset.timeIdx)] = el.value;
                                updateDripSummary();
                            });
                        });
                        row.querySelectorAll('button[data-time-idx]').forEach((el) => {
                            el.addEventListener('click', () => {
                                state.dripTimes.splice(Number(el.dataset.timeIdx), 1);
                                renderDripTimes();
                                updateDripSummary();
                            });
                        });
                        const addBtn = $('drip-add-time');
                        if (addBtn) {
                            addBtn.addEventListener('click', () => {
                                state.dripTimes.push('12:00');
                                renderDripTimes();
                                updateDripSummary();
                            });
                        }
                    }

                    function renderDripCampaignSelect() {
                        const sel = $('drip-campaign');
                        if (!sel) return;
                        const campaigns = Array.isArray(state.campaigns) ? state.campaigns
                            : (state.campaigns?.campaigns || []);
                        const prev = sel.value;
                        sel.innerHTML = '<option value="">No campaign</option>' + campaigns.map((c) =>
                            `<option value="${Number(c.id)}" ${String(c.id) === prev ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
                        ).join('');
                    }

                    function renderDripEntries() {
                        const list = $('drip-entries-list');
                        if (!list) return;
                        const count = $('drip-entry-count');
                        if (count) count.textContent = state.dripEntries.length;
                        const statEntries = $('drip-stat-entries');
                        if (statEntries) statEntries.textContent = state.dripEntries.length;
                        if (state.dripEntries.length === 0) {
                            list.innerHTML = '<div class="drip-empty">No content entries yet. Click <strong>+ Add Entry</strong> to start, or <strong>Import JSON</strong> to bulk-load a content set.</div>';
                            return;
                        }
                        list.innerHTML = state.dripEntries.map((entry, i) => `<div class="drip-entry" data-entry-idx="${i}"><div class="drip-entry-num">${i + 1}</div><div class="drip-entry-fields"><textarea class="drip-entry-content" data-entry-content="${i}" rows="2" placeholder="Post content..."></textarea><input type="text" class="drip-entry-hashtags" data-entry-hashtags="${i}" placeholder="#hashtags, comma separated" value=""></div><button type="button" class="btn btn-micro btn-danger" data-remove-entry="${i}" title="Remove">✕</button></div>`).join('');
                        // Set values directly after render to avoid HTML entity double-encoding
                        list.querySelectorAll('[data-entry-content]').forEach((el) => {
                            el.value = state.dripEntries[Number(el.dataset.entryContent)].content || '';
                            el.addEventListener('input', () => {
                                state.dripEntries[Number(el.dataset.entryContent)].content = el.value;
                            });
                        });
                        list.querySelectorAll('[data-entry-hashtags]').forEach((el) => {
                            el.value = (state.dripEntries[Number(el.dataset.entryHashtags)].hashtags || []).join(', ');
                            el.addEventListener('change', () => {
                                state.dripEntries[Number(el.dataset.entryHashtags)].hashtags =
                                    el.value.split(',').map((h) => h.trim().replace(/^#/, '')).filter(Boolean);
                            });
                        });
                        list.querySelectorAll('[data-remove-entry]').forEach((btn) => {
                            btn.addEventListener('click', () => {
                                state.dripEntries.splice(Number(btn.dataset.removeEntry), 1);
                                renderDripEntries();
                                updateDripSummary();
                            });
                        });
                    }

                    function addDripEntry(content = '', hashtags = [], assetId = '') {
                        state.dripEntries.push({ content, hashtags, asset_id: assetId });
                        renderDripEntries();
                        updateDripSummary();
                    }

                    function updateDripSummary() {
                        const ppd = state.dripPostsPerDay || 2;
                        const platformCount = state.dripSelectedPlatforms.size;
                        const entryCount = state.dripEntries.length;
                        const validEntries = state.dripEntries.filter((e) => e.content?.trim()).length;
                        const days = validEntries > 0 ? Math.ceil(validEntries / ppd) : 0;
                        const totalVariants = validEntries * platformCount;

                        const $days = $('drip-stat-days');
                        const $platforms = $('drip-stat-platforms');
                        const $variants = $('drip-stat-variants');
                        const $window = $('drip-stat-window');
                        const $statEntries = $('drip-stat-entries');

                        if ($statEntries) $statEntries.textContent = entryCount;
                        if ($days) $days.textContent = days > 0 ? days + ' days' : '—';
                        if ($platforms) $platforms.textContent = platformCount > 0
                            ? [...state.dripSelectedPlatforms].join(', ') : '—';
                        if ($variants) $variants.textContent = totalVariants > 0
                            ? totalVariants.toLocaleString() : '—';

                        if ($window) {
                            if (validEntries > 0) {
                                const startDateVal = $('drip-start-date')?.value;
                                if (startDateVal) {
                                    const start = new Date(startDateVal + 'T00:00:00');
                                    const end = new Date(start.getTime() + (days - 1) * 86400000);
                                    $window.textContent = start.toLocaleDateString() + ' \u2192 ' + end.toLocaleDateString();
                                } else {
                                    $window.textContent = days + ' days from chosen start';
                                }
                            } else {
                                $window.textContent = '—';
                            }
                        }

                        const countBadge = $('drip-entry-count');
                        if (countBadge) countBadge.textContent = entryCount;
                    }

                    function generateDripPreview() {
                        const ppd = state.dripPostsPerDay || 2;
                        const times = [...state.dripTimes].sort();
                        const platforms = [...state.dripSelectedPlatforms];
                        const startDateVal = $('drip-start-date')?.value;
                        const entries = state.dripEntries.filter((e) => e.content?.trim());

                        if (entries.length === 0) { toast('Add at least one content entry before previewing.', 'error'); return; }
                        if (platforms.length === 0) { toast('Select at least one platform.', 'error'); return; }
                        if (!startDateVal) { toast('Choose a start date.', 'error'); return; }
                        if (times.length === 0) { toast('Add at least one post time.', 'error'); return; }

                        const slots = [];
                        const start = new Date(startDateVal + 'T00:00:00');

                        for (let i = 0; i < entries.length; i++) {
                            const dayOffset = Math.floor(i / ppd);
                            const timeIdx = i % ppd;
                            const time = times[timeIdx] || times[times.length - 1];
                            const [hh, mm] = time.split(':').map(Number);
                            const slotDate = new Date(start.getTime() + dayOffset * 86400000);
                            slotDate.setUTCHours(hh, mm, 0, 0);
                            slots.push({
                                idx: i + 1,
                                scheduled_at: slotDate.toISOString(),
                                platforms: platforms.join(', '),
                                content: entries[i].content,
                            });
                        }

                        const panel = $('drip-preview-panel');
                        const table = $('drip-preview-table');
                        const previewCount = $('drip-preview-count');
                        const displaySlots = slots.slice(0, 50);

                        table.innerHTML = displaySlots.map((s) => `<tr><td>${escapeHtml(String(s.idx))}</td><td>${escapeHtml(formatDateTime(s.scheduled_at))}</td><td>${escapeHtml(s.platforms)}</td><td class="content-preview-cell">${escapeHtml(s.content.slice(0, 100))}${s.content.length > 100 ? '…' : ''}</td></tr>`).join('');

                        if (previewCount) previewCount.textContent = `${slots.length} slots · showing first ${displaySlots.length} `;
                        if (panel) panel.classList.remove('d-none');

                        const confirmBtn = $('drip-confirm-btn');
                        if (confirmBtn) confirmBtn.classList.remove('d-none');

                        updateDripSummary();
                        toast(`Preview: ${slots.length} posts × ${platforms.length} platforms = ${(slots.length * platforms.length).toLocaleString()} variants`, 'success');
                    }

                    async function confirmDripSchedule() {
                        const ppd = state.dripPostsPerDay || 2;
                        const times = [...state.dripTimes].sort();
                        const platforms = [...state.dripSelectedPlatforms];
                        const startDateVal = $('drip-start-date')?.value;
                        const campaignId = $('drip-campaign')?.value ? Number($('drip-campaign').value) : null;
                        const entries = state.dripEntries.filter((e) => e.content?.trim());

                        if (entries.length === 0) { toast('No content entries to schedule.', 'error'); return; }
                        if (platforms.length === 0) { toast('Select at least one platform.', 'error'); return; }
                        if (!startDateVal) { toast('Choose a start date.', 'error'); return; }

                        const confirmBtn = $('drip-confirm-btn');
                        try {
                            if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Scheduling…'; }

                            const payload = {
                                brand: currentBrand,
                                campaign_id: campaignId,
                                platforms,
                                start_date: startDateVal,
                                posts_per_day: ppd,
                                post_times_utc: times,
                                entries: entries.map((e) => ({
                                    content: e.content,
                                    hashtags: e.hashtags || [],
                                    asset_id: e.asset_id || '',
                                })),
                            };

                            const result = await api('/campaigns/bulk-schedule', { method: 'POST', body: payload });
                            toast(
                                `Drip scheduled! ${(result.created_variants || 0).toLocaleString()} variants across ${result.days_covered || 0} days.`,
                                'success'
                            );

                            state.dripEntries = [];
                            renderDripEntries();
                            updateDripSummary();
                            if ($('drip-preview-panel')) $('drip-preview-panel').classList.add('d-none');
                            if (confirmBtn) { confirmBtn.classList.add('d-none'); confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm & Schedule All'; }
                            await refreshAll();
                        } catch (err) {
                            toast('Bulk schedule failed: ' + err.message, 'error');
                            if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm & Schedule All'; }
                        }
                    }

                    function importDripJSON() {
                        const raw = $('drip-import-textarea')?.value?.trim();
                        if (!raw) { toast('Paste JSON content first.', 'error'); return; }

                        let parsed;
                        try {
                            parsed = JSON.parse(raw);
                        } catch {
                            toast('Invalid JSON — please paste a valid JSON array.', 'error');
                            return;
                        }

                        if (!Array.isArray(parsed)) { toast('JSON must be an array.', 'error'); return; }

                        let added = 0;
                        for (const item of parsed) {
                            if (typeof item === 'string') {
                                if (item.trim()) { addDripEntry(item.trim(), [], ''); added++; }
                            } else if (item && typeof item === 'object') {
                                const content = (item.content || item.text || item.caption || '').toString().trim();
                                if (content) {
                                    const hashtags = Array.isArray(item.hashtags) ? item.hashtags : [];
                                    addDripEntry(content, hashtags, item.asset_id || '');
                                    added++;
                                }
                            }
                        }

                        closeModal('drip-import-modal');
                        if ($('drip-import-textarea')) $('drip-import-textarea').value = '';
                        toast(`Imported ${added} entr${added === 1 ? 'y' : 'ies'}.`, 'success');
                        updateDripSummary();
                    }

                    // ── Gallery Manager ──────────────────────────────────────────────

                    async function loadGalleries() {
                        try {
                            const brand = $('gallery-filter-brand')?.value || '';
                            const qs = brand ? '?brand=' + encodeURIComponent(brand) : '';
                            const data = await api('/galleries' + qs);
                            state.galleries = data.galleries || [];
                        } catch {
                            state.galleries = [];
                        }
                    }

                    function renderGalleriesList() {
                        const tbody = $('galleries-table');
                        const empty = $('galleries-empty');
                        if (!tbody) return;
                        if (!state.galleries.length) {
                            tbody.innerHTML = '';
                            empty?.classList.remove('d-none');
                            return;
                        }
                        empty?.classList.add('d-none');
                        tbody.innerHTML = state.galleries.map((g) => `<tr class="${state.selectedGalleryId === g.id ? 'row-selected' : ''}" style="cursor:pointer" data-gallery-row="${g.id}"><td>${escapeHtml(g.title)}</td><td class="mono text-muted">${escapeHtml(g.site_domain)}</td><td>${g.item_count || 0}</td><td class="inline-actions"><button class="btn btn-micro btn-secondary" data-gallery-edit="${g.id}">Edit</button><button class="btn btn-micro btn-danger" data-gallery-delete="${g.id}">Delete</button></td></tr>`).join('');

                        tbody.querySelectorAll('[data-gallery-row]').forEach((row) => {
                            row.addEventListener('click', (ev) => {
                                if (ev.target.closest('button')) return;
                                selectGallery(Number(row.dataset.galleryRow));
                            });
                        });
                        tbody.querySelectorAll('[data-gallery-edit]').forEach((btn) => {
                            btn.addEventListener('click', (ev) => {
                                ev.stopPropagation();
                                const g = state.galleries.find((x) => String(x.id) === btn.dataset.galleryEdit);
                                if (g) openGalleryModal(g);
                            });
                        });
                        tbody.querySelectorAll('[data-gallery-delete]').forEach((btn) => {
                            btn.addEventListener('click', (ev) => {
                                ev.stopPropagation();
                                deleteGallery(btn.dataset.galleryDelete);
                            });
                        });
                    }

                    async function selectGallery(id) {
                        state.selectedGalleryId = id;
                        renderGalleriesList();
                        const g = state.galleries.find((x) => x.id === id);
                        $('gallery-items-title').textContent = g ? g.title + ' — Items' : 'Gallery Items';
                        $('gallery-items-actions').classList.remove('d-none');

                        // Populate asset picker
                        const sel = $('gallery-add-asset');
                        sel.innerHTML = '<option value="">\u2014 add asset \u2014</option>' +
                            state.assets.map((a) =>
                                `<option value="${escapeHtml(a.id)}">${escapeHtml(a.title || a.id)}</option>`
                            ).join('');

                        // Load items
                        try {
                            const data = await api('/galleries/' + id + '/items');
                            state.galleryItems = data.items || [];
                        } catch {
                            state.galleryItems = [];
                        }
                        renderGalleryItems();
                    }

                    function renderGalleryItems() {
                        const list = $('gallery-items-list');
                        if (!list) return;
                        if (!state.galleryItems.length) {
                            list.innerHTML = '<p class="text-muted">No items in this gallery yet. Use the asset picker above to add some.</p>';
                            return;
                        }
                        list.innerHTML = `
                        <div class="asset-grid asset-grid-full">
                            ${state.galleryItems.map((item) => `
                            <div class="asset-card">
                                ${item.thumbnail_path
                                ? `<img src="${assetUrl(item)}" data-r2="${escapeHtml(assetBase(item))}" alt="${escapeHtml(item.alt_text || item.title || '')}" loading="lazy" class="asset-thumb">`
                                : `<div class="asset-thumb-placeholder">${escapeHtml(item.media_type || 'file')}</div>`
                            }
                                <div class="asset-info">
                                    <span class="asset-name">${escapeHtml(item.title || item.asset_id)}</span>
                                    ${item.caption ? `<span class="text-muted">${escapeHtml(item.caption)}</span>` : ''}
                                </div>
                                <div class="asset-actions">
                                    <button class="btn btn-micro btn-danger" data-gallery-item-delete="${item.item_id}">Remove</button>
                                </div>
                            </div>
                        `).join('')
                            }
                    </div >
                        `;
                        list.querySelectorAll('[data-gallery-item-delete]').forEach((btn) => {
                            btn.addEventListener('click', () =>
                                removeGalleryItem(state.selectedGalleryId, btn.dataset.galleryItemDelete)
                            );
                        });
                    }

                    function openGalleryModal(gallery = null) {
                        $('gallery-modal-title').textContent = gallery ? 'Edit Gallery' : 'New Gallery';
                        $('gallery-id').value = gallery?.id || '';
                        $('gallery-brand').value = gallery?.brand || currentBrand;
                        $('gallery-domain').value = gallery?.site_domain || '';
                        $('gallery-slug').value = gallery?.gallery_slug || '';
                        $('gallery-title').value = gallery?.title || '';
                        $('gallery-description').value = gallery?.description || '';
                        $('gallery-sort').value = gallery?.sort_order ?? 100;

                        const sel = $('gallery-cover');
                        sel.innerHTML = '<option value="">\u2014 none \u2014</option>' +
                            state.assets.map((a) => {
                                const sel2 = gallery?.cover_asset_id === a.id ? ' selected' : '';
                                return `<option value="${escapeHtml(a.id)}"${sel2}>${escapeHtml(a.title || a.id)}</option>`;
                            }).join('');

                        openModal('gallery-modal');
                    }

                    async function saveGallery() {
                        const id = $('gallery-id').value;
                        const payload = {
                            brand: $('gallery-brand').value,
                            site_domain: $('gallery-domain').value.trim(),
                            gallery_slug: $('gallery-slug').value.trim(),
                            title: $('gallery-title').value.trim(),
                            description: $('gallery-description').value.trim(),
                            cover_asset_id: $('gallery-cover').value,
                            sort_order: Number($('gallery-sort').value) || 100,
                        };
                        if (!payload.site_domain || !payload.gallery_slug || !payload.title) {
                            toast('Domain, slug, and title are required.', 'error');
                            return;
                        }
                        try {
                            if (id) {
                                await api('/galleries/' + id, { method: 'PUT', body: payload });
                            } else {
                                await api('/galleries', { method: 'POST', body: payload });
                            }
                            closeModal('gallery-modal');
                            await loadGalleries();
                            renderGalleriesList();
                            toast('Gallery saved.', 'success');
                        } catch (err) {
                            toast('Failed to save: ' + err.message, 'error');
                        }
                    }

                    async function deleteGallery(id) {
                        showConfirm('Delete this gallery? Items will be unlinked but assets remain in the library.', async () => {
                            try {
                                await api('/galleries/' + id, { method: 'DELETE' });
                                if (state.selectedGalleryId === Number(id)) {
                                    state.selectedGalleryId = null;
                                    state.galleryItems = [];
                                    renderGalleryItems();
                                    $('gallery-items-title').textContent = 'Select a gallery to manage its items';
                                    $('gallery-items-actions').classList.add('d-none');
                                }
                                await loadGalleries();
                                renderGalleriesList();
                                toast('Gallery deleted.', 'success');
                            } catch (err) {
                                toast('Failed to delete: ' + err.message, 'error');
                            }
                        });
                    }

                    async function addGalleryItem(galleryId, assetId) {
                        try {
                            await api('/galleries/' + galleryId + '/items', { method: 'POST', body: { asset_id: assetId } });
                            $('gallery-add-asset').value = '';
                            await selectGallery(galleryId);
                            toast('Asset added to gallery.', 'success');
                        } catch (err) {
                            toast('Failed to add: ' + err.message, 'error');
                        }
                    }

                    async function removeGalleryItem(galleryId, itemId) {
                        showConfirm('Remove this item from the gallery?', async () => {
                            try {
                                await api('/galleries/' + galleryId + '/items/' + itemId, { method: 'DELETE' });
                                await selectGallery(galleryId);
                                toast('Item removed.', 'success');
                            } catch (err) {
                                toast('Failed to remove: ' + err.message, 'error');
                            }
                        });
                    }

                    // ── Content Studio ───────────────────────────────────────────────

                    async function loadContentStudioRegistries() {
                        const brand = $('cs-brand-filter')?.value || '';
                        const type = $('cs-type-filter')?.value || '';
                        const qs = new URLSearchParams();
                        if (brand) qs.set('brand', brand);
                        if (type) qs.set('type', type);
                        const suffix = qs.toString() ? '?' + qs.toString() : '';
                        try {
                            const data = await api('/content-studio/registries' + suffix);
                            state.csRegistries = data.registries || [];
                        } catch {
                            state.csRegistries = [];
                        }
                        renderCSRegistriesTable();
                    }

                    function renderCSRegistriesTable() {
                        const tbody = $('cs-registries-table');
                        const empty = $('cs-registries-empty');
                        if (!tbody) return;
                        if (!state.csRegistries.length) {
                            tbody.innerHTML = '';
                            empty?.classList.remove('d-none');
                            return;
                        }
                        empty?.classList.add('d-none');
                        tbody.innerHTML = state.csRegistries.map((r) => `<tr><td><strong>${escapeHtml(r.title)}</strong><br><small class="text-muted">${escapeHtml(r.id)}</small></td><td><span class="badge">${escapeHtml(r.brand)}</span></td><td>${escapeHtml(r.type)}</td><td>${Number(r.scene_count) || 0}</td><td><button class="btn btn-ghost btn-sm" data-cs-open-registry="${escapeHtml(r.id)}">Open</button></td></tr>`).join('');
                        tbody.querySelectorAll('[data-cs-open-registry]').forEach((btn) => {
                            btn.addEventListener('click', () => openCSRegistry(btn.dataset.csOpenRegistry));
                        });
                    }

                    async function openCSRegistry(id) {
                        try {
                            const data = await api('/content-studio/registries/' + encodeURIComponent(id));
                            state.csCurrentRegistry = data;
                            state.csCurrentScene = 0;
                            $('cs-scene-panel-title').textContent = data.title || id;
                            $('cs-scene-nav').classList.remove('d-none');
                            renderCSScene();
                        } catch (err) {
                            toast(err.message, 'error');
                        }
                    }

                    function renderCSScene() {
                        const reg = state.csCurrentRegistry;
                        if (!reg) return;
                        let scenes = [];
                        try { scenes = JSON.parse(reg.scenes_json || '[]'); } catch { scenes = []; }
                        const idx = state.csCurrentScene;
                        const scene = scenes[idx];
                        const total = scenes.length;

                        const counter = $('cs-scene-counter');
                        if (counter) counter.textContent = `Scene ${idx + 1} / ${total}`;
                        const prev = $('cs-prev-scene');
                        const next = $('cs-next-scene');
                        if (prev) prev.disabled = idx === 0;
                        if (next) next.disabled = idx >= total - 1;

                        if (!scene) {
                            $('cs-scene-detail').innerHTML = '<p class="text-muted">No scenes in this registry.</p>';
                            return;
                        }

                        const imagePrompts = Array.isArray(scene.imagePrompts) ? scene.imagePrompts : [];
                        const videoPrompt = scene.videoPrompt || scene.video_prompt || '';
                        const voiceOver = scene.voiceOver || scene.vo || scene.voice_over || '';
                        const soundCues = scene.soundCues || scene.sound || scene.sound_cues || '';
                        const paddyLine = scene.paddyLine || scene.paddy_line || '';
                        const notes = scene.notes || scene.description || '';

                        const promptsHtml = imagePrompts.map((p, i) => {
                            const pText = typeof p === 'string' ? p : (p.prompt || p.text || JSON.stringify(p));
                            const safeId = 'cs-img-' + idx + '-' + i;
                            return `
                    <div class="cs-prompt-card" id="${escapeHtml(safeId)}">
                        <p class="cs-prompt-text">${escapeHtml(pText)}</p>
                        <div class="inline-actions mt-04">
                            <button class="btn btn-ghost btn-sm" data-cs-copy="${escapeHtml(pText)}">Copy</button>
                            <button class="btn btn-primary btn-sm cs-gen-btn"
                                data-scene="${idx}" data-pi="${i}"
                                data-prompt="${escapeHtml(pText)}"
                                data-registry="${escapeHtml(reg.id)}">Generate ✦</button>
                        </div>
                        <div class="cs-gen-result d-none" id="${escapeHtml(safeId)}-result"></div>
                    </div>`;
                        }).join('');

                        $('cs-scene-detail').innerHTML = `
                    <div class="cs-scene-header">
                        <h4>Scene ${idx + 1}${scene.title ? ': ' + escapeHtml(scene.title) : ''}</h4>
                        ${notes ? `<p class="text-muted">${escapeHtml(notes)}</p>` : ''}
                    </div>
                    ${imagePrompts.length ? `
                    <div class="cs-prompt-section">
                        <h5 class="cs-section-label">Image Prompts (${imagePrompts.length})</h5>
                        ${promptsHtml}
                    </div>` : ''}
                    ${videoPrompt ? `
                    <div class="cs-prompt-section">
                        <h5 class="cs-section-label">Video Prompt</h5>
                        <div class="cs-prompt-card">
                            <p class="cs-prompt-text">${escapeHtml(videoPrompt)}</p>
                            <button class="btn btn-ghost btn-sm mt-04" data-cs-copy="${escapeHtml(videoPrompt)}">Copy</button>
                        </div>
                    </div>` : ''}
                    ${voiceOver ? `
                    <div class="cs-prompt-section">
                        <h5 class="cs-section-label">Voice Over</h5>
                        <p class="cs-prompt-text">${escapeHtml(voiceOver)}</p>
                    </div>` : ''}
                    ${paddyLine ? `
                    <div class="cs-prompt-section">
                        <h5 class="cs-section-label">&#x1F9C6; Character Line</h5>
                        <p class="cs-prompt-text">${escapeHtml(paddyLine)}</p>
                    </div>` : ''}
                    ${soundCues ? `
                    <div class="cs-prompt-section">
                        <h5 class="cs-section-label">Sound Cues</h5>
                        <p class="cs-prompt-text">${escapeHtml(soundCues)}</p>
                    </div>` : ''}
                `;

                        // Copy buttons
                        $('cs-scene-detail').querySelectorAll('[data-cs-copy]').forEach((btn) => {
                            btn.addEventListener('click', () => {
                                navigator.clipboard.writeText(btn.dataset.csCopy).then(() => toast('Copied!'));
                            });
                        });

                        // Generate buttons
                        $('cs-scene-detail').querySelectorAll('.cs-gen-btn').forEach((btn) => {
                            btn.addEventListener('click', handleCSGenerate);
                        });
                    }

                    async function handleCSGenerate(e) {
                        const btn = e.currentTarget;
                        const sceneNum = parseInt(btn.dataset.scene, 10);
                        const pi = parseInt(btn.dataset.pi, 10);
                        const promptText = btn.dataset.prompt;
                        const registryId = btn.dataset.registry;
                        const resultEl = document.getElementById('cs-img-' + sceneNum + '-' + pi + '-result');

                        btn.disabled = true;
                        btn.textContent = 'Generating…';
                        if (resultEl) { resultEl.classList.remove('d-none'); resultEl.innerHTML = '<p class="text-muted">Calling DALL&#x2011;E 3…</p>'; }

                        try {
                            const data = await api('/content-studio/generate', {
                                method: 'POST',
                                body: {
                                    registry_id: registryId,
                                    scene_number: sceneNum,
                                    prompt_index: pi,
                                    prompt_text: promptText,
                                    brand: state.csCurrentRegistry?.brand || currentBrand,
                                },
                            });
                            const previewAsset = data.r2_key ? { file_path: data.r2_key } : null;
                            const previewUrl = previewAsset ? assetUrl(previewAsset) : (data.url || '');
                            const previewBase = previewAsset ? assetBase(previewAsset) : '';
                            if (resultEl) {
                                resultEl.innerHTML = `
                            <img src="${escapeHtml(previewUrl)}" ${previewBase ? `data-r2="${escapeHtml(previewBase)}"` : ''} alt="Generated scene ${sceneNum + 1} prompt ${pi + 1}" style="max-width:100%;border-radius:8px;margin-top:8px">
                            <div class="inline-actions mt-04">
                                <a href="${escapeHtml(previewUrl)}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">View full</a>
                                <button class="btn btn-secondary btn-sm" data-cs-schedule="${escapeHtml(data.generated_asset_id)}">Schedule to social &#x25B6;</button>
                            </div>`;
                                resultEl.querySelector('[data-cs-schedule]')?.addEventListener('click', (ev) => {
                                    openCSScheduleModal(ev.currentTarget.dataset.csSchedule);
                                });
                            }
                            toast('Image generated!', 'success');
                        } catch (err) {
                            if (resultEl) resultEl.innerHTML = `<p class="text-error">${escapeHtml(err.message)}</p>`;
                            toast(err.message, 'error');
                        } finally {
                            btn.disabled = false;
                            btn.textContent = 'Generate ✦';
                        }
                    }

                    function openCSScheduleModal(genAssetId) {
                        $('cs-schedule-asset-id').value = genAssetId;
                        const tomorrow = new Date(Date.now() + 86400000);
                        tomorrow.setHours(14, 0, 0, 0);
                        $('cs-schedule-date').value = tomorrow.toISOString().slice(0, 16);
                        openModal('cs-schedule-modal');
                    }

                    async function submitCSSchedule() {
                        const genAssetId = $('cs-schedule-asset-id').value;
                        const platforms = Array.from(
                            document.querySelectorAll('#cs-schedule-platforms input:checked')
                        ).map((c) => c.value);
                        const caption = $('cs-schedule-caption').value.trim();
                        const scheduledAt = $('cs-schedule-date').value;

                        if (!platforms.length) { toast('Select at least one platform', 'error'); return; }
                        if (!scheduledAt) { toast('Select a scheduled date/time', 'error'); return; }

                        const submitBtn = $('cs-schedule-submit-btn');
                        try {
                            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Scheduling…'; }
                            const data = await api('/content-studio/schedule', {
                                method: 'POST',
                                body: {
                                    generated_asset_id: genAssetId,
                                    platforms,
                                    caption,
                                    scheduled_at: new Date(scheduledAt).toISOString(),
                                    brand: state.csCurrentRegistry?.brand || currentBrand,
                                },
                            });
                            toast('Scheduled to ' + (data.variants?.length || 0) + ' platform(s)', 'success');
                            closeModal('cs-schedule-modal');
                            $('cs-schedule-caption').value = '';
                        } catch (err) {
                            toast(err.message, 'error');
                        } finally {
                            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Schedule ▶'; }
                        }
                    }

                    async function saveCSRegistry() {
                        const id = $('cs-registry-id').value.trim();
                        const regId = $('cs-reg-id-field').value.trim();
                        if (!regId) { toast('Registry ID is required', 'error'); return; }

                        let scenesJson = '[]';
                        const raw = $('cs-reg-scenes').value.trim();
                        if (raw) {
                            try { JSON.parse(raw); scenesJson = raw; }
                            catch { toast('Scenes JSON is not valid JSON', 'error'); return; }
                        }

                        const payload = {
                            id: id || regId,
                            brand: $('cs-reg-brand').value,
                            type: $('cs-reg-type').value,
                            series_id: $('cs-reg-series').value.trim(),
                            title: $('cs-reg-title').value.trim(),
                            description: $('cs-reg-description').value.trim(),
                            scenes_json: scenesJson,
                        };
                        if (!payload.title) { toast('Title is required', 'error'); return; }

                        try {
                            const method = id ? 'PUT' : 'POST';
                            await api('/content-studio/registries', { method, body: payload });
                            closeModal('cs-registry-modal');
                            await loadContentStudioRegistries();
                            toast('Registry saved.', 'success');
                        } catch (err) {
                            toast('Failed to save: ' + err.message, 'error');
                        }
                    }

                    function importCSJSON() {
                        const raw = $('cs-import-json')?.value?.trim();
                        if (!raw) { toast('Paste JSON first', 'error'); return; }

                        let parsed;
                        try { parsed = JSON.parse(raw); }
                        catch { toast('Invalid JSON', 'error'); return; }

                        // Accept either { meta, scenes } wrapper or a raw scenes array
                        const meta = parsed.meta || {};
                        const scenes = Array.isArray(parsed) ? parsed : (parsed.scenes || []);

                        $('cs-registry-id').value = meta.id || '';
                        $('cs-reg-id-field').value = meta.id || '';
                        $('cs-reg-brand').value = meta.brand || currentBrand;
                        $('cs-reg-type').value = meta.type || 'episode';
                        $('cs-reg-series').value = meta.series_id || '';
                        $('cs-reg-title').value = meta.title || '';
                        $('cs-reg-description').value = meta.description || '';
                        $('cs-reg-scenes').value = JSON.stringify(scenes, null, 2);

                        closeModal('cs-import-modal');
                        $('cs-import-json').value = '';
                        openModal('cs-registry-modal');
                        $('cs-registry-modal-title').textContent = 'Review & Save Registry';
                    }

                    // ── Prompt Studio sync ───────────────────────────────────────────

                    async function openCSSyncModal() {
                        openModal('cs-sync-modal');
                        const statusEl = $('cs-sync-status');
                        const listEl = $('cs-sync-list');
                        statusEl.innerHTML = '<p class="text-muted">Connecting to Prompt Studio on localhost&#x2026;</p>';
                        listEl.innerHTML = '';
                        try {
                            const { baseUrl, registries: remoteRegs } = await detectPromptStudio();
                            const existingIds = new Set(state.csRegistries.map((r) => r.id));
                            if (!remoteRegs.length) {
                                statusEl.innerHTML = '<p class="text-muted">No registries found. Run <code>make prompt-studio</code> in SummitView first.</p>';
                                return;
                            }
                            const newCount = remoteRegs.filter((r) => !existingIds.has(r.registryId)).length;
                            statusEl.innerHTML = `<p class="text-muted">Connected to <code>${escapeHtml(baseUrl)}</code> &#xB7; ${remoteRegs.length} registries found &#xB7; ${newCount} new</p>`;
                            listEl.innerHTML = remoteRegs.map((r) => `
                        <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border-subtle);cursor:pointer">
                            <input type="checkbox" value="${escapeHtml(r.registryId)}" ${!existingIds.has(r.registryId) ? 'checked' : ''} style="margin-top:2px;flex-shrink:0">
                            <div>
                                <strong>${escapeHtml(r.title)}</strong>
                                <span class="badge">${r.sceneCount}s</span>
                                ${existingIds.has(r.registryId) ? '<span class="badge" style="background:#1a2a1a;color:#6bcf8a">already synced</span>' : ''}
                                <br><small class="text-muted">${escapeHtml(r.brandId)} &#xB7; ${escapeHtml(r.seriesId)}</small>
                            </div>
                        </label>
                    `).join('');
                            $('cs-sync-select-all')?.addEventListener('click', () => {
                                listEl.querySelectorAll('input[type=checkbox]').forEach((c) => { c.checked = true; });
                            });
                        } catch (err) {
                            statusEl.innerHTML = `<p class="text-error">Cannot reach Prompt Studio: ${escapeHtml(err.message)}<br><small class="text-muted">Start it with <code>make prompt-studio</code> in SummitView.</small></p>`;
                            listEl.innerHTML = '';
                        }
                    }

                    async function importFromPromptStudio() {
                        const checked = Array.from(
                            document.querySelectorAll('#cs-sync-list input[type=checkbox]:checked')
                        ).map((c) => c.value);
                        if (!checked.length) { toast('Select at least one registry', 'error'); return; }
                        const btn = $('cs-sync-import-btn');
                        if (btn) { btn.disabled = true; btn.textContent = `Importing ${checked.length}\u2026`; }
                        let imported = 0;
                        let failed = 0;
                        for (const registryId of checked) {
                            try {
                                const baseUrl = state.csPromptStudioBaseUrl || (await detectPromptStudio()).baseUrl;
                                const res = await fetch(`${baseUrl}/api/registries/${encodeURIComponent(registryId)}`);
                                if (!res.ok) throw new Error('HTTP ' + res.status);
                                const reg = await res.json();
                                await api('/content-studio/registries', {
                                    method: 'POST',
                                    body: {
                                        id: reg.registryId,
                                        brand: _normalizeBrandId(reg.brandId),
                                        type: reg.type || 'special',
                                        series_id: reg.seriesId || '',
                                        title: reg.title || reg.registryId,
                                        description: reg._source || '',
                                        scenes_json: JSON.stringify(_normalizePromptStudioScenes(reg.scenes || [])),
                                    },
                                });
                                imported++;
                            } catch (err) {
                                console.warn('Failed to import registry', registryId, err);
                                failed++;
                            }
                        }
                        if (btn) { btn.disabled = false; btn.textContent = 'Import Selected \u2192'; }
                        toast(
                            `Imported ${imported} registr${imported !== 1 ? 'ies' : 'y'}` +
                            (failed ? ` \u00B7 ${failed} failed` : ''),
                            imported ? 'success' : 'error'
                        );
                        closeModal('cs-sync-modal');
                        await loadContentStudioRegistries();
                    }

                    function _normalizePromptStudioScenes(scenes) {
                        return scenes.map((s) => ({
                            title: s.label || s.beat_id || `Scene ${s.scene_number}`,
                            notes: s.title_card_text || '',
                            imagePrompts: (s.image_prompts || [])
                                .map((p) => (typeof p === 'string' ? p : (p.prompt || '')))
                                .filter(Boolean),
                            videoPrompt: s.video_gen_prompt || '',
                            voiceOver: s.narrator_line || '',
                            paddyLine: s.paddy_line || '',
                            soundCues: s.sound_cue || '',
                        }));
                    }

                    function _normalizeBrandId(brandId) {
                        const map = {
                            goodflippinvibes: 'gfv',
                            goodflippindesign: 'gfd',
                            aiaimate: 'aiaimate',
                            culturesherpa: 'culturesherpa',
                            globaldeets: 'globaldeets',
                        };
                        return map[brandId] || brandId || 'gfv';
                    }

                    async function detectPromptStudio() {
                        for (const baseUrl of PROMPT_STUDIO_BASES) {
                            try {
                                const res = await fetch(`${baseUrl}/api/registries`, {
                                    signal: AbortSignal.timeout(5000),
                                });
                                if (!res.ok) continue;
                                const registries = await res.json();
                                if (!Array.isArray(registries)) continue;
                                state.csPromptStudioBaseUrl = baseUrl;
                                return { baseUrl, registries };
                            } catch {
                                // Try the next candidate.
                            }
                        }

                        state.csPromptStudioBaseUrl = '';
                        throw new Error('Prompt Studio is not reachable on localhost:5000 or localhost:5050');
                    }

                    // ── Image Overrides ──────────────────────────────────────────────

                    async function loadOverrides() {
                        try {
                            const brand = $('override-filter-brand')?.value || '';
                            const domain = $('override-filter-domain')?.value.trim() || '';
                            const qs = new URLSearchParams();
                            if (brand) qs.set('brand', brand);
                            if (domain) qs.set('domain', domain);
                            const suffix = qs.toString() ? '?' + qs.toString() : '';
                            const data = await api('/assets/overrides' + suffix);
                            state.overrides = data.overrides || [];
                        } catch {
                            state.overrides = [];
                        }
                    }

                    function renderOverrides() {
                        const tbody = $('overrides-table');
                        const empty = $('overrides-empty');
                        if (!tbody) return;
                        if (!state.overrides.length) {
                            tbody.innerHTML = '';
                            empty?.classList.remove('d-none');
                            return;
                        }
                        empty?.classList.add('d-none');
                        tbody.innerHTML = state.overrides.map((ov) => {
                            const isActive = Number(ov.active) !== 0;
                            return `
                        <tr>
                            <td><span class="tag">${escapeHtml(ov.brand)}</span></td>
                            <td class="mono">${escapeHtml(ov.site_domain)}</td>
                            <td class="mono">${escapeHtml(ov.url_pattern)}</td>
                            <td class="mono text-muted" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(ov.r2_key)}">${escapeHtml(ov.r2_key)}</td>
                            <td>${escapeHtml(ov.label || '\u2014')}</td>
                            <td>
                                <button class="btn btn-micro ${isActive ? 'btn-success' : 'btn-secondary'}"
                                    data-override-toggle="${ov.id}"
                                    data-override-active="${ov.active}">
                                    ${isActive ? 'Active' : 'Off'}
                                </button>
                            </td>
                            <td class="inline-actions">
                                <button class="btn btn-micro btn-secondary" data-override-edit="${ov.id}">Edit</button>
                                <button class="btn btn-micro btn-danger" data-override-delete="${ov.id}">Delete</button>
                            </td>
                        </tr>
                    `;
                        }).join('');

                        tbody.querySelectorAll('[data-override-toggle]').forEach((btn) => {
                            btn.addEventListener('click', () =>
                                toggleOverrideActive(Number(btn.dataset.overrideToggle), Number(btn.dataset.overrideActive) !== 0)
                            );
                        });
                        tbody.querySelectorAll('[data-override-edit]').forEach((btn) => {
                            btn.addEventListener('click', () => {
                                const ov = state.overrides.find((o) => String(o.id) === btn.dataset.overrideEdit);
                                if (ov) openOverrideModal(ov);
                            });
                        });
                        tbody.querySelectorAll('[data-override-delete]').forEach((btn) => {
                            btn.addEventListener('click', () => deleteOverride(btn.dataset.overrideDelete));
                        });
                    }

                    function openOverrideModal(override = null) {
                        $('override-modal-title').textContent = override ? 'Edit Image Override' : 'New Image Override';
                        $('override-id').value = override?.id || '';
                        $('override-brand').value = override?.brand || currentBrand;
                        $('override-domain').value = override?.site_domain || '';
                        $('override-url-pattern').value = override?.url_pattern || '';
                        $('override-r2-key').value = override?.r2_key || '';
                        $('override-label').value = override?.label || '';

                        const sel = $('override-asset-select');
                        sel.innerHTML = '<option value="">\u2014 pick from library \u2014</option>' +
                            state.assets.map((a) => {
                                const key = a.file_path || a.r2_key || '';
                                const selected = override?.r2_key === key ? ' selected' : '';
                                return `<option value="${escapeHtml(key)}"${selected}>${escapeHtml(a.title || key || a.id)}</option>`;
                            }).join('');

                        openModal('override-modal');
                    }

                    async function saveOverride() {
                        const id = $('override-id').value;
                        const pickerVal = $('override-asset-select').value;
                        const r2_key = $('override-r2-key').value.trim() || pickerVal;
                        const payload = {
                            brand: $('override-brand').value,
                            site_domain: $('override-domain').value.trim(),
                            url_pattern: $('override-url-pattern').value.trim(),
                            r2_key,
                            label: $('override-label').value.trim(),
                        };
                        if (!payload.site_domain || !payload.url_pattern || !payload.r2_key) {
                            toast('Domain, URL pattern, and an asset / R2 key are required.', 'error');
                            return;
                        }
                        try {
                            if (id) {
                                await api('/assets/overrides', { method: 'PUT', body: { id: Number(id), ...payload } });
                            } else {
                                await api('/assets/overrides', { method: 'POST', body: payload });
                            }
                            closeModal('override-modal');
                            await loadOverrides();
                            renderOverrides();
                            toast('Override saved.', 'success');
                        } catch (err) {
                            toast('Failed to save: ' + err.message, 'error');
                        }
                    }

                    async function deleteOverride(id) {
                        showConfirm('Delete this image override? The live-site swap will stop immediately.', async () => {
                            try {
                                await api('/assets/overrides?id=' + encodeURIComponent(id), { method: 'DELETE' });
                                state.overrides = state.overrides.filter((o) => String(o.id) !== String(id));
                                renderOverrides();
                                toast('Override deleted.', 'success');
                            } catch (err) {
                                toast('Failed to delete: ' + err.message, 'error');
                            }
                        });
                    }

                    async function toggleOverrideActive(id, currentlyActive) {
                        try {
                            await api('/assets/overrides', { method: 'PUT', body: { id, active: currentlyActive ? 0 : 1 } });
                            await loadOverrides();
                            renderOverrides();
                            toast(`Override ${currentlyActive ? 'deactivated' : 'activated'}.`, 'success');
                        } catch (err) {
                            toast('Failed to update: ' + err.message, 'error');
                        }
                    }

                    // ─── Ecosystem Health (panel 11) ────────────────────────────
                    const SWEEP_WORKER = 'https://gfd-health-sweep.weave0.workers.dev';

                    const ECO_REPOS = [
                        { owner: 'weave0', repo: 'goodflippindesign', label: 'Good Flippin Design' },
                        { owner: 'weave0', repo: 'SummitView', label: 'SummitView' },
                        { owner: 'weave0', repo: 'jamie-mediation', label: 'MN Peace' },
                    ];

                    function ecoRelTime(iso) {
                        if (!iso) return '';
                        const diff = Date.now() - new Date(iso).getTime();
                        const m = Math.floor(diff / 60000);
                        const h = Math.floor(m / 60);
                        const d = Math.floor(h / 24);
                        if (d > 1) return `${d}d ago`;
                        if (h > 1) return `${h}h ago`;
                        if (m > 1) return `${m}m ago`;
                        return 'just now';
                    }

                    async function ecoFetchSweepResults() {
                        try {
                            const res = await fetch(`${SWEEP_WORKER}/last`);
                            if (!res.ok) return [];
                            return await res.json();
                        } catch { return []; }
                    }

                    async function ecoFetchCIRuns(owner, repo) {
                        const headers = { 'Accept': 'application/vnd.github+json' };
                        try {
                            const res = await fetch(
                                `https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=6`,
                                { headers }
                            );
                            if (!res.ok) return { error: res.status === 401 ? 'private repo' : `HTTP ${res.status}` };
                            const data = await res.json();
                            return { runs: data.workflow_runs || [] };
                        } catch (e) { return { error: e.message }; }
                    }

                    async function refreshEcosystem() {
                        const siteGrid = $('eco-sites-grid');
                        const repoGrid = $('eco-repos-grid');
                        const kpiStrip = $('eco-kpi-strip');
                        const ageEl = $('eco-sweep-age');
                        if (!siteGrid) return;

                        siteGrid.innerHTML = '<div class="eco-site-card"><div class="eco-site-name">Loading from D1…</div></div>';

                        // ── Real sweep results from the health-sweep worker (D1-backed) ──
                        const rows = await ecoFetchSweepResults();

                        if (!rows.length) {
                            siteGrid.innerHTML = '<div class="eco-site-card"><div class="eco-site-name">No sweep data yet — click <strong>Run Sweep Now</strong></div></div>';
                        } else {
                            // Group by URL, most recent row per URL
                            const latest = {};
                            rows.forEach(r => {
                                if (!latest[r.url] || r.checked_at > latest[r.url].checked_at) latest[r.url] = r;
                            });
                            const checks = Object.values(latest);

                            // KPI strip
                            const pass = checks.filter(c => c.overall_status === 'pass').length;
                            const warn = checks.filter(c => c.overall_status === 'warn').length;
                            const fail = checks.filter(c => c.overall_status === 'fail').length;
                            const avgMs = Math.round(checks.reduce((s, c) => s + (c.response_time_ms || 0), 0) / checks.length);
                            if (kpiStrip) {
                                kpiStrip.style.display = '';
                                $('eco-kpi-pass').textContent = pass;
                                $('eco-kpi-warn').textContent = warn;
                                $('eco-kpi-fail').textContent = fail;
                                $('eco-kpi-avg').textContent = avgMs + 'ms';
                            }

                            // Age label
                            const lastTs = checks.reduce((a, c) => a > c.checked_at ? a : c.checked_at, '');
                            if (ageEl && lastTs) ageEl.textContent = 'Last sweep ' + ecoRelTime(lastTs);

                            // Cards
                            siteGrid.innerHTML = checks.map(c => {
                                const cls = c.overall_status === 'pass' ? 'pass' : c.overall_status === 'warn' ? 'warn' : 'fail';
                                const tagCls = cls === 'pass' ? 'ok' : cls;
                                const responseLabel = c.overall_status === 'pass' ? `${c.response_time_ms}ms` :
                                    c.overall_status === 'warn' ? `slow ${c.response_time_ms}ms` :
                                        c.error ? c.error.substring(0, 30) : `HTTP ${c.status_code}`;
                                // Security headers: 4 possible (CSP, HSTS, X-Frame, XCTO)
                                const secScore = (c.has_csp || 0) + (c.has_hsts || 0) + (c.has_x_frame || 0) + (c.has_xcto || 0);
                                const secCls = secScore >= 4 ? 'ok' : secScore >= 2 ? 'warn' : 'fail';
                                const headerChip = (label, has, abbrev) =>
                                    `<span class="eco-header-chip${has ? '' : ' missing'}" title="${label}">${abbrev}</span>`;
                                // Check type badge
                                const checkType = c.check_type || 'page';
                                const typeBadge = `<span class="eco-type-badge ${checkType}">${checkType}</span>`;
                                // Content validation badge
                                let contentBadge = '';
                                if (c.keyword_found === 1) {
                                    contentBadge = `<span class="eco-content-badge found" title="Expected content found: ${escapeHtml(c.content_keyword || '')}">✓ content</span>`;
                                } else if (c.keyword_found === 0) {
                                    contentBadge = `<span class="eco-content-badge missing" title="Missing expected: ${escapeHtml(c.content_keyword || '')}">✗ content</span>`;
                                }
                                return `<div class="eco-site-card eco-site-card--${cls}" data-check-type="${checkType}">
                            <div class="eco-site-card-header">
                                ${typeBadge}
                                <span class="eco-site-name">${escapeHtml(c.name)}</span>
                                <span class="tag ${tagCls}">${escapeHtml(responseLabel)}</span>
                            </div>
                            <div class="eco-site-url">${escapeHtml(c.url)}</div>
                            <div class="eco-sec-row">
                                <span class="eco-sec-score ${secCls}" title="Security headers score">🛡️ ${secScore}/4</span>
                                ${headerChip('Content-Security-Policy', c.has_csp, 'CSP')}
                                ${headerChip('Strict-Transport-Security', c.has_hsts, 'HSTS')}
                                ${headerChip('X-Frame-Options', c.has_x_frame, 'X-Frame')}
                                ${headerChip('X-Content-Type-Options', c.has_xcto, 'XCTO')}
                                ${contentBadge}
                            </div>
                        </div>`;
                            }).join('');

                            const kpiSites = $('kpi-sites-online');
                            if (kpiSites) kpiSites.textContent = `${pass}/${checks.length}`;

                            // Sweep history — group rows by checked_at timestamp
                            const histDetails = $('eco-history-details');
                            const histBody = $('eco-history-body');
                            if (histDetails && histBody) {
                                const byRun = {};
                                rows.forEach(r => {
                                    if (!byRun[r.checked_at]) byRun[r.checked_at] = { ts: r.checked_at, pass: 0, warn: 0, fail: 0 };
                                    byRun[r.checked_at][r.overall_status] = (byRun[r.checked_at][r.overall_status] || 0) + 1;
                                });
                                const history = Object.values(byRun).sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 7);
                                if (history.length > 1) {
                                    histDetails.style.display = '';
                                    histBody.innerHTML = history.map(h => {
                                        const ts = new Date(h.ts);
                                        const label = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
                                            ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' UTC';
                                        return `<tr>
                                    <td>${escapeHtml(label)}</td>
                                    <td style="color:#22c55e">${h.pass}</td>
                                    <td style="color:#f59e0b">${h.warn || 0}</td>
                                    <td style="color:#f43f5e">${h.fail || 0}</td>
                                </tr>`;
                                    }).join('');
                                }
                            }
                            // Per-site performance trend
                            const trendDetails = $('eco-trend-details');
                            const trendGrid = $('eco-trend-grid');
                            if (trendDetails && trendGrid) {
                                // Group rows by URL across multiple sweeps
                                const byUrl = {};
                                rows.forEach(r => {
                                    if (!byUrl[r.url]) byUrl[r.url] = { name: r.name, url: r.url, points: [] };
                                    byUrl[r.url].points.push({ ts: r.checked_at, ms: r.response_time_ms || 0, status: r.overall_status });
                                });
                                // Only show if multiple data points exist for at least one site
                                const multiSites = Object.values(byUrl).filter(s => s.points.length > 1);
                                if (multiSites.length) {
                                    trendDetails.style.display = '';
                                    trendGrid.innerHTML = multiSites.map(site => {
                                        // Sort chronologically, take last 7
                                        const pts = site.points.sort((a, b) => a.ts.localeCompare(b.ts)).slice(-7);
                                        const maxMs = Math.max.apply(null, pts.map(p => p.ms)) || 1;
                                        const bars = pts.map(p => {
                                            const h = Math.max(6, Math.round((p.ms / maxMs) * 48));
                                            const color = p.status === 'pass' ? '#22c55e' : p.status === 'warn' ? '#f59e0b' : '#f43f5e';
                                            const dt = new Date(p.ts);
                                            const label = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                            return '<div style="display:flex;flex-direction:column;align-items:center;gap:2px" title="' + escapeHtml(label) + ': ' + p.ms + 'ms">' +
                                                '<div style="width:14px;height:' + h + 'px;background:' + color + ';border-radius:3px"></div>' +
                                                '<span style="font-size:0.6rem;color:#666">' + p.ms + '</span></div>';
                                        }).join('');
                                        const latest = pts[pts.length - 1];
                                        const arrow = pts.length >= 2 ? (latest.ms > pts[pts.length - 2].ms ? '↑' : latest.ms < pts[pts.length - 2].ms ? '↓' : '→') : '';
                                        return '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px 12px">' +
                                            '<div style="font-weight:500;font-size:0.82rem;margin-bottom:6px">' + escapeHtml(site.name) + ' ' + arrow + '</div>' +
                                            '<div style="display:flex;align-items:flex-end;gap:4px;height:56px">' + bars + '</div>' +
                                            '</div>';
                                    }).join('');
                                }
                            }
                        }

                        // ── CI status (public repos — no PAT needed) ──
                        if (!repoGrid) return;
                        repoGrid.innerHTML = ECO_REPOS.map(r =>
                            `<div class="eco-repo-card"><div class="eco-repo-name">${escapeHtml(r.label)}</div><div class="eco-no-workflows">loading…</div></div>`
                        ).join('');

                        const ciResults = await Promise.allSettled(ECO_REPOS.map(r => ecoFetchCIRuns(r.owner, r.repo)));
                        let totalFailures = 0;
                        repoGrid.innerHTML = ECO_REPOS.map((r, i) => {
                            const result = ciResults[i].status === 'fulfilled' ? ciResults[i].value : { error: 'fetch failed' };
                            if (result.error) {
                                return `<div class="eco-repo-card">
                            <div class="eco-repo-header">
                                <span class="eco-repo-name">${escapeHtml(r.label)}</span>
                                <a class="eco-repo-link" href="https://github.com/${r.owner}/${r.repo}/actions" target="_blank" rel="noopener">↗ GitHub</a>
                            </div>
                            <div class="eco-no-workflows">${escapeHtml(result.error)}</div>
                        </div>`;
                            }
                            const byWorkflow = {};
                            (result.runs || []).forEach(run => { if (!byWorkflow[run.name]) byWorkflow[run.name] = run; });
                            const entries = Object.values(byWorkflow);
                            if (!entries.length) return `<div class="eco-repo-card">
                        <div class="eco-repo-header"><span class="eco-repo-name">${escapeHtml(r.label)}</span>
                        <a class="eco-repo-link" href="https://github.com/${r.owner}/${r.repo}/actions" target="_blank" rel="noopener">↗ GitHub</a></div>
                        <div class="eco-no-workflows">No recent runs</div></div>`;
                            const rows = entries.map(run => {
                                const concl = run.conclusion || run.status || 'unknown';
                                const cls = concl === 'success' ? 'ok' : concl === 'failure' ? 'fail' : 'warn';
                                if (concl === 'failure') totalFailures++;
                                return `<div class="eco-workflow-row">
                            <span class="eco-workflow-name">${escapeHtml(run.name)}</span>
                            <span class="eco-workflow-meta">${ecoRelTime(run.updated_at)}</span>
                            <a class="tag ${cls}" href="${escapeHtml(run.html_url)}" target="_blank" rel="noopener" style="text-decoration:none">${escapeHtml(concl)}</a>
                        </div>`;
                            }).join('');
                            return `<div class="eco-repo-card">
                        <div class="eco-repo-header"><span class="eco-repo-name">${escapeHtml(r.label)}</span>
                        <a class="eco-repo-link" href="https://github.com/${r.owner}/${r.repo}/actions" target="_blank" rel="noopener">↗ GitHub</a></div>
                        ${rows}</div>`;
                        }).join('');
                        const kpiCI = $('kpi-ci-failures');
                        if (kpiCI) kpiCI.textContent = String(totalFailures);
                    }

                    // ── Check type filter tabs ──
                    (function () {
                        const tabs = $('eco-type-tabs');
                        if (!tabs) return;
                        tabs.addEventListener('click', function (e) {
                            const btn = e.target.closest('.eco-type-tab');
                            if (!btn) return;
                            tabs.querySelectorAll('.eco-type-tab').forEach(t => t.classList.remove('active'));
                            btn.classList.add('active');
                            const type = btn.getAttribute('data-type');
                            const grid = $('eco-sites-grid');
                            if (!grid) return;
                            grid.querySelectorAll('.eco-site-card').forEach(card => {
                                if (type === 'all' || card.getAttribute('data-check-type') === type) {
                                    card.style.display = '';
                                } else {
                                    card.style.display = 'none';
                                }
                            });
                        });
                    })();

                    // ── Sweep trigger button ──
                    $('eco-sweep-btn').addEventListener('click', async function () {
                        logActivity('Sweep', 'Triggered ecosystem health sweep', 'action');
                        const btn = $('eco-sweep-btn');
                        const ageEl = $('eco-sweep-age');
                        btn.disabled = true;
                        btn.textContent = '⟳ Running…';
                        if (ageEl) ageEl.textContent = '';
                        try {
                            const res = await fetch(`${SWEEP_WORKER}/trigger`, { method: 'GET' });
                            const data = await res.json().catch(() => ({}));
                            if (res.status === 429) {
                                btn.textContent = `Rate limited — retry in ${data.retry_after_seconds || '?'}s`;
                                setTimeout(() => { btn.textContent = '▶ Run Sweep Now'; btn.disabled = false; }, 4000);
                                return;
                            }
                            btn.textContent = '⏳ Sweep running (D1 updates in ~10s)';
                            // Auto-refresh results after 12s
                            setTimeout(async () => {
                                await refreshEcosystem();
                                btn.textContent = '▶ Run Sweep Now';
                                btn.disabled = false;
                            }, 12000);
                        } catch (e) {
                            btn.textContent = 'Error — check console';
                            console.error('[health-sweep trigger]', e);
                            setTimeout(() => { btn.textContent = '▶ Run Sweep Now'; btn.disabled = false; }, 4000);
                        }
                    });
                    // ─────────────────────────────────────────────────────────────

                    // ─── Blog Manager (panel 12) ──────────────────────────────────
                    (function initBlogManager() {
                        'use strict';

                        let blogPosts = [];
                        let blogEditingId = null;
                        let blogSlugManuallyEdited = false;
                        let blogSortCol = 'created_at';
                        let blogSortDir = 'desc'; // 'asc' | 'desc'

                        // blogFetch removed — api() now accepts full /api/ paths directly

                        // ── helpers ───────────────────────────────────────────────
                        function slugify(str) {
                            return String(str)
                                .toLowerCase()
                                .trim()
                                .replace(/[^a-z0-9\s-]/g, '')
                                .replace(/[\s]+/g, '-')
                                .replace(/-+/g, '-')
                                .slice(0, 80);
                        }

                        function insertMarkdown(textarea, type, opts) {
                            const start = textarea.selectionStart;
                            const end = textarea.selectionEnd;
                            const sel = textarea.value.slice(start, end) || '';
                            const before = textarea.value.slice(0, start);
                            const after = textarea.value.slice(end);
                            let insert = '';
                            switch (type) {
                                case 'bold': insert = '**' + (sel || 'bold text') + '**'; break;
                                case 'italic': insert = '*' + (sel || 'italic text') + '*'; break;
                                case 'h2': insert = '\n## ' + (sel || 'Heading'); break;
                                case 'h3': insert = '\n### ' + (sel || 'Heading'); break;
                                case 'link': insert = '[' + (sel || 'link text') + '](url)'; break;
                                case 'code': insert = '`' + (sel || 'code') + '`'; break;
                                case 'codeblock': insert = '\n```\n' + (sel || 'code here') + '\n```\n'; break;
                                case 'ul': insert = '\n- ' + (sel || 'list item'); break;
                                case 'hr': insert = '\n\n---\n\n'; break;
                                case 'strikethrough': insert = '~~' + (sel || 'text') + '~~'; break;
                                case 'blockquote': insert = '\n> ' + (sel || 'quote'); break;
                                case 'image': {
                                    const imgUrl = (opts && opts.url) ? opts.url : (sel || 'https://example.com/image.jpg');
                                    const imgAlt = (opts && opts.alt) ? opts.alt : 'image';
                                    insert = '\n![' + imgAlt + '](' + imgUrl + ')\n';
                                    break;
                                }
                                case 'video': {
                                    const vidUrl = sel || 'https://youtube.com/watch?v=VIDEO_ID';
                                    insert = '\n@[video](' + vidUrl + ')\n';
                                    break;
                                }
                            }
                            textarea.value = before + insert + after;
                            const cursor = before.length + insert.length;
                            textarea.setSelectionRange(cursor, cursor);
                            textarea.focus();
                            textarea.dispatchEvent(new Event('input'));
                        }

                        // ── stats chip update ─────────────────────────────────────
                        function updateBlogStats(posts) {
                            const total = posts.length;
                            const published = posts.filter(function (p) { return p.status === 'published'; }).length;
                            const draft = total - published;

                            const elTotal = $('blog-stat-total');
                            const elPub = $('blog-stat-published');
                            const elDraft = $('blog-stat-draft');
                            const elBadge = $('blog-draft-badge');

                            if (elTotal) elTotal.textContent = total;
                            if (elPub) elPub.textContent = published;
                            if (elDraft) elDraft.textContent = draft;
                            if (elBadge) {
                                elBadge.textContent = draft;
                                elBadge.classList.toggle('d-none', draft === 0);
                            }
                        }

                        // ── table render ──────────────────────────────────────────
                        function populateBlogSeriesFilter() {
                            const sel = $('blog-filter-series');
                            if (!sel) return;
                            const current = sel.value;
                            while (sel.options.length > 1) sel.remove(1);
                            const seen = {};
                            blogPosts.forEach(function (p) {
                                if (p.series && !seen[p.series]) {
                                    seen[p.series] = true;
                                    const opt = document.createElement('option');
                                    opt.value = p.series;
                                    opt.textContent = p.series;
                                    sel.appendChild(opt);
                                }
                            });
                            // restore selection if still valid
                            if (current && seen[current]) sel.value = current;
                        }

                        function renderBlogTable() {
                            const tbody = $('blog-posts-tbody');
                            const emptyMsg = $('blog-empty-msg');
                            if (!tbody) return;

                            const search = ($('blog-search') ? $('blog-search').value : '').toLowerCase().trim();
                            const statusFilter = $('blog-filter-status') ? $('blog-filter-status').value : '';
                            const seriesFilter = $('blog-filter-series') ? $('blog-filter-series').value : '';
                            // dropdown sort still works; column-header sort overrides via blogSortCol/Dir
                            const dropdownSort = $('blog-filter-sort') ? $('blog-filter-sort').value : '';
                            if (dropdownSort && dropdownSort !== 'created_desc') {
                                if (dropdownSort === 'created_asc') { blogSortCol = 'created_at'; blogSortDir = 'asc'; }
                                if (dropdownSort === 'title_asc') { blogSortCol = 'title'; blogSortDir = 'asc'; }
                                if (dropdownSort === 'title_desc') { blogSortCol = 'title'; blogSortDir = 'desc'; }
                                if (dropdownSort === 'status') { blogSortCol = 'status'; blogSortDir = 'asc'; }
                            }

                            const filtered = blogPosts.filter(function (p) {
                                if (statusFilter && p.status !== statusFilter) return false;
                                if (seriesFilter && p.series !== seriesFilter) return false;
                                if (search) {
                                    const haystack = (p.title + ' ' + (p.excerpt || '') + ' ' + (p.tags || '') + ' ' + (p.series || '')).toLowerCase();
                                    if (haystack.indexOf(search) === -1) return false;
                                }
                                return true;
                            });

                            const col = blogSortCol;
                            const dir = blogSortDir;
                            filtered.sort(function (a, b) {
                                const av = (a[col] || '');
                                const bv = (b[col] || '');
                                const cmp = typeof av === 'string' ? av.localeCompare(bv) : (av < bv ? -1 : av > bv ? 1 : 0);
                                return dir === 'asc' ? cmp : -cmp;
                            });

                            // update sort-icon indicators
                            document.querySelectorAll('#blog-posts-table th.sortable').forEach(function (th) {
                                if (th.dataset.sort === col) {
                                    th.classList.toggle('sort-asc', dir === 'asc');
                                    th.classList.toggle('sort-desc', dir === 'desc');
                                } else {
                                    th.classList.remove('sort-asc', 'sort-desc');
                                }
                            });

                            if (filtered.length === 0) {
                                tbody.innerHTML = '';
                                if (emptyMsg) emptyMsg.classList.remove('d-none');
                                return;
                            }
                            if (emptyMsg) emptyMsg.classList.add('d-none');

                            tbody.innerHTML = filtered.map(function (p) {
                                const statusBadge = p.status === 'published'
                                    ? '<span class="tag ok">published</span>'
                                    : '<span class="tag warn">draft</span>';

                                const tagHtml = p.tags
                                    ? p.tags.split(',').filter(Boolean).slice(0, 4).map(function (t) {
                                        return '<span class="blog-post-tag">' + escapeHtml(t.trim()) + '</span>';
                                    }).join('')
                                    : '<span class="text-muted">—</span>';

                                const viewLink = p.status === 'published' && p.slug
                                    ? ' <a href="https://goodflippinvibes.com/blog/' + encodeURIComponent(p.slug) + '" target="_blank" rel="noopener" class="link-muted" aria-label="View post on site">\u2197</a>'
                                    : '';

                                function fmtDate(ts) {
                                    if (!ts) return '\u2014';
                                    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                                }

                                return '<tr>' +
                                    '<td class="blog-post-title-cell">' + escapeHtml(p.title || 'Untitled') + viewLink +
                                    '<div class="text-muted" style="font-size:0.75rem">' + escapeHtml(p.slug || '') + '</div></td>' +
                                    '<td>' + statusBadge + '</td>' +
                                    '<td class="text-muted">' + (p.series ? escapeHtml(p.series) : '\u2014') + '</td>' +
                                    '<td class="blog-post-tags-cell">' + tagHtml + '</td>' +
                                    '<td class="text-muted">' + fmtDate(p.published_at) + '</td>' +
                                    '<td class="text-muted">' + fmtDate(p.created_at) + '</td>' +
                                    '<td style="white-space:nowrap">' +
                                    '<button class="btn btn-sm btn-secondary blog-edit-btn" data-id="' + escapeHtml(p.id) + '">Edit</button>' +
                                    ' <button class="btn btn-sm btn-danger blog-del-btn" data-id="' + escapeHtml(p.id) + '" aria-label="Delete post">&#128465;</button>' +
                                    '</td>' +
                                    '</tr>';
                            }).join('');

                            // bind row action buttons
                            tbody.querySelectorAll('.blog-edit-btn').forEach(function (btn) {
                                btn.addEventListener('click', function () {
                                    const post = blogPosts.find(function (p) { return p.id === btn.dataset.id; });
                                    if (post) openBlogModal(post);
                                });
                            });
                            tbody.querySelectorAll('.blog-del-btn').forEach(function (btn) {
                                btn.addEventListener('click', function () {
                                    deleteBlogPost(btn.dataset.id);
                                });
                            });
                        }

                        // ── fetch all posts ───────────────────────────────────────
                        async function fetchBlogPosts() {
                            const btn = $('blog-refresh-btn');
                            if (btn) { btn.disabled = true; btn.textContent = 'Loading\u2026'; }
                            try {
                                const data = await api('/api/blog?status=all');
                                blogPosts = Array.isArray(data) ? data : (data.posts || []);
                                updateBlogStats(blogPosts);
                                populateBlogSeriesFilter();
                                renderBlogTable();
                            } catch (err) {
                                console.error('[blog] fetch failed', err);
                                const tbody = $('blog-posts-tbody');
                                if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-muted">Failed to load posts. Check auth and worker deployment.</td></tr>';
                            } finally {
                                if (btn) { btn.disabled = false; btn.textContent = 'Refresh'; }
                            }
                        }

                        // ── modal open / close ────────────────────────────────────
                        function openBlogModal(post) {
                            blogEditingId = post ? post.id : null;
                            blogSlugManuallyEdited = !!post;

                            const titleEl = $('blog-modal-title');
                            if (titleEl) titleEl.textContent = post ? 'Edit Post' : 'New Blog Post';

                            setValue('blog-post-id', post ? post.id : '');
                            setValue('blog-post-title', post ? post.title : '');
                            setValue('blog-post-slug', post ? post.slug : '');
                            setValue('blog-post-excerpt', post ? post.excerpt : '');
                            setValue('blog-post-content', post ? post.content : '');
                            setValue('blog-post-tags', post ? (post.tags || '') : '');
                            setValue('blog-post-status', post ? post.status : 'draft');
                            setValue('blog-post-series', post ? (post.series || '') : '');
                            // Featured image
                            const featImgUrl = post ? (post.featured_image || '') : '';
                            setValue('blog-featured-image', featImgUrl);
                            setValue('blog-featured-image-url', featImgUrl);
                            updateFeaturedImagePreview(featImgUrl);
                            // SEO fields
                            setValue('blog-seo-description', post ? (post.seo_description || '') : '');
                            setValue('blog-seo-og-image', post ? (post.seo_og_image || '') : '');
                            updateCharCount('blog-seo-description', 'blog-seo-desc-count');

                            updateSlugPreview(post ? post.slug : '');
                            updateCharCount('blog-post-title', 'blog-title-count');
                            updateCharCount('blog-post-excerpt', 'blog-excerpt-count');

                            // reset autosave dots to "saved" when opening existing or clean "not saved" for new
                            const savedState = !!post;
                            [$('blog-autosave-dot'), $('blog-autosave-dot-header')].forEach(function (dot) {
                                if (!dot) return;
                                dot.classList.toggle('saved', savedState);
                                dot.classList.toggle('unsaved', !savedState);
                            });
                            const lbl = $('blog-autosave-label');
                            if (lbl) lbl.textContent = savedState ? 'Saved' : 'Not saved';
                            const hLbl = $('blog-autosave-header-label');
                            if (hLbl) hLbl.textContent = savedState ? '' : 'New';

                            // initialise statusbar counters
                            const ta = $('blog-post-content');
                            if (ta) {
                                const text = ta.value;
                                const wc = $('blog-word-count');
                                const cc = $('blog-char-count');
                                const lc = $('blog-line-count');
                                if (wc) wc.textContent = text.trim() ? text.trim().split(/\s+/).length : 0;
                                if (cc) cc.textContent = text.length;
                                if (lc) lc.textContent = text.split('\n').length;
                            }

                            const deleteBtn = $('blog-delete-btn');
                            if (deleteBtn) deleteBtn.classList.toggle('d-none', !post);

                            const saveBtn = $('blog-save-btn');
                            if (saveBtn) saveBtn.textContent = post ? 'Save Changes' : 'Create Post';

                            openModal('blog-post-modal');
                        }

                        function setValue(id, val) {
                            const el = $(id);
                            if (el) el.value = val || '';
                        }

                        function updateSlugPreview(slug) {
                            const preview = $('blog-slug-preview');
                            if (preview) preview.textContent = slug || 'auto-generated';
                        }

                        function updateCharCount(inputId, countId) {
                            const input = $(inputId);
                            const counter = $(countId);
                            if (input && counter) counter.textContent = input.value.length;
                        }

                        function updateFeaturedImagePreview(url) {
                            const preview = $('blog-featured-image-preview');
                            const thumb = $('blog-featured-image-thumb');
                            if (!preview || !thumb) return;
                            if (url && url.trim()) {
                                thumb.src = url.trim();
                                preview.style.display = 'block';
                            } else {
                                thumb.src = '#';
                                preview.style.display = 'none';
                            }
                        }

                        // ── blog image picker (reuses asset-picker-modal) ────────
                        let _blogImagePickerMode = ''; // 'featured' | 'insert'

                        function openBlogImagePicker(mode) {
                            _blogImagePickerMode = mode;
                            const modal = $('asset-picker-modal');
                            if (!modal) return;
                            // Reset search
                            const searchEl = $('asset-picker-search');
                            if (searchEl) searchEl.value = '';
                            const brandEl = $('asset-picker-brand');
                            if (brandEl) brandEl.value = 'gfv';
                            modal.classList.remove('d-none');
                            searchAssets();
                            if (searchEl) searchEl.focus();
                            // Override click handler on grid items for blog context
                            modal.dataset.blogPicker = '1';
                        }

                        function closeBlogImagePicker() {
                            const modal = $('asset-picker-modal');
                            if (modal) {
                                modal.classList.add('d-none');
                                delete modal.dataset.blogPicker;
                            }
                        }

                        // ── save (create or update) ───────────────────────────────
                        async function saveBlogPost() {
                            const saveBtn = $('blog-save-btn');
                            const title = ($('blog-post-title') || {}).value || '';
                            let slug = ($('blog-post-slug') || {}).value || '';
                            const excerpt = ($('blog-post-excerpt') || {}).value || '';
                            const content = ($('blog-post-content') || {}).value || '';
                            const tags = ($('blog-post-tags') || {}).value || '';
                            const status = ($('blog-post-status') || {}).value || 'draft';
                            const series = ($('blog-post-series') || {}).value || '';
                            const featuredImage = ($('blog-featured-image-url') || {}).value || '';
                            const seoDescription = ($('blog-seo-description') || {}).value || '';
                            const seoOgImage = ($('blog-seo-og-image') || {}).value || '';

                            if (!title.trim()) {
                                toast('Title is required.', 'error');
                                return;
                            }
                            if (!slug.trim()) slug = slugify(title);

                            if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving\u2026'; }

                            try {
                                const body = { title: title.trim(), slug: slug.trim(), excerpt: excerpt.trim(), content: content, tags: tags.trim(), status: status, series: series.trim(), featured_image: featuredImage.trim(), seo_description: seoDescription.trim(), seo_og_image: seoOgImage.trim() };
                                if (blogEditingId) body.id = blogEditingId;

                                await api('/api/blog', {
                                    method: blogEditingId ? 'PUT' : 'POST',
                                    body: body
                                });

                                // mark autosave dots as saved
                                [$('blog-autosave-dot'), $('blog-autosave-dot-header')].forEach(function (dot) {
                                    if (dot) { dot.classList.remove('unsaved'); dot.classList.add('saved'); }
                                });
                                const lbl = $('blog-autosave-label');
                                if (lbl) lbl.textContent = 'Saved';
                                const hLbl = $('blog-autosave-header-label');
                                if (hLbl) hLbl.textContent = 'Saved';

                                closeModal('blog-post-modal');
                                await fetchBlogPosts();
                            } catch (err) {
                                console.error('[blog] save failed', err);
                                toast('Save failed: ' + (err.message || 'Unknown error'), 'error');
                            } finally {
                                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = blogEditingId ? 'Save Changes' : 'Create Post'; }
                            }
                        }

                        // ── delete ────────────────────────────────────────────────
                        async function deleteBlogPost(id) {
                            if (!id) return;
                            const post = blogPosts.find(function (p) { return p.id === id; });
                            const title = post ? post.title : 'this post';
                            showConfirm('Permanently delete "' + title + '"? This cannot be undone.', async function () {
                                try {
                                    await api('/api/blog?id=' + encodeURIComponent(id), { method: 'DELETE' });
                                    closeModal('blog-post-modal');
                                    await fetchBlogPosts();
                                } catch (err) {
                                    console.error('[blog] delete failed', err);
                                    toast('Delete failed: ' + (err.message || 'Unknown error'), 'error');
                                }
                            });
                        }

                        // ── event wiring ──────────────────────────────────────────
                        function wireBlogEvents() {
                            // nav → new post
                            const newBtn = $('blog-new-btn');
                            if (newBtn) newBtn.addEventListener('click', function () { openBlogModal(null); });

                            // refresh
                            const refreshBtn = $('blog-refresh-btn');
                            if (refreshBtn) refreshBtn.addEventListener('click', fetchBlogPosts);

                            // sortable column headers
                            document.querySelectorAll('#blog-posts-table th.sortable[data-sort]').forEach(function (th) {
                                th.style.cursor = 'pointer';
                                th.addEventListener('click', function () {
                                    const col = th.dataset.sort;
                                    if (blogSortCol === col) {
                                        blogSortDir = blogSortDir === 'asc' ? 'desc' : 'asc';
                                    } else {
                                        blogSortCol = col;
                                        blogSortDir = 'asc';
                                    }
                                    renderBlogTable();
                                });
                            });

                            // save
                            const saveBtn = $('blog-save-btn');
                            if (saveBtn) saveBtn.addEventListener('click', saveBlogPost);

                            // delete (from modal)
                            const deleteBtn = $('blog-delete-btn');
                            if (deleteBtn) deleteBtn.addEventListener('click', function () { deleteBlogPost(blogEditingId); });

                            // featured image URL input → live preview
                            const featImgInput = $('blog-featured-image-url');
                            if (featImgInput) {
                                featImgInput.addEventListener('input', function () {
                                    updateFeaturedImagePreview(this.value);
                                });
                            }

                            // featured image pick button → open blog image picker
                            const featPickBtn = $('blog-featured-image-pick-btn');
                            if (featPickBtn) {
                                featPickBtn.addEventListener('click', function () {
                                    openBlogImagePicker('featured');
                                });
                            }

                            // insert image ribbon button
                            const insertImgBtn = $('blog-insert-image-btn');
                            if (insertImgBtn) {
                                insertImgBtn.addEventListener('click', function () {
                                    openBlogImagePicker('insert');
                                });
                            }

                            // SEO description char count
                            const seoDescInput = $('blog-seo-description');
                            if (seoDescInput) {
                                seoDescInput.addEventListener('input', function () {
                                    updateCharCount('blog-seo-description', 'blog-seo-desc-count');
                                });
                            }

                            // title → auto-slug + char count
                            const titleInput = $('blog-post-title');
                            if (titleInput) {
                                titleInput.addEventListener('input', function () {
                                    updateCharCount('blog-post-title', 'blog-title-count');
                                    if (!blogSlugManuallyEdited) {
                                        const generated = slugify(titleInput.value);
                                        setValue('blog-post-slug', generated);
                                        updateSlugPreview(generated);
                                    }
                                });
                            }

                            // slug → manual edit detection
                            const slugInput = $('blog-post-slug');
                            if (slugInput) {
                                slugInput.addEventListener('input', function () {
                                    blogSlugManuallyEdited = true;
                                    updateSlugPreview(slugInput.value);
                                });
                            }

                            // excerpt char count
                            const excerptInput = $('blog-post-excerpt');
                            if (excerptInput) {
                                excerptInput.addEventListener('input', function () {
                                    updateCharCount('blog-post-excerpt', 'blog-excerpt-count');
                                });
                            }

                            // filter / search → re-render
                            ['blog-search', 'blog-filter-status', 'blog-filter-series', 'blog-filter-sort'].forEach(function (id) {
                                const el = $(id);
                                if (el) el.addEventListener('input', renderBlogTable);
                            });

                            // markdown ribbon toolbar
                            document.querySelectorAll('.blog-ribbon-btn[data-md]').forEach(function (btn) {
                                btn.addEventListener('click', function () {
                                    const textarea = $('blog-post-content');
                                    if (textarea) insertMarkdown(textarea, btn.dataset.md);
                                });
                            });

                            // ── live markdown preview ─────────────────────────────
                            const editorSplit = $('blog-editor-split');
                            const previewPane = $('blog-preview-pane');
                            const contentArea = $('blog-post-content');

                            function renderBlogMD(md) {
                                if (!md) return '<p style="color:var(--text-muted);font-style:italic">Nothing to preview yet.</p>';
                                let html = md;
                                // code blocks first (before inline code)
                                html = html.replace(/```[\w]*\n?([\s\S]*?)```/g, function (_, code) {
                                    return '<pre><code>' + code.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</code></pre>';
                                });
                                // inline code
                                html = html.replace(/`([^`]+)`/g, function (_, c) {
                                    return '<code>' + c.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</code>';
                                });
                                // headings
                                html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
                                html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
                                html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
                                html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
                                html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
                                html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
                                // blockquote
                                html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');
                                // horizontal rule
                                html = html.replace(/^---+$/gm, '<hr>');
                                // bold + italic
                                html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
                                html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                                html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
                                // links
                                html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
                                // unordered lists
                                html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
                                html = html.replace(/(<li>[\s\S]*?<\/li>)(\n(?!<li>)|$)/g, '<ul>$1</ul>\n');
                                // paragraphs: double newlines → <p>
                                html = html.split(/\n{2,}/).map(function (block) {
                                    if (/^<(h[1-6]|pre|ul|ol|hr|blockquote)/.test(block.trim())) return block;
                                    block = block.replace(/\n/g, '<br>');
                                    return '<p>' + block + '</p>';
                                }).join('\n');
                                return html;
                            }

                            function updatePreview() {
                                if (previewPane && contentArea) {
                                    previewPane.innerHTML = renderBlogMD(contentArea.value);
                                }
                            }

                            // word / char / line counter + autosave dot
                            function updateEditorStats(ta) {
                                const text = ta.value;
                                const words = text.trim() ? text.trim().split(/\s+/).length : 0;
                                const wc = $('blog-word-count');
                                const cc = $('blog-char-count');
                                const lc = $('blog-line-count');
                                if (wc) wc.textContent = words;
                                if (cc) cc.textContent = text.length;
                                if (lc) lc.textContent = text.split('\n').length;
                                // mark autosave dots as unsaved
                                [$('blog-autosave-dot'), $('blog-autosave-dot-header')].forEach(function (dot) {
                                    if (dot) { dot.classList.remove('saved'); dot.classList.add('unsaved'); }
                                });
                                const lbl = $('blog-autosave-label');
                                if (lbl) lbl.textContent = 'Unsaved changes';
                                const hLbl = $('blog-autosave-header-label');
                                if (hLbl) hLbl.textContent = 'Unsaved';
                            }

                            if (contentArea) {
                                contentArea.addEventListener('input', function () {
                                    updatePreview();
                                    updateEditorStats(contentArea);
                                });
                                updateEditorStats(contentArea); // initialise counters
                            }

                            // view mode toggle buttons
                            document.querySelectorAll('.blog-ribbon-view-btn[data-blog-view]').forEach(function (btn) {
                                btn.addEventListener('click', function () {
                                    document.querySelectorAll('.blog-ribbon-view-btn').forEach(function (b) { b.classList.remove('active'); });
                                    btn.classList.add('active');
                                    const mode = btn.dataset.blogView;
                                    if (editorSplit) {
                                        editorSplit.className = 'blog-editor-split mode-' + mode;
                                    }
                                    if (mode === 'preview' || mode === 'split') updatePreview();
                                });
                            });
                        }

                        // ── hook into nav switching ───────────────────────────────
                        // Patch the existing nav-click handler to trigger a fetch when
                        // the Blog Manager view becomes active for the first time.
                        let blogLoaded = false;
                        const origNavHandler = document.querySelector('[data-view="blog-manager"]');
                        if (origNavHandler) {
                            origNavHandler.addEventListener('click', function () {
                                if (!blogLoaded) {
                                    blogLoaded = true;
                                    fetchBlogPosts();
                                }
                            });
                        }

                        wireBlogEvents();

                        // ── Comment Moderation ────────────────────────────────────
                        async function loadComments() {
                            const tbody = $('blog-comments-tbody');
                            const countEl = $('blog-comments-count');
                            if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-muted">Loading…</td></tr>';
                            try {
                                const data = await api('/api/comments/all');
                                const comments = Array.isArray(data) ? data : (data.comments || []);
                                if (countEl) countEl.textContent = comments.length;
                                if (!tbody) return;
                                if (!comments.length) {
                                    tbody.innerHTML = '<tr><td colspan="5" class="text-muted">No comments found.</td></tr>';
                                    return;
                                }
                                tbody.innerHTML = comments.map(function (c) {
                                    const snippet = (c.content || c.body || '').slice(0, 100) + ((c.content || c.body || '').length > 100 ? '…' : '');
                                    return '<tr>' +
                                        '<td>' + escapeHtml(c.article_title || c.article_id || '—') + '</td>' +
                                        '<td>' + escapeHtml(c.author_name || c.user_id || '—') + '</td>' +
                                        '<td style="max-width:240px;word-break:break-word;font-size:0.8rem">' + escapeHtml(snippet) + '</td>' +
                                        '<td class="text-muted">' + escapeHtml(formatDateTime(c.created_at)) + '</td>' +
                                        '<td><button class="btn btn-sm btn-danger blog-comment-del-btn" data-comment-id="' + escapeHtml(c.id) + '" aria-label="Delete comment">🗑</button></td>' +
                                        '</tr>';
                                }).join('');
                                tbody.querySelectorAll('.blog-comment-del-btn').forEach(function (btn) {
                                    btn.addEventListener('click', function () { deleteComment(btn.dataset.commentId); });
                                });
                            } catch (e) {
                                if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-muted">Failed: ' + escapeHtml(e.message) + '</td></tr>';
                            }
                        }

                        async function deleteComment(commentId) {
                            showConfirm('Delete this comment permanently?', async function () {
                                try {
                                    await api('/api/comments', { method: 'DELETE', body: { commentId: commentId } });
                                    toast('Comment deleted.', 'success');
                                    loadComments();
                                } catch (e) {
                                    toast('Delete failed: ' + e.message, 'error');
                                }
                            });
                        }

                        const cmtRefBtn = $('blog-comments-refresh-btn');
                        if (cmtRefBtn) cmtRefBtn.addEventListener('click', loadComments);

                        // Auto-load comments when blog panel opens
                        const origBlogNav = document.querySelector('[data-view="blog-manager"]');
                        if (origBlogNav) {
                            origBlogNav.addEventListener('click', function () { loadComments(); });
                        }
                    })();
                    // ─── End Blog Manager ─────────────────────────────────────────

                    // =================================================================
                    // ANALYTICS PANEL (panel 15)
                    // =================================================================
                    (function initAnalyticsPanel() {
                        'use strict';

                        function renderTagCloud(elId, mapObj, cssClass) {
                            const el = $(elId);
                            if (!el) return;
                            const entries = Object.entries(mapObj).sort(function (a, b) { return b[1] - a[1]; });
                            el.innerHTML = entries.length
                                ? entries.map(function (e) {
                                    return '<span class="tag ' + cssClass + '" style="font-size:0.8rem">' +
                                        escapeHtml(e[0]) + ' <strong>' + e[1] + '</strong></span>';
                                }).join('')
                                : '<span class="text-muted" style="font-size:0.85rem">No data yet.</span>';
                        }

                        function rate(pub, fail) {
                            return (pub + fail) > 0
                                ? ((pub / (pub + fail)) * 100).toFixed(1) + '%'
                                : '—';
                        }

                        function rateClass(pub, fail) {
                            if ((pub + fail) === 0) return '';
                            const r = pub / (pub + fail) * 100;
                            if (r >= 90) return 'emerald';
                            if (r >= 70) return 'gold';
                            return 'rose';
                        }

                        async function load() {
                            try {
                                const variants = state.variants || [];
                                const publishedV = variants.filter(function (v) { return v.status === 'published'; });
                                const failedV = variants.filter(function (v) { return v.status === 'failed'; });
                                const scheduledV = variants.filter(function (v) { return v.status === 'scheduled'; });
                                const campaignCount = (state.campaigns || []).length;

                                const pub = publishedV.length;
                                const fail = failedV.length;
                                const sched = scheduledV.length;

                                const delivKlass = rateClass(pub, fail);
                                const delivEl = $('an-delivery-rate');

                                $('an-published').textContent = pub;
                                $('an-failed').textContent = fail;
                                $('an-scheduled').textContent = sched;
                                $('an-campaigns').textContent = campaignCount;
                                if (delivEl) {
                                    delivEl.textContent = rate(pub, fail);
                                    delivEl.className = 'panel-kpi-value ' + delivKlass;
                                }

                                // Published by platform tag cloud
                                const byPlatform = {};
                                publishedV.forEach(function (v) {
                                    const p = v.platform || 'unknown';
                                    byPlatform[p] = (byPlatform[p] || 0) + 1;
                                });
                                renderTagCloud('analytics-by-platform', byPlatform, 'ok');

                                // Published by brand tag cloud
                                const byBrandPub = {};
                                publishedV.forEach(function (v) {
                                    const b = v.brand || 'unknown';
                                    byBrandPub[b] = (byBrandPub[b] || 0) + 1;
                                });
                                renderTagCloud('analytics-by-brand', byBrandPub, 'cyan');

                                // Brand performance breakdown table
                                const brandMap = {};
                                variants.forEach(function (v) {
                                    const b = v.brand || 'unknown';
                                    if (!brandMap[b]) brandMap[b] = { pub: 0, fail: 0, sched: 0, campaigns: new Set() };
                                    if (v.status === 'published') brandMap[b].pub++;
                                    else if (v.status === 'failed') brandMap[b].fail++;
                                    else if (v.status === 'scheduled') brandMap[b].sched++;
                                    if (v.campaign_id) brandMap[b].campaigns.add(v.campaign_id);
                                });
                                const brandTbody = $('analytics-brand-tbody');
                                if (brandTbody) {
                                    const rows = Object.entries(brandMap).sort(function (a, b) { return b[1].pub - a[1].pub; });
                                    brandTbody.innerHTML = rows.length
                                        ? rows.map(function (entry) {
                                            const b = entry[0], s = entry[1];
                                            const r = rate(s.pub, s.fail);
                                            const rc = rateClass(s.pub, s.fail);
                                            return '<tr>' +
                                                '<td>' + escapeHtml(b) + '</td>' +
                                                '<td>' + s.pub + '</td>' +
                                                '<td>' + s.fail + '</td>' +
                                                '<td>' + s.sched + '</td>' +
                                                '<td><span class="' + rc + '">' + r + '</span></td>' +
                                                '<td>' + s.campaigns.size + '</td>' +
                                                '</tr>';
                                        }).join('')
                                        : '<tr><td colspan="6" class="text-muted">No variant data found.</td></tr>';
                                }

                                // Recent published variants table (last 50, sorted newest first)
                                const recent = publishedV
                                    .sort(function (a, b) { return new Date(b.scheduled_at || 0) - new Date(a.scheduled_at || 0); })
                                    .slice(0, 50);
                                const tbody = $('analytics-variants-tbody');
                                if (tbody) {
                                    tbody.innerHTML = recent.length
                                        ? recent.map(function (v) {
                                            const raw = v.content || v.caption || '';
                                            const caption = raw.slice(0, 70) + (raw.length > 70 ? '…' : '');
                                            return '<tr>' +
                                                '<td>' + escapeHtml(caption || '—') + '</td>' +
                                                '<td><span class="tag ok">' + escapeHtml(v.platform || '—') + '</span></td>' +
                                                '<td>' + escapeHtml(v.campaign_name || '—') + '</td>' +
                                                '<td>' + escapeHtml(v.brand || '—') + '</td>' +
                                                '<td>' + escapeHtml(formatDateTime(v.scheduled_at)) + '</td>' +
                                                '</tr>';
                                        }).join('')
                                        : '<tr><td colspan="5" class="text-muted">No published variants found.</td></tr>';
                                }
                            } catch (e) {
                                console.error('[analytics panel]', e);
                            }
                        }

                        const refBtn = $('analytics-refresh-btn');
                        if (refBtn) refBtn.addEventListener('click', load);

                        window.__adminPanels = window.__adminPanels || {};
                        window.__adminPanels.analytics = load;
                    })();

                    // =================================================================
                    // ASSET INTELLIGENCE PANEL (panel 27)
                    // =================================================================
                    (function initAssetIntelPanel() {
                        'use strict';

                        function rateClass(num, total) {
                            if (!total) return '';
                            const pct = (num / total) * 100;
                            if (pct >= 80) return 'emerald';
                            if (pct >= 50) return 'gold';
                            return 'rose';
                        }

                        function shortDate(iso) {
                            if (!iso) return '—';
                            try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }); }
                            catch (_) { return iso.slice(0, 10); }
                        }

                        async function load() {
                            try {
                                const data = await api('/assets/analytics');

                                const total = data.total || 0;
                                const byStatus = data.by_status || [];
                                const byBrand = data.by_brand || [];
                                const byType = data.by_media_type || [];
                                const byCat = data.by_category || [];
                                const pending = data.oldest_pending || [];
                                const approved = data.recently_approved || [];

                                const approvedCount = (byStatus.find(function (s) { return s.review_status === 'approved'; }) || {}).count || 0;
                                const pendingCount = (byStatus.filter(function (s) { return s.review_status === 'draft' || s.review_status === 'pending'; })
                                    .reduce(function (sum, s) { return sum + (s.count || 0); }, 0));
                                const rejectedCount = (byStatus.find(function (s) { return s.review_status === 'rejected'; }) || {}).count || 0;
                                const approvalPct = total ? ((approvedCount / total) * 100).toFixed(1) + '%' : '—';

                                $('ai-total').textContent = total.toLocaleString();
                                $('ai-approved').textContent = approvedCount.toLocaleString();
                                $('ai-pending').textContent = pendingCount.toLocaleString();
                                $('ai-rejected').textContent = rejectedCount.toLocaleString();

                                const rateEl = $('ai-approval-rate');
                                rateEl.textContent = approvalPct;
                                rateEl.className = 'panel-kpi-value ' + rateClass(approvedCount, total);

                                // Media type tag cloud
                                const typeEl = $('ai-by-type');
                                typeEl.innerHTML = byType.length
                                    ? byType.map(function (t) {
                                        return '<span class="tag cyan" style="font-size:0.82rem">' +
                                            escapeHtml(t.media_type || '?') + ' <strong>' + t.count + '</strong></span>';
                                    }).join('')
                                    : '<span class="text-muted">No data</span>';

                                // Category tag cloud
                                const catEl = $('ai-by-category');
                                catEl.innerHTML = byCat.length
                                    ? byCat.map(function (c) {
                                        return '<span class="tag" style="font-size:0.76rem;background:var(--border)">' +
                                            escapeHtml(c.category || '?') + ' <strong>' + c.count + '</strong></span>';
                                    }).join('')
                                    : '<span class="text-muted">No data</span>';

                                // Brand breakdown table
                                const brandTbody = $('ai-brand-tbody');
                                brandTbody.innerHTML = byBrand.length
                                    ? byBrand.map(function (b) {
                                        const pct = b.total ? ((b.approved / b.total) * 100).toFixed(0) + '%' : '—';
                                        const cls = rateClass(b.approved, b.total);
                                        return '<tr>' +
                                            '<td><strong>' + escapeHtml(b.brand || '?') + '</strong></td>' +
                                            '<td>' + (b.total || 0) + '</td>' +
                                            '<td class="emerald">' + (b.approved || 0) + '</td>' +
                                            '<td class="gold">' + (b.pending || 0) + '</td>' +
                                            '<td class="rose">' + (b.rejected || 0) + '</td>' +
                                            '<td>' + (b.featured || 0) + '</td>' +
                                            '<td><span class="' + cls + '">' + pct + '</span></td>' +
                                            '</tr>';
                                    }).join('')
                                    : '<tr><td colspan="7" class="text-muted">No brand data.</td></tr>';

                                // Oldest pending — with quick-approve action
                                const pendTbody = $('ai-pending-tbody');
                                pendTbody.innerHTML = pending.length
                                    ? pending.map(function (a) {
                                        return '<tr>' +
                                            '<td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escapeHtml(a.title) + '">' + escapeHtml(a.title) + '</td>' +
                                            '<td>' + escapeHtml(a.brand || '—') + '</td>' +
                                            '<td>' + escapeHtml(a.category || '—') + '</td>' +
                                            '<td style="white-space:nowrap">' + shortDate(a.created_at) + '</td>' +
                                            '<td><button class="btn btn-micro btn-success-soft" data-quick-approve="' + escapeHtml(String(a.id)) + '" title="Approve">&#10003;</button></td>' +
                                            '</tr>';
                                    }).join('')
                                    : '<tr><td colspan="5" class="emerald">Queue clear — no unreviewed assets!</td></tr>';

                                // Quick-approve handlers
                                pendTbody.querySelectorAll('[data-quick-approve]').forEach(function (btn) {
                                    btn.addEventListener('click', async function () {
                                        btn.disabled = true;
                                        btn.textContent = '…';
                                        await reviewAsset(btn.dataset.quickApprove, 'approve');
                                        load();
                                    });
                                });

                                // Recently approved table
                                const appTbody = $('ai-approved-tbody');
                                appTbody.innerHTML = approved.length
                                    ? approved.map(function (a) {
                                        return '<tr>' +
                                            '<td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escapeHtml(a.title) + '">' + escapeHtml(a.title) + '</td>' +
                                            '<td>' + escapeHtml(a.brand || '—') + '</td>' +
                                            '<td>' + escapeHtml(a.category || '—') + '</td>' +
                                            '<td style="white-space:nowrap">' + shortDate(a.approved_at) + '</td>' +
                                            '</tr>';
                                    }).join('')
                                    : '<tr><td colspan="4" class="text-muted">No approved assets yet.</td></tr>';

                            } catch (e) {
                                console.error('[asset-intel panel]', e);
                                toast('Asset Intel load failed: ' + e.message, 'error');
                            }
                        }

                        const refBtn = $('asset-intel-refresh-btn');
                        if (refBtn) refBtn.addEventListener('click', load);

                        window.__adminPanels = window.__adminPanels || {};
                        window.__adminPanels['asset-intel'] = load;
                    })();

                    // =================================================================
                    // ASSET USAGE GRAPH PANEL (panel 29)
                    // =================================================================
                    (function initAssetUsagePanel() {
                        'use strict';

                        const PLATFORM_COLORS = {
                            instagram: 'violet', x: 'cyan', linkedin: 'emerald',
                            youtube: 'rose', threads: 'gold', pinterest: 'rose', tiktok: 'violet',
                        };

                        function fmt(d) {
                            if (!d) return '—';
                            const dt = new Date(d);
                            return isNaN(dt) ? d : dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
                        }

                        function renderBarList(containerId, rows, labelKey, valueKey, colorClass) {
                            const el = document.getElementById(containerId);
                            if (!el) return;
                            if (!rows.length) { el.innerHTML = '<p class="text-muted" style="font-size:.8rem">No data</p>'; return; }
                            const max = Math.max(...rows.map(r => r[valueKey] || 0)) || 1;
                            el.innerHTML = rows.map(r => {
                                const pct = Math.round(((r[valueKey] || 0) / max) * 100);
                                const cls = colorClass || PLATFORM_COLORS[r[labelKey]] || 'cyan';
                                return `<div class="au-bar-row">
                                    <span class="au-bar-label" title="${escapeHtml(String(r[labelKey]))}">${escapeHtml(String(r[labelKey]))}</span>
                                    <div class="au-bar-track"><div class="au-bar-fill ${cls}" style="width:${pct}%"></div></div>
                                    <span class="au-bar-count">${r[valueKey] || 0}</span>
                                </div>`;
                            }).join('');
                        }

                        function renderTopTable(assets) {
                            const tbody = document.getElementById('au-top-tbody');
                            if (!tbody) return;
                            if (!assets.length) {
                                tbody.innerHTML = '<tr><td colspan="9" class="text-muted">No assets linked to post variants yet.</td></tr>';
                                return;
                            }
                            tbody.innerHTML = assets.map(a => `
                                <tr>
                                    <td>${escapeHtml(a.title || a.id)}</td>
                                    <td><span class="tag">${escapeHtml(a.brand || '—')}</span></td>
                                    <td>${escapeHtml(a.media_type || '—')}</td>
                                    <td style="color:var(--text-muted);font-size:.8rem">${escapeHtml(a.category || '—')}</td>
                                    <td><strong>${a.use_count || 0}</strong></td>
                                    <td class="emerald">${a.published || 0}</td>
                                    <td class="gold">${a.pending || 0}</td>
                                    <td class="rose">${a.failed || 0}</td>
                                    <td style="color:var(--text-muted);font-size:.78rem">${fmt(a.last_used)}</td>
                                </tr>`).join('');
                        }

                        async function load() {
                            let total = '—';
                            let d;
                            try {
                                const td = await api('/assets?limit=1');
                                if (td && typeof td.total === 'number') total = td.total;
                            } catch { /* total stays '—' */ }
                            try {
                                d = await api('/assets/usage');
                            } catch {
                                ['au-total', 'au-used', 'au-never', 'au-rate'].forEach(id => {
                                    const el = document.getElementById(id);
                                    if (el) el.textContent = 'Error';
                                });
                                return;
                            }
                            const usedCount = d.used_count || 0;
                            const neverUsed = d.never_used || 0;
                            const grandTotal = usedCount + neverUsed;
                            const rate = grandTotal ? Math.round((usedCount / grandTotal) * 100) : 0;

                            const auTotal = document.getElementById('au-total');
                            const auUsed = document.getElementById('au-used');
                            const auNever = document.getElementById('au-never');
                            const auRate = document.getElementById('au-rate');

                            if (auTotal) auTotal.textContent = grandTotal || total;
                            if (auUsed) auUsed.textContent = usedCount;
                            if (auNever) auNever.textContent = neverUsed;
                            if (auRate) {
                                auRate.textContent = `${rate}%`;
                                auRate.className = `panel-kpi-value ${rate >= 60 ? 'emerald' : rate >= 30 ? 'gold' : 'rose'}`;
                            }

                            renderBarList('au-by-platform', d.by_platform || [], 'platform', 'use_count');
                            renderBarList('au-by-month', d.by_month || [], 'month', 'count', 'cyan');
                            renderTopTable(d.top_assets || []);
                        }

                        const refBtn = document.getElementById('au-refresh-btn');
                        if (refBtn) refBtn.addEventListener('click', load);

                        window.__adminPanels = window.__adminPanels || {};
                        window.__adminPanels['asset-usage'] = load;
                    })();

                    // =================================================================
                    // AUTOMATION CENTER PANEL (panel 30)
                    // =================================================================
                    (function initAutomationCenterPanel() {
                        'use strict';

                        function fmt(iso) {
                            if (!iso) return '—';
                            const d = new Date(iso);
                            return isNaN(d) ? iso : d.toLocaleString();
                        }

                        function renderBarList(containerId, rows, labelKey, valueKey, colorClass) {
                            const el = document.getElementById(containerId);
                            if (!el) return;
                            if (!rows || rows.length === 0) { el.innerHTML = '<span class="text-muted">No data.</span>'; return; }
                            const max = Math.max(...rows.map(r => r[valueKey] || 0), 1);
                            el.innerHTML = rows.map(r => {
                                const pct = Math.round(((r[valueKey] || 0) / max) * 100);
                                return `<div class="au-bar-row"><span class="au-bar-label">${r[labelKey] || '—'}</span><div class="au-bar-track"><div class="au-bar-fill ${colorClass}" style="width:${pct}%"></div></div><span class="au-bar-val">${r[valueKey] || 0}</span></div>`;
                            }).join('');
                        }

                        async function load() {
                            const pending = document.getElementById('auto-pending');
                            const published = document.getElementById('auto-published');
                            const failed = document.getElementById('auto-failed');
                            const lastSweep = document.getElementById('auto-last-sweep');
                            const sweepTbody = document.getElementById('auto-sweep-tbody');
                            const retryTbody = document.getElementById('auto-retry-tbody');

                            if (pending) pending.textContent = '…';
                            if (published) published.textContent = '…';
                            if (failed) failed.textContent = '…';
                            if (lastSweep) lastSweep.textContent = '…';

                            try {
                                const data = await api('/automation-center');

                                // KPI strip — queue snapshot
                                const qMap = {};
                                (data.queue || []).forEach(r => { qMap[r.status] = r.count; });
                                if (pending) pending.textContent = (qMap.pending || qMap.scheduled || 0);
                                if (published) published.textContent = (qMap.published || 0);
                                if (failed) failed.textContent = (qMap.failed || 0);

                                // Last sweep timing
                                if (lastSweep) {
                                    const mins = data.minutes_since_sweep;
                                    lastSweep.textContent = mins === null ? '—' : mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
                                }

                                // Sweep run history table
                                if (sweepTbody) {
                                    const runs = data.sweep_runs || [];
                                    if (runs.length === 0) {
                                        sweepTbody.innerHTML = '<tr><td colspan="6" class="text-muted">No sweep history found.</td></tr>';
                                    } else {
                                        sweepTbody.innerHTML = runs.map(r => {
                                            const allPass = r.failed === 0 && r.warned === 0;
                                            const badge = allPass ? '<span class="status-badge status-pass">pass</span>'
                                                : r.failed > 0 ? '<span class="status-badge status-fail">fail</span>'
                                                    : '<span class="status-badge status-warn">warn</span>';
                                            return `<tr>
                                                <td style="font-size:0.78rem">${fmt(r.checked_at)}</td>
                                                <td>${r.total || 0}</td>
                                                <td class="emerald">${r.passed || 0}</td>
                                                <td class="gold">${r.warned || 0}</td>
                                                <td class="rose">${r.failed || 0}</td>
                                                <td>${badge}</td>
                                            </tr>`;
                                        }).join('');
                                    }
                                }

                                // Failed by brand bar list
                                renderBarList('auto-failed-brand', data.failed_by_brand || [], 'brand', 'failed_count', 'rose');

                                // Retry candidates table
                                if (retryTbody) {
                                    const cands = data.retry_candidates || [];
                                    if (cands.length === 0) {
                                        retryTbody.innerHTML = '<tr><td colspan="7" class="text-muted">No retry candidates — great!</td></tr>';
                                    } else {
                                        retryTbody.innerHTML = cands.map(c => `<tr>
                                            <td style="font-size:0.75rem;font-family:var(--mono)">${c.id ? String(c.id).slice(0, 8) : '—'}</td>
                                            <td>${c.brand || '—'}</td>
                                            <td>${c.platform || '—'}</td>
                                            <td>${c.retry_count ?? 0}</td>
                                            <td style="font-size:0.75rem">${fmt(c.scheduled_at)}</td>
                                            <td style="font-size:0.75rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(c.error_message || '').replace(/"/g, '&quot;')}">${c.error_message || '—'}</td>
                                            <td><button class="btn btn-secondary" style="font-size:0.75rem;padding:0.2rem 0.5rem" data-retry-variant="${c.id}">Retry</button></td>
                                        </tr>`).join('');
                                    }
                                }

                            } catch (err) {
                                if (sweepTbody) sweepTbody.innerHTML = `<tr><td colspan="6" class="text-muted">Error: ${escapeHtml(err.message)}</td></tr>`;
                                if (retryTbody) retryTbody.innerHTML = `<tr><td colspan="7" class="text-muted">Error: ${escapeHtml(err.message)}</td></tr>`;
                            }
                        }

                        document.addEventListener('click', function (e) {
                            const btn = e.target.closest('[data-retry-variant]');
                            if (!btn) return;
                            const id = btn.dataset.retryVariant;
                            btn.disabled = true;
                            btn.textContent = '…';
                            (async function () {
                                try {
                                    await api('/variants/' + encodeURIComponent(id) + '/retry', { method: 'PUT' });
                                    btn.textContent = 'Queued';
                                    btn.style.color = 'var(--emerald)';
                                    setTimeout(load, 1500);
                                } catch (err) {
                                    btn.textContent = 'Error';
                                    btn.style.color = 'var(--rose)';
                                    btn.disabled = false;
                                }
                            })();
                        });

                        const refBtn = document.getElementById('auto-refresh-btn');
                        if (refBtn) refBtn.addEventListener('click', load);

                        window.__adminPanels = window.__adminPanels || {};
                        window.__adminPanels['automation'] = load;
                    })();
                    (function initAiUtilitiesPanel() {
                        'use strict';

                        let selectedAsset = null; // { id, title, brand }

                        const searchInput = document.getElementById('ai-asset-search');
                        const searchBtn = document.getElementById('ai-asset-search-btn');
                        const resultsEl = document.getElementById('ai-asset-results');
                        const selectedEl = document.getElementById('ai-selected-asset');
                        const selectedLbl = document.getElementById('ai-selected-label');
                        const deselectBtn = document.getElementById('ai-deselect-btn');
                        const generateBtn = document.getElementById('ai-generate-btn');
                        const statusMsg = document.getElementById('ai-status-msg');
                        const outputPanel = document.getElementById('ai-output-panel');
                        const captionCards = document.getElementById('ai-caption-cards');
                        const copyAllBtn = document.getElementById('ai-copy-all-btn');
                        const clearBtn = document.getElementById('ai-clear-btn');
                        const toneSelect = document.getElementById('ai-tone-select');

                        function setStatus(msg, color) {
                            if (!statusMsg) return;
                            statusMsg.textContent = msg;
                            statusMsg.style.color = color || 'var(--text-muted)';
                        }

                        function selectAsset(asset) {
                            selectedAsset = asset;
                            if (selectedLbl) selectedLbl.textContent = `${asset.title || 'Untitled'} — ${asset.brand || ''}`;
                            if (selectedEl) selectedEl.style.display = '';
                            if (resultsEl) resultsEl.style.display = 'none';
                            if (generateBtn) generateBtn.disabled = false;
                        }

                        function clearSelection() {
                            selectedAsset = null;
                            if (selectedEl) selectedEl.style.display = 'none';
                            if (generateBtn) generateBtn.disabled = true;
                            if (outputPanel) outputPanel.style.display = 'none';
                            setStatus('');
                        }

                        // Asset search
                        async function searchAssets() {
                            const q = (searchInput?.value || '').trim();
                            if (!q) return;
                            if (resultsEl) resultsEl.innerHTML = '<div style="padding:0.4rem 0.6rem;color:var(--text-muted);font-size:0.82rem">Searching…</div>';
                            if (resultsEl) resultsEl.style.display = '';
                            try {
                                const data = await api('/assets?q=' + encodeURIComponent(q) + '&limit=20');
                                const items = data.assets || data.results || data || [];
                                if (!Array.isArray(items) || items.length === 0) {
                                    resultsEl.innerHTML = '<div style="padding:0.4rem 0.6rem;color:var(--text-muted);font-size:0.82rem">No assets found.</div>';
                                    return;
                                }
                                resultsEl.innerHTML = items.slice(0, 20).map(a =>
                                    `<div class="asset-result-row" style="padding:0.4rem 0.6rem;cursor:pointer;font-size:0.82rem;border-bottom:1px solid var(--border)" data-id="${a.id}" data-title="${(a.title || '').replace(/"/g, '&quot;')}" data-brand="${(a.brand || '').replace(/"/g, '&quot;')}">${a.title || 'Untitled'} <span style="color:var(--text-muted)">${a.brand || ''}</span></div>`
                                ).join('');
                                resultsEl.querySelectorAll('.asset-result-row').forEach(row => {
                                    row.addEventListener('click', () => selectAsset({ id: row.dataset.id, title: row.dataset.title, brand: row.dataset.brand }));
                                    row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,255,255,0.05)'; });
                                    row.addEventListener('mouseleave', () => { row.style.background = ''; });
                                });
                            } catch (err) {
                                if (resultsEl) resultsEl.innerHTML = `<div style="padding:0.4rem 0.6rem;color:var(--rose);font-size:0.82rem">Error: ${escapeHtml(err.message)}</div>`;
                            }
                        }

                        if (searchBtn) searchBtn.addEventListener('click', searchAssets);
                        if (searchInput) searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') searchAssets(); });
                        if (deselectBtn) deselectBtn.addEventListener('click', clearSelection);
                        if (clearBtn) clearBtn.addEventListener('click', () => {
                            clearSelection();
                            if (searchInput) searchInput.value = '';
                            if (resultsEl) { resultsEl.innerHTML = ''; resultsEl.style.display = 'none'; }
                            if (captionCards) captionCards.innerHTML = '';
                        });

                        // Generate captions
                        if (generateBtn) generateBtn.addEventListener('click', async () => {
                            if (!selectedAsset) return;
                            const platforms = Array.from(document.querySelectorAll('input[name="ai-platform"]:checked')).map(el => el.value);
                            if (platforms.length === 0) { setStatus('Select at least one platform.', 'var(--gold)'); return; }
                            const tone = toneSelect?.value || 'casual';

                            generateBtn.disabled = true;
                            setStatus('Generating captions… (Llama 3 8B)', 'var(--text-muted)');
                            if (outputPanel) outputPanel.style.display = 'none';

                            try {
                                const data = await api('/ai/caption', {
                                    method: 'POST',
                                    body: { asset_id: selectedAsset.id, platforms, tone }
                                });
                                renderCaptions(data.captions || {}, platforms);
                                setStatus(data.usage_note || 'Done.', 'var(--emerald)');
                            } catch (err) {
                                setStatus(`Error: ${err.message}`, 'var(--rose)');
                            } finally {
                                generateBtn.disabled = false;
                            }
                        });

                        const PLATFORM_LABELS = {
                            instagram: 'Instagram', facebook: 'Facebook', twitter: 'X / Twitter',
                            linkedin: 'LinkedIn', pinterest: 'Pinterest', threads: 'Threads'
                        };

                        function renderCaptions(captions, platforms) {
                            if (!captionCards) return;
                            captionCards.innerHTML = platforms.map(p => {
                                const text = captions[p] || '(No caption generated)';
                                const charCount = text.length;
                                return `<div class="panel" style="padding:0.7rem;background:rgba(255,255,255,0.02)">
                                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem">
                                        <strong style="font-size:0.85rem">${PLATFORM_LABELS[p] || p}</strong>
                                        <span style="display:flex;gap:0.4rem;align-items:center">
                                            <span style="font-size:0.75rem;color:var(--text-muted)">${charCount} chars</span>
                                            <button class="btn btn-secondary" style="font-size:0.73rem;padding:0.15rem 0.5rem" onclick="navigator.clipboard.writeText(this.closest('[data-caption]')?.dataset.caption||'').then(()=>{this.textContent='Copied!';setTimeout(()=>{this.textContent='Copy'},1500)})">Copy</button>
                                        </span>
                                    </div>
                                    <div data-caption="${text.replace(/"/g, '&quot;')}" style="font-size:0.82rem;line-height:1.5;white-space:pre-wrap;word-break:break-word;color:var(--text)">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                                </div>`;
                            }).join('');
                            // Fix copy buttons to use sibling div's data
                            captionCards.querySelectorAll('.btn').forEach(btn => {
                                btn.onclick = function () {
                                    const card = btn.closest('.panel');
                                    const txt = card?.querySelector('[data-caption]')?.dataset.caption || '';
                                    navigator.clipboard.writeText(txt).then(() => {
                                        btn.textContent = 'Copied!';
                                        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
                                    });
                                };
                            });
                            if (outputPanel) outputPanel.style.display = '';
                        }

                        // Copy all
                        if (copyAllBtn) copyAllBtn.addEventListener('click', () => {
                            const all = Array.from(captionCards?.querySelectorAll('[data-caption]') || [])
                                .map(el => el.dataset.caption).filter(Boolean).join('\n\n---\n\n');
                            if (!all) return;
                            navigator.clipboard.writeText(all).then(() => {
                                copyAllBtn.textContent = 'Copied!';
                                setTimeout(() => { copyAllBtn.textContent = 'Copy All'; }, 1500);
                            });
                        });

                        window.__adminPanels = window.__adminPanels || {};
                        window.__adminPanels['ai-utils'] = function () { clearSelection(); };
                    })();
                    (function initEcoCalPanel() {
                        'use strict';

                        const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                        const activeBrands = new Set(Object.keys(BRAND_DEFS));
                        let weekOffset = 0; // 0 = window starting this Sunday
                        let eventsMap = new Map(); // YYYY-MM-DD → [event, …]
                        let selectedDate = null;

                        function getWindowStart() {
                            const d = new Date();
                            d.setHours(0, 0, 0, 0);
                            d.setDate(d.getDate() - d.getDay()); // rewind to Sunday
                            d.setDate(d.getDate() + weekOffset * 7);
                            return new Date(d);
                        }

                        function toDateStr(d) {
                            return d.toISOString().slice(0, 10);
                        }

                        function fmtDate(d) {
                            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                        }

                        async function load() {
                            const start = getWindowStart();
                            const end = new Date(start);
                            end.setDate(end.getDate() + 34); // 5 full weeks

                            const from = toDateStr(start);
                            const to = toDateStr(end);
                            const brands = [...activeBrands].join(',');

                            const label = $('eco-cal-range-label');
                            if (label) label.textContent = fmtDate(start) + ' – ' + fmtDate(end);

                            const grid = $('eco-cal-grid');
                            if (grid) grid.innerHTML = '<div class="text-muted" style="grid-column:1/-1;padding:1rem">Loading…</div>';

                            try {
                                const data = await api('/ecosystem-calendar?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to) + '&brands=' + encodeURIComponent(brands));
                                eventsMap = new Map();
                                (data.events || []).forEach(function (ev) {
                                    const day = (ev.scheduled_at || '').slice(0, 10);
                                    if (!eventsMap.has(day)) eventsMap.set(day, []);
                                    eventsMap.get(day).push(ev);
                                });
                                renderCalendar(start);
                                if (selectedDate) renderDetail(selectedDate);
                            } catch (e) {
                                toast('Eco Calendar: ' + e.message, 'error');
                                if (grid) grid.innerHTML = '<div class="text-muted" style="grid-column:1/-1;padding:1rem">Failed to load calendar data.</div>';
                            }
                        }

                        function renderCalendar(start) {
                            const grid = $('eco-cal-grid');
                            if (!grid) return;

                            const today = toDateStr(new Date());
                            let html = DAY_NAMES.map(function (d) { return '<div class="eco-cal-hdr">' + d + '</div>'; }).join('');

                            for (let i = 0; i < 35; i++) {
                                const d = new Date(start);
                                d.setDate(d.getDate() + i);
                                const ds = toDateStr(d);
                                const events = eventsMap.get(ds) || [];

                                // Group by brand for dots (max 5 visible)
                                const brandCounts = {};
                                events.forEach(function (ev) { brandCounts[ev.brand] = (brandCounts[ev.brand] || 0) + 1; });
                                const brandEntries = Object.entries(brandCounts);
                                const dots = brandEntries.slice(0, 5).map(function (entry) {
                                    const br = entry[0], cnt = entry[1];
                                    const color = (BRAND_DEFS[br] && BRAND_DEFS[br].color) || '#888';
                                    return '<span class="eco-cal-dot" style="background:' + escapeHtml(color) + '" title="' + escapeHtml(br) + ': ' + cnt + '"></span>';
                                }).join('');
                                const overflow = brandEntries.length > 5 ? '<span class="eco-cal-more">+' + (brandEntries.length - 5) + '</span>' : '';

                                const classes = ['eco-cal-day',
                                    ds === today ? 'eco-cal-today' : '',
                                    ds === selectedDate ? 'eco-cal-selected' : '',
                                    events.length ? 'eco-cal-has-events' : '',
                                ].filter(Boolean).join(' ');

                                html += '<div class="' + classes + '" data-eco-date="' + escapeHtml(ds) + '">' +
                                    '<span class="eco-cal-date-num">' + d.getDate() + '</span>' +
                                    '<div class="eco-cal-dots">' + dots + overflow + '</div>' +
                                    (events.length ? '<span class="eco-cal-count">' + events.length + ' post' + (events.length !== 1 ? 's' : '') + '</span>' : '') +
                                    '</div>';
                            }

                            grid.innerHTML = html;

                            const capturedStart = new Date(start);
                            grid.querySelectorAll('[data-eco-date]').forEach(function (cell) {
                                cell.addEventListener('click', function () {
                                    selectedDate = cell.dataset.ecoDate;
                                    renderCalendar(capturedStart);
                                    renderDetail(selectedDate);
                                });
                            });
                        }

                        function renderDetail(dateStr) {
                            const detail = $('eco-cal-detail');
                            const dateLabel = $('eco-cal-detail-date');
                            const list = $('eco-cal-detail-list');
                            if (!detail || !list) return;

                            const events = eventsMap.get(dateStr) || [];
                            if (!events.length) {
                                detail.classList.add('d-none');
                                return;
                            }

                            detail.classList.remove('d-none');
                            if (dateLabel) {
                                const d = new Date(dateStr + 'T12:00:00Z');
                                dateLabel.textContent = fmtDate(d);
                            }

                            list.innerHTML = events.map(function (ev) {
                                const brandDef = BRAND_DEFS[ev.brand] || {};
                                const color = brandDef.color || '#888';
                                const shortBrand = brandDef.shortName || ev.brand || '';
                                const time = ev.scheduled_at
                                    ? new Date(ev.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                                    : 'No time';
                                const statusClass = ev.status === 'published' ? 'emerald' : ev.status === 'scheduled' ? 'gold' : 'muted';
                                const excerpt = (ev.content_body || '').slice(0, 120);
                                return '<li class="eco-detail-row">' +
                                    '<span class="eco-detail-dot" style="background:' + escapeHtml(color) + '"></span>' +
                                    '<div class="eco-detail-body">' +
                                    '<div class="eco-detail-brand">' + escapeHtml(shortBrand) + ' &middot; ' + escapeHtml(ev.platform || '') + ' &middot; <span class="eco-detail-time">' + escapeHtml(time) + '</span></div>' +
                                    (excerpt ? '<div class="eco-detail-excerpt">' + escapeHtml(excerpt) + (ev.content_body && ev.content_body.length > 120 ? '&hellip;' : '') + '</div>' : '') +
                                    (ev.campaign_name ? '<div class="eco-detail-campaign">&#128203; ' + escapeHtml(ev.campaign_name) + '</div>' : '') +
                                    '</div>' +
                                    '<span class="tag tag-' + statusClass + ' tag-xs">' + escapeHtml(ev.status || '') + '</span>' +
                                    '</li>';
                            }).join('');
                        }

                        function renderBrandFilter() {
                            const row = $('eco-cal-brand-filter');
                            if (!row) return;
                            row.innerHTML = Object.entries(BRAND_DEFS).map(function (entry) {
                                const id = entry[0], def = entry[1];
                                return '<button type="button" class="crosspost-pill ' + (activeBrands.has(id) ? 'active' : '') +
                                    '" data-eco-brand="' + escapeHtml(id) +
                                    '" style="--brand-color:' + escapeHtml(def.color) + '">' +
                                    escapeHtml(def.shortName || def.name) + '</button>';
                            }).join('');
                            row.querySelectorAll('[data-eco-brand]').forEach(function (btn) {
                                btn.addEventListener('click', function () {
                                    const b = btn.dataset.ecoBrand;
                                    if (activeBrands.has(b)) activeBrands.delete(b);
                                    else activeBrands.add(b);
                                    renderBrandFilter();
                                    load();
                                });
                            });
                        }

                        function init() {
                            renderBrandFilter();
                            load();

                            const prev = $('eco-cal-prev');
                            const next = $('eco-cal-next');
                            const todayBtn = $('eco-cal-today');
                            const closeBtn = $('eco-cal-detail-close');

                            if (prev) prev.addEventListener('click', function () { weekOffset--; selectedDate = null; load(); });
                            if (next) next.addEventListener('click', function () { weekOffset++; selectedDate = null; load(); });
                            if (todayBtn) todayBtn.addEventListener('click', function () { weekOffset = 0; selectedDate = null; load(); });
                            if (closeBtn) closeBtn.addEventListener('click', function () {
                                selectedDate = null;
                                const d = $('eco-cal-detail');
                                if (d) d.classList.add('d-none');
                            });
                        }

                        window.__adminPanels = window.__adminPanels || {};
                        window.__adminPanels['eco-cal'] = init;
                    })();

                    // =================================================================
                    // COMMUNITY MEMBERS PANEL (panel 16)
                    // =================================================================
                    (function initCommunityPanel() {
                        'use strict';
                        let allMembers = [];

                        async function load() {
                            const tbody = $('community-members-tbody');
                            if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="text-muted">Loading…</td></tr>';
                            try {
                                const token = await (state.clerk && state.clerk.session ? state.clerk.session.getToken() : Promise.resolve(null));
                                if (!token) throw new Error('Not signed in');
                                const resp = await fetch('/api/community/members', { headers: { Authorization: 'Bearer ' + token } });
                                if (!resp.ok) throw new Error(resp.status + ' ' + resp.statusText);
                                const data = await resp.json();
                                allMembers = Array.isArray(data.members) ? data.members : (Array.isArray(data) ? data : []);
                                renderTable(allMembers);
                                updateKPIs(allMembers);
                            } catch (e) {
                                if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="text-muted">Failed to load: ' + escapeHtml(e.message) + '</td></tr>';
                            }
                        }

                        function updateKPIs(members) {
                            $('cm-total').textContent = members.length;
                            const now = Date.now();
                            const active = members.filter(function (m) {
                                const t = m.last_active || m.updated_at || m.created_at;
                                return t && (now - new Date(t).getTime()) < 30 * 86400 * 1000;
                            }).length;
                            $('cm-active').textContent = active;
                            const totalXP = members.reduce(function (s, m) { return s + Number(m.xp || m.total_xp || 0); }, 0);
                            $('cm-xp').textContent = totalXP.toLocaleString();

                            // New KPIs
                            const totalBadges = members.reduce(function (s, m) { return s + (Array.isArray(m.badges) ? m.badges.length : Number(m.badge_count || 0)); }, 0);
                            const suspendedCount = members.filter(function (m) { return m.suspended; }).length;
                            if ($('cm-badges')) $('cm-badges').textContent = totalBadges;
                            if ($('cm-suspended')) $('cm-suspended').textContent = suspendedCount;
                        }

                        function renderTable(members) {
                            const search = ($('community-search') || {}).value || '';
                            let filtered = members;
                            if (search) {
                                const q = search.toLowerCase();
                                filtered = members.filter(function (m) {
                                    return (m.email || '').toLowerCase().includes(q) ||
                                        (m.username || '').toLowerCase().includes(q) ||
                                        (m.full_name || '').toLowerCase().includes(q);
                                });
                            }
                            const tbody = $('community-members-tbody');
                            if (!tbody) return;
                            if (!filtered.length) {
                                tbody.innerHTML = '<tr><td colspan="9" class="text-muted">No members found.</td></tr>';
                                return;
                            }
                            tbody.innerHTML = filtered.map(function (m) {
                                const xp = Number(m.xp || m.total_xp || 0);
                                const level = m.level || (Math.floor(xp / 100) + 1);
                                const badgeCount = Array.isArray(m.badges) ? m.badges.length : Number(m.badge_count || 0);
                                const streak = Number(m.current_streak || 0);
                                const isSuspended = !!m.suspended;
                                const statusClass = isSuspended ? 'fail' : 'pass';
                                const statusLabel = isSuspended ? 'Suspended' : 'Active';
                                const suspendLabel = isSuspended ? 'Unsuspend' : 'Suspend';
                                const uid = encodeURIComponent(m.user_id || m.id || '');
                                return '<tr>' +
                                    '<td>' + escapeHtml(m.full_name || m.username || m.email || '—') + '</td>' +
                                    '<td>Lv ' + level + '</td>' +
                                    '<td>' + xp.toLocaleString() + '</td>' +
                                    '<td>' + Number(m.post_count || 0) + '</td>' +
                                    '<td>' + badgeCount + '</td>' +
                                    '<td>' + (streak > 0 ? '🔥 ' + streak + 'd' : '—') + '</td>' +
                                    '<td><span class="tag ' + statusClass + '">' + statusLabel + '</span></td>' +
                                    '<td>' + escapeHtml(formatDateTime(m.created_at)) + '</td>' +
                                    '<td>' +
                                    '<button class="admin-action-btn cm-suspend-btn" data-uid="' + uid + '" data-suspended="' + isSuspended + '" title="' + suspendLabel + '" style="padding:2px 6px;font-size:0.72rem;cursor:pointer">' + (isSuspended ? '▶' : '⏸') + '</button>' +
                                    '</td>' +
                                    '</tr>';
                            }).join('');
                        }

                        // Suspend / unsuspend action
                        document.addEventListener('click', function (e) {
                            const btn = e.target.closest('.cm-suspend-btn');
                            if (!btn) return;
                            const uid = btn.getAttribute('data-uid');
                            const wasSuspended = btn.getAttribute('data-suspended') === 'true';
                            (async function () {
                                try {
                                    const token = await (state.clerk && state.clerk.session ? state.clerk.session.getToken() : Promise.resolve(null));
                                    if (!token) throw new Error('Not signed in');
                                    const resp = await fetch('/api/community/members/' + uid + '/suspend', {
                                        method: 'PUT',
                                        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ suspended: !wasSuspended })
                                    });
                                    if (!resp.ok) throw new Error(resp.status);
                                    toast((wasSuspended ? 'Unsuspended' : 'Suspended') + ' member.', 'success');
                                    load();
                                } catch (ex) {
                                    toast('Action failed: ' + ex.message, 'error');
                                }
                            })();
                        });

                        let searchTimer;
                        const searchEl = $('community-search');
                        if (searchEl) {
                            searchEl.addEventListener('input', function () {
                                clearTimeout(searchTimer);
                                searchTimer = setTimeout(function () { renderTable(allMembers); }, 200);
                            });
                        }
                        const refBtn = $('community-refresh-btn');
                        if (refBtn) refBtn.addEventListener('click', load);

                        window.__adminPanels = window.__adminPanels || {};
                        window.__adminPanels.community = load;
                    })();

                    // =================================================================
                    // QUEUE HEALTH PANEL (panel 17)
                    // =================================================================
                    (function initQueueHealthPanel() {
                        'use strict';
                        let activePlatform = 'all';

                        // Classify error messages into categories
                        function classifyError(err) {
                            if (!err) return 'unknown';
                            const e = err.toLowerCase();
                            if (e.includes('401') || e.includes('403') || e.includes('unauthorized') || e.includes('token') || e.includes('auth') || e.includes('expired')) return 'auth';
                            if (e.includes('429') || e.includes('rate') || e.includes('throttl') || e.includes('too many')) return 'rate-limit';
                            if (e.includes('timeout') || e.includes('timed out') || e.includes('econnrefused') || e.includes('network') || e.includes('dns') || e.includes('502') || e.includes('503') || e.includes('504')) return 'api-down';
                            if (e.includes('too long') || e.includes('character') || e.includes('length') || e.includes('format') || e.includes('invalid') || e.includes('400') || e.includes('missing')) return 'format';
                            if (e.includes('duplicate') || e.includes('already')) return 'duplicate';
                            return 'other';
                        }

                        const errLabels = { 'auth': '🔑 Auth', 'rate-limit': '⏱ Rate Limit', 'api-down': '🔌 API Down', 'format': '📝 Format', 'duplicate': '♻ Duplicate', 'other': '❓ Other', 'unknown': '—' };
                        const errColors = { 'auth': 'rose', 'rate-limit': 'gold', 'api-down': 'rose', 'format': 'cyan', 'duplicate': 'violet', 'other': '', 'unknown': '' };

                        function load() {
                            const variants = state.variants || [];
                            const failed = variants.filter(function (v) { return v.status === 'failed'; });
                            const pending = variants.filter(function (v) { return v.status === 'scheduled' || v.status === 'pending'; });
                            const published = variants.filter(function (v) { return v.status === 'published'; });
                            const highRetry = failed.filter(function (v) { return Number(v.retry_count || 0) >= 3; });

                            $('qh-failed').textContent = failed.length;
                            $('qh-pending').textContent = pending.length;
                            $('qh-published').textContent = published.length;
                            $('qh-high-retry').textContent = highRetry.length;

                            // Success rate
                            const total = published.length + failed.length;
                            const rate = total > 0 ? Math.round((published.length / total) * 100) : 0;
                            const rateEl = $('qh-success-rate');
                            if (rateEl) {
                                rateEl.textContent = total > 0 ? rate + '%' : '—';
                                rateEl.className = 'panel-kpi-value ' + (rate >= 90 ? 'emerald' : rate >= 70 ? 'gold' : 'rose');
                            }

                            // Error breakdown
                            const errCounts = {};
                            failed.forEach(function (v) { const t = classifyError(v.last_error); errCounts[t] = (errCounts[t] || 0) + 1; });
                            const breakdownEl = $('qh-error-breakdown');
                            if (breakdownEl) {
                                if (!failed.length) {
                                    breakdownEl.innerHTML = '<div class="panel-kpi"><div class="panel-kpi-value emerald">0</div><div class="panel-kpi-label">No errors</div></div>';
                                } else {
                                    breakdownEl.innerHTML = Object.keys(errCounts).map(function (t) {
                                        return '<div class="panel-kpi"><div class="panel-kpi-value ' + (errColors[t] || '') + '">' + errCounts[t] + '</div><div class="panel-kpi-label">' + (errLabels[t] || t) + '</div></div>';
                                    }).join('');
                                }
                            }

                            // Platform filter tabs — build dynamically
                            const platforms = {};
                            variants.forEach(function (v) { if (v.platform) platforms[v.platform] = true; });
                            const filterEl = $('qh-platform-filter');
                            if (filterEl) {
                                let btns = '<button class="dcc-view-btn' + (activePlatform === 'all' ? ' active' : '') + '" data-qh-platform="all">All</button>';
                                Object.keys(platforms).sort().forEach(function (p) {
                                    btns += '<button class="dcc-view-btn' + (activePlatform === p ? ' active' : '') + '" data-qh-platform="' + escapeHtml(p) + '">' + escapeHtml(p) + '</button>';
                                });
                                filterEl.innerHTML = btns;
                            }

                            // Apply platform filter
                            const filteredFailed = activePlatform === 'all' ? failed : failed.filter(function (v) { return v.platform === activePlatform; });

                            // Failed variants table with error type column
                            const failedTbody = $('qh-failed-tbody');
                            if (failedTbody) {
                                failedTbody.innerHTML = filteredFailed.length
                                    ? filteredFailed.map(function (v) {
                                        const caption = (v.content || v.caption || '').slice(0, 55) + ((v.content || v.caption || '').length > 55 ? '…' : '');
                                        const errType = classifyError(v.last_error);
                                        const retryWarn = Number(v.retry_count || 0) >= 3 ? ' style="color:var(--accent-rose);font-weight:600"' : '';
                                        return '<tr>' +
                                            '<td>' + escapeHtml(caption || '—') + '</td>' +
                                            '<td><span class="tag fail">' + escapeHtml(v.platform || '—') + '</span></td>' +
                                            '<td>' + escapeHtml(v.brand || '—') + '</td>' +
                                            '<td>' + escapeHtml(formatDateTime(v.scheduled_at)) + '</td>' +
                                            '<td' + retryWarn + '>' + Number(v.retry_count || 0) + '</td>' +
                                            '<td><span class="tag ' + (errColors[errType] ? errColors[errType] : 'warn') + '" style="font-size:0.72rem">' + (errLabels[errType] || errType) + '</span></td>' +
                                            '<td style="max-width:180px;word-break:break-all;font-size:0.72rem">' + escapeHtml(v.last_error || '—') + '</td>' +
                                            '</tr>';
                                    }).join('')
                                    : '<tr><td colspan="7" class="text-muted">No failed variants — publisher is healthy.</td></tr>';
                            }

                            // All variants table (recent 50)
                            const filteredAll = activePlatform === 'all' ? variants : variants.filter(function (v) { return v.platform === activePlatform; });
                            const allTbody = $('qh-all-tbody');
                            if (allTbody) {
                                const recent = [...filteredAll].sort(function (a, b) { return new Date(b.scheduled_at || 0) - new Date(a.scheduled_at || 0); }).slice(0, 50);
                                allTbody.innerHTML = recent.length
                                    ? recent.map(function (v) {
                                        const caption = (v.content || v.caption || '').slice(0, 55) + ((v.content || v.caption || '').length > 55 ? '…' : '');
                                        return '<tr>' +
                                            '<td>' + escapeHtml(caption || '—') + '</td>' +
                                            '<td>' + escapeHtml(v.platform || '—') + '</td>' +
                                            '<td>' + escapeHtml(v.brand || '—') + '</td>' +
                                            '<td>' + statusTag(v.status) + '</td>' +
                                            '<td>' + escapeHtml(formatDateTime(v.scheduled_at)) + '</td>' +
                                            '</tr>';
                                    }).join('')
                                    : '<tr><td colspan="5" class="text-muted">No variants loaded yet.</td></tr>';
                            }
                        }

                        // Platform filter delegation
                        const filterEl = $('qh-platform-filter');
                        if (filterEl) filterEl.addEventListener('click', function (e) {
                            const btn = e.target.closest('[data-qh-platform]');
                            if (!btn) return;
                            activePlatform = btn.getAttribute('data-qh-platform');
                            load();
                        });

                        const refBtn = $('qh-refresh-btn');
                        if (refBtn) refBtn.addEventListener('click', load);

                        const runBtn = $('run-queue-btn-qh');
                        if (runBtn) runBtn.addEventListener('click', function () { runQueueNow().then(load); });

                        // Retry all failed: re-schedule each to now
                        const retryAllBtn = $('retry-all-failed-btn');
                        if (retryAllBtn) {
                            retryAllBtn.addEventListener('click', async function () {
                                const failed = (state.variants || []).filter(function (v) { return v.status === 'failed'; });
                                if (!failed.length) { toast('No failed variants to retry.', 'info'); return; }
                                try {
                                    const now = new Date().toISOString();
                                    await Promise.all(failed.map(function (v) {
                                        return api('/social/' + v.id, { method: 'PUT', body: { status: 'scheduled', scheduled_at: now, retry_count: 0, last_error: null } });
                                    }));
                                    toast('Retried ' + failed.length + ' variant(s).', 'success');
                                    await refreshAll();
                                    load();
                                } catch (e) {
                                    toast('Retry failed: ' + e.message, 'error');
                                }
                            });
                        }

                        window.__adminPanels = window.__adminPanels || {};
                        window.__adminPanels.notifications = load;
                    })();

                    // =================================================================
                    // CHARACTERS PANEL (panel 18) — registry with pose tracking
                    // =================================================================
                    (function initCharactersPanel() {
                        'use strict';

                        const STORAGE_KEY = 'gfd_character_registry';
                        const defaultRegistry = [
                            {
                                id: 'sheriff', name: 'The Sheriff', brand: 'gfv', emoji: '🤠',
                                description: 'Friendly cowboy mascot. Target: 2D vector production asset in Rive (web) + Spine2D (video).',
                                pipeline: 'Option B — Simplify to 2D',
                                tools: ['Rive', 'Spine2D'],
                                stage: 'in-progress',
                                poses: [
                                    { id: 'idle', label: 'idle', status: 'blocked', note: 'Current pose locked — needs redesign' },
                                    { id: 'wave', label: 'wave', status: 'planned' },
                                    { id: 'cheer', label: 'cheer', status: 'planned' },
                                    { id: 'neutral', label: 'neutral', status: 'planned' },
                                    { id: 'point', label: 'point', status: 'planned' },
                                    { id: 'nod', label: 'nod', status: 'planned' },
                                    { id: 'walk', label: 'walk', status: 'planned' },
                                ],
                                milestones: [
                                    { phase: 'Source Art', status: 'not-started' },
                                    { phase: 'Rig Setup', status: 'not-started' },
                                    { phase: 'Core Animations', status: 'not-started' },
                                    { phase: 'Production Export', status: 'not-started' },
                                ],
                            },
                        ];

                        // ─── Data layer ────────────────────────────────────────────
                        let registryCache = null; // in-memory cache for the session

                        async function loadRegistry() {
                            // 1. Try D1 via API
                            try {
                                const data = await api('/characters');
                                const reg = (data.characters && data.characters.length) ? data.characters : defaultRegistry;
                                localStorage.setItem(STORAGE_KEY, JSON.stringify(reg)); // write-through cache
                                registryCache = reg;
                                return reg;
                            } catch (e) {
                                console.warn('[characters] API load failed, using localStorage:', e.message);
                            }
                            // 2. Fall back to localStorage
                            try {
                                const stored = localStorage.getItem(STORAGE_KEY);
                                if (stored) { registryCache = JSON.parse(stored); return registryCache; }
                            } catch (e2) { /* ignore */ }
                            // 3. Fall back to defaults
                            registryCache = defaultRegistry;
                            return registryCache;
                        }

                        function cacheSet(reg) {
                            registryCache = reg;
                            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(reg)); } catch (e) { /* ignore */ }
                        }

                        async function persistCharacter(ch) {
                            // Persist pose/milestone updates back to API (best-effort)
                            try {
                                await api('/characters/' + ch.id, { method: 'PUT', body: ch });
                            } catch (e) {
                                console.warn('[characters] Could not persist to API, localStorage-only:', e.message);
                            }
                        }

                        // ─── Render ────────────────────────────────────────────────
                        function renderRegistry(registry) {
                            const container = $('char-cards-container');
                            if (!container) return;
                            // Remove all rendered char-cards, keep the empty-state sentinel
                            container.querySelectorAll('.char-card').forEach(function (el) { el.remove(); });
                            const emptyState = container.querySelector('.char-empty-state');
                            if (emptyState) emptyState.style.display = registry.length ? 'none' : '';

                            registry.forEach(function (ch) {
                                const card = document.createElement('div');
                                card.className = 'char-card dynamic';
                                card.id = 'char-' + ch.id;

                                const poseHTML = (ch.poses || []).map(function (p) {
                                    return '<span class="char-pose-tag ' + p.status + '" title="' + escapeHtml(p.note || p.status) + '"'
                                        + ' data-char="' + ch.id + '" data-pose="' + p.id + '" style="cursor:pointer">'
                                        + (p.status === 'blocked' ? '⚡ ' : p.status === 'done' ? '✓ ' : '')
                                        + escapeHtml(p.label) + '</span>';
                                }).join('');

                                const msHTML = (ch.milestones || []).map(function (m) {
                                    const icon = m.status === 'done' ? '✅' : m.status === 'in-progress' ? '🔄' : '⬜';
                                    return '<span class="char-pose-tag ' + m.status + '" title="Click to cycle status"'
                                        + ' data-char="' + ch.id + '" data-milestone="' + escapeHtml(m.phase) + '"'
                                        + ' style="cursor:pointer;font-size:0.72rem">'
                                        + icon + ' ' + escapeHtml(m.phase) + '</span>';
                                }).join('');

                                const toolsArr = Array.isArray(ch.tools) ? ch.tools
                                    : (typeof ch.tools === 'string' ? ch.tools.split(',').map(function (t) { return t.trim(); }) : []);

                                card.innerHTML = '<div class="char-avatar">' + escapeHtml(ch.emoji || '🎭') + '</div>'
                                    + '<div style="flex:1;min-width:0">'
                                    + '<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.25rem;flex-wrap:wrap">'
                                    + '<strong style="font-size:1rem">' + escapeHtml(ch.name) + '</strong>'
                                    + '<span class="tag" style="background:rgba(251,191,36,0.15);color:var(--accent-gold);border:1px solid rgba(251,191,36,0.3);font-size:0.72rem">' + escapeHtml((ch.brand || '').toUpperCase()) + ' Brand</span>'
                                    + (ch.stage ? '<span class="tag ' + escapeHtml(ch.stage) + '" style="font-size:0.72rem">' + escapeHtml(ch.stage) + '</span>' : '')
                                    + '<span style="margin-left:auto;display:flex;gap:0.35rem">'
                                    + '<button class="btn btn-micro" data-char-edit="' + ch.id + '" title="Edit character">Edit</button>'
                                    + '<button class="btn btn-micro" style="color:var(--rose);border-color:rgba(251,113,133,0.3)" data-char-delete="' + ch.id + '" title="Delete character">Delete</button>'
                                    + '</span>'
                                    + '</div>'
                                    + '<p style="font-size:0.82rem;color:var(--text-muted);margin:0 0 0.5rem">' + escapeHtml(ch.description || '') + '</p>'
                                    + (poseHTML ? '<div class="char-poses">' + poseHTML + '</div>' : '')
                                    + '<div style="margin-top:0.5rem;font-size:0.78rem;color:var(--text-muted)">'
                                    + (ch.pipeline ? 'Pipeline: <code style="font-size:0.75rem">' + escapeHtml(ch.pipeline) + '</code>' : '')
                                    + (toolsArr.length ? ' &emsp;Tools: ' + toolsArr.map(function (t) { return '<code style="font-size:0.75rem">' + escapeHtml(t) + '</code>'; }).join(' · ') : '')
                                    + '</div>'
                                    + (msHTML ? '<div style="margin-top:0.5rem">' + msHTML + '</div>' : '')
                                    + '</div>';

                                if (emptyState) {
                                    container.insertBefore(card, emptyState);
                                } else {
                                    container.appendChild(card);
                                }
                            });
                        }

                        // ─── Click handler: edit / delete / cycle pose / milestone ─
                        const container = $('char-cards-container');
                        if (container) {
                            container.addEventListener('click', async function (e) {
                                // ── Edit button ─────────────────────────────────────
                                const editEl = e.target.closest('[data-char-edit]');
                                if (editEl) {
                                    const editId = editEl.dataset.charEdit;
                                    const reg0 = registryCache ? registryCache : await loadRegistry();
                                    const ch0 = reg0.find(function (c) { return c.id === editId; });
                                    if (ch0) openEditModal(ch0);
                                    return;
                                }

                                // ── Delete button ────────────────────────────────────
                                const delEl = e.target.closest('[data-char-delete]');
                                if (delEl) {
                                    const delId = delEl.dataset.charDelete;
                                    const reg1 = registryCache ? registryCache : await loadRegistry();
                                    const ch1 = reg1.find(function (c) { return c.id === delId; });
                                    const charName = ch1 ? ch1.name : delId;
                                    if (!confirm('Delete "' + charName + '"? This cannot be undone.')) return;
                                    try {
                                        await api('/characters/' + delId, { method: 'DELETE' });
                                        registryCache = null;
                                        await loadAndRender();
                                        toast('"' + charName + '" deleted.', 'info');
                                    } catch (err) {
                                        toast('Delete failed: ' + err.message, 'error');
                                    }
                                    return;
                                }

                                // ── Pose / milestone cycle ────────────────────────────
                                const poseEl = e.target.closest('[data-pose]');
                                const msEl = e.target.closest('[data-milestone]');
                                if (!poseEl && !msEl) return;

                                const reg = registryCache ? registryCache.slice() : await loadRegistry();
                                let updated = null;

                                if (poseEl) {
                                    const charId = poseEl.dataset.char;
                                    const poseId = poseEl.dataset.pose;
                                    const poseOrder = ['planned', 'in-progress', 'done', 'blocked'];
                                    reg.forEach(function (ch) {
                                        if (ch.id !== charId) return;
                                        (ch.poses || []).forEach(function (p) {
                                            if (p.id !== poseId) return;
                                            const idx = poseOrder.indexOf(p.status);
                                            p.status = poseOrder[(idx + 1) % poseOrder.length];
                                            p.note = p.status === 'blocked' ? 'Blocked' : '';
                                        });
                                        updated = ch;
                                    });
                                }
                                if (msEl) {
                                    const charId2 = msEl.dataset.char;
                                    const phase = msEl.dataset.milestone;
                                    const msOrder = ['not-started', 'in-progress', 'done'];
                                    reg.forEach(function (ch) {
                                        if (ch.id !== charId2) return;
                                        (ch.milestones || []).forEach(function (m) {
                                            if (m.phase !== phase) return;
                                            const idx2 = msOrder.indexOf(m.status);
                                            m.status = msOrder[(idx2 + 1) % msOrder.length];
                                        });
                                        updated = ch;
                                    });
                                }

                                cacheSet(reg);
                                renderRegistry(reg);
                                if (updated) persistCharacter(updated);
                            });
                        }

                        // ─── Add / Edit Character modal ───────────────────────────────
                        const charModal = $('char-modal');

                        function openCharModal() {
                            if (!charModal) return;
                            $('char-modal-id').value = '';
                            $('char-modal-name').value = '';
                            $('char-modal-emoji').value = '';
                            $('char-modal-brand').value = 'gfv';
                            $('char-modal-stage').value = 'concept';
                            $('char-modal-description').value = '';
                            $('char-modal-pipeline').value = '';
                            $('char-modal-tools').value = '';
                            $('char-modal-title').textContent = '+ Add Character';
                            charModal.classList.remove('d-none');
                            $('char-modal-name').focus();
                        }

                        function openEditModal(ch) {
                            if (!charModal) return;
                            const toolsArr = Array.isArray(ch.tools) ? ch.tools
                                : (typeof ch.tools === 'string' ? ch.tools.split(',').map(function (t) { return t.trim(); }) : []);
                            $('char-modal-id').value = ch.id || '';
                            $('char-modal-name').value = ch.name || '';
                            $('char-modal-emoji').value = ch.emoji || '';
                            $('char-modal-brand').value = ch.brand || 'gfv';
                            $('char-modal-stage').value = ch.stage || 'concept';
                            $('char-modal-description').value = ch.description || '';
                            $('char-modal-pipeline').value = ch.pipeline || '';
                            $('char-modal-tools').value = toolsArr.join(', ');
                            $('char-modal-title').textContent = 'Edit Character';
                            charModal.classList.remove('d-none');
                            $('char-modal-name').focus();
                        }

                        function closeCharModal() { if (charModal) charModal.classList.add('d-none'); }

                        const addBtn = $('char-add-btn');
                        const closeBtn2 = $('char-modal-close');
                        const cancelBtn2 = $('char-modal-cancel');
                        if (addBtn) addBtn.addEventListener('click', openCharModal);
                        if (closeBtn2) closeBtn2.addEventListener('click', closeCharModal);
                        if (cancelBtn2) cancelBtn2.addEventListener('click', closeCharModal);
                        if (charModal) charModal.addEventListener('click', function (e) { if (e.target === charModal) closeCharModal(); });

                        const saveCharBtn = $('char-modal-save');
                        if (saveCharBtn) {
                            saveCharBtn.addEventListener('click', async function () {
                                const name = ($('char-modal-name').value || '').trim();
                                if (!name) { toast('Character name is required.', 'error'); return; }
                                const toolsRaw = ($('char-modal-tools').value || '').trim();
                                const existingId = ($('char-modal-id').value || '').trim();
                                const existingCh = existingId && registryCache
                                    ? registryCache.find(function (c) { return c.id === existingId; }) : null;
                                const payload = {
                                    name: name,
                                    emoji: ($('char-modal-emoji').value || '').trim() || '🎭',
                                    brand: $('char-modal-brand').value || 'gfv',
                                    stage: $('char-modal-stage').value || 'concept',
                                    description: ($('char-modal-description').value || '').trim(),
                                    pipeline: ($('char-modal-pipeline').value || '').trim(),
                                    tools: toolsRaw ? toolsRaw.split(',').map(function (t) { return t.trim(); }).filter(Boolean) : [],
                                    // preserve existing poses/milestones when editing
                                    poses: existingCh ? existingCh.poses : [],
                                    milestones: existingCh ? existingCh.milestones : [],
                                };
                                try {
                                    saveCharBtn.disabled = true;
                                    saveCharBtn.textContent = 'Saving…';
                                    if (existingId) {
                                        await api('/characters/' + existingId, { method: 'PUT', body: payload });
                                        closeCharModal();
                                        toast('Character "' + name + '" updated.', 'success');
                                    } else {
                                        await api('/characters', { method: 'POST', body: payload });
                                        closeCharModal();
                                        toast('Character "' + name + '" added.', 'success');
                                    }
                                    registryCache = null; // force reload
                                    await loadAndRender();
                                } catch (err) {
                                    toast('Save failed: ' + err.message, 'error');
                                } finally {
                                    saveCharBtn.disabled = false;
                                    saveCharBtn.textContent = 'Save Character';
                                }
                            });
                        }

                        // ─── Load + render ─────────────────────────────────────────
                        async function loadAndRender() {
                            const reg = await loadRegistry();
                            renderRegistry(reg);
                        }

                        const refBtn3 = $('char-refresh-btn');
                        if (refBtn3) {
                            refBtn3.addEventListener('click', async function () {
                                registryCache = null;
                                await loadAndRender();
                                toast('Character registry refreshed from D1.', 'info');
                            });
                        }

                        window.__adminPanels = window.__adminPanels || {};
                        window.__adminPanels.characters = loadAndRender;
                    })();

                    // =================================================================
                    // DONATIONS PANEL (panel 14) — live Stripe data from D1
                    // =================================================================
                    (function initDonationsPanel() {
                        'use strict';
                        const refBtn = $('donations-refresh-btn');
                        const recordBtn = $('donations-record-btn');
                        if (refBtn) refBtn.addEventListener('click', loadDonations);
                        if (recordBtn) recordBtn.addEventListener('click', openDonationModal);

                        // Modal wiring
                        const modal = $('don-modal');
                        function openDonationModal() {
                            if (!modal) return;
                            $('don-amount').value = '';
                            $('don-project').value = '';
                            $('don-donor').value = '';
                            $('don-stripe-id').value = '';
                            $('don-status').value = 'succeeded';
                            $('don-recurring').value = '0';
                            modal.classList.remove('d-none');
                            $('don-amount').focus();
                        }
                        function closeDonationModal() { if (modal) modal.classList.add('d-none'); }

                        const closeBtn = $('don-modal-close');
                        const cancelBtn = $('don-modal-cancel');
                        if (closeBtn) closeBtn.addEventListener('click', closeDonationModal);
                        if (cancelBtn) cancelBtn.addEventListener('click', closeDonationModal);
                        if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) closeDonationModal(); });

                        const saveBtn = $('don-modal-save');
                        if (saveBtn) {
                            saveBtn.addEventListener('click', async function () {
                                const amtRaw = parseFloat($('don-amount').value);
                                if (!amtRaw || amtRaw <= 0) { toast('Enter a valid amount.', 'error'); return; }
                                const payload = {
                                    amount_cents: Math.round(amtRaw * 100),
                                    project: ($('don-project').value || '').trim() || null,
                                    donor_name: ($('don-donor').value || '').trim() || null,
                                    stripe_payment_id: ($('don-stripe-id').value || '').trim() || null,
                                    status: $('don-status').value || 'succeeded',
                                    recurring: parseInt($('don-recurring').value, 10) === 1 ? 1 : 0,
                                };
                                try {
                                    saveBtn.disabled = true;
                                    saveBtn.textContent = 'Saving…';
                                    await api('/donations', { method: 'POST', body: payload });
                                    closeDonationModal();
                                    toast('Donation recorded.', 'success');
                                    await loadDonations();
                                } catch (err) {
                                    toast('Save failed: ' + err.message, 'error');
                                } finally {
                                    saveBtn.disabled = false;
                                    saveBtn.textContent = 'Save Donation';
                                }
                            });
                        }

                        window.__adminPanels = window.__adminPanels || {};
                        window.__adminPanels.donations = loadDonations;

                        async function loadDonations() {
                            try {
                                const data = await api('/donations');
                                renderDonationKPIs(data);
                                renderDonationTable(data.donations || []);
                            } catch (err) {
                                toast('Could not load donation data: ' + err.message, 'error');
                            }
                        }

                        function fmtUSD(cents) {
                            return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        }

                        function renderDonationKPIs(data) {
                            const totalEl = $('don-total');
                            const monthEl = $('don-month');
                            const countEl = $('don-count');
                            const avgEl = $('don-avg');
                            if (totalEl) totalEl.textContent = fmtUSD(data.totalRaised || 0);
                            if (monthEl) monthEl.textContent = fmtUSD(data.thisMonth || 0);
                            if (countEl) countEl.textContent = String(data.count || 0);
                            if (avgEl) avgEl.textContent = data.count ? fmtUSD(Math.round((data.totalRaised || 0) / data.count)) : '$0.00';
                        }

                        function renderDonationTable(donations) {
                            const tbody = $('donations-tbody');
                            if (!tbody) return;
                            if (!donations.length) {
                                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2.5rem 1rem;color:var(--text-muted)">'
                                    + '<p>No donation transactions recorded yet.</p>'
                                    + '<p style="font-size:0.82rem;margin-top:0.4rem">Click <strong>+ Record Donation</strong> above to log one manually, or configure the Stripe webhook for automatic logging.</p>'
                                    + '<a href="https://dashboard.stripe.com/webhooks" target="_blank" rel="noopener" class="btn btn-secondary" style="margin-top:0.75rem;display:inline-flex">Configure Stripe Webhook ↗</a>'
                                    + '</td></tr>';
                                return;
                            }
                            tbody.innerHTML = donations.map(function (d) {
                                const dt = d.created_at ? new Date(d.created_at + (d.created_at.includes('T') ? '' : 'T00:00:00Z')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
                                const statusClass = d.status === 'succeeded' ? 'emerald' : d.status === 'failed' ? 'rose' : d.status === 'refunded' ? 'warn' : '';
                                return '<tr>'
                                    + '<td>' + dt + '</td>'
                                    + '<td class="mono">' + fmtUSD(d.amount_cents) + (d.recurring ? ' <span style="color:var(--accent-cyan);font-size:0.75rem">↻</span>' : '') + '</td>'
                                    + '<td>' + escapeHtml(d.donor_name || '—') + '</td>'
                                    + '<td>' + escapeHtml(d.project || '—') + '</td>'
                                    + '<td><span class="' + statusClass + '">' + escapeHtml(d.status || 'unknown') + '</span></td>'
                                    + '</tr>';
                            }).join('');
                        }
                    })();


                    // ─────────────────────────────────────────────────────────────────
                    // STORAGE INTELLIGENCE (panel 13)
                    // -----------------------------------------------------------------
                    // Reads a JSON snapshot produced by scripts/storage-snapshot.ps1.
                    // Data is stored in localStorage so it persists across sessions.
                    // ─────────────────────────────────────────────────────────────────
                    (function () {
                        const STORAGE_KEY = 'gfd_storage_snapshot';

                        function escHtml(s) {
                            return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        }

                        function barClass(pct) {
                            if (pct >= 85) return 'danger';
                            if (pct >= 65) return 'warn';
                            return 'ok';
                        }

                        function fmtTime(iso) {
                            try { return new Date(iso).toLocaleString(); }
                            catch (e) { return iso; }
                        }

                        function renderSnapshot(snap) {
                            const empty = $('storage-empty-state');
                            if (empty) empty.style.display = 'none';

                            // Meta row
                            const metaRow = $('storage-meta-row');
                            if (metaRow && snap.meta) {
                                $('storage-meta-machine').textContent = snap.meta.machine || '—';
                                $('storage-meta-time').textContent = fmtTime(snap.meta.timestamp);
                                metaRow.style.display = 'block';
                            }

                            // Drive cards
                            const drivesPanel = $('storage-drives-panel');
                            const drivesGrid = $('storage-drives-grid');
                            if (drivesPanel && drivesGrid && snap.drives && snap.drives.length) {
                                drivesPanel.style.display = 'block';

                                // Growth summary from comparison
                                const growthEl = $('storage-growth-summary');
                                if (growthEl && snap.comparison && snap.comparison.driveGrowth) {
                                    const flagged = snap.comparison.driveGrowth.filter(function (g) { return g.flag; });
                                    if (flagged.length) {
                                        growthEl.innerHTML = '<span class="storage-growth-flag">⚠ ' +
                                            flagged.map(function (g) { return g.drive + ' +' + g.growthGB + ' GB'; }).join(' · ') +
                                            '</span> vs baseline ' + escHtml(snap.comparison.baselineTimestamp ? fmtTime(snap.comparison.baselineTimestamp) : '');
                                    } else {
                                        growthEl.textContent = 'No significant growth vs baseline.';
                                    }
                                }

                                drivesGrid.innerHTML = snap.drives.map(function (d) {
                                    const cls = barClass(d.pctUsed);
                                    return '<div class="storage-drive-card">' +
                                        '<div class="storage-drive-header">' +
                                        '<span class="storage-drive-letter">' + escHtml(d.drive) + '</span>' +
                                        '<span class="storage-drive-pct">' + escHtml(d.pctUsed) + '%</span>' +
                                        '</div>' +
                                        '<div class="storage-drive-label">' + escHtml(d.label || '—') + '</div>' +
                                        '<div class="storage-bar-wrap"><div class="storage-bar-fill ' + cls + '" style="width:' + Math.min(d.pctUsed, 100) + '%"></div></div>' +
                                        '<div class="storage-drive-stats">' + escHtml(d.usedGB) + ' GB used &mdash; ' + escHtml(d.freeGB) + ' GB free</div>' +
                                        '</div>';
                                }).join('');
                            }

                            // Hot-spots table
                            const hsPanel = $('storage-hotspots-panel');
                            const hsTbody = $('storage-hotspots-tbody');
                            if (hsPanel && hsTbody && snap.hotspots && snap.hotspots.length) {
                                hsPanel.style.display = 'block';
                                const sorted = snap.hotspots.slice().sort(function (a, b) { return (b.sizeGB || 0) - (a.sizeGB || 0); });

                                // Build growth lookup if available
                                const growthLookup = {};
                                if (snap.comparison && snap.comparison.driveGrowth) {
                                    snap.comparison.driveGrowth.forEach(function (g) { growthLookup[g.drive] = g; });
                                }

                                hsTbody.innerHTML = sorted.filter(function (h) { return h.sizeGB !== null && h.sizeGB !== undefined; }).map(function (h) {
                                    return '<tr><td>' + escHtml(h.label || h.path) + '</td>' +
                                        '<td style="text-align:right;font-family:\'JetBrains Mono\',monospace">' + escHtml(h.sizeGB) + '</td>' +
                                        '<td></td></tr>';
                                }).join('');
                            }

                            // Action items
                            const actPanel = $('storage-actions-panel');
                            const actGrid = $('storage-actions-grid');
                            if (actPanel && actGrid && snap.actionItems && snap.actionItems.length) {
                                actPanel.style.display = 'block';
                                const pending = snap.actionItems.filter(function (a) { return a.status !== 'done'; });
                                const totalGB = pending.reduce(function (sum, a) { return sum + (a.potentialGB || 0); }, 0);
                                const pendSumEl = $('storage-pending-summary');
                                if (pendSumEl) pendSumEl.textContent = pending.length + ' items · ~' + totalGB + ' GB recoverable';

                                actGrid.innerHTML = snap.actionItems.map(function (a) {
                                    const isDone = a.status === 'done';
                                    const badgeCls = isDone ? 'badge-done' : (a.potentialGB > 50 ? 'badge-warn' : 'badge-pending');
                                    const badgeLabel = isDone ? '✓ done' : 'pending';
                                    return '<div class="storage-action-item ' + (isDone ? 'done' : '') + '">' +
                                        '<span class="storage-action-badge ' + badgeCls + '">' + badgeLabel + '</span>' +
                                        '<div>' +
                                        '<div class="storage-action-label">' + escHtml(a.label) + '</div>' +
                                        (a.potentialGB ? '<div class="storage-action-gb">~' + escHtml(a.potentialGB) + ' GB</div>' : '') +
                                        (a.notes ? '<div class="storage-action-notes">' + escHtml(a.notes) + '</div>' : '') +
                                        '</div>' +
                                        '</div>';
                                }).join('');
                            }

                            // node_modules
                            const nmPanel = $('storage-nm-panel');
                            const nmTbody = $('storage-nm-tbody');
                            if (nmPanel && nmTbody && snap.nodeModules && snap.nodeModules.length) {
                                nmPanel.style.display = 'block';
                                nmTbody.innerHTML = snap.nodeModules.map(function (nm) {
                                    return '<tr><td style="font-family:\'JetBrains Mono\',monospace;font-size:0.74rem">' +
                                        escHtml(nm.path) + '</td><td style="text-align:right">' + escHtml(nm.sizeGB) + '</td></tr>';
                                }).join('');
                            }
                        }

                        function loadFromStorage() {
                            const raw = localStorage.getItem(STORAGE_KEY);
                            if (raw) {
                                try {
                                    renderSnapshot(JSON.parse(raw));
                                } catch (e) {
                                    console.error('[storage] Failed to parse saved snapshot', e);
                                }
                            }
                        }

                        // Load button → file picker
                        const loadBtn = $('storage-load-btn');
                        const fileInput = $('storage-file-input');
                        if (loadBtn && fileInput) {
                            loadBtn.addEventListener('click', function () { fileInput.click(); });
                            fileInput.addEventListener('change', function (e) {
                                const file = e.target.files[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = function (ev) {
                                    try {
                                        const snap = JSON.parse(ev.target.result);
                                        localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
                                        // Reset panels
                                        ['storage-drives-panel', 'storage-hotspots-panel', 'storage-actions-panel', 'storage-nm-panel'].forEach(function (id) {
                                            const el = $(id); if (el) el.style.display = 'none';
                                        });
                                        renderSnapshot(snap);
                                        toast('Snapshot loaded — ' + (snap.meta && snap.meta.machine ? snap.meta.machine : 'unknown'), 'success');
                                    } catch (err) {
                                        toast('Invalid JSON snapshot file.', 'error');
                                    }
                                };
                                reader.readAsText(file);
                                e.target.value = '';
                            });
                        }

                        // Clear button
                        const clearBtn = $('storage-clear-btn');
                        if (clearBtn) {
                            clearBtn.addEventListener('click', function () {
                                localStorage.removeItem(STORAGE_KEY);
                                ['storage-drives-panel', 'storage-hotspots-panel', 'storage-actions-panel', 'storage-nm-panel', 'storage-meta-row'].forEach(function (id) {
                                    const el = $(id); if (el) el.style.display = 'none';
                                });
                                const empty = $('storage-empty-state'); if (empty) empty.style.display = 'block';
                                toast('Snapshot cleared.', 'success');
                            });
                        }

                        // Copy command button
                        const copyCmdBtn = $('storage-copy-cmd-btn');
                        const cmdText = $('storage-cmd-text');
                        if (copyCmdBtn && cmdText) {
                            copyCmdBtn.addEventListener('click', function () {
                                navigator.clipboard.writeText(cmdText.textContent).then(function () {
                                    toast('Command copied to clipboard.', 'success');
                                }).catch(function () {
                                    toast('Copy failed — select text manually.', 'error');
                                });
                            });
                        }

                        let storageLoaded = false;
                        async function ensureStorageLoaded() {
                            if (!storageLoaded) {
                                storageLoaded = true;
                                // Auto-load cloud asset stats from /api/cms/stats
                                const cloudKpi = $('storage-cloud-kpi');
                                if (cloudKpi) {
                                    cloudKpi.innerHTML = '<span style="color:var(--text-muted);font-size:0.78rem">Loading cloud stats…</span>';
                                    try {
                                        const stats = await api('/stats');
                                        const totalBytes = stats.storage ? stats.storage.totalBytes : 0;
                                        const fileCount = stats.storage ? stats.storage.fileCount : 0;
                                        const pendRev = stats.pendingReview || 0;
                                        const usedMB = (totalBytes / (1024 * 1024)).toFixed(1);
                                        const usedPct = Math.min((totalBytes / (10 * 1024 * 1024 * 1024)) * 100, 100).toFixed(1);
                                        const barCls = parseFloat(usedPct) >= 80 ? 'danger' : parseFloat(usedPct) >= 50 ? 'warn' : 'ok';
                                        // D1 data from enriched stats
                                        const chars = stats.characters || 0;
                                        const donCount = stats.donations ? (stats.donations.total || 0) : 0;
                                        const donCents = stats.donations ? (stats.donations.totalCents || 0) : 0;
                                        const openOps = stats.openOps || 0;
                                        const auditTotal = stats.auditTotal || 0;
                                        const donDollars = (donCents / 100).toFixed(0);
                                        cloudKpi.innerHTML =
                                            '<div class="panel-kpis" style="margin:0">' +
                                            '<div class="panel-kpi"><div class="panel-kpi-label">R2 Assets</div><div class="panel-kpi-value">' + fileCount + '</div></div>' +
                                            '<div class="panel-kpi"><div class="panel-kpi-label">R2 Used</div><div class="panel-kpi-value">' + usedMB + ' MB</div></div>' +
                                            '<div class="panel-kpi"><div class="panel-kpi-label">Free Tier Cap</div><div class="panel-kpi-value">10 GB</div></div>' +
                                            '<div class="panel-kpi"><div class="panel-kpi-label" title="Assets awaiting approval">Pending Review</div><div class="panel-kpi-value' + (pendRev > 0 ? ' warn' : ' emerald') + '">' + pendRev + '</div></div>' +
                                            '</div>' +
                                            '<div class="storage-bar-wrap" style="margin:0.55rem 0 0"><div class="storage-bar-fill ' + barCls + '" style="width:' + usedPct + '%" title="' + usedPct + '% of 10 GB free tier used"></div></div>' +
                                            '<p style="font-size:0.72rem;color:var(--text-muted);margin:0.35rem 0 0">' + usedPct + '% of 10 GB free-tier quota used</p>' +
                                            '<div style="margin-top:0.85rem;border-top:1px solid var(--border);padding-top:0.75rem">' +
                                            '<div style="font-size:0.72rem;color:var(--text-muted);font-weight:600;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:0.45rem">D1 Table Counts</div>' +
                                            '<div class="panel-kpis" style="margin:0;gap:0.6rem">' +
                                            '<div class="panel-kpi"><div class="panel-kpi-label">Characters</div><div class="panel-kpi-value gold">' + chars + '</div></div>' +
                                            '<div class="panel-kpi"><div class="panel-kpi-label">Donations</div><div class="panel-kpi-value emerald">' + donCount + ' ($' + Number(donDollars).toLocaleString() + ')</div></div>' +
                                            '<div class="panel-kpi"><div class="panel-kpi-label">Open Tasks</div><div class="panel-kpi-value' + (openOps > 0 ? ' gold' : '') + '">' + openOps + '</div></div>' +
                                            '<div class="panel-kpi"><div class="panel-kpi-label">Audit Entries</div><div class="panel-kpi-value">' + Number(auditTotal).toLocaleString() + '</div></div>' +
                                            '</div>' +
                                            '</div>';
                                    } catch (e) {
                                        cloudKpi.innerHTML = '<span style="color:var(--text-muted);font-size:0.78rem">Cloud stats unavailable</span>';
                                    }
                                }
                            }
                            loadFromStorage();
                        }

                        window.__adminPanels = window.__adminPanels || {};
                        window.__adminPanels.storage = ensureStorageLoaded;
                    })();
                    // ─── End Storage Intelligence ──────────────────────────────────

                    // ─── Daily Culture Calendar (Panel 20) ─────────────────────────
                    (function () {
                        const DCC_SCHEDULE_URL = '/assets/data/featured-cultures.json';
                        const DCC_CULTURES_URL = '/assets/data/cultures_index.json';
                        let dccSchedule = [];
                        let dccCultures = [];
                        let dccMonthOffset = 0;
                        let dccCurrentView = 'today';
                        let dccLoaded = false;

                        // ── Helpers ──
                        function isoDate(d) {
                            const y = d.getFullYear();
                            const m = String(d.getMonth() + 1).padStart(2, '0');
                            const day = String(d.getDate()).padStart(2, '0');
                            return y + '-' + m + '-' + day;
                        }
                        function dayName(d) {
                            return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
                        }
                        const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
                            'July', 'August', 'September', 'October', 'November', 'December'];

                        // Get 2 cultures for a given date — deterministic from schedule
                        function getCulturesForDate(date) {
                            const iso = isoDate(date);
                            const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);

                            // Find all entries for this date; entries without a slot field are treated as 'am'
                            const all = dccSchedule.filter(function (e) { return e.date === iso; });
                            let schedAm = null, schedPm = null;
                            for (let i = 0; i < all.length; i++) {
                                if (all[i].slot === 'pm') { if (!schedPm) schedPm = all[i]; }
                                else { if (!schedAm) schedAm = all[i]; }
                            }
                            if (schedAm && schedPm) return { am: schedAm, pm: schedPm };

                            // Fallback pool uses only AM entries to avoid duplicates in deterministic mode
                            const pool = dccSchedule.filter(function (e) { return e.slot !== 'pm'; });
                            if (pool.length === 0) return { am: null, pm: null };

                            if (schedAm && !schedPm) {
                                // AM scheduled, derive PM deterministically
                                let pmIdx = ((dayOfYear * 7) + 3) % pool.length;
                                const amIdx = pool.indexOf(schedAm);
                                if (pmIdx === amIdx) pmIdx = (pmIdx + 1) % pool.length;
                                return { am: schedAm, pm: pool[pmIdx] };
                            }

                            // Both deterministic (no explicit schedule for this date)
                            const amIdx2 = (dayOfYear * 2) % pool.length;
                            const pmIdx2 = (dayOfYear * 2 + 1) % pool.length;
                            return { am: pool[amIdx2], pm: pool[pmIdx2] };
                        }

                        function getCultureMeta(slug) {
                            if (!slug || dccCultures.length === 0) return null;
                            for (let i = 0; i < dccCultures.length; i++) {
                                if (dccCultures[i].slug === slug) return dccCultures[i];
                            }
                            return null;
                        }

                        function prettifySlug(s) {
                            if (!s) return '';
                            return s.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
                        }

                        // ── Loading ──
                        function loadDccData() {
                            const statusEl = $('dcc-data-status');
                            if (statusEl) { statusEl.textContent = 'Loading culture data\u2026'; statusEl.className = 'dcc-data-status loading'; }

                            const scheduleReq = fetch(DCC_SCHEDULE_URL)
                                .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
                                .catch(function (e) { console.warn('[DCC] Schedule fetch failed:', e.message); return []; });
                            const culturesReq = fetch(DCC_CULTURES_URL)
                                .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
                                .catch(function (e) { console.warn('[DCC] Cultures fetch failed:', e.message); return []; });

                            Promise.all([scheduleReq, culturesReq]).then(function (results) {
                                dccSchedule = Array.isArray(results[0]) ? results[0] : [];
                                dccCultures = Array.isArray(results[1]) ? results[1] : [];

                                if (statusEl) {
                                    if (dccSchedule.length === 0 && dccCultures.length === 0) {
                                        statusEl.textContent = '\u26a0 Could not load culture data \u2014 check /assets/data/ files are deployed.';
                                        statusEl.className = 'dcc-data-status error';
                                    } else {
                                        const lastEntry = dccSchedule.length > 0 ? dccSchedule[dccSchedule.length - 1] : null;
                                        const lastDate = lastEntry ? lastEntry.date : null;
                                        const today = isoDate(new Date());
                                        const isStale = lastDate && lastDate < today;
                                        if (isStale) {
                                            statusEl.textContent = '\u26a0 Schedule covers through ' + lastDate + ' \u2014 showing rotation fallback for today. Update featured-cultures.json to extend.';
                                            statusEl.className = 'dcc-data-status warn';
                                        } else {
                                            statusEl.textContent = '\u2713 ' + dccSchedule.length + ' scheduled dates loaded \u00b7 ' + dccCultures.length + ' cultures in index';
                                            statusEl.className = 'dcc-data-status ok';
                                        }
                                    }
                                }

                                renderDccToday();
                                renderDccWeek();
                                renderDccMonth();
                                renderOvCultures();
                            });
                        }

                        // ── Render Overview hero ──
                        function renderOvCultures() {
                            const today = new Date();
                            const pair = getCulturesForDate(today);

                            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                            const dateEl = $('ov-cultures-date');
                            if (dateEl) dateEl.textContent = months[today.getMonth()] + ' ' + today.getDate() + ', ' + today.getFullYear();

                            function fillOvSlot(slot, entry) {
                                const nameEl = $('ov-' + slot + '-name');
                                const regionEl = $('ov-' + slot + '-region');
                                if (!nameEl) return;
                                if (!entry) { nameEl.textContent = 'No culture scheduled'; return; }
                                const meta = getCultureMeta(entry.slug);
                                nameEl.textContent = meta ? meta.culture_name : prettifySlug(entry.slug);
                                if (regionEl) regionEl.textContent = (meta && meta.region) ? meta.region : (entry.reason || '');
                            }
                            fillOvSlot('am', pair.am);
                            fillOvSlot('pm', pair.pm);

                            // Update the sidebar nav label under the Daily Calendar button
                            const navToday = $('nav-cs-today');
                            if (navToday && pair.am && pair.pm) {
                                const amMeta = getCultureMeta(pair.am.slug);
                                const pmMeta = getCultureMeta(pair.pm.slug);
                                const amName = amMeta ? amMeta.culture_name : prettifySlug(pair.am.slug);
                                const pmName = pmMeta ? pmMeta.culture_name : prettifySlug(pair.pm.slug);
                                navToday.textContent = amName + ' · ' + pmName;
                            }
                        }

                        // ── Render today ──
                        function renderDccToday() {
                            const today = new Date();
                            const pair = getCulturesForDate(today);

                            fillCard('am', pair.am);
                            fillCard('pm', pair.pm);
                            renderUpcoming();
                        }

                        function fillCard(slot, entry) {
                            const name = $('dcc-' + slot + '-name');
                            const region = $('dcc-' + slot + '-region');
                            const reason = $('dcc-' + slot + '-reason');
                            const fact = $('dcc-' + slot + '-fact');
                            if (!name) return;

                            if (!entry) {
                                name.textContent = 'No culture scheduled';
                                if (region) region.textContent = '';
                                if (reason) reason.textContent = '';
                                if (fact) fact.textContent = '';
                                return;
                            }

                            const meta = getCultureMeta(entry.slug);
                            name.textContent = meta ? meta.culture_name : prettifySlug(entry.slug);
                            if (region) region.textContent = meta && meta.region ? meta.region : '';
                            if (reason) reason.textContent = entry.reason || '';
                            if (fact) {
                                let factText = entry.featured_fact || '';
                                // Fall back to index summary when schedule entry is a stub
                                if (!factText || factText.includes('Initial stub') || factText.includes('requires enrichment')) {
                                    const metaSummary = meta && meta.summary && !meta.summary.includes('Initial stub') ? meta.summary : '';
                                    if (metaSummary) {
                                        const dot = metaSummary.indexOf('. ');
                                        factText = dot >= 0 ? metaSummary.substring(0, dot + 1) : metaSummary;
                                    } else {
                                        factText = 'Explore the rich traditions of the ' + (meta ? meta.culture_name : prettifySlug(entry.slug)) + ' people.';
                                    }
                                }
                                fact.textContent = factText;
                            }

                            // Show culture artwork
                            const imgEl = $('dcc-' + slot + '-img');
                            if (imgEl) {
                                const imgPath = meta && meta.image ? meta.image : null;
                                if (imgPath) {
                                    imgEl.src = 'https://www.culturesherpa.org' + imgPath;
                                    imgEl.alt = (meta ? meta.culture_name : '') + ' cultural art';
                                    imgEl.style.display = 'block';
                                } else {
                                    imgEl.style.display = 'none';
                                }
                            }
                        }

                        function renderUpcoming() {
                            const container = $('dcc-upcoming-list');
                            if (!container) return;
                            let html = '';
                            for (let i = 1; i <= 7; i++) {
                                const d = new Date();
                                d.setDate(d.getDate() + i);
                                const pair = getCulturesForDate(d);
                                const amLabel = pair.am ? prettifySlug(pair.am.slug) : '—';
                                const pmLabel = pair.pm ? prettifySlug(pair.pm.slug) : '—';
                                html += '<div class="dcc-schedule-row">';
                                html += '<span class="dcc-sched-date">' + dayName(d) + ' ' + d.getDate() + '</span>';
                                html += '<span class="dcc-sched-slug"><span class="dot am" style="width:6px;height:6px;border-radius:50%;display:inline-block;background:var(--accent-amber)"></span> ' + escapeHtml(amLabel) + '</span>';
                                html += '<span class="dcc-sched-slug"><span class="dot pm" style="width:6px;height:6px;border-radius:50%;display:inline-block;background:var(--accent-sky)"></span> ' + escapeHtml(pmLabel) + '</span>';
                                html += '<button class="dcc-swap-btn" data-dcc-swap-date="' + isoDate(d) + '">Swap</button>';
                                html += '</div>';
                            }
                            container.innerHTML = html;
                        }

                        // ── Render week ──
                        function renderDccWeek() {
                            const grid = $('dcc-week-grid');
                            const sched = $('dcc-week-schedule');
                            if (!grid) return;

                            const today = new Date();
                            const dayOfWeek = today.getDay();
                            const startOfWeek = new Date(today);
                            startOfWeek.setDate(today.getDate() - dayOfWeek);

                            let gridHtml = '';
                            let schedHtml = '';
                            for (let i = 0; i < 7; i++) {
                                const d = new Date(startOfWeek);
                                d.setDate(startOfWeek.getDate() + i);
                                const isToday = isoDate(d) === isoDate(today);
                                const pair = getCulturesForDate(d);

                                gridHtml += '<div class="dcc-day' + (isToday ? ' today' : '') + '">';
                                gridHtml += '<div class="dcc-day-label">' + dayName(d) + '</div>';
                                gridHtml += '<div class="dcc-day-num">' + d.getDate() + '</div>';
                                gridHtml += '<div class="dcc-day-cultures">';
                                if (pair.am) gridHtml += '<span class="dcc-slug am">' + escapeHtml(prettifySlug(pair.am.slug)) + '</span>';
                                if (pair.pm) gridHtml += '<span class="dcc-slug pm">' + escapeHtml(prettifySlug(pair.pm.slug)) + '</span>';
                                gridHtml += '</div></div>';

                                const amL = pair.am ? prettifySlug(pair.am.slug) : '—';
                                const pmL = pair.pm ? prettifySlug(pair.pm.slug) : '—';
                                schedHtml += '<div class="dcc-schedule-row">';
                                schedHtml += '<span class="dcc-sched-date">' + dayName(d) + ' ' + d.getDate() + '</span>';
                                schedHtml += '<span class="dcc-sched-slug"><span class="dot am" style="width:6px;height:6px;border-radius:50%;display:inline-block;background:var(--accent-amber)"></span> ' + escapeHtml(amL) + '</span>';
                                schedHtml += '<span class="dcc-sched-slug"><span class="dot pm" style="width:6px;height:6px;border-radius:50%;display:inline-block;background:var(--accent-sky)"></span> ' + escapeHtml(pmL) + '</span>';
                                schedHtml += '<button class="dcc-swap-btn" data-dcc-swap-date="' + isoDate(d) + '">Swap</button>';
                                schedHtml += '</div>';
                            }
                            grid.innerHTML = gridHtml;
                            if (sched) sched.innerHTML = schedHtml;
                        }

                        // ── Render month ──
                        function renderDccMonth() {
                            const grid = $('dcc-month-grid');
                            const label = $('dcc-month-label');
                            if (!grid) return;

                            const now = new Date();
                            const viewMonth = new Date(now.getFullYear(), now.getMonth() + dccMonthOffset, 1);
                            if (label) label.textContent = MONTH_NAMES[viewMonth.getMonth()] + ' ' + viewMonth.getFullYear();

                            const todayISO = isoDate(now);
                            const firstDay = viewMonth.getDay();
                            const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();

                            let html = '';
                            const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                            for (let h = 0; h < 7; h++) {
                                html += '<div class="dcc-month-header">' + dayHeaders[h] + '</div>';
                            }
                            // Empty cells before 1st
                            for (let e = 0; e < firstDay; e++) {
                                html += '<div class="dcc-month-cell empty"></div>';
                            }
                            for (let d = 1; d <= daysInMonth; d++) {
                                const dt = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d);
                                const iso = isoDate(dt);
                                const isToday = iso === todayISO;
                                const pair = getCulturesForDate(dt);
                                html += '<div class="dcc-month-cell' + (isToday ? ' today' : '') + '">';
                                html += '<div class="dcc-cell-num">' + d + '</div>';
                                if (pair.am) html += '<span class="dcc-slug am" style="font-size:0.58rem;display:block;margin-bottom:1px">' + escapeHtml(prettifySlug(pair.am.slug)) + '</span>';
                                if (pair.pm) html += '<span class="dcc-slug pm" style="font-size:0.58rem;display:block">' + escapeHtml(prettifySlug(pair.pm.slug)) + '</span>';
                                html += '</div>';
                            }
                            grid.innerHTML = html;
                        }

                        // ── Post Kit modal ──
                        function showShareKit(slot, entry, meta, focusPlatform) {
                            const name = meta ? meta.culture_name : prettifySlug(entry.slug);
                            const slug = entry.slug;
                            const region = (meta && meta.region) ? meta.region : '';
                            const summary = (meta && meta.summary) ? meta.summary : '';
                            // First sentence of summary as fallback for missing featured_fact
                            const summaryFirst = summary
                                ? (summary.indexOf('. ') > -1 ? summary.substring(0, summary.indexOf('. ') + 1) : summary)
                                : '';
                            let fact = entry.featured_fact || summaryFirst;
                            // Filter stubs: fall back to index summary or generic text
                            if (!fact || fact.includes('Initial stub') || fact.includes('requires enrichment')) {
                                fact = summaryFirst || ('Explore the rich traditions of the ' + name + ' people.');
                            }
                            const url = 'https://www.culturesherpa.org/explore/culture/' + slug;
                            const slotLabel = slot === 'am' ? 'Morning' : 'Evening';
                            const imgPath = meta && meta.image ? 'https://www.culturesherpa.org' + meta.image.replace(/(\.[^.\/]+)$/, '_branded$1') : null;
                            const imgPathPlain = meta && meta.image ? 'https://www.culturesherpa.org' + meta.image : null;

                            // ── Per-platform caption generators ──
                            const igTags = '#culture #art #travel #love #history #beautiful #photography #explore #world #people #diversity #heritage #indigenous #traditions #multicultural #globalcitizen #worldcultures #culturesherpa #culturalheritage #anthropology #folklore #humanstories #cultureiseverywhere #culturaleducation #educate #goodvibes #culturaldiversity #exploreculture #ethnicculture #cultureislife';

                            function igCaption() {
                                let t = '🌍 ' + name + (region ? ' | ' + region : '') + '\n\n';
                                if (fact) t += fact + '\n\n';
                                t += 'Discover hundreds of world cultures at CultureSherpa.org 🔗\n\n' + url + '\n\n' + igTags;
                                return t;
                            }

                            function liCaption() {
                                const tags = '#CultureSherpa #CulturalIntelligence #DEI #GlobalMindset #CrossCulturalCommunication #Anthropology #WorldCultures #CulturalHeritage';
                                let t = '🌍 ' + slotLabel + ' Culture Spotlight: ' + name;
                                if (region) t += ' (' + region + ')';
                                t += '\n\n';
                                if (fact) t += fact + '\n\n';
                                t += 'Cultural intelligence starts with curiosity. Explore ' + name + ' and hundreds of world cultures at CultureSherpa 👇\n\n' + url + '\n\n' + tags;
                                return t;
                            }

                            // Twitter counts every URL as exactly 23 chars regardless of domain length
                            function twitterLength(text) {
                                return text.replace(/https?:\/\/[^\s]+/g, 'x'.repeat(23)).length;
                            }

                            function xCaption() {
                                const tags = '#CultureSherpa #WorldCultures #History';
                                const head = '\uD83C\uDF0D ' + name + (region ? ' | ' + region : '');
                                const suffix = '\n\n\u21DD ' + url + '\n\n' + tags;
                                let full = head + (fact ? '\n\n' + fact : '') + suffix;
                                if (twitterLength(full) > 280 && fact) {
                                    const over = twitterLength(full) - 280;
                                    const trimLen = Math.max(0, fact.length - over - 1);
                                    const trimmedFact = trimLen > 0 ? fact.substring(0, trimLen) + '\u2026' : '';
                                    full = head + (trimmedFact ? '\n\n' + trimmedFact : '') + suffix;
                                }
                                return full;
                            }

                            function fbCaption() {
                                const tags = '#CultureSherpa #WorldCultures #Diversity #Heritage #Culture';
                                let t = '🌍 ' + slotLabel + ' Culture: ' + name;
                                if (region) t += ' (' + region + ')';
                                t += '\n\n';
                                if (fact) t += fact + '\n\n';
                                t += 'Learn more: ' + url + '\n\n' + tags;
                                return t;
                            }

                            const VARIANTS = [
                                { id: 'instagram', label: '📷 Instagram', cls: 'p-instagram', caption: igCaption(), charLimit: 2200, actionLabel: '📷 Open Instagram', actionUrl: 'https://www.instagram.com/', tip: '<strong>Instagram steps:</strong> 1. Click <em>Copy Image</em> (saves art). 2. Click <em>Open Instagram</em> and create a new post, then paste the caption.<br><em>Desktop?</em> Try <a href="https://creator.instagram.com" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">creator.instagram.com</a> to upload directly from a browser.' },
                                { id: 'linkedin', label: 'in LinkedIn', cls: 'p-linkedin', caption: liCaption(), charLimit: 3000, actionLabel: 'in Share on LinkedIn', actionUrl: 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(url), tip: '<strong>LinkedIn:</strong> Caption is auto-copied when you click the button. In the share dialog, click the poster dropdown → switch to <strong>CultureSherpa</strong> page, then paste the caption into the post body.' },
                                { id: 'x', label: '𝕏 X / Twitter', cls: 'p-x', caption: xCaption(), charLimit: 280, actionLabel: '𝕏 Post to X', actionUrl: 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(xCaption()), tip: '<strong>X / Twitter:</strong> The intent URL pre-fills this caption. Caption also auto-copied for manual compose.' },
                                { id: 'facebook', label: 'f Facebook', cls: 'p-facebook', caption: fbCaption(), charLimit: 63206, actionLabel: 'f Share on Facebook', actionUrl: 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url), tip: '<strong>Facebook tip:</strong> The sharer dialog includes the link preview. Paste the copied caption into the post box for full narrative.' },
                            ];

                            let activePlatformIdx = 0;
                            if (focusPlatform) {
                                const fi = VARIANTS.findIndex(function (v) { return v.id === focusPlatform; });
                                if (fi > -1) activePlatformIdx = fi;
                            }

                            const artSection = imgPath
                                ? '<div class="dcc-kit-art-wrap">'
                                + '<a href="' + escapeHtml(imgPath) + '" id="dcc-kit-art-link" download target="_blank" rel="noopener" title="Click to save art">'
                                + '<img class="dcc-kit-art" src="' + escapeHtml(imgPath) + '" alt="' + escapeHtml(name) + ' cultural art" id="dcc-kit-img">'
                                + '</a>'
                                + '<div class="dcc-kit-art-dl-hint">&#8659; Click image to save art</div>'
                                + '</div>'
                                : '<div class="dcc-kit-art-placeholder"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M2 14l5-5 4 4 3-3 5 5"/><circle cx="15" cy="8" r="2"/></svg><span>No art found \u2014 add an <em>image</em> field in cultures_index.json.</span></div>';

                            const copyImgBtn = imgPath
                                ? '<button class="btn btn-secondary btn-micro" id="dcc-kit-copy-img">&#x1F5BC; Copy Image</button>'
                                : '';

                            // Build tab HTML
                            const tabsHtml = '<div class="dcc-kit-platabs" id="dcc-kit-platabs">'
                                + VARIANTS.map(function (v, i) {
                                    return '<button class="dcc-kit-platab ' + v.cls + (i === activePlatformIdx ? ' active' : '') + '" data-platab="' + v.id + '">' + v.label + '</button>';
                                }).join('')
                                + '</div>';

                            const activeVar = VARIANTS[activePlatformIdx];
                            const capLen = activeVar.caption.length;
                            const cntPct = capLen / activeVar.charLimit;
                            const cntCls = cntPct > 1 ? 'over' : cntPct > 0.85 ? 'warn' : 'ok';

                            const xInitLen = activeVar.id === 'x' ? twitterLength(activeVar.caption) : capLen;
                            const xInitCls = (xInitLen / activeVar.charLimit) > 1 ? 'over' : (xInitLen / activeVar.charLimit) > 0.85 ? 'warn' : 'ok';
                            const displayCntCls = activeVar.id === 'x' ? xInitCls : cntCls;
                            const displayCapLen = activeVar.id === 'x' ? xInitLen : capLen;
                            const capAreaHtml = '<div class="dcc-kit-cap-header">'
                                + '<span class="dcc-kit-section-label" style="margin:0">Caption</span>'
                                + '<button class="dcc-kit-reset-btn" id="dcc-kit-reset-btn" title="Restore original caption" aria-label="Reset caption">&#x21ba; Reset</button>'
                                + '</div>'
                                + '<div class="dcc-kit-cap-area" id="dcc-kit-cap-area">'
                                + '<textarea class="dcc-kit-caption" id="dcc-kit-caption-text" rows="7" spellcheck="false" aria-label="Caption — edit before copying">' + escapeHtml(activeVar.caption) + '</textarea>'
                                + '<div class="dcc-kit-char-counter ' + displayCntCls + '" id="dcc-kit-char-counter">' + displayCapLen + ' / ' + activeVar.charLimit + (activeVar.id === 'x' ? ' tw' : '') + '</div>'
                                + '</div>';

                            const actionsHtml = '<div class="dcc-kit-actions" id="dcc-kit-actions-row">'
                                + '<button class="btn btn-primary btn-micro" id="dcc-kit-copy-text">Copy Caption</button>'
                                + copyImgBtn
                                + '<button class="btn btn-secondary btn-micro" id="dcc-kit-save-draft" title="Save as CMS draft">&#128190; Save Draft</button>'
                                + '<a class="btn-platform ' + activeVar.cls + '" href="' + escapeHtml(activeVar.actionUrl) + '" target="_blank" rel="noopener" id="dcc-kit-post-btn">' + activeVar.actionLabel + '</a>'
                                + '</div>';

                            const tipHtml = '<p class="dcc-kit-note" id="dcc-kit-platform-note">' + activeVar.tip + '</p>';

                            const overlay = document.createElement('div');
                            overlay.className = 'dcc-kit-overlay';
                            overlay.setAttribute('role', 'dialog');
                            overlay.setAttribute('aria-modal', 'true');
                            overlay.setAttribute('aria-label', 'Post Kit: ' + name);

                            overlay.innerHTML =
                                '<div class="dcc-kit-modal">'
                                + '<div class="dcc-kit-header">'
                                + '<h3>' + escapeHtml(name) + ' &mdash; ' + slotLabel + ' Post Kit</h3>'
                                + '<button class="dcc-kit-close" aria-label="Close post kit">&times;</button>'
                                + '</div>'
                                + artSection
                                + '<div class="dcc-kit-body">'
                                + '<div class="dcc-kit-section-label">Post to Platform</div>'
                                + tabsHtml
                                + capAreaHtml
                                + actionsHtml
                                + tipHtml
                                + '</div>'
                                + '</div>';

                            document.body.appendChild(overlay);

                            // ── Close ──
                            function closeKit() {
                                overlay.remove();
                                document.removeEventListener('keydown', kitKeyHandler);
                            }

                            overlay.addEventListener('click', function (e) {
                                if (e.target === overlay || e.target.classList.contains('dcc-kit-close')) {
                                    closeKit();
                                }
                            });

                            const kitKeyHandler = function (e) {
                                if (e.key === 'Escape') {
                                    closeKit();
                                    return;
                                }
                                // ── Focus trap ──
                                if (e.key === 'Tab') {
                                    const focusable = Array.from(overlay.querySelectorAll(
                                        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
                                    )).filter(function (el) { return !el.closest('[hidden]') && el.offsetParent !== null; });
                                    if (!focusable.length) return;
                                    const first = focusable[0];
                                    const last = focusable[focusable.length - 1];
                                    if (e.shiftKey) {
                                        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
                                    } else {
                                        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
                                    }
                                }
                            };
                            document.addEventListener('keydown', kitKeyHandler);

                            // ── Shared counter update helper ──
                            function updateKitCounter(rawLen, charLimit) {
                                const counterEl = overlay.querySelector('#dcc-kit-char-counter');
                                if (!counterEl) return;
                                const v = VARIANTS[activePlatformIdx];
                                let displayLen = rawLen;
                                if (v.id === 'x') {
                                    const capEl2 = overlay.querySelector('#dcc-kit-caption-text');
                                    if (capEl2) displayLen = twitterLength(capEl2.value);
                                }
                                const pct = displayLen / charLimit;
                                counterEl.className = 'dcc-kit-char-counter ' + (pct > 1 ? 'over' : pct > 0.85 ? 'warn' : 'ok');
                                counterEl.textContent = displayLen + ' / ' + charLimit + (v.id === 'x' ? ' tw' : '');
                                // Disable X post button if over 280 Twitter chars
                                if (v.id === 'x') {
                                    const postBtn2 = overlay.querySelector('#dcc-kit-post-btn');
                                    if (postBtn2) {
                                        if (pct > 1) {
                                            postBtn2.setAttribute('aria-disabled', 'true');
                                            postBtn2.style.opacity = '0.4';
                                            postBtn2.style.pointerEvents = 'none';
                                        } else {
                                            postBtn2.removeAttribute('aria-disabled');
                                            postBtn2.style.opacity = '';
                                            postBtn2.style.pointerEvents = '';
                                        }
                                    }
                                }
                            }

                            // ── Switch platform tab ──
                            function switchPlatformTab(idx) {
                                const v = VARIANTS[idx];
                                // Update tab button states
                                overlay.querySelectorAll('.dcc-kit-platab').forEach(function (btn, i) {
                                    btn.classList.toggle('active', i === idx);
                                });
                                // Update caption textarea
                                const capEl = overlay.querySelector('#dcc-kit-caption-text');
                                if (capEl) capEl.value = v.caption;
                                // Update char counter
                                updateKitCounter(v.caption.length, v.charLimit);
                                // Update action button
                                const postBtn = overlay.querySelector('#dcc-kit-post-btn');
                                if (postBtn) {
                                    postBtn.textContent = v.actionLabel;
                                    postBtn.className = 'btn-platform ' + v.cls;
                                    postBtn.style.opacity = '';
                                    postBtn.style.pointerEvents = '';
                                    postBtn.removeAttribute('aria-disabled');
                                    if (v.id === 'instagram') {
                                        postBtn.removeAttribute('href');
                                    } else if (v.id === 'x') {
                                        // Use fresh caption for intent URL
                                        postBtn.setAttribute('href', 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(v.caption));
                                    } else {
                                        postBtn.setAttribute('href', v.actionUrl);
                                    }
                                }
                                // Reset copy button label
                                const copyBtn = overlay.querySelector('#dcc-kit-copy-text');
                                if (copyBtn) copyBtn.textContent = 'Copy Caption';
                                // Update tip
                                const noteEl = overlay.querySelector('#dcc-kit-platform-note');
                                if (noteEl) noteEl.innerHTML = v.tip;
                            }

                            overlay.querySelectorAll('.dcc-kit-platab').forEach(function (btn, i) {
                                btn.addEventListener('click', function () {
                                    activePlatformIdx = i;
                                    switchPlatformTab(i);
                                });
                            });

                            // ── Live char counter on textarea input ──
                            const capTextarea = overlay.querySelector('#dcc-kit-caption-text');
                            if (capTextarea) {
                                capTextarea.addEventListener('input', function () {
                                    updateKitCounter(this.value.length, VARIANTS[activePlatformIdx].charLimit);
                                    // Keep X intent URL in sync with live edits
                                    if (VARIANTS[activePlatformIdx].id === 'x') {
                                        const pBtn = overlay.querySelector('#dcc-kit-post-btn');
                                        if (pBtn) pBtn.setAttribute('href', 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(this.value));
                                    }
                                });
                            }

                            // ── Branded image onerror → fall back to plain image ──
                            if (imgPathPlain && imgPath && imgPath !== imgPathPlain) {
                                const kitImg = overlay.querySelector('#dcc-kit-img');
                                if (kitImg) {
                                    kitImg.addEventListener('error', function () {
                                        if (!this._brandedFallback) {
                                            this._brandedFallback = true;
                                            this.src = imgPathPlain;
                                            const artLink = overlay.querySelector('#dcc-kit-art-link');
                                            if (artLink) artLink.href = imgPathPlain;
                                        }
                                    });
                                }
                            }

                            // ── Copy caption ──
                            const copyBtn = overlay.querySelector('#dcc-kit-copy-text');
                            if (copyBtn) {
                                copyBtn.addEventListener('click', function () {
                                    const capEl = overlay.querySelector('#dcc-kit-caption-text');
                                    const caption = capEl ? capEl.value : VARIANTS[activePlatformIdx].caption;
                                    navigator.clipboard.writeText(caption).then(function () {
                                        copyBtn.textContent = '\u2713 Copied!';
                                        setTimeout(function () { copyBtn.textContent = 'Copy Caption'; }, 2000);
                                    }).catch(function () { toast('Copy failed \u2014 select the text above manually.', 'error'); });
                                });
                            }

                            // ── Save Draft to CMS ──
                            const saveDraftBtn = overlay.querySelector('#dcc-kit-save-draft');
                            if (saveDraftBtn) {
                                saveDraftBtn.addEventListener('click', function () {
                                    const v = VARIANTS[activePlatformIdx];
                                    const capEl = overlay.querySelector('#dcc-kit-caption-text');
                                    const draftContent = capEl ? capEl.value : v.caption;
                                    const currentSrc = (overlay.querySelector('#dcc-kit-img') || {}).src || imgPath;
                                    saveDraftBtn.textContent = 'Saving\u2026';
                                    saveDraftBtn.disabled = true;
                                    fetch('/api/cms/social', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            brand: 'culturesherpa',
                                            platform: v.id,
                                            content: draftContent,
                                            culture_slug: slug,
                                            slot: slot,
                                            media_ids: currentSrc ? [currentSrc] : []
                                        })
                                    })
                                        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
                                        .then(function () {
                                            saveDraftBtn.textContent = '\u2713 Draft Saved';
                                            toast('Post draft saved!', 'success');
                                            setTimeout(function () { saveDraftBtn.textContent = '\uD83D\uDCBE Save Draft'; saveDraftBtn.disabled = false; }, 2500);
                                        })
                                        .catch(function (err) {
                                            saveDraftBtn.textContent = '\uD83D\uDCBE Save Draft';
                                            saveDraftBtn.disabled = false;
                                            toast('Failed to save draft: ' + err.message, 'error');
                                        });
                                });
                            }

                            // ── Post action button ──
                            const postBtnEl = overlay.querySelector('#dcc-kit-post-btn');
                            if (postBtnEl) {
                                postBtnEl.addEventListener('click', function (e) {
                                    const v = VARIANTS[activePlatformIdx];
                                    const capEl = overlay.querySelector('#dcc-kit-caption-text');
                                    const caption = capEl ? capEl.value : v.caption;
                                    // Auto-copy caption before opening platform
                                    navigator.clipboard && navigator.clipboard.writeText(caption).catch(function () { });
                                    if (v.id === 'instagram') {
                                        e.preventDefault();
                                        const igUrl = window.innerWidth >= 768
                                            ? 'https://creator.instagram.com'
                                            : 'https://www.instagram.com/';
                                        const noteEl = overlay.querySelector('#dcc-kit-platform-note');
                                        if (noteEl) noteEl.innerHTML = '<strong>Instagram steps:</strong> Caption copied! 1. Save the art (click image above or <em>Copy Image</em>). 2. Compose a new post, attach the art, then paste the caption.';
                                        setTimeout(function () { window.open(igUrl, '_blank', 'noopener'); }, 200);
                                    } else if (v.id === 'facebook') {
                                        const fbNote = overlay.querySelector('#dcc-kit-platform-note');
                                        if (fbNote) fbNote.innerHTML = '<strong>Facebook:</strong> Caption copied \u2014 paste it into the Facebook post text box after the link preview loads.';
                                        toast('Caption copied \u2014 paste it into the Facebook post.', 'info');
                                    } else if (v.id === 'linkedin') {
                                        // Update the share URL to use current caption if user edited it
                                        const liNote = overlay.querySelector('#dcc-kit-platform-note');
                                        if (liNote) liNote.innerHTML = '<strong>LinkedIn:</strong> Caption copied \u2014 paste it in the share dialog. Switch posting as <strong>CultureSherpa</strong> page.';
                                        toast('Caption copied \u2014 paste it in LinkedIn. Switch to CultureSherpa page in the share dialog!', 'info');
                                    }
                                });
                            }

                            // ── Copy image (try clipboard API; fall back to download) ──
                            const copyImgBtnEl = overlay.querySelector('#dcc-kit-copy-img');
                            if (copyImgBtnEl && imgPath) {
                                copyImgBtnEl.addEventListener('click', function () {
                                    copyImgBtnEl.textContent = 'Copying\u2026';
                                    copyImgBtnEl.disabled = true;
                                    const currentImg = overlay.querySelector('#dcc-kit-img');
                                    const effectiveImgPath = (currentImg && currentImg.src) || imgPath || imgPathPlain;
                                    const dlExt = effectiveImgPath ? effectiveImgPath.split('.').pop().split('?')[0] || 'webp' : 'webp';
                                    function fallbackDownload() {
                                        const a = document.createElement('a');
                                        a.href = effectiveImgPath;
                                        a.download = (slug || 'culture-art') + '_branded.' + dlExt;
                                        a.rel = 'noopener';
                                        a.target = '_blank';
                                        document.body.appendChild(a); a.click(); document.body.removeChild(a);
                                        copyImgBtnEl.textContent = '\u2713 Saved!';
                                        copyImgBtnEl.disabled = false;
                                        setTimeout(function () { copyImgBtnEl.textContent = '\uD83D\uDDBC\uFE0F Copy Image'; }, 2500);
                                        toast('Art saved \u2014 attach it when composing your post!', 'info');
                                    }
                                    if (navigator.clipboard && window.ClipboardItem) {
                                        fetch(effectiveImgPath, { mode: 'cors' })
                                            .then(function (r) { return r.blob(); })
                                            .then(function (blob) {
                                                const img2 = new Image();
                                                const objUrl = URL.createObjectURL(blob);
                                                img2.onload = function () {
                                                    const cv = document.createElement('canvas');
                                                    cv.width = img2.naturalWidth; cv.height = img2.naturalHeight;
                                                    cv.getContext('2d').drawImage(img2, 0, 0);
                                                    URL.revokeObjectURL(objUrl);
                                                    cv.toBlob(function (pngBlob) {
                                                        navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
                                                            .then(function () {
                                                                copyImgBtnEl.textContent = '\u2713 Image Copied!';
                                                                copyImgBtnEl.disabled = false;
                                                                setTimeout(function () { copyImgBtnEl.textContent = '\u{1F5BC} Copy Image'; }, 2500);
                                                                toast('Art copied to clipboard \u2014 paste it into your post!', 'success');
                                                            })
                                                            .catch(fallbackDownload);
                                                    }, 'image/png');
                                                };
                                                img2.onerror = function () { URL.revokeObjectURL(objUrl); fallbackDownload(); };
                                                img2.src = objUrl;
                                            })
                                            .catch(fallbackDownload);
                                    } else {
                                        fallbackDownload();
                                    }
                                });
                            }

                            // ── Reset caption ──
                            const resetBtn = overlay.querySelector('#dcc-kit-reset-btn');
                            if (resetBtn) {
                                resetBtn.addEventListener('click', function () {
                                    const v = VARIANTS[activePlatformIdx];
                                    const capEl = overlay.querySelector('#dcc-kit-caption-text');
                                    if (capEl) {
                                        capEl.value = v.caption;
                                        updateKitCounter(v.caption.length, v.charLimit);
                                        if (v.id === 'x') {
                                            const pBtn = overlay.querySelector('#dcc-kit-post-btn');
                                            if (pBtn) pBtn.setAttribute('href', 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(v.caption));
                                        }
                                        capEl.focus();
                                        toast('Caption reset.', 'info');
                                    }
                                });
                            }

                            // Focus close button for accessibility
                            const closeBtn = overlay.querySelector('.dcc-kit-close');
                            if (closeBtn) closeBtn.focus();
                        }

                        // ── Social sharing ──
                        // All platforms open the Post Kit modal pre-focused on the right tab.
                        // 'copy' is the only non-kit action (copies the page URL directly).
                        function shareCulture(slot, platform) {
                            const pair = getCulturesForDate(new Date());
                            const entry = slot === 'am' ? pair.am : pair.pm;
                            if (!entry) { toast('No culture to share.', 'error'); return; }

                            if (platform === 'copy') {
                                const copyUrl = 'https://www.culturesherpa.org/explore/culture/' + entry.slug;
                                if (navigator.clipboard) {
                                    navigator.clipboard.writeText(copyUrl).then(function () {
                                        toast('Link copied!', 'success');
                                    }).catch(function () {
                                        toast('Copy failed \u2014 try the Post Kit.', 'error');
                                    });
                                } else {
                                    toast('Clipboard unavailable \u2014 use the Post Kit to copy.', 'error');
                                }
                                return;
                            }

                            const meta = getCultureMeta(entry.slug);
                            // 'kit' with no focusPlatform defaults to Instagram (first tab)
                            const focusPlatform = platform === 'kit' ? null : platform;
                            showShareKit(slot, entry, meta, focusPlatform);
                        }

                        // ── View switching ──
                        function switchDccView(view) {
                            dccCurrentView = view;
                            ['today', 'week', 'month'].forEach(function (v) {
                                const el = $('dcc-view-' + v);
                                if (el) el.style.display = v === view ? '' : 'none';
                            });
                            document.querySelectorAll('.dcc-view-btn').forEach(function (btn) {
                                btn.classList.toggle('active', btn.dataset.dccView === view);
                            });
                        }

                        // ── Events ──
                        document.querySelectorAll('.dcc-view-btn').forEach(function (btn) {
                            btn.addEventListener('click', function () {
                                switchDccView(this.dataset.dccView);
                            });
                        });

                        document.querySelectorAll('[data-dcc-share]').forEach(function (btn) {
                            btn.addEventListener('click', function () {
                                shareCulture(this.dataset.dccShare, this.dataset.platform);
                            });
                        });

                        const prevBtn = $('dcc-month-prev');
                        const nextBtn = $('dcc-month-next');
                        if (prevBtn) prevBtn.addEventListener('click', function () { dccMonthOffset--; renderDccMonth(); });
                        if (nextBtn) nextBtn.addEventListener('click', function () { dccMonthOffset++; renderDccMonth(); });

                        const refreshBtn = $('dcc-refresh-btn');
                        if (refreshBtn) refreshBtn.addEventListener('click', function () { loadDccData(); toast('Refreshed culture calendar.', 'success'); });

                        // Export full featured-cultures.json with any in-session swaps applied
                        const exportBtn = $('dcc-export-btn');
                        if (exportBtn) exportBtn.addEventListener('click', function () {
                            if (dccSchedule.length === 0) {
                                toast('No schedule loaded yet — click Refresh first.', 'info');
                                return;
                            }
                            const json = JSON.stringify(dccSchedule, null, 2);
                            const blob = new Blob([json], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            const today = isoDate(new Date());
                            a.href = url;
                            a.download = 'featured-cultures-' + today + '.json';
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                            toast('Downloaded featured-cultures-' + today + '.json — commit to assets/data/ to deploy.', 'success');
                        });

                        // Swap button handler (delegated) — opens culture picker modal
                        let swapTargetDate = null;
                        let swapTargetSlot = 'am';
                        document.addEventListener('click', function (e) {
                            const swapBtn = e.target.closest('.dcc-swap-btn');
                            if (!swapBtn) return;
                            swapTargetDate = swapBtn.dataset.dccSwapDate;
                            swapTargetSlot = 'am';
                            const modal = document.getElementById('dcc-swap-modal');
                            const titleEl = document.getElementById('dcc-swap-title');
                            const dateLabel = document.getElementById('dcc-swap-date-label');
                            const searchInput = document.getElementById('dcc-swap-search');
                            if (!modal) return;
                            if (titleEl) titleEl.textContent = 'Swap Culture \u2014 ' + swapTargetDate;
                            if (dateLabel) {
                                const pair = getCulturesForDate(new Date(swapTargetDate + 'T12:00:00'));
                                const amName = pair.am ? prettifySlug(pair.am.slug) : '\u2014';
                                const pmName = pair.pm ? prettifySlug(pair.pm.slug) : '\u2014';
                                dateLabel.textContent = 'Current: AM = ' + amName + ' \u00b7 PM = ' + pmName;
                            }
                            // Reset slot buttons
                            modal.querySelectorAll('[data-swap-slot]').forEach(function (b) {
                                b.classList.toggle('active', b.dataset.swapSlot === 'am');
                            });
                            if (searchInput) searchInput.value = '';
                            renderSwapList('');
                            modal.classList.add('active');
                            if (searchInput) searchInput.focus();
                        });

                        // Slot toggle
                        document.addEventListener('click', function (e) {
                            const slotBtn = e.target.closest('[data-swap-slot]');
                            if (!slotBtn) return;
                            swapTargetSlot = slotBtn.dataset.swapSlot;
                            const modal = document.getElementById('dcc-swap-modal');
                            if (modal) modal.querySelectorAll('[data-swap-slot]').forEach(function (b) {
                                b.classList.toggle('active', b.dataset.swapSlot === swapTargetSlot);
                            });
                        });

                        // Search filter
                        const swapSearchEl = document.getElementById('dcc-swap-search');
                        if (swapSearchEl) swapSearchEl.addEventListener('input', function () { renderSwapList(this.value); });

                        function renderSwapList(query) {
                            const listEl = document.getElementById('dcc-swap-list');
                            if (!listEl) return;
                            const q = (query || '').toLowerCase().trim();
                            const filtered = dccCultures.filter(function (c) {
                                if (!q) return true;
                                return (c.culture_name || '').toLowerCase().indexOf(q) !== -1 ||
                                    (c.slug || '').toLowerCase().indexOf(q) !== -1 ||
                                    (c.region || '').toLowerCase().indexOf(q) !== -1;
                            }).slice(0, 60);
                            if (filtered.length === 0) {
                                listEl.innerHTML = '<div style="padding:1rem;color:var(--text-muted);text-align:center">No cultures match \u201c' + escapeHtml(q) + '\u201d</div>';
                                return;
                            }
                            let html = '';
                            for (let i = 0; i < filtered.length; i++) {
                                const c = filtered[i];
                                html += '<div class="dcc-swap-item" data-swap-slug="' + escapeHtml(c.slug) + '">';
                                html += '<div><div class="swap-name">' + escapeHtml(c.culture_name) + '</div>';
                                html += '<div class="swap-region">' + escapeHtml(c.region || '') + '</div></div></div>';
                            }
                            listEl.innerHTML = html;
                        }

                        // Culture selection — apply swap
                        document.addEventListener('click', function (e) {
                            const item = e.target.closest('.dcc-swap-item');
                            if (!item || !swapTargetDate) return;
                            const slug = item.dataset.swapSlug;
                            const meta = getCultureMeta(slug);
                            const name = meta ? meta.culture_name : prettifySlug(slug);

                            // Remove existing entry for this date+slot
                            dccSchedule = dccSchedule.filter(function (entry) {
                                if (entry.date !== swapTargetDate) return true;
                                const entrySlot = entry.slot || 'am';
                                return entrySlot !== swapTargetSlot;
                            });

                            // Add new entry
                            const newEntry = { date: swapTargetDate, slug: slug, reason: 'Admin swap', featured_fact: (meta && meta.summary) ? meta.summary : '' };
                            if (swapTargetSlot === 'pm') newEntry.slot = 'pm';
                            dccSchedule.push(newEntry);
                            dccSchedule.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

                            // Re-render
                            renderDccToday();
                            renderDccWeek();
                            renderDccMonth();
                            renderUpcoming();
                            renderOvCultures();

                            // Close modal
                            const modal = document.getElementById('dcc-swap-modal');
                            if (modal) modal.classList.remove('active');
                            toast('Swapped ' + swapTargetSlot.toUpperCase() + ' slot on ' + swapTargetDate + ' \u2192 ' + name, 'success');
                        });

                        // Copy JSON for the swapped date
                        const copyBtn = document.getElementById('dcc-swap-copy-btn');
                        if (copyBtn) copyBtn.addEventListener('click', function () {
                            if (!swapTargetDate) return;
                            const entries = dccSchedule.filter(function (e) { return e.date === swapTargetDate; });
                            if (entries.length === 0) { toast('No entries for ' + swapTargetDate, 'info'); return; }
                            const json = JSON.stringify(entries, null, 2);
                            navigator.clipboard.writeText(json).then(function () {
                                toast('Copied ' + entries.length + ' entry JSON to clipboard', 'success');
                            });
                        });

                        function ensureDccLoaded() {
                            if (!dccLoaded) {
                                dccLoaded = true;
                                loadDccData();
                                return;
                            }
                            renderDccToday();
                            renderDccWeek();
                            renderDccMonth();
                        }

                        window.__adminPanels = window.__adminPanels || {};
                        window.__adminPanels['daily-cultures'] = ensureDccLoaded;
                    })();

                    // --- NFT Studio Panel (20) --------------------------------------------------------
                    (function initNftStudioPanel() {
                        'use strict';

                        let nftCollections = [];
                        let nftTokens = [];
                        let activeCollId = null;

                        const RARITY_COLORS = {
                            Common: 'background:rgba(107,114,128,0.2);color:#9ca3af',
                            Uncommon: 'background:rgba(34,197,94,0.2);color:#4ade80',
                            Rare: 'background:rgba(59,130,246,0.2);color:#60a5fa',
                            Epic: 'background:rgba(168,85,247,0.2);color:#c084fc',
                            Legendary: 'background:rgba(234,179,8,0.2);color:#facc15',
                        };
                        const STATUS_COLORS = {
                            draft: 'background:rgba(107,114,128,0.2);color:#9ca3af',
                            watermarked: 'background:rgba(20,184,166,0.2);color:#2dd4bf',
                            ready: 'background:rgba(59,130,246,0.2);color:#60a5fa',
                            minted: 'background:rgba(34,197,94,0.2);color:#4ade80',
                            listed: 'background:rgba(249,115,22,0.2);color:#fb923c',
                        };

                        function autoSlug(v) {
                            return v.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
                        }

                        async function load() {
                            try {
                                const [collRes, tokRes] = await Promise.all([
                                    api('/nft/collections'),
                                    api('/nft/tokens?limit=500' + (activeCollId ? '&collection_id=' + activeCollId : '')),
                                ]);
                                nftCollections = collRes.collections || collRes || [];
                                nftTokens = tokRes.tokens || tokRes || [];
                                renderCollections();
                                renderTokens();
                                renderKPIs();
                            } catch (err) {
                                toast('NFT Studio: ' + err.message, 'error');
                            }
                        }

                        function renderKPIs() {
                            const byStatus = {};
                            nftTokens.forEach(function (t) { byStatus[t.status] = (byStatus[t.status] || 0) + 1; });
                            const el = function (id, v) { const e = $(id); if (e) e.textContent = v; };
                            el('nft-kpi-total', nftTokens.length);
                            el('nft-kpi-minted', byStatus.minted || 0);
                            el('nft-kpi-ready', byStatus.ready || 0);
                            el('nft-kpi-draft', byStatus.draft || 0);
                        }

                        function renderCollections() {
                            const list = $('nft-collections-list');
                            if (!list) return;
                            const allBtn = '<button class="btn btn-secondary" style="font-size:0.8rem;padding:0.3rem 0.6rem;text-align:left' +
                                (activeCollId === null ? ';background:var(--accent-bg)' : '') +
                                '" data-coll-id="">All Collections</button>';
                            const collBtns = nftCollections.map(function (c) {
                                return '<button class="btn btn-secondary" style="font-size:0.8rem;padding:0.3rem 0.6rem;text-align:left' +
                                    (activeCollId === c.id ? ';background:var(--accent-bg)' : '') +
                                    '" data-coll-id="' + c.id + '">' + escapeHtml(c.name) + '</button>';
                            });
                            list.innerHTML = allBtn + collBtns.join('');
                            list.querySelectorAll('[data-coll-id]').forEach(function (btn) {
                                btn.addEventListener('click', function () {
                                    activeCollId = this.dataset.collId ? Number(this.dataset.collId) : null;
                                    load();
                                });
                            });
                        }

                        function renderTokens() {
                            const tbody = $('nft-tokens-tbody');
                            if (!tbody) return;
                            const collMap = {};
                            nftCollections.forEach(function (c) { collMap[c.id] = c.name; });
                            if (!nftTokens.length) {
                                tbody.innerHTML = '<tr><td colspan="8" class="text-muted" style="text-align:center;padding:2rem">No tokens yet. Create a collection and add tokens to get started.</td></tr>';
                                return;
                            }
                            tbody.innerHTML = nftTokens.map(function (t) {
                                const rarityStyle = RARITY_COLORS[t.rarity] || RARITY_COLORS.Common;
                                const statusStyle = STATUS_COLORS[t.status] || STATUS_COLORS.draft;
                                return '<tr>' +
                                    '<td style="font-variant-numeric:tabular-nums;color:var(--text-muted)">' + (t.edition_number || '\u2014') + '</td>' +
                                    '<td><strong>' + escapeHtml(t.name) + '</strong></td>' +
                                    '<td>' + escapeHtml(collMap[t.collection_id] || '\u2014') + '</td>' +
                                    '<td><span class="tag" style="' + rarityStyle + '">' + escapeHtml(t.rarity || 'Common') + '</span></td>' +
                                    '<td><span class="tag" style="' + statusStyle + '">' + escapeHtml(t.status) + '</span></td>' +
                                    '<td style="font-family:var(--font-mono);font-size:0.75rem;color:var(--accent-teal)">' +
                                    (t.ipfs_image_cid ? t.ipfs_image_cid.slice(0, 10) + '\u2026' : '\u2014') + '</td>' +
                                    '<td style="font-size:0.78rem;color:var(--text-muted)">' + (t.minted_at ? formatDateTime(t.minted_at) : '\u2014') + '</td>' +
                                    '<td><button class="btn btn-secondary btn-sm" data-nft-edit-token="' + t.id + '">Edit</button></td>' +
                                    '</tr>';
                            }).join('');
                        }

                        function openCollectionModal(coll) {
                            $('nft-coll-modal-title').textContent = coll ? 'Edit Collection' : 'New Collection';
                            $('nft-coll-id').value = coll ? coll.id : '';
                            $('nft-coll-name').value = coll ? coll.name : '';
                            $('nft-coll-slug').value = coll ? (coll.slug || '') : '';
                            $('nft-coll-brand').value = coll ? (coll.brand || '') : '';
                            $('nft-coll-description').value = coll ? (coll.description || '') : '';
                            $('nft-coll-contract').value = coll ? (coll.contract_address || '') : '';
                            $('nft-coll-marketplace').value = coll ? (coll.marketplace_url || '') : '';
                            $('nft-coll-status').value = coll ? (coll.status || 'draft') : 'draft';
                            openModal('nft-collection-modal');
                        }

                        const saveCollBtn = $('nft-coll-save-btn');
                        if (saveCollBtn) saveCollBtn.addEventListener('click', async function () {
                            const id = $('nft-coll-id').value;
                            const name = $('nft-coll-name').value.trim();
                            if (!name) { toast('Collection name is required', 'error'); return; }
                            const payload = {
                                id: id ? Number(id) : undefined,
                                name: name,
                                slug: $('nft-coll-slug').value.trim() || autoSlug(name),
                                brand: $('nft-coll-brand').value || undefined,
                                description: $('nft-coll-description').value.trim() || undefined,
                                contract_address: $('nft-coll-contract').value.trim() || undefined,
                                marketplace_url: $('nft-coll-marketplace').value.trim() || undefined,
                                status: $('nft-coll-status').value,
                            };
                            try {
                                await api('/nft/collections', { method: id ? 'PUT' : 'POST', body: payload });
                                closeModal('nft-collection-modal');
                                toast('Collection saved', 'success');
                                load();
                            } catch (err) { toast(err.message, 'error'); }
                        });

                        const newCollBtn = $('nft-new-collection-btn');
                        if (newCollBtn) newCollBtn.addEventListener('click', function () { openCollectionModal(null); });

                        function openTokenModal(token) {
                            $('nft-token-modal-title').textContent = token ? 'Edit Token' : 'New Token';
                            $('nft-token-id').value = token ? token.id : '';
                            $('nft-token-name').value = token ? token.name : '';
                            $('nft-token-edition').value = token ? (token.edition_number || '') : '';
                            $('nft-token-description').value = token ? (token.description || '') : '';
                            $('nft-token-rarity').value = token ? (token.rarity || 'Common') : 'Common';
                            $('nft-token-ipfs-img').value = token ? (token.ipfs_image_cid || '') : '';
                            $('nft-token-ipfs-meta').value = token ? (token.ipfs_metadata_cid || '') : '';
                            $('nft-token-external-url').value = token ? (token.external_url || '') : '';
                            const sel = $('nft-token-collection');
                            sel.innerHTML = '<option value="">\u2014 select \u2014</option>' +
                                nftCollections.map(function (c) {
                                    return '<option value="' + c.id + '"' +
                                        (token && token.collection_id === c.id ? ' selected' : '') +
                                        '>' + escapeHtml(c.name) + '</option>';
                                }).join('');
                            if (!token && activeCollId) sel.value = activeCollId;
                            openModal('nft-token-modal');
                        }

                        const saveTokenBtn = $('nft-token-save-btn');
                        if (saveTokenBtn) saveTokenBtn.addEventListener('click', async function () {
                            const id = $('nft-token-id').value;
                            const name = $('nft-token-name').value.trim();
                            const collId = Number($('nft-token-collection').value);
                            if (!name) { toast('Token name is required', 'error'); return; }
                            if (!collId) { toast('Collection is required', 'error'); return; }
                            const payload = {
                                id: id ? Number(id) : undefined,
                                name: name,
                                collection_id: collId,
                                rarity: $('nft-token-rarity').value,
                                edition_number: $('nft-token-edition').value ? Number($('nft-token-edition').value) : undefined,
                                description: $('nft-token-description').value.trim() || undefined,
                                ipfs_image_cid: $('nft-token-ipfs-img').value.trim() || undefined,
                                ipfs_metadata_cid: $('nft-token-ipfs-meta').value.trim() || undefined,
                                external_url: $('nft-token-external-url').value.trim() || undefined,
                            };
                            try {
                                await api('/nft/tokens', { method: id ? 'PUT' : 'POST', body: payload });
                                closeModal('nft-token-modal');
                                toast('Token saved', 'success');
                                load();
                            } catch (err) { toast(err.message, 'error'); }
                        });

                        const newTokenBtn = $('nft-new-token-btn');
                        if (newTokenBtn) newTokenBtn.addEventListener('click', function () { openTokenModal(null); });

                        const nftRefreshBtn = $('nft-refresh-btn');
                        if (nftRefreshBtn) nftRefreshBtn.addEventListener('click', load);

                        document.addEventListener('click', function (e) {
                            const btn = e.target.closest('[data-nft-edit-token]');
                            if (!btn) return;
                            const id = Number(btn.dataset.nftEditToken);
                            const t = nftTokens.find(function (x) { return x.id === id; });
                            if (t) openTokenModal(t);
                        });

                        window.__adminPanels = window.__adminPanels || {};
                        window.__adminPanels['nft-studio'] = load;
                    })();

                    // --- Brand Registry Panel (21) ----------------------------------------------------
                    (function initBrandsPanel() {
                        'use strict';

                        const BRAND_DEFS = [
                            { id: 'gfd', name: 'Good Flippin Design', slug: 'gfd', color: '#6366f1', emoji: '\ud83c\udfa8', url: 'https://goodflippindesign.com' },
                            { id: 'gfv', name: 'Good Flippin Vibes', slug: 'gfv', color: '#8b5cf6', emoji: '\u2728', url: 'https://goodflippinvibes.com' },
                            { id: 'culturesherpa', name: 'CultureSherpa', slug: 'culturesherpa', color: '#10b981', emoji: '\ud83e\uddad', url: 'https://culturesherpa.org' },
                            { id: 'aiaimate', name: 'AI Aimate', slug: 'aiaimate', color: '#0ea5e9', emoji: '\ud83e\udd16', url: 'https://aiaimate.com' },
                            { id: 'globaldeets', name: 'GlobalDeets', slug: 'globaldeets', color: '#f59e0b', emoji: '\ud83c\udf0d', url: 'https://globaldeets.com' },
                            { id: 'citizenapproved', name: 'CitizenApproved', slug: 'citizenapproved', color: '#ef4444', emoji: '\u2705', url: 'https://citizenapproved.org' },
                        ];

                        async function load() {
                            const grid = $('brands-grid');
                            if (!grid) return;
                            const accountsMap = {};
                            const workflowMap = {};
                            let assetsByBrand = {};
                            try {
                                const [socRes, wfRes, statsRes] = await Promise.all([
                                    api('/social-accounts?limit=200'),
                                    api('/workflows?limit=200'),
                                    api('/stats'),
                                ]);
                                const accounts = socRes.accounts || socRes || [];
                                accounts.forEach(function (a) {
                                    if (!accountsMap[a.brand]) accountsMap[a.brand] = [];
                                    accountsMap[a.brand].push(a);
                                });
                                const workflows = wfRes.workflows || wfRes || [];
                                workflows.forEach(function (w) {
                                    workflowMap[w.brand] = (workflowMap[w.brand] || 0) + 1;
                                });
                                assetsByBrand = statsRes.assetsByBrand || {};
                            } catch (err) {
                                console.warn('[brands panel] Could not load live data:', err.message);
                            }
                            const totalAccounts = Object.values(accountsMap).reduce(function (s, v) { return s + v.length; }, 0);
                            const totalWorkflows = Object.values(workflowMap).reduce(function (s, v) { return s + v; }, 0);
                            const totalLinked = Object.values(accountsMap).reduce(function (s, v) {
                                return s + v.filter(function (a) { return a.link_status === 'linked'; }).length;
                            }, 0);
                            const kpi = function (id, v) { const e = $(id); if (e) e.textContent = v; };
                            kpi('br-kpi-total', BRAND_DEFS.length);
                            kpi('br-kpi-workflows', totalWorkflows);
                            kpi('br-kpi-accounts', totalAccounts);
                            kpi('br-kpi-linked', totalLinked);
                            grid.innerHTML = BRAND_DEFS.map(function (b) {
                                const accts = accountsMap[b.id] || [];
                                const wfCount = workflowMap[b.id] || 0;
                                const assetCount = assetsByBrand[b.id] || 0;
                                const acctTags = accts.slice(0, 6).map(function (a) {
                                    const isLinked = a.link_status === 'linked';
                                    const dot = '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' +
                                        (isLinked ? '#10b981' : 'var(--text-muted)') +
                                        ';margin-right:4px;vertical-align:middle" title="' +
                                        (isLinked ? 'Linked \u2022 ref: ' + (a.token_fingerprint || 'n/a') : 'Unlinked') + '"></span>';
                                    return '<span class="tag" style="font-size:0.72rem;background:rgba(255,255,255,0.06);display:inline-flex;align-items:center">' +
                                        dot + escapeHtml(a.platform) + (a.handle ? ' @' + escapeHtml(a.handle) : '') + '</span>';
                                }).join('');
                                const linkedCount = accts.filter(function (a) { return a.link_status === 'linked'; }).length;
                                const linkBadge = accts.length
                                    ? '<span class="tag" style="font-size:0.72rem;background:rgba(16,185,129,0.12);color:#10b981">' +
                                    linkedCount + '/' + accts.length + ' linked</span>'
                                    : '';
                                return '<article class="panel" style="border-top:3px solid ' + b.color + '">' +
                                    '<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.6rem">' +
                                    '<span style="font-size:1.5rem;line-height:1">' + b.emoji + '</span>' +
                                    '<div><strong style="font-size:1rem;color:var(--text)">' + escapeHtml(b.name) + '</strong>' +
                                    '<div style="font-size:0.75rem;color:var(--text-muted);font-family:var(--font-mono)">' + escapeHtml(b.slug) + '</div></div>' +
                                    '</div>' +
                                    '<div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;flex-wrap:wrap">' +
                                    '<span class="tag" style="font-size:0.72rem;background:rgba(255,255,255,0.06)">' + accts.length + ' accounts</span>' +
                                    '<span class="tag" style="font-size:0.72rem;background:rgba(255,255,255,0.06)">' + wfCount + ' workflows</span>' +
                                    '<span class="tag" style="font-size:0.72rem;background:rgba(255,255,255,0.06)">' + assetCount + ' assets</span>' +
                                    linkBadge +
                                    '</div>' +
                                    (acctTags ? '<div style="display:flex;flex-wrap:wrap;gap:0.3rem;margin-bottom:0.75rem">' + acctTags + '</div>' : '') +
                                    '<div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem">' +
                                    '<a href="' + escapeHtml(b.url) + '" target="_blank" rel="noopener" style="font-size:0.78rem;color:var(--text-muted)">' + escapeHtml(b.url) + '</a>' +
                                    '<button class="btn btn-secondary brands-sync-btn" data-brand="' + escapeHtml(b.id) + '" style="font-size:0.72rem;padding:0.25rem 0.6rem;height:auto">&#8644; Sync</button>' +
                                    '</div>' +
                                    '</article>';
                            }).join('');

                            // Per-brand sync buttons
                            grid.querySelectorAll('.brands-sync-btn').forEach(function (btn) {
                                btn.addEventListener('click', function () { populateForBrand(btn.dataset.brand); });
                            });
                        }

                        async function populateForBrand(brand) {
                            try {
                                const res = await api('/social-accounts/populate', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(brand ? { brand: brand } : {}),
                                });
                                toast('Synced ' + (res.populated || 0) + ' account(s)' + (brand ? ' for ' + brand : ''), 'success');
                                load();
                            } catch (err) {
                                toast('Sync failed: ' + err.message, 'error');
                            }
                        }

                        const brandsRefreshBtn = $('brands-refresh-btn');
                        if (brandsRefreshBtn) brandsRefreshBtn.addEventListener('click', load);

                        const brandsPopulateBtn = $('brands-populate-btn');
                        if (brandsPopulateBtn) brandsPopulateBtn.addEventListener('click', function () { populateForBrand(null); });

                        window.__adminPanels = window.__adminPanels || {};
                        window.__adminPanels['brands'] = load;
                    })();
                    // ─── End Daily Culture Calendar ────────────────────────────────

                    // ── Mission Control: Ecosystem Map ──────────────────────────────
                    async function renderEcosystemMap() {
                        const grid = $('eco-command-grid');
                        const updEl = $('eco-health-updated');
                        if (!grid) return;

                        // Fetch latest health sweep results (best-effort, no auth required)
                        const healthMap = {};
                        try {
                            const resp = await fetch('https://gfd-health-sweep.weave0.workers.dev/last');
                            if (resp.ok) {
                                const data = await resp.json();
                                (data.results || []).forEach(function (r) {
                                    const key = r.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
                                    healthMap[key] = r;
                                });
                                if (updEl) updEl.textContent = 'Health: ' + new Date().toLocaleTimeString();
                                state.lastHealthMap = healthMap;
                                renderHealthAlertBanner();
                            }
                        } catch (e) { /* health sweep unavailable */ }

                        const hostingLabel = { 'cf-pages': 'CF Pages', 'vercel': 'Vercel', 'gfd-inline': 'GFD Inline', 'undeployed': 'Undeployed' };

                        const CHECK_LABELS = [
                            { key: 'ga4', label: 'GA4' },
                            { key: 'sentry', label: 'Sentry' },
                            { key: 'csp', label: 'CSP' },
                            { key: 'ci', label: 'CI' },
                            { key: 'tests', label: 'Tests' },
                            { key: 'onerror', label: 'onerror' },
                            { key: 'monitor', label: 'Uptime' },
                        ];

                        grid.innerHTML = SITE_REGISTRY.map(function (site) {
                            const healthKey = site.domain;
                            const h = healthKey ? healthMap[healthKey] : null;
                            const dotClass = !healthKey ? 'unknown' : !h ? 'unknown' : h.ok ? 'ok' : 'fail';
                            const dotTitle = h ? (h.ok ? 'Up · ' + h.response_ms + 'ms' : 'Down · HTTP ' + (h.status_code || '?')) : 'No health data';
                            const links = [];
                            if (site.liveUrl) links.push('<a class="eco-site-link" href="' + site.liveUrl + '" target="_blank" rel="noopener">&#127758; Live</a>');
                            if (site.adminUrl) links.push('<a class="eco-site-link" href="' + site.adminUrl + '" target="_blank" rel="noopener">&#9881; Dashboard</a>');
                            if (site.repo) links.push('<a class="eco-site-link" href="https://github.com/' + site.repo + '" target="_blank" rel="noopener">&#128025; Repo</a>');
                            if (site.repo) links.push('<a class="eco-site-link" href="https://github.com/' + site.repo + '/commits/main" target="_blank" rel="noopener">&#128336; Commits</a>');

                            // Check badges
                            const checks = site.checks || {};
                            const checkFails = CHECK_LABELS.filter(function (c) { return checks[c.key] === false; }).length;
                            const checkBadges = CHECK_LABELS.map(function (c) {
                                const val = checks[c.key];
                                const cls = val === true ? 'pass' : val === false ? 'fail' : 'unknown';
                                const sym = val === true ? '✓' : val === false ? '✗' : '?';
                                return '<span class="eco-check-pill ' + cls + '" title="' + escapeHtml(c.label) + ': ' + (val === true ? 'confirmed' : val === false ? 'missing' : 'unknown') + '">' + sym + ' ' + escapeHtml(c.label) + '</span>';
                            }).join('');

                            const gapBadge = checkFails > 0 ? '<span style="font-size:0.7rem;font-weight:700;color:#f87171;margin-left:4px" title="' + checkFails + ' integration gap(s) found">' + checkFails + ' gap' + (checkFails > 1 ? 's' : '') + '</span>' : '';

                            return '<div class="eco-site-card' + (site.hosting === 'undeployed' ? ' undeployed' : '') + '">' +
                                '<div class="eco-site-card-header">' +
                                '<span class="eco-site-dot" style="background:' + site.color + '"></span>' +
                                '<span class="eco-site-name">' + escapeHtml(site.name) + gapBadge + '</span>' +
                                '<span class="eco-hosting-badge ' + site.hosting + '">' + (hostingLabel[site.hosting] || site.hosting) + '</span>' +
                                '</div>' +
                                '<div class="eco-site-purpose">' + escapeHtml(site.purpose) + '</div>' +
                                (healthKey ? '<div class="eco-health-indicator"><span class="eco-health-dot ' + dotClass + '" title="' + dotTitle + '"></span><span style="color:var(--text-muted)">' + (h ? (h.ok ? 'Up · ' + h.response_ms + 'ms' : '&#10005; Down') : 'Unknown') + '</span></div>' : '') +
                                (links.length ? '<div class="eco-site-links">' + links.join('') + '</div>' : '') +
                                '<div class="eco-check-row">' + checkBadges + '</div>' +
                                '<div class="eco-site-notes">' + escapeHtml(site.notes || '') + '</div>' +
                                '</div>';
                        }).join('');

                        const refreshBtn = $('eco-cmd-refresh-btn');
                        if (refreshBtn) {
                            refreshBtn.onclick = function () { renderEcosystemMap(); };
                        }
                    }

                    // ── Mission Control: Quick Launch ────────────────────────────────
                    function renderQuickLaunch() {
                        const grid = $('quick-launch-grid');
                        if (!grid) return;
                        const groups = {};
                        QUICK_LINKS.forEach(function (lnk) {
                            if (!groups[lnk.group]) groups[lnk.group] = [];
                            groups[lnk.group].push(lnk);
                        });
                        let html = '';
                        Object.entries(groups).forEach(function ([group, items]) {
                            html += '<span class="quick-launch-group-label">' + escapeHtml(group) + '</span>';
                            items.forEach(function (lnk) {
                                html += '<a class="quick-launch-item" href="' + lnk.url + '" target="_blank" rel="noopener">' +
                                    '<span class="quick-launch-icon">' + lnk.icon + '</span>' +
                                    '<span>' + escapeHtml(lnk.label) + '</span></a>';
                            });
                        });
                        grid.innerHTML = html;
                    }

                    // ── Mission Control: Ops Board ───────────────────────────────────
                    let _opsTasks = [];

                    function renderOpsBoard(tasks) {
                        _opsTasks = tasks || [];
                        const list = $('ops-board-list');
                        if (!list) return;
                        if (!_opsTasks.length) {
                            list.innerHTML = '<div class="text-muted" style="padding:8px 4px;font-size:0.82rem">No open tasks. Add one below.</div>';
                            return;
                        }
                        list.innerHTML = _opsTasks.map(function (t) {
                            const meta = [t.brand !== 'all' ? escapeHtml(t.brand.toUpperCase()) : '', t.area !== 'General' ? escapeHtml(t.area) : ''].filter(Boolean).join(' · ');
                            return '<div class="ops-task" data-sev="' + escapeHtml(t.severity) + '" data-id="' + escapeHtml(t.id) + '">' +
                                '<input type="checkbox" class="ops-task-check" title="Mark complete" aria-label="Complete task" />' +
                                '<div class="ops-task-body">' +
                                '<div class="ops-task-title">' + escapeHtml(t.title) + '</div>' +
                                (meta ? '<div class="ops-task-meta">' + meta + '</div>' : '') +
                                '</div>' +
                                '<button class="ops-task-del" title="Delete task" aria-label="Delete task">&#10005;</button>' +
                                '</div>';
                        }).join('');

                        list.querySelectorAll('.ops-task-check').forEach(function (chk) {
                            chk.addEventListener('change', function () {
                                const id = chk.closest('.ops-task').dataset.id;
                                opsCompleteTask(id);
                            });
                        });
                        list.querySelectorAll('.ops-task-del').forEach(function (btn) {
                            btn.addEventListener('click', function () {
                                const id = btn.closest('.ops-task').dataset.id;
                                opsDeleteTask(id);
                            });
                        });
                    }

                    async function loadOpsTasks() {
                        try {
                            const token = await state.clerk.session.getToken();
                            const resp = await fetch('/api/cms/admin-ops', { headers: { Authorization: 'Bearer ' + token } });
                            if (resp.ok) {
                                const data = await resp.json();
                                renderOpsBoard(data.tasks || []);
                            }
                        } catch (e) { console.error('[ops board]', e); }
                    }

                    async function opsCompleteTask(id) {
                        try {
                            const token = await state.clerk.session.getToken();
                            await fetch('/api/cms/admin-ops/' + encodeURIComponent(id), {
                                method: 'PUT',
                                headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ completed: true }),
                            });
                            await loadOpsTasks();
                        } catch (e) { console.error('[ops complete]', e); }
                    }

                    async function opsDeleteTask(id) {
                        try {
                            const token = await state.clerk.session.getToken();
                            await fetch('/api/cms/admin-ops/' + encodeURIComponent(id), {
                                method: 'DELETE',
                                headers: { Authorization: 'Bearer ' + token },
                            });
                            _opsTasks = _opsTasks.filter(function (t) { return t.id !== id; });
                            renderOpsBoard(_opsTasks);
                        } catch (e) { console.error('[ops delete]', e); }
                    }

                    function initOpsBoard() {
                        renderGapFlags();
                        loadOpsTasks();
                        const form = $('ops-add-form');
                        if (!form) return;
                        form.addEventListener('submit', async function (e) {
                            e.preventDefault();
                            const titleEl = $('ops-add-title');
                            const sevEl = $('ops-add-severity');
                            const brandEl = $('ops-add-brand');
                            const title = titleEl ? titleEl.value.trim() : '';
                            if (!title) return;
                            try {
                                const token = await state.clerk.session.getToken();
                                const resp = await fetch('/api/cms/admin-ops', {
                                    method: 'POST',
                                    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        title,
                                        severity: sevEl ? sevEl.value : 'normal',
                                        brand: brandEl ? brandEl.value : 'all',
                                    }),
                                });
                                if (resp.ok) {
                                    logActivity('Ops Flag', title + ' [' + (sevEl ? sevEl.value : 'normal') + ']', 'action');
                                    if (titleEl) titleEl.value = '';
                                    await loadOpsTasks();
                                }
                            } catch (err) { console.error('[ops add]', err); }
                        });
                    }

                    // ── Activity Log ─────────────────────────────────────────────────
                    const ACTIVITY_MAX = 60;
                    const ACTIVITY_KEY = 'gfd_activity_log';

                    // Wire buttons + render on load
                    (function () {
                        const clearBtn = $('activity-clear-btn');
                        if (clearBtn) {
                            clearBtn.addEventListener('click', function () {
                                try { localStorage.removeItem(ACTIVITY_KEY); } catch (e) { /* */ }
                                renderActivityTimeline();
                            });
                        }
                        const exportBtn = $('eco-export-manifest-btn');
                        if (exportBtn) exportBtn.addEventListener('click', exportStudioManifest);
                        renderActivityTimeline();
                    }());

                    function logActivity(action, detail, type) {
                        try {
                            const log = JSON.parse(localStorage.getItem(ACTIVITY_KEY) || '[]');
                            log.unshift({ ts: new Date().toISOString(), action, detail: detail || '', type: type || 'nav' });
                            if (log.length > ACTIVITY_MAX) log.length = ACTIVITY_MAX;
                            localStorage.setItem(ACTIVITY_KEY, JSON.stringify(log));
                        } catch (e) { /* localStorage unavailable */ }
                        renderActivityTimeline();
                    }

                    function renderActivityTimeline() {
                        const el = $('activity-timeline');
                        if (!el) return;
                        let log = [];
                        try { log = JSON.parse(localStorage.getItem(ACTIVITY_KEY) || '[]'); } catch (e) { /* */ }
                        if (!log.length) {
                            el.innerHTML = '<div class="activity-empty">No activity yet &mdash; navigation, sweeps, publishes, and exports will appear here.</div>';
                            return;
                        }
                        el.innerHTML = log.map(e => {
                            const ago = relTimeFromIso(e.ts);
                            const dotCls = (e.type === 'action' || e.type === 'export') ? e.type : 'nav';
                            return `<div class="activity-item">` +
                                `<span class="activity-time">${escapeHtml(ago)}</span>` +
                                `<span class="activity-dot ${escapeHtml(dotCls)}"></span>` +
                                `<span class="activity-action">${escapeHtml(e.action)}</span>` +
                                (e.detail ? `<span class="activity-detail">${escapeHtml(e.detail)}</span>` : '') +
                                `</div>`;
                        }).join('');
                    }

                    function relTimeFromIso(iso) {
                        try {
                            const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
                            if (diff < 5) return 'just now';
                            if (diff < 60) return diff + 's ago';
                            if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
                            if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
                            return Math.floor(diff / 86400) + 'd ago';
                        } catch (e) { return ''; }
                    }

                    function renderServerAuditLog(entries, total) {
                        const tbody = $('server-audit-tbody');
                        const totalLabel = $('audit-total-label');
                        if (!tbody) return;
                        if (totalLabel) totalLabel.textContent = total ? total.toLocaleString() + ' total entries' : '';
                        if (!entries || !entries.length) {
                            tbody.innerHTML = '<tr><td colspan="5" class="text-muted">No audit entries yet — write operations will appear here.</td></tr>';
                            return;
                        }
                        const actionIcon = {
                            'asset.create': '➕', 'asset.update': '✏️', 'asset.delete': '🗑️',
                            'upload': '⬆️', 'upload_url': '🔗', 'bulk_approve': '✅',
                            'asset.approve': '✅', 'asset.reject': '❌',
                            'social.create': '📤', 'social.update': '✏️', 'social.delete': '🗑️',
                            'social.campaign.create': '📣', 'social.connection.upsert': '🔌',
                            'social.account.upsert': '👤', 'campaign.create': '🚀',
                            'character.create': '🎭', 'character.update': '✏️', 'character.delete': '🗑️',
                            'donation.record': '💰', 'admin.ops.create': '📋',
                        };
                        tbody.innerHTML = entries.map(function (e) {
                            const icon = actionIcon[e.action] || '·';
                            const userShort = (e.user_id || '').slice(0, 8);
                            const targetShort = String(e.target_id || '').slice(0, 16);
                            return '<tr>' +
                                '<td style="white-space:nowrap;font-size:0.75rem">' + escapeHtml(relTimeFromIso(e.created_at)) + '</td>' +
                                '<td><span title="' + escapeHtml(e.action) + '">' + escapeHtml(icon) + '</span> <span style="font-size:0.8rem">' + escapeHtml(e.action) + '</span></td>' +
                                '<td><span class="tag" style="font-size:0.73rem">' + escapeHtml(e.target_type || '—') + '</span></td>' +
                                '<td style="font-family:\'JetBrains Mono\',monospace;font-size:0.73rem;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escapeHtml(String(e.target_id || '')) + '">' + escapeHtml(targetShort) + '</td>' +
                                '<td style="font-family:\'JetBrains Mono\',monospace;font-size:0.73rem;color:var(--text-muted)">' + escapeHtml(userShort) + '</td>' +
                                '</tr>';
                        }).join('');

                        // Wire refresh button once
                        const refreshBtn = $('audit-refresh-btn');
                        if (refreshBtn && !refreshBtn._wired) {
                            refreshBtn._wired = true;
                            refreshBtn.addEventListener('click', async function () {
                                refreshBtn.disabled = true;
                                refreshBtn.textContent = '…';
                                try {
                                    const stats = await api('/stats');
                                    renderServerAuditLog(stats.recentAudit || [], Number(stats.auditTotal || 0));
                                } catch (e) {
                                    toast('Failed to reload audit log: ' + e.message, 'error');
                                } finally {
                                    refreshBtn.disabled = false;
                                    refreshBtn.textContent = 'Refresh';
                                }
                            });
                        }
                    }

                    // ── Export Studio Manifest ───────────────────────────────────────
                    function exportStudioManifest() {
                        const manifest = {
                            generated: new Date().toISOString(),
                            version: '1.0',
                            description: 'GFD Studio Manifest — Single Source of Truth for the ecosystem',
                            sites: SITE_REGISTRY.map(s => ({
                                id: s.id,
                                name: s.name,
                                domain: s.domain || null,
                                purpose: s.purpose,
                                hosting: s.hosting,
                                liveUrl: s.liveUrl || null,
                                repo: s.repo || null,
                                checks: s.checks,
                                notes: s.notes || '',
                            })),
                        };
                        const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'studio-manifest.json';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        logActivity('Export', 'Downloaded studio-manifest.json', 'export');
                    }

                    // ─── Projects Panel (Charter §10) ─────────────────────────────
                    (function initProjectsPanel() {
                        const PROJ_REPOS = SITE_REGISTRY
                            .filter(function (s) { return s.repo; })
                            .map(function (s) {
                                const parts = s.repo.split('/');
                                return { owner: parts[0], repo: parts[1], label: s.name, color: s.color, domain: s.domain };
                            });

                        async function fetchRepoData(owner, repo) {
                            const headers = { 'Accept': 'application/vnd.github+json' };
                            try {
                                const repoRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo, { headers: headers });
                                const repoData = repoRes.ok ? await repoRes.json() : null;

                                const runsRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/actions/runs?per_page=1', { headers: headers });
                                const runsData = runsRes.ok ? await runsRes.json() : { workflow_runs: [] };

                                const prsRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/pulls?state=open&per_page=100', { headers: headers });
                                const prs = prsRes.ok ? await prsRes.json() : [];

                                const protRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/branches/main/protection', { headers: headers });
                                const hasProt = protRes.ok;

                                return {
                                    repo: repoData,
                                    lastRun: (runsData.workflow_runs || [])[0] || null,
                                    openPRs: Array.isArray(prs) ? prs.length : 0,
                                    branchProtection: hasProt
                                };
                            } catch (e) {
                                return { error: e.message };
                            }
                        }

                        async function loadProjects() {
                            const grid = $('proj-grid');
                            if (!grid) return;
                            grid.innerHTML = '<div class="text-muted" style="text-align:center;padding:2rem">Fetching from GitHub&hellip;</div>';

                            const results = await Promise.all(PROJ_REPOS.map(function (r) {
                                return fetchRepoData(r.owner, r.repo).then(function (data) {
                                    return Object.assign({}, r, data);
                                });
                            }));

                            let passing = 0, failing = 0, totalPRs = 0;
                            results.forEach(function (r) {
                                if (r.lastRun) {
                                    if (r.lastRun.conclusion === 'success') passing++;
                                    else if (r.lastRun.conclusion === 'failure') failing++;
                                }
                                totalPRs += r.openPRs || 0;
                            });

                            $('proj-kpi-total').textContent = results.length;
                            $('proj-kpi-passing').textContent = passing;
                            $('proj-kpi-failing').textContent = failing;
                            $('proj-kpi-prs').textContent = totalPRs;

                            grid.innerHTML = results.map(function (r) {
                                let ciStatus = 'none';
                                let ciLabel = 'No CI';
                                let ciCls = 'tag';
                                if (r.lastRun) {
                                    ciStatus = r.lastRun.conclusion || r.lastRun.status || 'unknown';
                                    ciLabel = ciStatus;
                                    ciCls = ciStatus === 'success' ? 'tag ok' : ciStatus === 'failure' ? 'tag fail' : 'tag warn';
                                }

                                const protLabel = r.branchProtection ? '🔒 Protected' : '⚠️ Unprotected';
                                const protCls = r.branchProtection ? 'color:#10b981' : 'color:#ef4444';

                                const lastCommit = r.repo && r.repo.pushed_at ? ecoRelTime(r.repo.pushed_at) : '—';
                                const desc = r.repo && r.repo.description ? escapeHtml(r.repo.description) : r.domain || '';

                                return '<div class="panel" style="padding:1rem;border-left:3px solid ' + r.color + '">' +
                                    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">' +
                                    '<strong>' + escapeHtml(r.label) + '</strong>' +
                                    '<span class="' + ciCls + '">' + escapeHtml(ciLabel) + '</span></div>' +
                                    '<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.5rem">' + desc + '</div>' +
                                    '<div style="display:flex;gap:1rem;font-size:0.75rem;flex-wrap:wrap">' +
                                    '<span>Last push: ' + lastCommit + '</span>' +
                                    '<span>PRs: <strong>' + (r.openPRs || 0) + '</strong></span>' +
                                    '<span style="' + protCls + '">' + protLabel + '</span>' +
                                    '</div>' +
                                    '<div style="margin-top:0.5rem;font-size:0.72rem">' +
                                    '<a href="https://github.com/' + r.owner + '/' + r.repo + '" target="_blank" rel="noopener" style="color:var(--accent-cyan)">GitHub</a>' +
                                    (r.domain ? ' · <a href="https://' + r.domain + '" target="_blank" rel="noopener" style="color:var(--accent-cyan)">' + r.domain + '</a>' : '') +
                                    '</div></div>';
                            }).join('');
                        }

                        const projRefresh = $('proj-refresh-btn');
                        if (projRefresh) projRefresh.addEventListener('click', loadProjects);
                        window.__adminPanels = window.__adminPanels || {};
                        window.__adminPanels['projects'] = loadProjects;
                    })();

                    // ─── Deployments Panel (Charter §10) ──────────────────────────
                    (function initDeploymentsPanel() {
                        const DEPLOY_REPOS = SITE_REGISTRY
                            .filter(function (s) { return s.repo; })
                            .map(function (s) {
                                const parts = s.repo.split('/');
                                return { owner: parts[0], repo: parts[1], label: s.name, color: s.color };
                            });

                        // per-repo health data keyed by label
                        let _healthMap = {};

                        async function loadDeployments() {
                            const timeline = $('deploy-timeline');
                            const healthGrid = $('deploy-health-grid');
                            if (!timeline) return;
                            timeline.innerHTML = '<div class="text-muted" style="text-align:center;padding:2rem">Fetching deployments&hellip;</div>';
                            if (healthGrid) healthGrid.innerHTML = '<div class="text-muted" style="text-align:center;padding:1.5rem;grid-column:1/-1">Fetching&hellip;</div>';

                            const allRuns = [];
                            const repoRuns = {}; // label -> run[]
                            const headers = { 'Accept': 'application/vnd.github+json' };

                            await Promise.all(DEPLOY_REPOS.map(async function (r) {
                                try {
                                    const res = await fetch(
                                        'https://api.github.com/repos/' + r.owner + '/' + r.repo + '/actions/runs?per_page=30&event=push',
                                        { headers: headers }
                                    );
                                    if (!res.ok) return;
                                    const data = await res.json();
                                    const runs = (data.workflow_runs || []).map(function (run) {
                                        return Object.assign({}, run, { _label: r.label, _color: r.color });
                                    });
                                    repoRuns[r.label] = runs;
                                    runs.forEach(function (run) { allRuns.push(run); });
                                } catch (e) { /* skip */ }
                            }));

                            allRuns.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });

                            const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
                            const recent = allRuns.filter(function (r) { return new Date(r.created_at).getTime() > sevenDaysAgo; });

                            const success = recent.filter(function (r) { return r.conclusion === 'success'; }).length;
                            const failed = recent.filter(function (r) { return r.conclusion === 'failure'; }).length;

                            $('deploy-kpi-total').textContent = recent.length;
                            $('deploy-kpi-success').textContent = success;
                            $('deploy-kpi-failed').textContent = failed;
                            $('deploy-kpi-last').textContent = allRuns.length ? ecoRelTime(allRuns[0].created_at) : '—';

                            // ── Per-repo health scoring ────────────────────────────────
                            _healthMap = {};
                            let criticalCount = 0;

                            DEPLOY_REPOS.forEach(function (r) {
                                const runs = (repoRuns[r.label] || []).filter(function (run) {
                                    return run.conclusion === 'success' || run.conclusion === 'failure';
                                });
                                const total = runs.length;
                                const successes = runs.filter(function (run) { return run.conclusion === 'success'; }).length;
                                const rate = total ? Math.round(successes / total * 100) : null;

                                // average deploy duration in seconds
                                const durs = runs.filter(function (run) { return run.updated_at && run.created_at; }).map(function (run) {
                                    return (new Date(run.updated_at) - new Date(run.created_at)) / 1000;
                                });
                                const avgDur = durs.length ? Math.round(durs.reduce(function (a, b) { return a + b; }, 0) / durs.length) : null;

                                // streak: consecutive from top
                                let streak = 0;
                                let streakSign = null;
                                for (let i = 0; i < runs.length; i++) {
                                    const c = runs[i].conclusion;
                                    if (streakSign === null) { streakSign = c; streak = 1; }
                                    else if (c === streakSign) { streak++; }
                                    else { break; }
                                }

                                const isCritical = streakSign === 'failure' && streak >= 2;
                                if (isCritical) criticalCount++;

                                // last 10 spark dots
                                const sparkRuns = (repoRuns[r.label] || []).filter(function (run) {
                                    return run.conclusion === 'success' || run.conclusion === 'failure';
                                }).slice(0, 10);

                                _healthMap[r.label] = {
                                    color: r.color, label: r.label,
                                    rate: rate, avgDur: avgDur,
                                    streak: streak, streakSign: streakSign,
                                    isCritical: isCritical,
                                    sparkRuns: sparkRuns, total: total
                                };
                            });

                            // ecosystem health KPI = weighted average across repos with data
                            const ratesWithData = Object.values(_healthMap).filter(function (h) { return h.rate !== null; });
                            const ecoHealth = ratesWithData.length
                                ? Math.round(ratesWithData.reduce(function (sum, h) { return sum + h.rate; }, 0) / ratesWithData.length)
                                : null;
                            const healthEl = $('deploy-kpi-health');
                            if (healthEl) {
                                healthEl.textContent = ecoHealth !== null ? ecoHealth + '%' : '—';
                                healthEl.style.color = ecoHealth >= 90 ? '#10b981' : ecoHealth >= 70 ? '#f59e0b' : '#ef4444';
                            }

                            // alert badge on nav button
                            const alertBadge = $('deploy-alert-badge');
                            if (alertBadge) {
                                if (criticalCount > 0) {
                                    alertBadge.textContent = criticalCount;
                                    alertBadge.classList.remove('d-none');
                                } else {
                                    alertBadge.classList.add('d-none');
                                }
                            }

                            // render per-repo health cards
                            if (healthGrid) {
                                const cards = Object.values(_healthMap);
                                if (!cards.length) {
                                    healthGrid.innerHTML = '<div class="text-muted" style="grid-column:1/-1;text-align:center;padding:1.5rem">No repos found</div>';
                                } else {
                                    healthGrid.innerHTML = cards.map(function (h) {
                                        const rateColor = h.rate === null ? 'var(--text-muted)' : h.rate >= 90 ? '#10b981' : h.rate >= 70 ? '#f59e0b' : '#ef4444';
                                        const rateText = h.rate !== null ? h.rate + '%' : 'N/A';
                                        const avgText = h.avgDur !== null ? (h.avgDur >= 60 ? Math.round(h.avgDur / 60) + 'm ' + (h.avgDur % 60) + 's' : h.avgDur + 's') : '—';
                                        const streakLabel = h.streakSign === 'success'
                                            ? '✅ ' + h.streak + ' consecutive'
                                            : h.streakSign === 'failure'
                                                ? '❌ ' + h.streak + ' consecutive fail' + (h.streak > 1 ? 's' : '')
                                                : '—';
                                        let sparks = h.sparkRuns.map(function (run) {
                                            const cls = run.conclusion === 'success' ? 'ok' : 'fail';
                                            return '<span class="deploy-spark ' + cls + '" title="' + escapeHtml(run.conclusion) + ' · ' + escapeHtml(ecoRelTime(run.created_at)) + '"></span>';
                                        }).join('');
                                        // pad to 10 dots
                                        for (let i = h.sparkRuns.length; i < 10; i++) {
                                            sparks += '<span class="deploy-spark skip"></span>';
                                        }
                                        return '<div class="deploy-health-card" style="border-left-color:' + escapeHtml(h.color) + '">' +
                                            '<div class="deploy-health-card-name" title="' + escapeHtml(h.label) + '">' + escapeHtml(h.label) + '</div>' +
                                            '<div class="deploy-health-score" style="color:' + rateColor + '">' + rateText + '</div>' +
                                            '<div class="deploy-spark-row" aria-label="Last 10 runs">' + sparks + '</div>' +
                                            '<div class="deploy-health-meta">' +
                                            '<span>Avg build: ' + avgText + '</span>' +
                                            '<span class="deploy-streak">' + streakLabel + '</span>' +
                                            '<span>Runs sampled: ' + h.total + '</span>' +
                                            '</div>' +
                                            '</div>';
                                    }).join('');
                                }
                            }

                            // ── Timeline ──────────────────────────────────────────────
                            const shown = allRuns.slice(0, 30);
                            if (!shown.length) {
                                timeline.innerHTML = '<div class="text-muted" style="text-align:center;padding:2rem">No deployment runs found</div>';
                                return;
                            }

                            timeline.innerHTML = shown.map(function (run) {
                                const cls = run.conclusion === 'success' ? 'ok' : run.conclusion === 'failure' ? 'fail' : 'warn';
                                const icon = run.conclusion === 'success' ? '✅' : run.conclusion === 'failure' ? '❌' : '🔄';
                                let dur = '';
                                if (run.updated_at && run.created_at) {
                                    const ms = new Date(run.updated_at) - new Date(run.created_at);
                                    dur = Math.round(ms / 1000) + 's';
                                }
                                return '<div class="panel" style="padding:0.75rem 1rem;border-left:3px solid ' + run._color + ';display:flex;align-items:center;gap:1rem;flex-wrap:wrap">' +
                                    '<span style="font-size:1.1rem">' + icon + '</span>' +
                                    '<div style="flex:1;min-width:200px">' +
                                    '<strong style="font-size:0.85rem">' + escapeHtml(run._label) + '</strong>' +
                                    '<span style="color:var(--text-muted);font-size:0.78rem;margin-left:0.5rem">' + escapeHtml(run.name || '') + '</span>' +
                                    '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.2rem">' +
                                    escapeHtml(run.head_commit ? run.head_commit.message.split('\n')[0] : run.display_title || '') +
                                    '</div></div>' +
                                    '<span class="tag ' + cls + '" style="font-size:0.72rem">' + escapeHtml(run.conclusion || run.status || 'running') + '</span>' +
                                    (dur ? '<span style="font-size:0.72rem;color:var(--text-muted)">' + dur + '</span>' : '') +
                                    '<span style="font-size:0.72rem;color:var(--text-muted)">' + ecoRelTime(run.created_at) + '</span>' +
                                    '<a href="' + escapeHtml(run.html_url) + '" target="_blank" rel="noopener" style="font-size:0.72rem;color:var(--accent-cyan)">View</a>' +
                                    '</div>';
                            }).join('');
                        }

                        const deployRefresh = $('deploy-refresh-btn');
                        if (deployRefresh) deployRefresh.addEventListener('click', loadDeployments);
                        window.__adminPanels = window.__adminPanels || {};
                        window.__adminPanels['deployments'] = loadDeployments;
                    })();

                    // ─── Settings Panel (Charter §10) ─────────────────────────────
                    (function initSettingsPanel() {
                        const INTEGRATIONS = [
                            { name: 'Clerk', desc: 'Auth for community + admin', icon: '🔐', checkFn: function () { return !!window.Clerk; } },
                            { name: 'Stripe', desc: 'Donation payments', icon: '💳', checkFn: function () { return !!(window.ENV && window.ENV.STRIPE_PUBLISHABLE_KEY); } },
                            { name: 'Formspree', desc: 'Contact form processing', icon: '📬', checkFn: function () { return true; } },
                            { name: 'GA4', desc: 'Analytics tracking', icon: '📈', checkFn: function () { return typeof gtag === 'function'; } },
                            { name: 'Sentry', desc: 'Error tracking', icon: '🐛', checkFn: function () { return !!(window.ENV && window.ENV.SENTRY_DSN); } },
                            { name: 'OpenAI', desc: 'DALL-E image generation', icon: '🤖', checkFn: function () { return !!(window.ENV && window.ENV.OPENAI_API_KEY); } },
                        ];

                        const ENV_VARS = [
                            { key: 'CLERK_PUBLISHABLE_KEY', scope: 'Pages', required: true },
                            { key: 'CLERK_SECRET_KEY', scope: 'Pages + Auth Worker', required: true },
                            { key: 'STRIPE_PUBLISHABLE_KEY', scope: 'Pages', required: true },
                            { key: 'STRIPE_SECRET_KEY', scope: 'Stripe Worker', required: true },
                            { key: 'SENTRY_DSN', scope: 'Pages + Auth Worker', required: false },
                            { key: 'OPENAI_API_KEY', scope: 'Pages', required: false },
                            { key: 'TOKEN_ENCRYPTION_KEY', scope: 'Pages', required: true },
                            { key: 'INTERNAL_SECRET', scope: 'Pages', required: true },
                            { key: 'SOCIAL_PUBLISHER_URL', scope: 'Pages', required: false },
                            { key: 'META_APP_SECRET', scope: 'Pages', required: false },
                            { key: 'THREADS_APP_SECRET', scope: 'Pages', required: false },
                            { key: 'X_CLIENT_ID', scope: 'Pages', required: false },
                            { key: 'LINKEDIN_CLIENT_ID', scope: 'Pages', required: false },
                            { key: 'GOOGLE_CLIENT_ID', scope: 'Pages', required: false },
                        ];

                        const WORKERS = [
                            { name: 'gfd-stripe', url: 'https://gfd-stripe.weave0.workers.dev', purpose: 'Stripe payment intents' },
                            { name: 'gfd-health-sweep', url: 'https://gfd-health-sweep.weave0.workers.dev', purpose: 'Nightly ecosystem health checks' },
                            { name: 'gfv-social-publisher', url: 'https://gfv-social-publisher.weave0.workers.dev', purpose: 'Social scheduling & publishing' },
                            { name: 'GFD Pages (_worker.js)', url: '/api/health', purpose: 'Auth, CMS, media routing' },
                        ];

                        function renderSettings() {
                            // Integrations
                            const intGrid = $('settings-integrations');
                            if (intGrid) {
                                intGrid.innerHTML = INTEGRATIONS.map(function (i) {
                                    let ok = false;
                                    try { ok = i.checkFn(); } catch (e) { /* */ }
                                    const cls = ok ? 'border-left:3px solid #10b981' : 'border-left:3px solid #ef4444';
                                    return '<div class="panel" style="padding:0.75rem 1rem;' + cls + '">' +
                                        '<div style="display:flex;justify-content:space-between;align-items:center">' +
                                        '<span>' + i.icon + ' <strong>' + escapeHtml(i.name) + '</strong></span>' +
                                        '<span class="tag ' + (ok ? 'ok' : 'fail') + '">' + (ok ? 'Connected' : 'Not detected') + '</span>' +
                                        '</div>' +
                                        '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem">' + escapeHtml(i.desc) + '</div>' +
                                        '</div>';
                                }).join('');
                            }

                            // Env vars — we can only check what's injected via window.ENV
                            const envGrid = $('settings-env-grid');
                            if (envGrid) {
                                envGrid.innerHTML = ENV_VARS.map(function (v) {
                                    const present = window.ENV && window.ENV[v.key] != null && window.ENV[v.key] !== '';
                                    const scopeOnly = v.scope !== 'Pages';
                                    const label = present ? '✅ Set' : scopeOnly ? '🔒 Worker-only' : (v.required ? '❌ Missing' : '⚪ Optional');
                                    const cls = present ? 'ok' : scopeOnly ? 'warn' : (v.required ? 'fail' : '');
                                    return '<div class="panel" style="padding:0.5rem 0.75rem">' +
                                        '<div style="display:flex;justify-content:space-between;align-items:center">' +
                                        '<code style="font-size:0.78rem">' + escapeHtml(v.key) + '</code>' +
                                        '<span class="tag ' + cls + '" style="font-size:0.68rem">' + label + '</span>' +
                                        '</div>' +
                                        '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.15rem">Scope: ' + escapeHtml(v.scope) + '</div>' +
                                        '</div>';
                                }).join('');
                            }

                            // Workers — ping each
                            const wGrid = $('settings-workers');
                            if (wGrid) {
                                wGrid.innerHTML = WORKERS.map(function (w) {
                                    return '<div class="panel" style="padding:0.75rem 1rem" id="settings-worker-' + w.name.replace(/[^a-z0-9]/g, '') + '">' +
                                        '<div style="display:flex;justify-content:space-between;align-items:center">' +
                                        '<strong style="font-size:0.82rem">' + escapeHtml(w.name) + '</strong>' +
                                        '<span class="tag warn" data-worker-status>Checking&hellip;</span>' +
                                        '</div>' +
                                        '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem">' + escapeHtml(w.purpose) + '</div>' +
                                        '</div>';
                                }).join('');

                                WORKERS.forEach(function (w) {
                                    const cardId = 'settings-worker-' + w.name.replace(/[^a-z0-9]/g, '');
                                    fetch(w.url, { method: 'GET', mode: 'cors' })
                                        .then(function (res) {
                                            const card = $(cardId);
                                            if (!card) return;
                                            const badge = card.querySelector('[data-worker-status]');
                                            if (badge) {
                                                badge.className = 'tag ' + (res.ok || res.status === 405 || res.status === 401 ? 'ok' : 'fail');
                                                badge.textContent = res.ok || res.status === 405 || res.status === 401 ? '✅ Reachable' : 'HTTP ' + res.status;
                                            }
                                        })
                                        .catch(function () {
                                            const card = $(cardId);
                                            if (!card) return;
                                            const badge = card.querySelector('[data-worker-status]');
                                            if (badge) { badge.className = 'tag fail'; badge.textContent = '❌ Unreachable'; }
                                        });
                                });
                            }
                        }

                        window.__adminPanels = window.__adminPanels || {};
                        window.__adminPanels['settings'] = renderSettings;
                    })();

                    // =================================================================
                    // STUDIO HQ PANEL (panel 26) — Studio Management Platform
                    // Zero-cost: client-side rules engine + localStorage kanban
                    // =================================================================
                    (function initStudioHQ() {
                        'use strict';

                        const KANBAN_LS_KEY = 'shq_kanban_v2';

                        const SHQ_STAGES = [
                            { key: 'backlog', label: 'Backlog', next: 'scoping' },
                            { key: 'scoping', label: 'Scoping', next: 'building' },
                            { key: 'building', label: 'Building', next: 'review' },
                            { key: 'review', label: 'Review', next: 'shipped' },
                            { key: 'shipped', label: 'Shipped', next: null },
                        ];

                        const DEFAULT_KANBAN_ITEMS = [
                            { id: 'k1', title: 'Social publisher — live API posting to social platforms', stage: 'shipped', priority: 'critical', brand: 'all' },
                            { id: 'k2', title: 'Stripe donation webhook → D1 persistence', stage: 'shipped', priority: 'high', brand: 'gfd' },
                            { id: 'k3', title: 'MediaDrop R2 processor pipeline — scan → approve → CDN', stage: 'building', priority: 'high', brand: 'all' },
                            { id: 'k4', title: 'Gallery enhancements + Netflix rows on GFV', stage: 'review', priority: 'high', brand: 'gfv' },
                            { id: 'k5', title: 'Community portal automated test suite (0% coverage)', stage: 'backlog', priority: 'high', brand: 'gfd' },
                            { id: 'k6', title: 'Pinterest + TikTok developer app registration', stage: 'backlog', priority: 'low', brand: 'all' },
                            { id: 'k7', title: 'CultureSherpa MN Cup application review', stage: 'review', priority: 'critical', brand: 'cs' },
                            { id: 'k8', title: 'NFT drop v1 — GFV collection pre-mint setup', stage: 'backlog', priority: 'medium', brand: 'gfv' },
                            { id: 'k9', title: 'CASHMONEY: capital request worksheet + vendor quotes', stage: 'scoping', priority: 'high', brand: 'gfd' },
                            { id: 'k10', title: 'Admin portal Studio HQ management panel', stage: 'shipped', priority: 'high', brand: 'gfd' },
                            { id: 'k11', title: 'Contact form E2E — Formspree confirmed operational', stage: 'shipped', priority: 'medium', brand: 'gfd' },
                            { id: 'k12', title: 'Branch protection rollout across all repos', stage: 'shipped', priority: 'medium', brand: 'all' },
                            { id: 'k13', title: 'AIAimate: OPENAI_API_KEY + SENTRY_DSN secrets live', stage: 'shipped', priority: 'high', brand: 'ai' },
                            { id: 'k14', title: 'Finalize OAuth flow for LinkedIn + Instagram publishing', stage: 'scoping', priority: 'critical', brand: 'all' },
                        ];

                        // ── Self-Advisor Rules ─────────────────────────────────────────
                        const ADVISOR_RULES = [
                            {
                                id: 'no-connections',
                                priority: 'critical',
                                icon: '🔌',
                                test: function () { return state.connections.length === 0; },
                                title: 'No platform connections active',
                                detail: 'Publishing will fail — connect at least one social account in Platform Connect.',
                                actionLabel: 'Fix Now →',
                                actionView: 'connections',
                            },
                            {
                                id: 'critical-ops-flags',
                                priority: 'critical',
                                icon: '🚨',
                                test: function () { return (_opsTasks || []).filter(function (t) { return t.severity === 'critical'; }).length > 0; },
                                titleFn: function () {
                                    const n = (_opsTasks || []).filter(function (t) { return t.severity === 'critical'; }).length;
                                    return n + ' critical ops flag' + (n === 1 ? '' : 's') + ' open on Operations Board';
                                },
                                detail: 'Review and resolve critical flags — they block key workflows.',
                                actionLabel: 'View Flags →',
                                actionView: 'overview',
                            },
                            {
                                id: 'ecosystem-failing',
                                priority: 'warning',
                                icon: '🌐',
                                test: function () {
                                    const entries = Object.values(state.lastHealthMap || {});
                                    return entries.length > 0 && entries.filter(function (e) { return !e.ok; }).length > 0;
                                },
                                titleFn: function () {
                                    const entries = Object.values(state.lastHealthMap || {});
                                    const n = entries.filter(function (e) { return !e.ok; }).length;
                                    return n + ' ecosystem endpoint' + (n === 1 ? '' : 's') + ' failing health check';
                                },
                                detail: 'Check Ecosystem Health for details — sites may be down or returning errors.',
                                actionLabel: 'Check Health →',
                                actionView: 'ecosystem',
                            },
                            {
                                id: 'failed-variants',
                                priority: 'warning',
                                icon: '⚠️',
                                test: function () { return (state.variants || []).filter(function (v) { return v.status === 'failed'; }).length > 0; },
                                titleFn: function () {
                                    const n = (state.variants || []).filter(function (v) { return v.status === 'failed'; }).length;
                                    return n + ' post variant' + (n === 1 ? '' : 's') + ' failed to publish';
                                },
                                detail: 'Use Queue Health to retry or clear failed delivery attempts.',
                                actionLabel: 'View Queue →',
                                actionView: 'notifications',
                            },
                            {
                                id: 'empty-queue',
                                priority: 'warning',
                                icon: '🗓️',
                                test: function () {
                                    return state.connections.length > 0
                                        && (state.variants || []).filter(function (v) { return v.status === 'scheduled'; }).length === 0;
                                },
                                title: 'Connections active but nothing scheduled',
                                detail: 'You have platform connections but no posts in the queue. Use Composer or Drip Builder to schedule content.',
                                actionLabel: 'Compose →',
                                actionView: 'composer',
                            },
                            {
                                id: 'no-campaigns',
                                priority: 'warning',
                                icon: '📅',
                                test: function () { return (state.campaigns || []).length === 0 && state.connections.length > 0; },
                                title: 'No campaigns created yet',
                                detail: 'Create at least one campaign in the Planner to organize your scheduled content.',
                                actionLabel: 'Create →',
                                actionView: 'planner',
                            },
                            {
                                id: 'draft-backlog',
                                priority: 'info',
                                icon: '📦',
                                test: function () {
                                    return (state.assets || []).filter(function (a) { return a.review_status === 'draft'; }).length > 15;
                                },
                                titleFn: function () {
                                    const n = (state.assets || []).filter(function (a) { return a.review_status === 'draft'; }).length;
                                    return n + ' assets sitting in draft — none will be published';
                                },
                                detail: 'Approve assets in the Asset Library so they can be retrieved by the scheduler.',
                                actionLabel: 'Review →',
                                actionView: 'library',
                            },
                            {
                                id: 'no-drip',
                                priority: 'info',
                                icon: '💧',
                                test: function () {
                                    return (state.dripEntries || []).length === 0
                                        && (state.campaigns || []).length > 0;
                                },
                                title: 'No drip entries loaded',
                                detail: 'You have campaigns but no drip content. Build a drip sequence for hands-off scheduling across all platforms.',
                                actionLabel: 'Build Drip →',
                                actionView: 'drip',
                            },
                            {
                                id: 'pipeline-healthy',
                                priority: 'ok',
                                icon: '✅',
                                test: function () {
                                    const scheduled = (state.variants || []).filter(function (v) { return v.status === 'scheduled'; }).length;
                                    const failed = (state.variants || []).filter(function (v) { return v.status === 'failed'; }).length;
                                    const allUp = Object.values(state.lastHealthMap || {}).every(function (e) { return e.ok; });
                                    return state.connections.length > 0 && scheduled > 0 && failed === 0 && allUp;
                                },
                                titleFn: function () {
                                    const n = (state.variants || []).filter(function (v) { return v.status === 'scheduled'; }).length;
                                    return 'Publishing pipeline healthy — ' + n + ' post' + (n === 1 ? '' : 's') + ' in queue';
                                },
                                detail: 'All connections active, variants scheduled, no failures, all ecosystem endpoints passing.',
                                actionLabel: null,
                                actionView: null,
                            },
                        ];

                        // ── localStorage kanban helpers ────────────────────────────────
                        function loadKanban() {
                            try {
                                const raw = localStorage.getItem(KANBAN_LS_KEY);
                                if (raw) return JSON.parse(raw);
                            } catch (e) { /* ignore */ }
                            return JSON.parse(JSON.stringify(DEFAULT_KANBAN_ITEMS));
                        }

                        function saveKanban(items) {
                            try { localStorage.setItem(KANBAN_LS_KEY, JSON.stringify(items)); } catch (e) { /* ignore */ }
                        }

                        function resetKanban() {
                            localStorage.removeItem(KANBAN_LS_KEY);
                            renderKanban(JSON.parse(JSON.stringify(DEFAULT_KANBAN_ITEMS)));
                        }

                        function advanceCard(id) {
                            const items = loadKanban();
                            const card = items.find(function (c) { return c.id === id; });
                            if (!card) return;
                            const stage = SHQ_STAGES.find(function (s) { return s.key === card.stage; });
                            if (stage && stage.next) {
                                card.stage = stage.next;
                                saveKanban(items);
                                renderKanban(items);
                            }
                        }

                        function deleteCard(id) {
                            const items = loadKanban().filter(function (c) { return c.id !== id; });
                            saveKanban(items);
                            renderKanban(items);
                        }

                        function addCard(title, priority, brand) {
                            const items = loadKanban();
                            const id = 'ku' + Date.now();
                            items.push({ id: id, title: title, stage: 'backlog', priority: priority, brand: brand });
                            saveKanban(items);
                            renderKanban(items);
                        }

                        // ── Signal Radar ───────────────────────────────────────────────
                        function renderSignalBoard() {
                            const scheduled = (state.variants || []).filter(function (v) { return v.status === 'scheduled'; }).length;
                            const failed = (state.variants || []).filter(function (v) { return v.status === 'failed'; }).length;
                            const connections = (state.connections || []).length;
                            const draftAssets = (state.assets || []).filter(function (a) { return a.review_status === 'draft'; }).length;
                            const opsCritical = (_opsTasks || []).filter(function (t) { return t.severity === 'critical'; }).length;
                            const opsWarn = (_opsTasks || []).filter(function (t) { return t.severity === 'warning'; }).length;
                            const healthMap = Object.values(state.lastHealthMap || {});
                            const healthPass = healthMap.filter(function (e) { return e.ok; }).length;
                            const healthTotal = healthMap.length;

                            function setSig(id, value, sub, status) {
                                const el = $(id);
                                if (el) el.textContent = value;
                                const subEl = $(id + '-sub');
                                if (subEl) subEl.textContent = sub;
                                const sig = el && el.closest('.shq-signal');
                                if (sig) {
                                    const bar = sig.querySelector('.shq-signal-bar');
                                    if (bar) { bar.className = 'shq-signal-bar ' + status; }
                                    el.style.color = status === 'crit' ? '#f43f5e' : status === 'warn' ? '#fbbf24' : '#10b981';
                                }
                            }

                            setSig('shq-sig-scheduled', scheduled,
                                scheduled === 0 ? 'nothing queued' : scheduled + ' in queue',
                                scheduled === 0 ? 'warn' : 'ok');

                            setSig('shq-sig-failed', failed,
                                failed === 0 ? 'clean' : 'needs retry',
                                failed > 0 ? 'crit' : 'ok');

                            setSig('shq-sig-connections', connections,
                                connections === 0 ? 'not connected' : 'platform' + (connections === 1 ? '' : 's') + ' linked',
                                connections === 0 ? 'crit' : 'ok');

                            setSig('shq-sig-assets', draftAssets,
                                draftAssets === 0 ? 'all approved' : 'pending approval',
                                draftAssets > 15 ? 'warn' : 'ok');

                            const opsLabel = opsCritical > 0 ? opsCritical + ' critical' : opsWarn > 0 ? opsWarn + ' warnings' : 'all clear';
                            setSig('shq-sig-ops', (_opsTasks || []).length,
                                opsLabel,
                                opsCritical > 0 ? 'crit' : opsWarn > 0 ? 'warn' : 'ok');

                            setSig('shq-sig-health',
                                healthTotal === 0 ? '—' : healthPass + '/' + healthTotal,
                                healthTotal === 0 ? 'no sweep data' : healthPass === healthTotal ? 'all passing' : (healthTotal - healthPass) + ' failing',
                                healthTotal === 0 ? 'warn' : healthPass < healthTotal ? 'crit' : 'ok');

                            const updated = $('shq-signal-updated');
                            if (updated) updated.textContent = 'Updated ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                        }

                        // ── Self-Advisor ───────────────────────────────────────────────
                        function runAdvisor() {
                            const list = $('shq-advisor-list');
                            if (!list) return;

                            const priorityOrder = { critical: 0, warning: 1, info: 2, ok: 3 };
                            const insights = ADVISOR_RULES
                                .filter(function (r) { try { return r.test(); } catch (e) { return false; } })
                                .sort(function (a, b) { return (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99); });

                            if (!insights.length) {
                                list.innerHTML = '<div class="shq-insight priority-ok"><span class="shq-insight-icon">✅</span><div class="shq-insight-body"><div class="shq-insight-title">No issues detected</div><div class="shq-insight-detail">Load some data first by refreshing the main panel, then re-analyze.</div></div></div>';
                                return;
                            }

                            list.innerHTML = insights.map(function (r) {
                                const title = r.titleFn ? r.titleFn() : r.title;
                                const action = r.actionLabel && r.actionView
                                    ? '<button class="shq-insight-action" data-nav="' + escapeHtml(r.actionView) + '">' + escapeHtml(r.actionLabel) + '</button>'
                                    : '';
                                return '<div class="shq-insight priority-' + r.priority + '">' +
                                    '<span class="shq-insight-icon">' + r.icon + '</span>' +
                                    '<div class="shq-insight-body">' +
                                    '<div class="shq-insight-title">' + escapeHtml(title) + '</div>' +
                                    '<div class="shq-insight-detail">' + escapeHtml(r.detail) + '</div>' +
                                    '</div>' +
                                    action +
                                    '</div>';
                            }).join('');

                            list.querySelectorAll('[data-nav]').forEach(function (btn) {
                                btn.addEventListener('click', function () {
                                    navigateToView(btn.dataset.nav);
                                });
                            });
                        }

                        // ── Kanban Renderer ────────────────────────────────────────────
                        function renderKanban(items) {
                            const board = $('shq-kanban');
                            if (!board) return;
                            board.innerHTML = SHQ_STAGES.map(function (stage) {
                                const cards = items.filter(function (c) { return c.stage === stage.key; });
                                return '<div class="shq-col" data-stage="' + stage.key + '">' +
                                    '<div class="shq-col-header">' +
                                    escapeHtml(stage.label) +
                                    '<span class="shq-col-count">' + cards.length + '</span>' +
                                    '</div>' +
                                    cards.map(function (card) {
                                        const advBtn = stage.next
                                            ? '<button class="shq-card-advance" data-advance="' + escapeHtml(card.id) + '" title="Advance to ' + stage.next + '">&rsaquo; ' + escapeHtml(SHQ_STAGES.find(function (s) { return s.key === stage.next; }).label) + '</button>'
                                            : '';
                                        const brand = card.brand && card.brand !== 'all' ? card.brand.toUpperCase() : '';
                                        return '<div class="shq-card" data-id="' + escapeHtml(card.id) + '">' +
                                            '<button class="shq-card-del" data-del="' + escapeHtml(card.id) + '" title="Remove" aria-label="Remove workitem">&#10005;</button>' +
                                            '<div class="shq-card-title">' + escapeHtml(card.title) + '</div>' +
                                            '<div class="shq-card-footer">' +
                                            '<span class="shq-card-tag ' + escapeHtml(card.priority || 'medium') + '">' + escapeHtml(card.priority || 'medium') + '</span>' +
                                            (brand ? '<span class="shq-card-brand">' + escapeHtml(brand) + '</span>' : '') +
                                            advBtn +
                                            '</div>' +
                                            '</div>';
                                    }).join('') +
                                    '</div>';
                            }).join('');

                            board.querySelectorAll('[data-advance]').forEach(function (btn) {
                                btn.addEventListener('click', function (e) { e.stopPropagation(); advanceCard(btn.dataset.advance); });
                            });
                            board.querySelectorAll('[data-del]').forEach(function (btn) {
                                btn.addEventListener('click', function (e) { e.stopPropagation(); deleteCard(btn.dataset.del); });
                            });
                        }

                        // ── Server-backed kanban helpers ───────────────────────────────
                        async function loadKanbanFromServer() {
                            try {
                                const resp = await api('/studio-kanban');
                                if (resp && Array.isArray(resp.items) && resp.items.length) {
                                    saveKanban(resp.items); // mirror to localStorage as offline backup
                                    return resp.items;
                                }
                            } catch (e) { /* fall through to localStorage */ }
                            return null;
                        }

                        function saveKanbanToServer(items) {
                            // Fire-and-forget — localStorage remains the local source of truth
                            api('/studio-kanban', { method: 'PUT', body: JSON.stringify({ items: items }) })
                                .catch(function () { /* silently ignore */ });
                        }

                        // Patch save/advance/delete to also sync to server
                        const _origSaveKanban = saveKanban;
                        saveKanban = function (items) {
                            _origSaveKanban(items);
                            saveKanbanToServer(items);
                        };

                        // ── Master Render ──────────────────────────────────────────────
                        let _shqFirstLoad = true;

                        async function renderSHQPanel() {
                            const btn = $('shq-refresh-btn');
                            // On first open (or if state is empty), pull fresh data silently
                            const stateIsEmpty = !state.connections || (!state.connections.length
                                && !state.variants.length && !state.assets.length);
                            if (_shqFirstLoad || stateIsEmpty) {
                                _shqFirstLoad = false;
                                if (btn) { btn.disabled = true; btn.textContent = '\u231b Loading…'; }
                                try {
                                    await Promise.all([refreshAll(), loadOpsTasks ? loadOpsTasks() : Promise.resolve()]);
                                } catch (e) { /* degrade gracefully */ }
                                if (btn) { btn.disabled = false; btn.innerHTML = '&#8635; Refresh Signals'; }
                            }

                            renderSignalBoard();
                            runAdvisor();

                            // Prefer server kanban on first load, fall back to localStorage
                            const serverItems = await loadKanbanFromServer();
                            renderKanban(serverItems || loadKanban());
                        }

                        // ── Event Bindings ─────────────────────────────────────────────
                        const refreshBtn = $('shq-refresh-btn');
                        if (refreshBtn) {
                            refreshBtn.addEventListener('click', async function () {
                                this.disabled = true;
                                const orig = this.innerHTML;
                                this.innerHTML = '&#8635; Refreshing…';
                                try {
                                    await Promise.all([refreshAll(), loadOpsTasks ? loadOpsTasks() : Promise.resolve()]);
                                    renderSignalBoard();
                                    runAdvisor();
                                    const serverItems = await loadKanbanFromServer();
                                    renderKanban(serverItems || loadKanban());
                                    toast('Studio HQ refreshed', 'success');
                                } catch (e) {
                                    toast('Refresh failed: ' + (e.message || 'network error'), 'error');
                                } finally {
                                    this.disabled = false;
                                    this.innerHTML = orig;
                                }
                            });
                        }

                        const advisorRefreshBtn = $('shq-advisor-refresh-btn');
                        if (advisorRefreshBtn) advisorRefreshBtn.addEventListener('click', runAdvisor);

                        const resetBtn = $('shq-kanban-reset-btn');
                        if (resetBtn) {
                            resetBtn.addEventListener('click', function () {
                                if (window.confirm('Reset all kanban cards to defaults? Your edits will be lost.')) {
                                    resetKanban();
                                    saveKanbanToServer(DEFAULT_KANBAN_ITEMS); // sync reset to server too
                                }
                            });
                        }

                        const addForm = $('shq-add-form');
                        if (addForm) {
                            addForm.addEventListener('submit', function (e) {
                                e.preventDefault();
                                const titleEl = $('shq-add-title');
                                const priEl = $('shq-add-priority');
                                const brandEl = $('shq-add-brand');
                                const titleVal = titleEl ? titleEl.value.trim() : '';
                                if (!titleVal) return;
                                addCard(titleVal, priEl ? priEl.value : 'medium', brandEl ? brandEl.value : 'all');
                                if (titleEl) titleEl.value = '';
                                toast('Workitem added to Backlog', 'success');
                            });
                        }

                        window.__adminPanels = window.__adminPanels || {};
                        window.__adminPanels['studio-hq'] = renderSHQPanel;
                    })();

                    // ── Panel 32: GFV Music Library ───────────────────────────────────
                    (function initMusicLibraryPanel() {

                        async function loadMusicLibraryCatalog() {
                            try {
                                const r = await fetch('/assets/data/gfv-music-catalog.json');
                                if (!r.ok) throw new Error('HTTP ' + r.status);
                                state.mlCatalog = await r.json();
                            } catch (err) {
                                state.mlCatalog = null;
                                console.warn('[music-library] fetch failed:', err.message);
                            }
                        }

                        function escMl(str) {
                            return String(str)
                                .replace(/&/g, '&amp;')
                                .replace(/</g, '&lt;')
                                .replace(/>/g, '&gt;')
                                .replace(/"/g, '&quot;');
                        }

                        function renderAlbumCard(album, artist) {
                            const bpmVals = album.tracks.map(t => t.bpm).filter(Boolean);
                            const bpmRange = bpmVals.length
                                ? Math.min(...bpmVals) + '\u2013' + Math.max(...bpmVals) + '\u202fBPM'
                                : '';
                            const trackRows = album.tracks.map(t => `
                                <tr>
                                    <td class="ml-td-num">${t.n}</td>
                                    <td>${escMl(t.title)}</td>
                                    <td class="ml-td-mono">${t.key || ''}</td>
                                    <td class="ml-td-mono">${t.bpm || ''}</td>
                                    <td class="ml-td-mono">${t.duration || ''}</td>
                                </tr>`).join('');

                            return `
                                <article class="panel ml-album-card">
                                    <div class="ml-album-header">
                                        <div>
                                            <h3 class="ml-album-title">${escMl(album.title)}</h3>
                                            <div class="ml-album-meta">${album.trackCount} tracks${bpmRange ? ' &middot; ' + bpmRange : ''}</div>
                                        </div>
                                        <div class="inline-actions">
                                            <button class="btn btn-secondary btn-sm ml-studio-btn"
                                                data-studio-path="${escMl(album.studioPath || '')}"
                                                aria-label="Open prompt studio for ${escMl(album.title)}">Studio</button>
                                            <button class="btn btn-primary btn-sm ml-post-btn"
                                                data-album-title="${escMl(album.title)}"
                                                data-artist-name="${escMl(artist.name)}"
                                                aria-label="Create post for ${escMl(album.title)}">Post</button>
                                        </div>
                                    </div>
                                    <details class="ml-track-details">
                                        <summary>View ${album.trackCount} track${album.trackCount !== 1 ? 's' : ''}&hellip;</summary>
                                        <table class="ml-track-table" aria-label="Tracks for ${escMl(album.title)}">
                                            <thead>
                                                <tr>
                                                    <th class="ml-td-num">#</th>
                                                    <th>Title</th>
                                                    <th>Key</th>
                                                    <th>BPM</th>
                                                    <th>Time</th>
                                                </tr>
                                            </thead>
                                            <tbody>${trackRows}</tbody>
                                        </table>
                                    </details>
                                </article>`;
                        }

                        function renderMusicLibrary() {
                            const metaEl = $('ml-meta');
                            const catalogEl = $('ml-catalog');
                            if (!catalogEl) return;

                            if (!state.mlCatalog) {
                                if (metaEl) metaEl.innerHTML = '';
                                catalogEl.innerHTML = '<p style="color:var(--text-muted)">Catalog unavailable — fetch failed. Ensure you are signed in and the catalog JSON has been exported.</p>';
                                return;
                            }

                            const meta = state.mlCatalog._meta || {};
                            if (metaEl) {
                                const exportedAt = meta.exported_at
                                    ? new Date(meta.exported_at).toLocaleString()
                                    : 'unknown';
                                metaEl.innerHTML = `
                                    <strong>${meta.total_artists || 0}</strong> artists
                                    <span class="ml-sep">&middot;</span>
                                    <strong>${meta.total_albums || 0}</strong> albums
                                    <span class="ml-sep">&middot;</span>
                                    <strong>${meta.total_tracks || 0}</strong> tracks
                                    <span class="ml-sep">&middot;</span>
                                    Exported ${exportedAt}`;
                            }

                            const artists = state.mlCatalog.artists || [];
                            if (!artists.length) {
                                catalogEl.innerHTML = '<p style="color:var(--text-muted)">No artists found in catalog.</p>';
                                return;
                            }

                            catalogEl.innerHTML = artists.map(artist => `
                                <div class="ml-artist-section">
                                    <h2 class="ml-artist-name">${escMl(artist.name)}</h2>
                                    <div class="ml-albums-grid">
                                        ${(artist.albums || []).map(album => renderAlbumCard(album, artist)).join('')}
                                    </div>
                                </div>`).join('');
                        }

                        // Single delegated listener on the static view section — survives catalog re-renders
                        const viewSection = document.getElementById('view-music-library');
                        if (viewSection) {
                            viewSection.addEventListener('click', function (e) {
                                const studioBtn = e.target.closest('.ml-studio-btn');
                                if (studioBtn) {
                                    const sp = studioBtn.dataset.studioPath;
                                    if (sp) {
                                        const base = 'http://localhost:5000/output/';
                                        window.open(base + sp, '_blank', 'noopener');
                                    } else {
                                        toast('No studio path configured for this album.', 'warn');
                                    }
                                    return;
                                }

                                const postBtn = e.target.closest('.ml-post-btn');
                                if (postBtn) {
                                    const albumTitle = postBtn.dataset.albumTitle || '';
                                    const artistName = postBtn.dataset.artistName || '';
                                    const draft = '\uD83C\uDFB5 ' + albumTitle + ' by ' + artistName + ' is out now on all platforms! Stream it today.\n\n#GoodFlippinVibes #NewMusic #' + artistName.replace(/\s+/g, '');
                                    const composerEl = document.getElementById('composer-content');
                                    if (composerEl) {
                                        composerEl.value = draft;
                                        navigateToView('composer');
                                        toast('Draft loaded in Post Composer.', 'success');
                                    } else {
                                        toast('Composer not available.', 'warn');
                                    }
                                }
                            });
                        }

                        // Refresh button
                        document.addEventListener('click', function (e) {
                            if (e.target && e.target.id === 'ml-refresh-btn') {
                                loadMusicLibraryCatalog().then(renderMusicLibrary);
                            }
                        });

                        window.__adminPanels = window.__adminPanels || {};
                        window.__adminPanels['music-library'] = async function () {
                            if (!state.mlCatalog) {
                                await loadMusicLibraryCatalog();
                            }
                            renderMusicLibrary();
                        };
                    })();

                    window.__clerkReady
                        .then(initAuth)
                        .catch(function (err) {
                            $('auth-loading').textContent = 'Failed to load Clerk auth library.';
                            console.error('[admin auth]', err);
                        });
                })();
