# Portfolio Manager - Quick Start Guide

## 📝 How to Edit Your Website Content (No VS Code Required!)

### Option 1: Edit via GitHub Web Interface (Recommended)

1. **Go to the content file**:
   - Visit: https://github.com/weave0/goodflippindesign/blob/main/assets/data/content.json

2. **Click the pencil icon** (✏️ Edit this file)

3. **Make your changes** following the examples below

4. **Scroll down and click "Commit changes"**
   - Add a description like "Added new portfolio project"
   - Click "Commit changes"

5. **Wait 2-3 minutes** for auto-deployment via GitHub Actions

6. **Refresh your website** to see changes live!

---

## 📂 Content Structure Explained

### Adding a New Portfolio Project

```json
{
  "id": "unique-project-id",
  "title": "Project Name",
  "description": "Short description of the project (1-2 sentences)",
  "category": "AI Platform | Data Visualization | Web Application | Dashboard",
  "tech": ["Next.js", "Python", "AWS"],
  "url": "https://yourproject.com",
  "image": "assets/portfolio/screenshot.png",
  "status": "Live | In Development | Archived",
  "statusBadge": {
    "text": "Special Label",
    "style": "background: rgba(31, 22, 66, 0.9); color: #c4b5fd;"
  },
  "featured": true,
  "launchDate": "2024"
}
```

**Field Guide**:

- `id` - Short, unique identifier (no spaces, use dashes)
- `title` - Project name as it appears on the site
- `description` - Keep under 150 characters
- `category` - Choose from: AI Platform, Data Visualization, Web Application, Dashboard
- `tech` - Array of technologies (wrap each in quotes)
- `url` - Full URL starting with https://
- `image` - Path to screenshot (upload to assets/portfolio/)
- `status` - Project state
- `featured` - true/false (shows on homepage if true)
- `launchDate` - Year launched

---

### Adding a Video to Media Gallery

```json
{
  "id": "unique-video-id",
  "title": "Video Title",
  "type": "video",
  "url": "https://www.youtube.com/embed/VIDEO_ID",
  "thumbnail": "assets/videos/thumbnail.jpg",
  "description": "What this video shows",
  "duration": "3:42"
}
```

**How to Get YouTube Embed URL**:

1. Go to your YouTube video
2. Click "Share" → "Embed"
3. Copy the URL from `src="..."` (looks like `https://www.youtube.com/embed/ABC123`)
4. Paste into `url` field

**For Vimeo Videos**:

- Use: `https://player.vimeo.com/video/VIDEO_ID`

---

## 🖼️ Uploading Images

### Via GitHub Web Interface

1. Navigate to: https://github.com/weave0/goodflippindesign/tree/main/assets/portfolio

2. Click **"Add file"** → **"Upload files"**

3. Drag and drop your images (PNG, JPG, or WebP)

4. **Name files clearly**: `project-name-screenshot.png`

5. Click **"Commit changes"**

6. Reference in JSON: `"image": "assets/portfolio/project-name-screenshot.png"`

### Recommended Image Sizes

- **Portfolio screenshots**: 1200x800px (3:2 ratio)
- **Video thumbnails**: 1280x720px (16:9 ratio)
- **File size**: Under 500KB (use https://tinypng.com to compress)

---

## 🎬 Video Management Options

### Option 1: YouTube (Easiest, Free)

1. Upload video to YouTube
2. Set visibility to "Unlisted" (not public, but accessible via link)
3. Get embed URL (see above)
4. Add to `mediaGallery` in content.json

### Option 2: Vimeo Pro ($20/month)

- Better privacy controls
- No YouTube branding
- Professional player

### Option 3: Self-Hosted (Advanced)

- Upload to `assets/videos/`
- Use `url: "assets/videos/demo.mp4"`
- ⚠️ Large files slow down site (keep under 10MB)

---

## ✅ Common Tasks

### Update Project Description

1. Find project in `portfolio` array
2. Change `description` text
3. Commit changes

### Change Project Status

```json
"status": "Live"  →  "status": "Archived"
```

### Add New Technology Tag

```json
"tech": ["Next.js", "Python"]  →  "tech": ["Next.js", "Python", "PostgreSQL"]
```

### Remove a Project (Hide from Site)

1. Set `featured: false`
2. Or delete entire project block (careful with commas!)

---

## 🐛 Troubleshooting

### Site Not Updating After Commit?

- Wait 3-5 minutes for GitHub Actions to deploy
- Check: https://github.com/weave0/goodflippindesign/actions
- Look for green checkmark (✅ success) or red X (❌ failed)

### JSON Syntax Error?

**Common mistakes**:

- Missing comma between items: `}` should be `},`
- Extra comma at end of last item
- Missing quotes around text: `title: Project` → `"title": "Project"`
- Use https://jsonlint.com to validate

### Image Not Showing?

- Check file path matches exactly (case-sensitive!)
- Ensure image uploaded to correct folder
- Verify image size (under 500KB)

---

## 🚀 Next Steps

**Want a visual editor instead?**

- See: `docs/CONTENT_MANAGEMENT_SOLUTIONS.md`
- Recommendation: Decap CMS (1-hour setup for WordPress-like UI)

**Need help?**

- Email: brett@goodflippindesign.com
- Or commit a change with "HELP:" prefix and I'll review

---

## 📋 Example: Adding a Complete Project

```json
{
  "id": "new-client-dashboard",
  "title": "Healthcare Analytics Dashboard",
  "description": "Real-time patient data visualization for multi-clinic healthcare network. HIPAA-compliant architecture.",
  "category": "Dashboard",
  "tech": ["React", "TypeScript", "PostgreSQL", "AWS"],
  "url": "https://healthcare-demo.goodflippindesign.com",
  "image": "assets/portfolio/healthcare-dashboard.png",
  "status": "Live",
  "statusBadge": {
    "text": "Enterprise Client",
    "style": "background: rgba(5, 46, 32, 0.9); color: #6ee7b7;"
  },
  "featured": true,
  "launchDate": "2025"
}
```

**Where to add this?**

- Open `content.json`
- Find `"portfolio": [` near top
- Add after last project (before `]`)
- Make sure there's a comma after previous project's `}`
