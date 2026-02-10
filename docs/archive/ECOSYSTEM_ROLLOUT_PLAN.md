# Ecosystem Logo Deployment - Rollout Plan

**Primary Site**: ✅ Good Flippin Design (DEPLOYED 2026-02-05-16:42)
**Remaining Sites**: 5 sites pending logo updates

## Deployment Strategy

### Phase 1: Repository Access & Structure Analysis

For each site, verify:

1. Repository exists and is accessible
2. Navigation structure matches GFD pattern
3. CSS classes are consistent
4. Identify current emoji icons locations

### Phase 2: Code Implementation

**Source Template**: [shared/ecosystem-nav-logos.html](shared/ecosystem-nav-logos.html)

**Replacement Pattern** (consistent across all sites):

```html
<!-- BEFORE -->
<span class="nav-icon" aria-hidden="true">🧠</span>

<!-- AFTER -->
<span class="nav-icon" aria-hidden="true">
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    width="24"
    height="24"
  >
    <path
      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
    />
  </svg>
</span>
```

### Phase 3: Testing & Validation

**Pre-Deployment Checks**:

- [ ] Verify SVG renders in Chrome, Firefox, Safari
- [ ] Test hover states and animations
- [ ] Confirm mobile responsive behavior (375px - 2560px)
- [ ] Validate accessibility (ARIA, keyboard nav)
- [ ] Check icon contrast ratios (WCAG AA 4.5:1 minimum)

**Post-Deployment Verification**:

- [ ] HTTP 200 response
- [ ] Cache bust timestamp updated
- [ ] SVG icons visible in browser DevTools
- [ ] Links functional (target="\_blank" rel="noopener")
- [ ] No console errors

## Sites Requiring Updates

### 1. AI Aimate

- **Repository**: `weave0/AI`
- **Domain**: https://aiaimate.com
- **Icon Change**: 🧠 → SVG lightbulb (innovation/education)
- **Priority**: HIGH (flagship AI product)
- **Estimated Effort**: 15 minutes

---

### 2. CultureSherpa

- **Repository**: `weave0/CultureSherpa`
- **Domain**: https://culturesherpa.org
- **Icon Change**: 🌍 → SVG globe
- **Priority**: HIGH (active public-facing project)
- **Estimated Effort**: 15 minutes

---

### 3. Good Flippin Vibes

- **Repository**: `weave0/good-flippin-vibes`
- **Domain**: https://goodflippinvibes.com
- **Icon Change**: ✨ → SVG heart (wellness focus)
- **Priority**: MEDIUM (wellness platform)
- **Estimated Effort**: 15 minutes

---

### 4. GlobalDeets

- **Repository**: `weave0/globaldeets`
- **Domain**: https://globaldeets.com
- **Icon Change**: 📊 → SVG bar chart
- **Priority**: HIGH (data visualization showcase)
- **Estimated Effort**: 15 minutes

---

### 5. CitizenApproved

- **Repository**: `weave0/CitizenApproved`
- **Domain**: https://citizenapproved.org
- **Icon Change**: 🗳️ → SVG shield with checkmark
- **Priority**: MEDIUM (civic engagement platform)
- **Estimated Effort**: 15 minutes
- **Future Enhancement**: Custom futuristic/glowing logo design

---

## Batch Deployment Workflow

### Automation Steps (Per Site)

```powershell
# 1. Clone repository (if not already local)
git clone https://github.com/weave0/{REPO_NAME}.git
cd {REPO_NAME}

# 2. Create feature branch
git checkout -b feat/ecosystem-nav-logos

# 3. Locate ecosystem navigation section
# (Search for: "nav-icon" + emoji icons)

# 4. Apply multi_replace_string_in_file for each icon
# (Use exact patterns from GFD implementation)

# 5. Update cache bust
Get-Date -Format "yyyy-MM-dd-HH:mm" | Out-File -FilePath "cache-bust.txt" -NoNewline -Encoding utf8

# 6. Sync to temp_review.html (if exists)
Copy-Item "index.html" "temp_review.html" -Force

# 7. Commit and push
git add .
git commit -m "feat: Replace emoji icons with SVG logos in ecosystem nav"
git push origin feat/ecosystem-nav-logos

# 8. Create pull request or merge to main
# 9. Monitor deployment
# 10. Verify live site
```

## Risk Mitigation

### Potential Issues

| Risk                        | Mitigation                                  |
| --------------------------- | ------------------------------------------- |
| Different HTML structure    | Inspect each site before batch changes      |
| Missing CSS classes         | Copy `.nav-icon` styles from GFD if needed  |
| Broken deployment pipelines | Test deployment before logo changes         |
| Custom domain DNS issues    | Verify site accessible before starting      |
| Cache not clearing          | Use hard refresh (Ctrl+Shift+R) for testing |

### Rollback Plan

If deployment fails:

1. Revert commit: `git revert HEAD`
2. Push revert: `git push`
3. Monitor auto-deploy
4. Investigate issue before retry

## Success Criteria

All 5 sites must meet:

- ✅ SVG icons render correctly
- ✅ No emoji fallbacks visible
- ✅ Hover states functional
- ✅ Mobile responsive (tested 375px, 768px, 1920px)
- ✅ Accessibility compliant (WCAG AA)
- ✅ Deployment succeeds without errors
- ✅ Cache bust timestamp updated
- ✅ Links functional across all sites

## Timeline Estimate

- **Per Site**: 15 minutes (implementation + testing)
- **Total Time**: 75 minutes (5 sites × 15 min)
- **Buffer Time**: +25 minutes for unexpected issues
- **Total Project**: ~100 minutes (1.67 hours)

## Dependencies

### Required Tools

- Git access to all 5 repositories
- GitHub CLI (`gh`) for workflow monitoring
- PowerShell for automation scripts
- Modern browser for visual verification

### Prerequisites Met

- ✅ Template created ([shared/ecosystem-nav-logos.html](shared/ecosystem-nav-logos.html))
- ✅ GFD successfully deployed as reference
- ✅ SVG icon designs finalized
- ✅ Deployment patterns documented

## Next Immediate Action

**Choose Deployment Approach**:

### Option A: Sequential Manual Deployment

- **Pros**: Careful validation per site, immediate issue detection
- **Cons**: Time-intensive, repetitive manual work
- **Best For**: Ensuring zero errors, learning site-specific quirks

### Option B: Batch Automated Deployment

- **Pros**: Fast, consistent changes across all sites
- **Cons**: If template wrong, breaks all sites simultaneously
- **Best For**: Sites with identical structure (verify first!)

### Option C: Staged Rollout (Recommended)

1. Deploy to 1 site (AI Aimate) - verify thoroughly
2. If successful, batch deploy to remaining 4 sites
3. Final verification pass across all sites

**Recommendation**: Use Option C (staged rollout) to balance speed with safety.

---

## Questions for User

Before proceeding:

1. **Access Confirmation**: Do you have write access to all 5 repositories?
2. **Deployment Method**: Which option (A/B/C) do you prefer?
3. **CitizenApproved Logo**: Use current shield icon or create custom logo first?
4. **Testing Requirements**: Manual visual check or automated test suite?

---

**Ready to proceed when you confirm approach!** 🚀
