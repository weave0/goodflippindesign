# Pre-Flight Checklist - Logo Generation

**Run this checklist BEFORE executing DALL-E generation**

---

## ✅ Environment Validation

### **1. Python Environment**

```powershell
python --version
# Expected: Python 3.9+ (you have 3.13.5 ✓)
```

### **2. Virtual Environment**

```powershell
# Should see (.venv) in your prompt
# If not, run:
.\.venv\Scripts\Activate.ps1
```

### **3. Required Packages**

```powershell
pip list | Select-String -Pattern "openai|pillow|requests"
# Expected output:
# openai      1.x.x or higher
# Pillow      10.x.x or higher
# requests    2.31.x or higher
```

**If missing:** Run setup script:

```powershell
.\Brand Assets Development\scripts\setup-environment.ps1
```

### **4. OpenAI API Key**

```powershell
# Check if configured
if (Test-Path .env) {
    Get-Content .env | Select-String "OPENAI_API_KEY"
} else {
    Write-Host "No .env file found - need to create it"
}
```

**Status:**

- [ ] `.env` file exists
- [ ] `OPENAI_API_KEY` is configured with real key (not placeholder)
- [ ] Key starts with `sk-proj-` or `sk-`

**If not configured:**

1. Copy template: `Copy-Item .env.example .env`
2. Get key from: https://platform.openai.com/api-keys
3. Edit `.env` and paste your real key

---

## 🎨 Prompt Validation

### **5. Prompt File Exists**

```powershell
Test-Path "Brand Assets Development\THE_PERFECT_DALLE_PROMPT.md"
# Expected: True
```

### **6. Review Final Prompt**

Open: `Brand Assets Development\THE_PERFECT_DALLE_PROMPT.md`

**Verify:**

- [ ] Concept approach feels right (lettermark/abstract/fusion)
- [ ] Color preference is clear (teal/purple/amber or "AI choose best")
- [ ] Technical requirements match needs (circular crop safe, scalable 16px-1024px)
- [ ] Exclusions are appropriate (no clichés, no realistic imagery)

**Quick edits allowed:**

- Emphasize preferred concept (A/B/C)
- Specify preferred accent color
- Adjust "minimalist" vs. "distinctive" balance

### **7. Output Directory Ready**

```powershell
Test-Path "Brand Assets Development\Final Assets\06-Source-Files"
# Expected: True
```

**If missing:** Run:

```powershell
New-Item -ItemType Directory -Path "Brand Assets Development\Final Assets\06-Source-Files" -Force
```

---

## 💰 Cost & API Verification

### **8. OpenAI Account Status**

Visit: https://platform.openai.com/account/usage

**Check:**

- [ ] Account has available credits or valid payment method
- [ ] No rate limit warnings
- [ ] DALL-E 3 API access enabled

**Expected cost:**

- 1 variant: ~$0.04
- 3 variants: ~$0.12
- HD quality (1792x1024) is worth it for scalability

### **9. Rate Limits**

Free tier: 5 images per minute
Paid tier: 50 images per minute

**Your plan:**

- [ ] Generating 1 variant (recommended first run)
- [ ] Generating 2-3 variants (if want choice)
- [ ] Wait between batches if hitting limits

---

## 🔍 Final Review

### **10. Research Documents**

Quick review to ensure alignment:

**[BRAND_DNA_ANALYSIS.md](Brand Assets Development/Research/BRAND_DNA_ANALYSIS.md)**

- [ ] Reviewed brand personality: "Warm Technical Excellence"
- [ ] Color palette feels right (#0d0d0d dark + vibrant glow)
- [ ] Understand competitive positioning (Apple minimalism + Stripe gradients + warmth)

**[THE_PERFECT_DALLE_PROMPT.md](Brand Assets Development/THE_PERFECT_DALLE_PROMPT.md)**

- [ ] Prompt is execution-ready (no placeholders)
- [ ] Concept options are clear
- [ ] Technical requirements match success criteria

**[COMPLETE_ASSET_SUITE.md](Brand Assets Development/COMPLETE_ASSET_SUITE.md)**

- [ ] Understand post-generation workflow
- [ ] Know what deliverables we're producing (150+ files)
- [ ] Vectorization process is clear

### **11. Decision Criteria Ready**

Know how you'll evaluate generated logos:

**Immediate checks:**

- [ ] View at full size (1792x1024)
- [ ] Test at 512px, 128px, 32px, 16px
- [ ] Apply circular crop (simulate social media)
- [ ] Check on dark background (#0d0d0d)
- [ ] Convert to grayscale (monochrome test)

**Success threshold:**

- 90%+ match → Approve for vectorization
- 70-89% → Note issues, refine once
- <70% → Revise prompt, regenerate

### **12. Time Allocation**

Set aside:

- [ ] 5 minutes: Generation + download
- [ ] 10-15 minutes: Quality review at multiple sizes
- [ ] 5 minutes: Decision (approve/refine/revise)

Total: ~20-30 minutes for thorough first run

---

## 🚀 Execution Command

**Once all checks pass, run:**

```powershell
# Single variant (recommended)
python "Brand Assets Development\scripts\generate-dalle-logo.py"

# Multiple variants (if want choice)
python "Brand Assets Development\scripts\generate-dalle-logo.py" 3
```

**What will happen:**

1. Script reads prompt from markdown file
2. Sends to DALL-E 3 API (HD quality)
3. Downloads image(s)
4. Saves to `Final Assets/06-Source-Files/`
5. Creates metadata JSON + prompt TXT
6. Displays success message with next steps

---

## ⚠️ Troubleshooting Quick Fixes

**"ModuleNotFoundError: No module named 'openai'"**

```powershell
pip install openai pillow requests
```

**"OpenAI API key not found"**

```powershell
# Quick test:
$env:OPENAI_API_KEY = "sk-proj-your-key-here"
# Then regenerate
```

**"HTTPError: 401 Unauthorized"**
→ API key is invalid, check for typos in .env file

**"HTTPError: 429 Rate Limit"**
→ Wait 60 seconds, try again

**"No such file or directory"**
→ Run from project root: `cd "Z:\Good Flippin Design"`

---

## ✅ Final Sign-Off

**Before executing, confirm:**

- [x] Python 3.13.5 ready
- [x] Virtual environment activated
- [ ] OpenAI SDK installed (will auto-install if missing)
- [ ] API key configured in .env
- [ ] Prompt reviewed and approved
- [ ] Output directory exists
- [ ] Decision criteria clear
- [ ] Time allocated

**Ready?** → Run the generation script!

**Not ready?** → Run setup script first:

```powershell
.\Brand Assets Development\scripts\setup-environment.ps1
```

---

**Last chance to adjust:** If you want to tweak the prompt (emphasize lettermark, prefer purple accent, etc.), do it NOW in `THE_PERFECT_DALLE_PROMPT.md` before running.

**Confidence level:** 🟢 HIGH - Research complete, prompt refined, infrastructure ready

**Status:** 🚀 READY FOR LAUNCH
