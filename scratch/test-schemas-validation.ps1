# Schema Validation Testing Script
# Extract JSON-LD schemas from each site for Google Rich Results Test

Write-Host "`n=== GFD Ecosystem Schema Validation ===" -ForegroundColor Cyan
Write-Host "Use Google Rich Results Test: https://search.google.com/test/rich-results`n" -ForegroundColor Yellow

# ============================================
# SITE 1: Good Flippin Design
# ============================================
Write-Host "`n[1/4] GOOD FLIPPIN DESIGN" -ForegroundColor Green
Write-Host "File: z:\GFD\index.html" -ForegroundColor Gray

$gfdSchemas = @"
EXTRACT THESE SCHEMAS FROM index.html (lines ~1408-1589):

1. ProfessionalService schema (existing - lines 1408-1490)
2. WebSite schema with SearchAction (NEW - lines 1491-1517)
3. Person schema - Brett Weaver (NEW - lines 1519-1555)
4. BreadcrumbList schema (NEW - lines 1557-1589)

TESTING STEPS:
→ Open: https://search.google.com/test/rich-results
→ Paste each JSON-LD block individually
→ Expected results:
  ✓ ProfessionalService: Valid organization
  ✓ WebSite: Site search box eligible
  ✓ Person: Knowledge panel candidate
  ✓ BreadcrumbList: Navigation valid

"@

Write-Host $gfdSchemas

# ============================================
# SITE 2: GlobalDeets
# ============================================
Write-Host "`n[2/4] GLOBALDEETS" -ForegroundColor Green
Write-Host "File: z:\GFD\GFD Dev Projects\Globaldeets\index.html" -ForegroundColor Gray

$globaldeetsSchemas = @"
EXTRACT THESE SCHEMAS (lines ~56-140):

1. WebSite schema with SearchAction (NEW)
2. CollectionPage with hasPart array (NEW - 3 portfolio projects)
3. BreadcrumbList schema (NEW - 4 navigation items)

TESTING STEPS:
→ Paste each schema into Google Rich Results Test
→ Expected results:
  ✓ WebSite: Search action for categories
  ✓ CollectionPage: Portfolio with 3 CreativeWork items
  ✓ BreadcrumbList: 4-item navigation

"@

Write-Host $globaldeetsSchemas

# ============================================
# SITE 3: AI Aimate
# ============================================
Write-Host "`n[3/4] AI AIMATE" -ForegroundColor Green
Write-Host "File: z:\GFD\GFD Dev Projects\AI\portal\app\layout.tsx" -ForegroundColor Gray

$aiaimateSchemas = @"
EXTRACT SCHEMA ARRAY (lines ~107-235):

This is a TypeScript/JavaScript array with 3 schemas.
Convert to valid JSON before testing:
- Remove trailing commas
- Ensure proper JSON formatting

1. EducationalOrganization (ENHANCED)
   → Contains course catalog with 3 courses
   → Founder, parent org, address info
2. WebSite schema with SearchAction
3. BreadcrumbList (4 items)

TESTING STEPS:
→ Copy structuredData array from layout.tsx
→ Convert to valid JSON (remove TypeScript syntax)
→ Test each schema separately
→ Expected results:
  ✓ EducationalOrganization: Course listings visible
  ✓ WebSite: Search action configured
  ✓ BreadcrumbList: Navigation valid

"@

Write-Host $aiaimateSchemas

# ============================================
# SITE 4: Good Flippin Vibes
# ============================================
Write-Host "`n[4/4] GOOD FLIPPIN VIBES" -ForegroundColor Green
Write-Host "File: z:\GFD\GFD Dev Projects\GFV\website\index.html" -ForegroundColor Gray

$gfvSchemas = @"
EXTRACT THESE SCHEMAS (lines ~70-195):

1. Organization schema (ENHANCED - wellness resources)
2. WebSite schema
3. BreadcrumbList (4 navigation items)

TESTING STEPS:
→ Paste each schema into Google Rich Results Test
→ Expected results:
  ✓ Organization: Wellness resources catalog
  ✓ WebSite: Valid site information
  ✓ BreadcrumbList: 4-item navigation

"@

Write-Host $gfvSchemas

# ============================================
# SUMMARY
# ============================================
Write-Host "`n=== VALIDATION CHECKLIST ===" -ForegroundColor Cyan
Write-Host "For EACH schema, verify:" -ForegroundColor Yellow
Write-Host "  ✓ No errors reported by Google" -ForegroundColor Gray
Write-Host "  ✓ No warnings (or understand why they exist)" -ForegroundColor Gray
Write-Host "  ✓ Rich result preview shows expected data" -ForegroundColor Gray
Write-Host "  ✓ URLs are absolute (https://...)" -ForegroundColor Gray
Write-Host "  ✓ Required properties present" -ForegroundColor Gray

Write-Host "`n=== AFTER VALIDATION ===" -ForegroundColor Cyan
Write-Host "If all tests pass → Proceed to deployment (todos 6-9)" -ForegroundColor Green
Write-Host "If errors found → Fix issues (todo 5) → Re-test → Deploy" -ForegroundColor Yellow

Write-Host "`n=== QUICK TEST OPTION ===" -ForegroundColor Cyan
Write-Host "Alternative: Extract one schema from each site for quick validation:" -ForegroundColor Gray
Write-Host "  1. GFD → WebSite schema (lines 1491-1517)" -ForegroundColor Gray
Write-Host "  2. GlobalDeets → CollectionPage (lines ~75-115)" -ForegroundColor Gray
Write-Host "  3. AI Aimate → EducationalOrganization (lines ~108-175)" -ForegroundColor Gray
Write-Host "  4. GFV → Organization (lines ~72-160)" -ForegroundColor Gray

Write-Host "`nReady to begin testing? Open Google Rich Results Test now.`n" -ForegroundColor Cyan
