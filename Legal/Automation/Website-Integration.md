# Legal Forms Section - Website Integration

## Add to goodflippindesign.com

**Location:** Insert after `#contact` section in index.html
**Purpose:** Provide direct access to automated legal document forms

---

## HTML CODE TO ADD

```html
<!-- LEGAL DOCUMENT FORMS SECTION -->
<section id="legal-forms">
  <div class="container">
    <div class="section-header">
      <p class="section-label">Legal Documentation</p>
      <h2 class="section-title">Automated Document Generation</h2>
      <p class="section-subtitle">
        Start your engagement with instant, automated legal documents. Fill out
        a simple form and receive professionally generated agreements within
        minutes.
      </p>
    </div>

    <div class="legal-forms-grid">
      <!-- NDA Request Card -->
      <div class="legal-form-card">
        <div class="form-icon">📄</div>
        <h3>Non-Disclosure Agreement</h3>
        <p>
          Protect confidential information before discussing your project
          details. Choose mutual or one-way NDA.
        </p>
        <ul class="form-features">
          <li>✓ Generated instantly</li>
          <li>✓ Mutual or one-way options</li>
          <li>✓ Email delivery</li>
        </ul>
        <a
          href="https://forms.gle/YOUR_NDA_FORM_ID"
          target="_blank"
          rel="noopener"
          class="btn-primary form-btn"
        >
          Request NDA →
        </a>
      </div>

      <!-- Service Agreement Card -->
      <div class="legal-form-card">
        <div class="form-icon">📋</div>
        <h3>Client Services Agreement</h3>
        <p>
          Formalize your engagement with comprehensive terms covering scope,
          payment, IP ownership, and warranties.
        </p>
        <ul class="form-features">
          <li>✓ Tailored to your project</li>
          <li>✓ Clear payment terms</li>
          <li>✓ IP protection included</li>
        </ul>
        <a
          href="https://forms.gle/YOUR_SERVICE_FORM_ID"
          target="_blank"
          rel="noopener"
          class="btn-primary form-btn"
        >
          Start Engagement →
        </a>
      </div>

      <!-- Statement of Work Card -->
      <div class="legal-form-card">
        <div class="form-icon">📊</div>
        <h3>Statement of Work</h3>
        <p>
          Define precise project deliverables, milestones, timeline, and
          acceptance criteria for your development project.
        </p>
        <ul class="form-features">
          <li>✓ Clear deliverables</li>
          <li>✓ Milestone tracking</li>
          <li>✓ Acceptance criteria</li>
        </ul>
        <a
          href="https://forms.gle/YOUR_SOW_FORM_ID"
          target="_blank"
          rel="noopener"
          class="btn-primary form-btn"
        >
          Create SOW →
        </a>
      </div>

      <!-- Change Order Card -->
      <div class="legal-form-card">
        <div class="form-icon">🔄</div>
        <h3>Change Order</h3>
        <p>
          Document scope changes, timeline impacts, and budget adjustments for
          active projects with formal change control.
        </p>
        <ul class="form-features">
          <li>✓ Scope change tracking</li>
          <li>✓ Budget impact analysis</li>
          <li>✓ Timeline adjustment</li>
        </ul>
        <a
          href="https://forms.gle/YOUR_CHANGE_ORDER_FORM_ID"
          target="_blank"
          rel="noopener"
          class="btn-primary form-btn"
        >
          Submit Change Order →
        </a>
      </div>
    </div>

    <!-- Process Explanation -->
    <div class="legal-process">
      <h3>How It Works</h3>
      <div class="process-steps">
        <div class="process-step">
          <div class="step-number">1</div>
          <h4>Fill Form</h4>
          <p>Complete simple form with project details (2-3 minutes)</p>
        </div>
        <div class="process-step">
          <div class="step-number">2</div>
          <h4>Auto-Generate</h4>
          <p>Document created instantly from your responses</p>
        </div>
        <div class="process-step">
          <div class="step-number">3</div>
          <h4>Email Delivery</h4>
          <p>Receive Google Doc + PDF via email within minutes</p>
        </div>
        <div class="process-step">
          <div class="step-number">4</div>
          <h4>Review & Sign</h4>
          <p>Review document and coordinate signature via email</p>
        </div>
      </div>
    </div>

    <!-- Trust Indicators -->
    <div class="legal-trust">
      <p class="trust-item">🔒 Secure automated processing</p>
      <p class="trust-item">📧 Email copies to all parties</p>
      <p class="trust-item">🗄️ Permanent archive storage</p>
      <p class="trust-item">⚖️ Attorney-reviewed templates</p>
    </div>
  </div>
</section>
```

---

## CSS STYLES TO ADD

