# ✅ MANUAL CONVERSION FEATURE VERIFICATION

**Purpose**: Verify deployed conversion features work end-to-end
**Time Required**: 30 minutes
**Tools Needed**: Modern browser with DevTools

---

## 🎯 TESTING CHECKLIST

### Site 1: Good Flippin Design (goodflippindesign.com)

#### Test 1: Exit Intent Popup ⏱️ 2 min

1. **Open**: https://goodflippindesign.com
2. **Wait**: 2-3 seconds for page to fully load
3. **Trigger**: Move mouse cursor to top edge of browser window (as if closing tab)
4. **Expected**: Popup appears with email signup form

**✅ Pass Criteria**:

- [ ] Popup appears within 1 second of mouse movement
- [ ] Email input field is visible
- [ ] "Subscribe" or "Join" button present
- [ ] Can close popup (X button or click outside)

**❌ If Failed**:

- Open DevTools (F12) → Console tab → Look for JavaScript errors
- Check if `showExitIntentPopup` function exists (type in console)
- Screenshot error and note details

---

#### Test 2: Recommended Donation Tier ⏱️ 2 min

1. **Open**: https://goodflippindesign.com/donate
2. **Find**: $10 donation tier
3. **Check**: Visual prominence

**✅ Pass Criteria**:

- [ ] $10 tier has "💖 RECOMMENDED" badge (green, top-center)
- [ ] $10 tier is larger than other tiers (scale ~1.05)
- [ ] $10 tier has green border glow
- [ ] Badge text is clearly visible (white text on green)

**❌ If Failed**:

- Right-click tier → Inspect Element
- Check for `transform: scale(1.05)` in styles
- Check for `.recommended-tier` or similar class
- ViewSource: Search for "RECOMMENDED"

---

### Site 2: Good Flippin Vibes (goodflippinvibes.com)

#### Test 3: Exit Intent (Same as Test 1) ⏱️ 2 min

Follow same steps as Test 1 above for goodflippinvibes.com

**Note**: May have different branding/colors but same functionality

---

### Site 3: GlobalDeets (globaldeets.com)

#### Test 4: Sticky CTA Bar ⏱️ 3 min

1. **Open**: https://globaldeets.com
2. **Scroll**: Down to 50% of page
3. **Expected**: Sticky CTA bar appears at bottom of viewport

**✅ Pass Criteria**:

