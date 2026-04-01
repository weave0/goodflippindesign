import js from "@eslint/js";

export default [
  {
    // Only lint the JS source files that matter for var→const/let conversion
    files: ["admin-panels.js", "admin.html", "community-portal.html", "scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        console: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
        navigator: "readonly",
        location: "readonly",
        history: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        FormData: "readonly",
        Headers: "readonly",
        Request: "readonly",
        Response: "readonly",
        Event: "readonly",
        CustomEvent: "readonly",
        MutationObserver: "readonly",
        IntersectionObserver: "readonly",
        ResizeObserver: "readonly",
        HTMLElement: "readonly",
        Element: "readonly",
        NodeList: "readonly",
        DOMParser: "readonly",
        AbortController: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        getComputedStyle: "readonly",
        alert: "readonly",
        confirm: "readonly",
        prompt: "readonly",
        performance: "readonly",
        queueMicrotask: "readonly",
        structuredClone: "readonly",
        // Clerk (community-portal)
        Clerk: "readonly",
      },
    },
    rules: {
      "no-var": "error",
      "prefer-const": "error",
    },
  },
  {
    // Workers use module sourceType
    files: ["workers/**/*.js", "_worker.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "no-var": "error",
      "prefer-const": "error",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".wrangler/**",
      "GFD Dev Projects/**",
      "tests/**",
      "*.html", // HTML files need special handling — override below
    ],
  },
];
