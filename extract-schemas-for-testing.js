/**
 * Schema Extraction Helper
 * Run this to get ready-to-test schemas for Google Rich Results Test
 */

const fs = require('fs');
const path = require('path');

console.log('\n=== EXTRACTING SCHEMAS FOR VALIDATION ===\n');

// ============================================
// EXTRACT GFD WEBSITE SCHEMA (New)
// ============================================
console.log('[1/4] Good Flippin Design - WebSite Schema with SearchAction');
console.log('Copy this into Google Rich Results Test:\n');

const gfdWebSite = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://goodflippindesign.com/#website",
  "name": "Good Flippin Design",
  "url": "https://goodflippindesign.com",
  "description": "Strategic web development specializing in data platforms, AI-integrated applications, and business intelligence dashboards",
  "publisher": {
    "@type": "Organization",
    "name": "GFV LLC DBA Good Flippin Design",
    "url": "https://goodflippindesign.com"
  },
  "potentialAction": {
    "@type": "SearchAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://goodflippindesign.com/#work?search={search_term_string}"
    },
    "query-input": "required name=search_term_string"
  }
};

console.log(JSON.stringify(gfdWebSite, null, 2));
console.log('\n' + '='.repeat(80) + '\n');

// ============================================
// EXTRACT GLOBALDEETS COLLECTIONPAGE SCHEMA
// ============================================
console.log('[2/4] GlobalDeets - CollectionPage Schema');
console.log('Copy this into Google Rich Results Test:\n');

const globaldeetsCollection = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "@id": "https://globaldeets.com/#collection",
  "name": "GlobalDeets Portfolio",
  "description": "Interactive portfolio hub showcasing data visualization projects, business intelligence dashboards, and strategic research platforms",
  "url": "https://globaldeets.com",
  "hasPart": [
    {
      "@type": "CreativeWork",
      "name": "AI Aimate",
      "description": "AI education platform with RAG-powered search",
      "url": "https://aiaimate.com"
    },
    {
      "@type": "CreativeWork",
      "name": "CultureSherpa",
      "description": "Interactive cultural atlas mapping 470+ world cultures",
      "url": "https://culturesherpa.org"
    },
    {
      "@type": "CreativeWork",
      "name": "Good Flippin Vibes",
      "description": "Science-backed wellness and community platform",
      "url": "https://goodflippinvibes.com"
    }
  ]
};

console.log(JSON.stringify(globaldeetsCollection, null, 2));
console.log('\n' + '='.repeat(80) + '\n');

// ============================================
// EXTRACT AI AIMATE EDUCATIONALORGANIZATION
// ============================================
console.log('[3/4] AI Aimate - EducationalOrganization Schema');
console.log('Copy this into Google Rich Results Test:\n');

const aiaimateOrg = {
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  "@id": "https://aiaimate.com/#organization",
  "name": "AI Aimate",
  "alternateName": "AI Aimate Learning Platform",
  "description": "Interactive AI education platform with visual explanations of artificial intelligence concepts, RAG-powered search, and semantic knowledge base",
  "url": "https://aiaimate.com",
  "logo": {
    "@type": "ImageObject",
    "url": "https://aiaimate.com/favicon-512x512.png",
    "width": "512",
    "height": "512"
  },
  "educationalProgramMode": "Online",
  "hasOfferCatalog": {
    "@type": "OfferCatalog",
    "name": "AI Learning Courses",
    "itemListElement": [
      {
        "@type": "Course",
        "name": "AI Fundamentals",
        "description": "Core concepts of artificial intelligence",
        "provider": {
          "@type": "EducationalOrganization",
          "name": "AI Aimate"
        }
      },
      {
        "@type": "Course",
        "name": "Machine Learning Basics",
        "description": "Introduction to machine learning algorithms",
        "provider": {
          "@type": "EducationalOrganization",
          "name": "AI Aimate"
        }
      },
      {
        "@type": "Course",
        "name": "RAG Systems",
        "description": "Retrieval-Augmented Generation for AI applications",
        "provider": {
          "@type": "EducationalOrganization",
          "name": "AI Aimate"
        }
      }
    ]
  },
  "founder": {
    "@type": "Person",
    "name": "Brett Weaver",
    "url": "https://goodflippindesign.com"
  }
};

console.log(JSON.stringify(aiaimateOrg, null, 2));
console.log('\n' + '='.repeat(80) + '\n');

// ============================================
// EXTRACT GFV ORGANIZATION SCHEMA
// ============================================
console.log('[4/4] Good Flippin Vibes - Organization Schema');
console.log('Copy this into Google Rich Results Test:\n');

const gfvOrg = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://www.goodflippinvibes.com/#organization",
  "name": "Good Flippin Vibes",
  "alternateName": "GFV",
  "url": "https://www.goodflippinvibes.com",
  "description": "Science-backed wellness platform combining art, humor, and community to promote mental well-being and holistic health",
  "knowsAbout": [
    "Mental Health",
    "Wellness",
    "Positive Psychology",
    "Art Therapy",
    "Laughter Therapy"
  ],
  "hasOfferCatalog": {
    "@type": "OfferCatalog",
    "name": "Wellness Resources",
    "itemListElement": [
      {
        "@type": "Article",
        "name": "Laughter Therapy",
        "description": "Science-backed benefits of laughter for mental and physical health",
        "url": "https://www.goodflippinvibes.com/science/laughter-therapy.html"
      },
      {
        "@type": "Article",
        "name": "Biology of Joy",
        "description": "Understanding the neuroscience behind happiness and well-being",
        "url": "https://www.goodflippinvibes.com/science/biology-of-joy.html"
      }
    ]
  },
  "founder": {
    "@type": "Person",
    "name": "Brett Weaver",
    "url": "https://goodflippindesign.com"
  }
};

console.log(JSON.stringify(gfvOrg, null, 2));
console.log('\n' + '='.repeat(80) + '\n');

// ============================================
// INSTRUCTIONS
// ============================================
console.log('=== TESTING INSTRUCTIONS ===\n');
console.log('1. Open: https://search.google.com/test/rich-results');
console.log('2. Click "CODE" tab');
console.log('3. Paste each schema above (one at a time)');
console.log('4. Click "TEST CODE" button');
console.log('5. Verify: ✓ No errors, ✓ Rich results detected\n');
console.log('=== EXPECTED RESULTS ===\n');
console.log('✓ GFD WebSite: "Valid WebSite" with search action');
console.log('✓ GlobalDeets CollectionPage: "Valid CollectionPage" with 3 items');
console.log('✓ AI Aimate EducationalOrganization: "Valid Organization" + course listings');
console.log('✓ GFV Organization: "Valid Organization" with wellness resources\n');
console.log('If any errors occur, note them and we will fix before deployment.\n');