- [ ] CTA bar appears after scrolling
- [ ] Bar sticks to bottom (doesn't scroll away)
- [ ] CTA text is readable
- [ ] Click CTA navigates correctly

**❌ If Failed**:

- Check DevTools → Console for errors
- Check if bar exists but not visible (may be `display: none`)
- Search source for `sticky-cta` or `position: fixed`

**Test on /donate page specifically**:

- Repeat above on https://globaldeets.com/donate

---

#### Test 5: Social Proof Notification ⏱️ 20 sec

1. **Open**: https://globaldeets.com
2. **Wait**: 15-20 seconds (stay on page)
3. **Expected**: Small notification appears (usually bottom-left or bottom-right)

**✅ Pass Criteria**:

- [ ] Notification appears after ~15 seconds
- [ ] Shows text like "Someone just donated..." or similar
- [ ] Notification auto-dismisses after 5-10 seconds
- [ ] Doesn't block page content

**❌ If Failed**:

- Check Console for timing errors
- Search source for `social-proof` or `notification`
- Try waiting 30 seconds (timing may be different)

---

### Site 4: AI Aimate (aiaimate.com)

#### Test 6: Support Page Features ⏱️ 3 min

1. **Open**: https://aiaimate.com/support
2. **Check**: Donation tier presentation

**✅ Pass Criteria**:

- [ ] Page loads without errors
- [ ] $10 tier exists
- [ ] $10 tier has "RECOMMENDED" indicator
- [ ] Tiers are clickable/interactive

**Note**: This is a React/Next.js site - features may be in JavaScript, not visible in source

---

#### Test 7: Social Proof (Same as Test 5) ⏱️ 20 sec

Follow same steps as Test 5 above for aiaimate.com/support

---

### Site 5: CitizenApproved (citizenapproved.org)

#### Test 8: Site Accessibility ⏱️ 1 min

1. **Open**: https://citizenapproved.org
2. **Wait**: Up to 15 seconds for full page load
3. **Check**: Page renders correctly

**✅ Pass Criteria**:

- [ ] Page loads (even if slow)
- [ ] Content visible
- [ ] Navigation works
- [ ] No blank white screen

**⚠️ Known Issue**: Slow load time (15+ seconds)

---

#### Test 9: Exit Intent (Same as Test 1) ⏱️ 2 min

Follow Test 1 steps for citizenapproved.org

---

### Site 6: CultureSherpa (culturesherpa.org)

#### Test 10: Site Health ⏱️ 2 min

1. **Open**: https://culturesherpa.org
2. **Open DevTools** (F12) → Console tab
3. **Check**: Errors

**✅ Pass Criteria**:

- [ ] Page loads quickly (<5 seconds)
- [ ] No critical errors in console
- [ ] Images/fonts load correctly

**❌ Expected Errors** (being fixed):

- Missing `site.webmanifest` (404)
- 2-4 resource 404s/403s

**These are cosmetic - site should still function**

---

#### Test 11: Exit Intent & Social Proof ⏱️ 3 min

Combine Tests 1 and 5 for culturesherpa.org

---

## 🧪 FORMSPREE EMAIL TESTING

### Test 12: Email Capture Works ⏱️ 3 min

**Pick ANY site** with exit intent popup:

1. **Trigger**: Exit intent popup (mouse to top of browser)
2. **Enter**: Test email (use your own or `test@example.com`)
3. **Submit**: Click subscribe/join button
4. **Expected**: Success message or redirect

**Verify in Formspree**: 5. **Login**: https://formspree.io/forms/xanyedqp/submissions 6. **Check**: Recent submission appears 7. **Verify**: "site" parameter distinguishes source correctly

**✅ Pass Criteria**:

- [ ] Form submits without error
- [ ] Success feedback shown to user
- [ ] Submission appears in Formspree dashboard
- [ ] Site source is tracked (parameter: `site=gfd` or similar)

---

## 📊 GA4 EVENT TESTING (After GA4 Setup)

### Test 13: GA4 Events Fire ⏱️ 5 min

**Prerequisites**: GA4 measurement ID installed

1. **Enable GA4 Debug Mode**:
   - Install: [Google Analytics Debugger](https://chrome.google.com/webstore/detail/google-analytics-debugger)
   - Click extension icon to enable

2. **Open**: https://goodflippindesign.com

3. **Open**: GA4 DebugView
   - Go to https://analytics.google.com
   - Left sidebar → Reports → DebugView

4. **Trigger**: Exit intent popup

5. **Check DebugView**: Event `exit_intent_shown` appears

6. **Submit**: Email in popup

7. **Check DebugView**: Event `email_signup` appears

**✅ Pass Criteria**:

- [ ] `exit_intent_shown` event fires
- [ ] `email_signup` event fires on form submit
- [ ] Events show correct parameters (site, timestamp)

**Repeat for**:

- Sticky CTA click → `sticky_cta_click`
- Social proof shown → `social_proof_shown`
- Donation tier selected → `donation_tier_selected`

---

## 📋 RESULTS TEMPLATE

### Copy/Paste This for Your Testing Session:

```markdown
## Manual Verification Results - [DATE]

### Good Flippin Design

- [x] Exit Intent: WORKS / FAILS - [notes]
- [x] $10 Recommended Tier: WORKS / FAILS - [notes]

### Good Flippin Vibes

- [ ] Exit Intent: WORKS / FAILS - [notes]

### GlobalDeets

- [ ] Sticky CTA: WORKS / FAILS - [notes]
- [ ] Social Proof: WORKS / FAILS - [notes]

### AI Aimate

- [ ] $10 Recommended: WORKS / FAILS - [notes]
- [ ] Social Proof: WORKS / FAILS - [notes]

### CitizenApproved

- [ ] Site loads: YES / NO - [time: X seconds]
- [ ] Exit Intent: WORKS / FAILS - [notes]

### CultureSherpa

- [ ] Console clean: YES / NO - [X errors]
- [ ] Exit Intent: WORKS / FAILS - [notes]
- [ ] Social Proof: WORKS / FAILS - [notes]

### Formspree Integration

- [ ] Email submits: WORKS / FAILS
- [ ] Appears in dashboard: YES / NO
- [ ] Site tracking works: YES / NO

### GA4 Events (if configured)

- [ ] exit_intent_shown: WORKS / FAILS
- [ ] email_signup: WORKS / FAILS
- [ ] sticky_cta_click: WORKS / FAILS
- [ ] social_proof_shown: WORKS / FAILS
- [ ] donation_tier_selected: WORKS / FAILS

### Issues Found:

1. [Issue description]
2. [Issue description]

### Screenshots: [attach any error screenshots]
```

---

## 🎯 QUICK REFERENCE

### Common DevTools Shortcuts

- **Open Console**: `F12` or `Ctrl+Shift+J` (Windows) / `Cmd+Option+J` (Mac)
- **Open Network**: `F12` → "Network" tab
- **Inspect Element**: Right-click → "Inspect"
- **Hard Refresh**: `Ctrl+Shift+R` (Windows) / `Cmd+Shift+R` (Mac)

### What to Look For

✅ **Good**: Clean console, features work, fast load
⚠️ **Warning**: Yellow console messages (informational)
❌ **Error**: Red console errors, features don't work

### When to Screenshot

- Any red console errors
- Feature not working as expected
- Visual layout issues
- Network failures (404, 403, 500)

---

## ⏱️ ESTIMATED TIME

| Task                   | Time       |
| ---------------------- | ---------- |
| All basic tests (1-11) | 25 min     |
| Formspree test (12)    | 3 min      |
| GA4 events test (13)   | 5 min      |
| Documentation          | 5 min      |
| **Total**              | **38 min** |

---

## 🚀 AFTER TESTING

### If All Tests Pass ✅

1. Update [PRODUCTION_VERIFICATION_COMPLETE.md](PRODUCTION_VERIFICATION_COMPLETE.md)
2. Mark features as "Manually Verified ✅"
3. Celebrate! 🎉

### If Tests Fail ❌

1. Document failures with screenshots
2. Open DevTools Console → Copy error messages
3. Share results for debugging
4. Reference [ECOSYSTEM_SITE_FIXES.md](ECOSYSTEM_SITE_FIXES.md) for solutions

---

**Ready to test? Open your browser and let's go! 🚀**
