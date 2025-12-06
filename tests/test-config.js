/**
 * GFV LLC Web UX Test Configuration
 * Centralized configuration for all test suites
 */

module.exports = {
    // Target files to test
    targets: {
        mainSite: 'file://' + __dirname.replace(/\\/g, '/').replace('/tests', '') + '/temp_review.html',
        contactForm: 'file://' + __dirname.replace(/\\/g, '/').replace('/tests', '') + '/assets/contact-form.html'
    },
    
    // Viewport configurations for responsive testing
    viewports: {
        mobile: { width: 375, height: 667, name: 'Mobile (iPhone SE)' },
        mobileLandscape: { width: 667, height: 375, name: 'Mobile Landscape' },
        tablet: { width: 768, height: 1024, name: 'Tablet (iPad)' },
        tabletLandscape: { width: 1024, height: 768, name: 'Tablet Landscape' },
        laptop: { width: 1366, height: 768, name: 'Laptop' },
        desktop: { width: 1920, height: 1080, name: 'Desktop (1080p)' },
        ultrawide: { width: 2560, height: 1440, name: 'Ultrawide (1440p)' }
    },
    
    // Animation/transition timing thresholds (ms)
    timing: {
        transitionMax: 500,     // Max acceptable transition duration
        animationMax: 1000,     // Max acceptable animation duration
        loadMax: 3000,          // Max page load time
        interactionDelay: 100,  // Delay between interactions
        scrollDelay: 50,        // Delay for scroll events
        hoverDelay: 200         // Delay for hover state changes
    },
    
    // Accessibility standards
    accessibility: {
        contrastRatioMin: 4.5,      // WCAG AA for normal text
        contrastRatioLarge: 3,      // WCAG AA for large text
        minTapTarget: 44,           // Minimum tap target size (px)
        minFocusVisible: true,      // Require visible focus states
        requiredLandmarks: ['main', 'navigation'],
        maxHeadingSkip: 1           // Max heading level skip allowed
    },
    
    // Test timeouts
    timeouts: {
        test: 30000,
        navigation: 10000,
        element: 5000
    },
    
    // External link domains to verify (should be reachable)
    externalDomains: [
        'globaldeets.com',
        'culturesherpa.org',
        'aiaimate.com',
        'goodflippinvibes.com',
        'formspree.io'
    ],
    
    // CSS properties to validate for transitions
    transitionProperties: [
        'opacity',
        'transform',
        'background-color',
        'border-color',
        'box-shadow',
        'color'
    ],
    
    // Form validation rules
    formValidation: {
        requiredFields: ['name', 'email', 'description'],
        emailPattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        minDescriptionLength: 10,
        maxDescriptionLength: 500
    }
};