```css
/* Legal Forms Section */
#legal-forms {
  background: var(--bg-elevated);
  padding: 6rem 2rem;
}

.legal-forms-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 2rem;
  margin-bottom: 4rem;
}

.legal-form-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 2rem;
  transition:
    transform 0.3s ease,
    border-color 0.3s ease;
  display: flex;
  flex-direction: column;
}

.legal-form-card:hover {
  transform: translateY(-4px);
  border-color: var(--border-hover);
}

.form-icon {
  font-size: 2.5rem;
  margin-bottom: 1rem;
}

.legal-form-card h3 {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: var(--text);
}

.legal-form-card > p {
  color: var(--text-secondary);
  font-size: 0.9375rem;
  line-height: 1.6;
  margin-bottom: 1.5rem;
  flex-grow: 1;
}

.form-features {
  list-style: none;
  margin-bottom: 1.5rem;
  padding-left: 0;
}

.form-features li {
  color: var(--text-secondary);
  font-size: 0.875rem;
  margin-bottom: 0.5rem;
  padding-left: 0;
}

.form-btn {
  width: 100%;
  text-align: center;
  text-decoration: none;
  margin-top: auto;
}

/* Legal Process */
.legal-process {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 3rem 2rem;
  margin-bottom: 3rem;
}

.legal-process h3 {
  text-align: center;
  font-size: 1.5rem;
  margin-bottom: 2.5rem;
}

.process-steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 2rem;
}

.process-step {
  text-align: center;
}

.step-number {
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, var(--accent), rgba(255, 255, 255, 0.8));
  color: var(--bg);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0 auto 1rem;
}

.process-step h4 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.process-step p {
  color: var(--text-secondary);
  font-size: 0.875rem;
  line-height: 1.5;
}

/* Trust Indicators */
.legal-trust {
  display: flex;
  flex-wrap: wrap;
  gap: 2rem;
  justify-content: center;
  padding-top: 2rem;
  border-top: 1px solid var(--border);
}

.trust-item {
  color: var(--text-secondary);
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Responsive */
@media (max-width: 900px) {
  .legal-forms-grid {
    grid-template-columns: 1fr;
  }

  .process-steps {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 600px) {
  .process-steps {
    grid-template-columns: 1fr;
  }

  .legal-trust {
    flex-direction: column;
    gap: 1rem;
    align-items: center;
  }
}
```

---

## NAVIGATION MENU UPDATE

Add link to navigation:

```html
<!-- Update .nav-links section -->
<ul class="nav-links">
  <li><a href="#services">Services</a></li>
  <li><a href="#work">Work</a></li>
  <li><a href="#process">Process</a></li>
  <li><a href="#legal-forms">Legal Forms</a></li>
  <!-- NEW -->
</ul>
```

---

## FOOTER UPDATE

Add legal links:

```html
<!-- Update .footer-links -->
<div class="footer-links">
  <a href="#legal-forms">Legal Forms</a>
  <a href="/terms.html">Terms of Service</a>
  <a href="/privacy.html">Privacy Policy</a>
  <a href="javascript:void(0)" id="footer-email-link"
    >getsome@goodflippinvibes.com</a
  >
</div>
```

---

## IMPLEMENTATION STEPS

1. **Open index.html**
2. **Find `</section>` after `#contact` section** (around line 950)
3. **Paste Legal Forms HTML** before `</main>`
4. **Add CSS** to `<style>` section (around line 50)
5. **Update navigation** to add Legal Forms link
6. **Update form URLs** after Google Forms are created:
   - Replace `YOUR_NDA_FORM_ID` with actual Google Form short URL
   - Replace `YOUR_SERVICE_FORM_ID` with actual URL
   - Replace `YOUR_SOW_FORM_ID` with actual URL
   - Replace `YOUR_CHANGE_ORDER_FORM_ID` with actual URL

---

## EXAMPLE GOOGLE FORM SHORT URL FORMAT

After creating Google Form, click "Send" → "Link" → "Shorten URL"

```
https://forms.gle/a1B2c3D4e5F6g7H8i
```

Use this in the href:

```html
<a href="https://forms.gle/a1B2c3D4e5F6g7H8i" ...></a>
```

---

## TESTING CHECKLIST

- [ ] All 4 form buttons visible on page
- [ ] Each button opens correct Google Form
- [ ] Form submission triggers Apps Script
- [ ] Document generated in Google Drive
- [ ] PDF created in Executed folder
- [ ] PDF copied to Archive folder
- [ ] Emails sent to all 3 addresses
- [ ] Email sent to requester
- [ ] Master Sheet updated with all data
- [ ] Status shows "Archived"
- [ ] Navigation scrolls to #legal-forms section
- [ ] Mobile responsive (test on phone)
- [ ] All icons/emojis display correctly

---

## ALTERNATIVE: EMBEDDED FORMS

If you want forms embedded directly on page instead of opening new tab:

```html
<!-- Replace button with iframe -->
<div class="embedded-form">
  <iframe
    src="https://docs.google.com/forms/d/e/YOUR_FORM_ID/viewform?embedded=true"
    width="100%"
    height="800"
    frameborder="0"
    marginheight="0"
    marginwidth="0"
  >
    Loading…
  </iframe>
</div>
```

**Pros:** Users stay on your site
**Cons:** Takes more space, may require scrolling

---

**File:** Website-Integration.md
**Purpose:** Instructions for adding legal forms to goodflippindesign.com
**Status:** Ready to implement once Google Forms created
**Last Updated:** January 29, 2026
