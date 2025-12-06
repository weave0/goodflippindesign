# Web Development Services - Project Inquiry Flow

## Overview

This document outlines a minimal, effective project discovery flow for freelance web development services. The goal is to filter genuine inquiries while respecting your time constraints.

---

## Recommended Flow

```
[Website Visit] 
    ↓
[Services Overview] → Quick scan of capabilities
    ↓
[Portfolio] → GlobalDeets showcases live work
    ↓
[Inquiry Form] → Basic qualification questions
    ↓
[Email to brett.l.weaver@gmail.com]
    ↓
[You review & respond if interested]
```

---

## Contact Form Fields (Minimal)

### Required Fields

```html
1. Name (text)
2. Email (email)
3. Company/Organization (text, optional)
4. Project Type (dropdown):
   - Business Intelligence Dashboard
   - Strategic Research Portal
   - Company Website/Landing Page
   - Web Application
   - AI/Data Integration
   - Other
5. Budget Range (dropdown):
   - Under $5,000
   - $5,000 - $15,000
   - $15,000 - $50,000
   - $50,000+
   - Let's discuss
6. Timeline (dropdown):
   - ASAP (within 2 weeks)
   - 1-3 months
   - 3-6 months
   - Flexible
7. Brief Description (textarea, 500 char max)
```

### Optional Enhancement
- How did you find me? (referral source)
- Link to current website (if redesign)

---

## Email Forwarding Setup

### Option 1: Cloudflare Email Routing (Recommended)
Since brettleeweaver.com is likely on Cloudflare:

1. Go to Cloudflare Dashboard → Email → Email Routing
2. Add custom address: `hello@brettleeweaver.com`
3. Forward to: `brett.l.weaver@gmail.com`
4. Repeat for other addresses as needed

### Option 2: Form Service (Netlify/Formspree)
```html
<form action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
  <!-- form fields -->
</form>
```
- Creates email notification on submission
- Free tier: 50 submissions/month (plenty for exclusive inquiries)

---

## Suggested Additions to brettleeweaver.com

### New Section: "Web Development Services"

```markdown
## Exclusive Web Development

I take on select projects that align with my expertise in:

- **Business Intelligence Portals** - Strategic research dashboards
- **Data Visualization** - Interactive analytics platforms  
- **Enterprise Web Applications** - Full-stack React/Node.js
- **AI-Integrated Solutions** - RAG systems, knowledge bases

### Approach
- Direct collaboration (no agency layers)
- Enterprise-quality code, startup speed
- Accessibility-first (WCAG 2.1 AA+)
- Full documentation and handoff

### Current Availability
Limited to 1-2 active projects. Inquire for timeline.

[View Portfolio](https://globaldeets.com) | [Submit Inquiry](#contact)
```

---

## Quick-Reference Price Anchors

Based on the complexity of your portfolio projects:

| Project Type | Typical Range | Timeline |
|-------------|---------------|----------|
| Landing Page | $2,500 - $5,000 | 1-2 weeks |
| Business Dashboard | $10,000 - $25,000 | 4-8 weeks |
| Full Web Application | $25,000 - $75,000 | 2-4 months |
| Strategic Intelligence Portal | $15,000 - $40,000 | 4-8 weeks |

*These are starting points for discussion. Every project is unique.*

---

## Response Templates

### Initial Response (Interested)
```
Hi [Name],

Thanks for reaching out about [project type]. I reviewed your inquiry and have a few follow-up questions:

1. [Specific question about scope]
2. [Question about timeline/budget alignment]
3. [Question about existing assets/content]

If this sounds like a fit, I'm available for a 30-minute discovery call. Here's my calendar: [link]

Best,
Brett
```

### Polite Decline
```
Hi [Name],

Thanks for thinking of me for this project. After reviewing your requirements, I don't think I'm the right fit for [reason - timeline, budget, scope mismatch].

A few suggestions that might help:
- [Alternative resource/approach]
- [Referral if appropriate]

Best of luck with your project!
Brett
```

---

## Implementation Priority

### This Week
- [ ] Set up Cloudflare email routing
- [ ] Add simple contact form to brettleeweaver.com
- [ ] Create Gmail filter for @brettleeweaver.com emails

### This Month  
- [ ] Add "Services" section to brettleeweaver.com
- [ ] Create intake form (Formspree or Netlify Forms)
- [ ] Write 2-3 response templates

### When Needed
- [ ] Standard proposal template
- [ ] Contract template (consider HelloSign/DocuSign integration)
- [ ] Simple project tracker (Notion template)

---

## Tools Recommendation

### Free/Low-Cost Stack
- **Forms**: Formspree (free 50/mo) or Netlify Forms
- **Email**: Gmail with filters + Cloudflare routing
- **Calendar**: Calendly free tier for discovery calls
- **Contracts**: HelloSign or Dropbox Sign (free for personal use)
- **Invoicing**: Wave or Stripe invoicing (both free)
- **Project Tracking**: Notion free tier

---

*Created: December 2, 2025*
