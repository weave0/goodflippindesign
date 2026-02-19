/* ============================================
   GFV Community Platform: Auth JavaScript
   Copy this before closing </body>
   ============================================ */

// ========================================
// CONFIGURATION
// ========================================
const GFV_CONFIG = {
    // UPDATE THESE VALUES:
    clerkPublishableKey: 'YOUR_CLERK_PUBLISHABLE_KEY', // Get from Clerk dashboard
    apiBaseUrl: 'https://gfv-community-api.YOUR-SUBDOMAIN.workers.dev', // Your Worker URL

    // Admin email addresses (can comment on any post, create blog posts)
    adminEmails: [
        'brett.l.weaver@gmail.com',
        'getsome@goodflippinvibes.com'
    ]
};

// ========================================
// GLOBAL STATE
// ========================================
let clerkInstance = null;
let currentUser = null;

// ========================================
// AUTH INITIALIZATION
// ========================================
async function initializeClerk() {
    // Skip if keys not configured
    if (!GFV_CONFIG.clerkPublishableKey || GFV_CONFIG.clerkPublishableKey === 'YOUR_CLERK_PUBLISHABLE_KEY') {
        console.warn('[GFV Auth] Clerk keys not configured. Auth features disabled.');
        showSignInButtons();
        return;
    }

    try {
        clerkInstance = window.Clerk;
        await clerkInstance.load({
            publishableKey: GFV_CONFIG.clerkPublishableKey
        });

        // Check if user is signed in
        if (clerkInstance.user) {
            currentUser = clerkInstance.user;
            showUserMenu(currentUser);
        } else {
            showSignInButtons();
        }

        // Listen for auth state changes
        clerkInstance.addListener(({ user }) => {
            currentUser = user;
            if (user) {
                showUserMenu(user);
            } else {
                showSignInButtons();
            }
        });

        console.log('[GFV Auth] Clerk initialized successfully');

    } catch (error) {
        console.error('[GFV Auth] Clerk initialization failed:', error);
        showSignInButtons();
    }
}

// ========================================
// UI STATE MANAGEMENT
// ========================================
function showUserMenu(user) {
    // Desktop navigation
    const signInBtn = document.getElementById('sign-in-btn');
    const userMenuContainer = document.getElementById('user-menu-container');
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');

    if (signInBtn) signInBtn.style.display = 'none';

    if (userMenuContainer) {
        userMenuContainer.style.display = 'block';

        // Set avatar
        if (userAvatar) {
            userAvatar.src = user.imageUrl || generateInitialsAvatar(user);
        }

        // Set name
        if (userName) {
            const displayName = user.publicMetadata?.displayName ||
                               user.firstName ||
                               'Wellness Friend';
            userName.textContent = displayName;

            // Add admin badge if user is admin
            if (isAdmin(user)) {
                userName.innerHTML = `${displayName} <span class="admin-badge">Admin</span>`;
            }
        }
    }

    // Mobile navigation
    const mobileSignInBtn = document.getElementById('mobile-sign-in-btn');
    const mobileProfileLink = document.getElementById('mobile-profile-link');
    const mobileSignOutBtn = document.getElementById('mobile-sign-out-btn');

    if (mobileSignInBtn) mobileSignInBtn.style.display = 'none';
    if (mobileProfileLink) mobileProfileLink.style.display = 'block';
    if (mobileSignOutBtn) mobileSignOutBtn.style.display = 'block';
}

function showSignInButtons() {
    // Desktop navigation
    const signInBtn = document.getElementById('sign-in-btn');
    const userMenuContainer = document.getElementById('user-menu-container');

    if (signInBtn) signInBtn.style.display = 'inline-block';
    if (userMenuContainer) userMenuContainer.style.display = 'none';

    // Mobile navigation
    const mobileSignInBtn = document.getElementById('mobile-sign-in-btn');
    const mobileProfileLink = document.getElementById('mobile-profile-link');
    const mobileSignOutBtn = document.getElementById('mobile-sign-out-btn');

    if (mobileSignInBtn) mobileSignInBtn.style.display = 'block';
    if (mobileProfileLink) mobileProfileLink.style.display = 'none';
    if (mobileSignOutBtn) mobileSignOutBtn.style.display = 'none';
}

// ========================================
// HELPER FUNCTIONS
// ========================================
function isAdmin(user) {
    if (!user) return false;
    const email = user.primaryEmailAddress?.emailAddress;
    return GFV_CONFIG.adminEmails.includes(email);
}

function generateInitialsAvatar(user) {
    const name = user.publicMetadata?.displayName || user.firstName || 'U';
    const initials = name.charAt(0).toUpperCase();

    // Create canvas for avatar
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');

    // GFV wellness gradient background
    const gradient = ctx.createLinearGradient(0, 0, 80, 80);
    gradient.addColorStop(0, '#7C9885'); // sage green
    gradient.addColorStop(1, '#E8B4B8'); // soft rose
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 80, 80);

    // White initial
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, 40, 40);

    return canvas.toDataURL();
}

// ========================================
// EVENT HANDLERS
// ========================================

// User menu dropdown toggle
document.addEventListener('click', function (e) {
    const userMenuBtn = document.getElementById('user-menu-btn');
    const userDropdown = document.getElementById('user-dropdown');

    if (!userMenuBtn || !userDropdown) return;

    if (e.target.closest('#user-menu-btn')) {
        // Toggle dropdown
        const isExpanded = userMenuBtn.getAttribute('aria-expanded') === 'true';
        userMenuBtn.setAttribute('aria-expanded', !isExpanded);
        userDropdown.setAttribute('aria-hidden', isExpanded);
    } else if (!e.target.closest('.user-menu-container')) {
        // Close dropdown when clicking outside
        userMenuBtn.setAttribute('aria-expanded', 'false');
        userDropdown.setAttribute('aria-hidden', 'true');
    }
});

// Sign-in button clicks
document.addEventListener('click', function (e) {
    const signInBtn = e.target.closest('#sign-in-btn');
    const mobileSignInBtn = e.target.closest('#mobile-sign-in-btn');

    if ((signInBtn || mobileSignInBtn) && clerkInstance) {
        clerkInstance.openSignIn();
    }
});

// Sign-out button clicks
document.addEventListener('click', function (e) {
    const signOutBtn = e.target.closest('#sign-out-btn');
    const mobileSignOutBtn = e.target.closest('#mobile-sign-out-btn');

    if ((signOutBtn || mobileSignOutBtn) && clerkInstance) {
        if (confirm('Are you sure you want to sign out?')) {
            clerkInstance.signOut();
        }
    }
});

// ========================================
// API HELPER FUNCTIONS
// ========================================

// Get auth token for API calls
async function getAuthToken() {
    if (!clerkInstance || !clerkInstance.session) {
        throw new Error('User not authenticated');
    }
    return await clerkInstance.session.getToken();
}

// Check if current user is admin
function isCurrentUserAdmin() {
    return currentUser && isAdmin(currentUser);
}

// Make authenticated API call
async function apiCall(endpoint, options = {}) {
    try {
        const token = await getAuthToken();

        const response = await fetch(`${GFV_CONFIG.apiBaseUrl}${endpoint}`, {
            ...options,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(error.error || `HTTP ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('[GFV API]', error);
        throw error;
    }
}

// Export for use in other scripts
window.GFV = {
    config: GFV_CONFIG,
    currentUser,
    isAdmin: isCurrentUserAdmin,
    getToken: getAuthToken,
    api: apiCall
};

// ========================================
// INITIALIZATION
// ========================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeClerk);
} else {
    initializeClerk();
}

console.log('✨ GFV Community Platform Auth loaded');
