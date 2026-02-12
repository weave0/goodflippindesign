# Good Flippin Vibes - Science Credibility Framework

**Purpose**: Implementation guide for transforming GFV from "science-washed marketing" to rigorous science communication
**Date**: 2026-02-10
**Priority**: CRITICAL for site credibility and user trust

---

## 🎯 Executive Summary

This framework addresses **Audit Items #1, #2, #3, #6** by establishing:

- Transparent citation systems with direct PubMed/NIH links
- Clear evidence hierarchies and effect size communication
- Author credentials and editorial oversight
- Structured disclaimer implementation
- Balanced messaging that acknowledges limitations

---

## 📐 Architecture: Citation & Evidence System

### 1. Citation Display Patterns

#### Pattern A: Inline Citation (For Body Text)

```html
<p>
  A small study found that watching comedy temporarily improved blood vessel
  function by 22% in healthy adults
  <sup class="citation-link">
    <a href="#ref-miller2006" aria-label="Citation: Miller et al., 2006">
      [1]
    </a> </sup
  >. While promising, this was an acute effect measured immediately after
  viewing.
</p>

<!-- Citation details section at bottom of page -->
<section class="citations" aria-label="Research Citations">
  <h2>References</h2>
  <ol class="citation-list">
    <li id="ref-miller2006" class="citation-item">
      <div class="citation-meta">
        <span class="citation-authors"
          >Miller M, Mangano C, Park Y, et al.</span
        >
        <span class="citation-year">(2006)</span>
        <span class="citation-title"
          >Impact of cinematic viewing on endothelial function.</span
        >
        <cite class="citation-journal">Heart, 92(2), 261-262.</cite>
      </div>
      <div class="citation-links">
        <a
          href="https://pubmed.ncbi.nlm.nih.gov/16415207/"
          rel="noopener noreferrer"
          class="citation-link-pubmed"
        >
          <svg aria-hidden="true"><!-- PubMed icon --></svg>
          PubMed
        </a>
        <a
          href="https://doi.org/10.1136/hrt.2005.064980"
          rel="noopener noreferrer"
          class="citation-link-doi"
        >
          DOI: 10.1136/hrt.2005.064980
        </a>
      </div>
      <div class="citation-details">
        <button class="btn-expand-citation" aria-expanded="false">
          Study Details
          <svg aria-hidden="true"><!-- Expand icon --></svg>
        </button>
        <div class="citation-expanded" hidden>
          <dl>
            <dt>Sample Size:</dt>
            <dd>n=20 healthy adults</dd>
            <dt>Study Design:</dt>
            <dd>Crossover study</dd>
            <dt>Key Limitation:</dt>
            <dd>Small sample, single measurement, acute effect only</dd>
            <dt>Clinical Relevance:</dt>
            <dd>Preliminary evidence requiring larger trials</dd>
          </dl>
        </div>
      </div>
    </li>
  </ol>
</section>
```

**CSS for Citations**:

```css
/* Citation superscripts */
.citation-link {
  font-size: 0.75em;
  line-height: 0;
  position: relative;
  top: -0.5em;
  margin-left: 0.125rem;
}

.citation-link a {
  color: var(--link-color);
  text-decoration: none;
  border-bottom: 1px dotted currentColor;
  transition:
    color 0.2s ease,
    border-color 0.2s ease;
}

.citation-link a:hover,
.citation-link a:focus {
  color: var(--link-hover-color);
  border-bottom-style: solid;
}

/* Citation list */
.citation-list {
  list-style: none;
  counter-reset: citation-counter;
  padding: 0;
  margin: 2rem 0;
}

.citation-item {
  counter-increment: citation-counter;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--bg-subtle);
  border-left: 3px solid var(--accent-color);
  border-radius: 4px;
}

.citation-item::before {
  content: "[" counter(citation-counter) "]";
  font-weight: 700;
  color: var(--text-muted);
  margin-right: 0.5rem;
}

/* External link icons */
.citation-link-pubmed,
.citation-link-doi {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-right: 1rem;
  font-size: 0.875rem;
  color: var(--link-color);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s ease;
}

.citation-link-pubmed:hover,
.citation-link-doi:hover {
  border-bottom-color: currentColor;
}

/* Expandable details */
.citation-expanded dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.5rem 1rem;
  margin-top: 1rem;
  font-size: 0.875rem;
}

.citation-expanded dt {
  font-weight: 600;
  color: var(--text-muted);
}

.citation-expanded dd {
  margin: 0;
}
```

#### Pattern B: Evidence Badge System

```html
<!-- Visual evidence level indicator -->
<div class="science-claim-card">
  <div class="evidence-badge" data-level="moderate">
    <span class="badge-icon" aria-hidden="true">🔬</span>
    <span class="badge-text">Moderate Evidence</span>
    <button class="badge-info" aria-label="What does this mean?">
      <svg><!-- Info icon --></svg>
    </button>
  </div>

  <h3>Gratitude & Sleep Quality</h3>
  <p class="claim-summary">
    Regular gratitude journaling is associated with modest improvements in sleep
    quality.
  </p>

  <div class="claim-details">
    <div class="effect-size">
      <span class="label">Effect Size:</span>
      <span class="value">Small-Medium (g = 0.31)</span>
      <span class="interpretation">(Noticeable but modest)</span>
    </div>

    <div class="evidence-basis">
      <span class="label">Evidence Base:</span>
      <span class="value">Meta-analysis of 38 studies</span>
    </div>

    <div class="sample-size">
      <span class="label">Total Participants:</span>
      <span class="value">n = 3,675</span>
    </div>
  </div>

  <a href="/science/gratitude-sleep" class="btn-read-more">
    Read Full Research Summary
    <svg aria-hidden="true"><!-- Arrow icon --></svg>
  </a>
</div>
```

**Evidence Badge Levels** (color-coded):

```css
.evidence-badge {
  padding: 0.5rem 1rem;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

/* Strong evidence = gold standard (meta-analyses, large RCTs) */
.evidence-badge[data-level="strong"] {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
  border: 2px solid rgba(34, 197, 94, 0.3);
}

/* Moderate evidence = promising (systematic reviews, RCTs) */
.evidence-badge[data-level="moderate"] {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
  border: 2px solid rgba(59, 130, 246, 0.3);
}

/* Limited evidence = preliminary (small studies, need replication) */
.evidence-badge[data-level="limited"] {
  background: rgba(251, 191, 36, 0.1);
  color: #fbbf24;
  border: 2px solid rgba(251, 191, 36, 0.3);
}

/* Preliminary evidence = early stage (case studies, hypotheses) */
.evidence-badge[data-level="preliminary"] {
  background: rgba(156, 163, 175, 0.1);
  color: #9ca3af;
  border: 2px solid rgba(156, 163, 175, 0.3);
}

/* Insufficient evidence = not recommended */
.evidence-badge[data-level="insufficient"] {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border: 2px solid rgba(239, 68, 68, 0.3);
}
```

**JavaScript for Badge Tooltips**:

```javascript
// Evidence badge info modals
const evidenceLevels = {
  strong: {
    title: "Strong Evidence",
    description:
      "Multiple high-quality studies (meta-analyses, large RCTs) show consistent effects. High confidence in findings.",
    examples: "Social connection & mortality, exercise & cardiovascular health",
  },
  moderate: {
    title: "Moderate Evidence",
    description:
      "Several studies show positive effects, but more research needed for clinical recommendations.",
    examples: "Gratitude journaling & wellbeing, laughter & stress",
  },
  limited: {
    title: "Limited Evidence",
    description:
      "Small studies show promise, but effects may not generalize. Replication needed.",
    examples: "Art therapy for specific conditions, humor & immune function",
  },
  preliminary: {
    title: "Preliminary Evidence",
    description:
      "Early-stage research or theoretical frameworks. Interesting but not yet validated.",
    examples: "Novel interventions, mechanistic hypotheses",
  },
  insufficient: {
    title: "Insufficient Evidence",
    description:
      "Current research does not support this claim. Practice not recommended.",
    examples: "Claims without peer-reviewed support",
  },
};

document.querySelectorAll(".badge-info").forEach((btn) => {
  btn.addEventListener("click", function () {
    const level = this.closest(".evidence-badge").dataset.level;
    const info = evidenceLevels[level];

    // Show modal with evidence level explanation
    showModal({
      title: info.title,
      content: `
        <p><strong>What this means:</strong></p>
        <p>${info.description}</p>
        <p><strong>Examples:</strong> ${info.examples}</p>
      `,
      icon: "🔬",
    });
  });
});
```

---

## 📝 Content Templates

### Template 1: Science Page Header

```html
<article class="science-article">
  <header class="article-header">
    <div class="content-type-label">
      <span class="label-icon">🔬</span>
      <span class="label-text">Science Communication</span>
    </div>

    <h1>Laughter & Cardiovascular Health</h1>

    <div class="article-meta">
      <div class="meta-item">
        <span class="meta-label">Evidence Level:</span>
        <div class="evidence-badge" data-level="moderate">
          <span class="badge-text">Moderate Evidence</span>
        </div>
      </div>

      <div class="meta-item">
        <span class="meta-label">Last Reviewed:</span>
        <time datetime="2026-02-10">February 10, 2026</time>
      </div>

      <div class="meta-item">
        <span class="meta-label">Reviewed By:</span>
        <a href="/about/scientific-advisory">Scientific Advisory Board</a>
      </div>
    </div>

    <!-- Prominent disclaimer -->
    <aside
      class="health-disclaimer"
      role="note"
      aria-label="Medical disclaimer"
    >
      <svg class="disclaimer-icon" aria-hidden="true">
        <!-- Warning icon -->
      </svg>
      <div class="disclaimer-content">
        <p>
          <strong>This is not medical advice.</strong> The information presented
          is for educational purposes only. Consult qualified healthcare
          providers for medical decisions. Do not use this content to diagnose
          or treat health conditions.
        </p>
      </div>
    </aside>
  </header>

  <!-- Article content follows -->
</article>
```

### Template 2: Claim Structure (The "Balanced Messaging" Pattern)

```html
<section class="science-claim">
  <!-- What the research shows -->
  <div class="claim-finding">
    <h3>What the Research Shows</h3>
    <p>
      A 2006 study of 20 healthy adults found that watching a humorous video led
      to a 22% improvement in flow-mediated dilation (a measure of blood vessel
      function) compared to baseline, while a stressful video decreased it by
      35%
      <sup><a href="#ref-miller2006">[1]</a></sup
      >.
    </p>
  </div>

  <!-- What this means (interpretation) -->
  <div class="claim-interpretation">
    <h3>What This Means</h3>
    <p>
      This suggests that acute laughter may temporarily improve how blood
      vessels relax and expand—an important marker of cardiovascular health. The
      magnitude of the effect was comparable to what's seen with some types of
      aerobic exercise.
    </p>
  </div>

  <!-- Important limitations (CRITICAL) -->
  <div class="claim-limitations">
    <h3>Important Limitations</h3>
    <ul>
      <li>
        <strong>Small sample:</strong> Only 20 participants—findings need
        replication in larger groups
      </li>
      <li>
        <strong>Short-term effect:</strong> Measured immediately after watching
        videos; we don't know if the benefit lasts
      </li>
      <li>
        <strong>Healthy participants only:</strong> May not apply to people with
        cardiovascular disease
      </li>
      <li>
        <strong>No clinical outcomes:</strong> Improved blood vessel function
        doesn't automatically mean reduced heart disease risk
      </li>
    </ul>
  </div>

  <!-- Bottom line (practical takeaway) -->
  <div class="claim-bottom-line">
    <h3>Bottom Line</h3>
    <p>
      <strong
        >Laughter may support cardiovascular health as part of a healthy
        lifestyle,</strong
      >
      but it's not a substitute for proven interventions like exercise, healthy
      diet, or medications when needed. Think of it as a pleasant addition
      to—not a replacement for—evidence-based heart health practices.
    </p>
  </div>

  <!-- Further research section -->
  <details class="claim-further-research">
    <summary>
      <h3>Want to Dive Deeper?</h3>
    </summary>
    <div class="research-list">
      <h4>Related Studies:</h4>
      <ul>
        <li>
          <a href="https://pubmed.ncbi.nlm.nih.gov/19394153/">
            Miller & Fry (2009) - Theoretical mechanisms review
          </a>
          <span class="research-note"
            >Note: Hypothesis paper, not clinical evidence</span
          >
        </li>
        <li>
          <a href="https://pubmed.ncbi.nlm.nih.gov/21280463/">
            Mora-Ripoll (2010) - Systematic review of laughter therapy
          </a>
        </li>
      </ul>

      <h4>Expert Perspectives:</h4>
      <ul>
        <li>
          <a href="https://www.heart.org/">American Heart Association</a> -
          Evidence-based heart health guidelines
        </li>
        <li>
          <a href="https://www.nhlbi.nih.gov/"
            >National Heart, Lung, and Blood Institute</a
          >
          - Research on cardiovascular disease prevention
        </li>
      </ul>
    </div>
  </details>
</section>
```

**CSS for Balanced Messaging**:

```css
.claim-finding {
  padding: 1.5rem;
  background: rgba(59, 130, 246, 0.05);
  border-left: 4px solid #3b82f6;
  margin-bottom: 1.5rem;
}

.claim-interpretation {
  padding: 1.5rem;
  background: rgba(139, 92, 246, 0.05);
  border-left: 4px solid #8b5cf6;
  margin-bottom: 1.5rem;
}

.claim-limitations {
  padding: 1.5rem;
  background: rgba(251, 191, 36, 0.05);
  border-left: 4px solid #fbbf24;
  margin-bottom: 1.5rem;
}

.claim-limitations ul {
  margin: 0.5rem 0 0 0;
  padding-left: 1.5rem;
}

.claim-limitations li {
  margin-bottom: 0.5rem;
}

.claim-limitations strong {
  color: #f59e0b;
}

.claim-bottom-line {
  padding: 1.5rem;
  background: rgba(34, 197, 94, 0.05);
  border-left: 4px solid #22c55e;
  margin-bottom: 1.5rem;
  font-size: 1.0625rem;
}

.health-disclaimer {
  background: rgba(239, 68, 68, 0.08);
  border: 2px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  padding: 1rem 1.5rem;
  margin: 1.5rem 0;
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}

.disclaimer-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  color: #ef4444;
}

.disclaimer-content p {
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.6;
}
```

---

## 👥 Author & Editorial Credibility

### Implementation: Author Bio System

```html
<!-- Author attribution on science pages -->
<div class="article-author" itemscope itemtype="https://schema.org/Person">
  <img
    src="/team/dr-smith.jpg"
    alt="Dr. Jane Smith"
    class="author-avatar"
    itemprop="image"
  />

  <div class="author-info">
    <div class="author-header">
      <h3 class="author-name" itemprop="name">Dr. Jane Smith, PhD</h3>
      <a
        href="/about/scientific-advisory#jane-smith"
        class="author-profile-link"
      >
        View Full Bio
      </a>
    </div>

    <p class="author-credentials" itemprop="jobTitle">
      Licensed Clinical Psychologist | PhD in Health Psychology, Stanford
      University
    </p>

    <p class="author-specialty">
      <strong>Expertise:</strong> Positive psychology interventions,
      psychoneuroimmunology, behavioral health research
    </p>

    <div class="author-verification">
      <span class="verification-badge">
        <svg aria-hidden="true"><!-- Checkmark --></svg>
        Verified Credentials
      </span>
      <a href="#verification-policy" class="verification-info">
        Our verification process
      </a>
    </div>
  </div>
</div>

<!-- Editorial review notice -->
<aside class="editorial-review">
  <h4>Editorial Review</h4>
  <p>
    This content was reviewed by our Scientific Advisory Board on
    <time datetime="2026-02-10">February 10, 2026</time> to ensure accuracy and
    adherence to our
    <a href="/about/editorial-standards">editorial standards</a>.
  </p>

  <details>
    <summary>See full review panel</summary>
    <ul>
      <li>Dr. Jane Smith, PhD (Primary Reviewer) - Health Psychology</li>
      <li>Dr. Michael Chen, MD (Medical Review) - Cardiology</li>
      <li>Dr. Sarah Johnson, PhD (Methods Review) - Biostatistics</li>
    </ul>
  </details>
</aside>
```

### Required: Editorial Standards Page

**URL**: `/about/editorial-standards`

**Content Structure**:

```markdown
# Editorial Standards & Review Process

## Our Commitment to Scientific Accuracy

Good Flippin Vibes is committed to providing accurate, evidence-based
information about wellbeing practices. We follow rigorous editorial
standards to ensure credibility.

## Editorial Team

### Scientific Advisory Board

**Dr. Jane Smith, PhD** - Lead Science Advisor
_Credentials_: PhD Health Psychology (Stanford), Licensed Clinical Psychologist (CA PSY12345)
_Role_: Reviews psychology and behavioral health content

**Dr. Michael Chen, MD** - Medical Advisor
_Credentials_: MD (Johns Hopkins), Board Certified Cardiologist
_Role_: Reviews cardiovascular and medical claims

**Dr. Sarah Johnson, PhD** - Research Methods Advisor
_Credentials_: PhD Biostatistics (Harvard)
_Role_: Reviews study methodology interpretations and statistical claims

### Credential Verification

All advisory board members have:

- ✅ Verified academic degrees (confirmed via National Student Clearinghouse)
- ✅ Active professional licenses (confirmed via state boards)
- ✅ Peer-reviewed publication records (confirmed via PubMed, Google Scholar)

[Link to verification policy details]

## Content Review Process

### 1. Initial Draft

Content creator drafts article based on peer-reviewed research

### 2. Evidence Check

- All claims must cite peer-reviewed sources
- Preference for systematic reviews, meta-analyses, RCTs
- Study details verified (sample size, design, limitations)

### 3. Expert Review

Relevant advisory board member reviews for:

- Scientific accuracy
- Appropriate interpretation of findings
- Clear communication of limitations
- Balanced messaging (benefits AND limits)

### 4. Final Edit

Content editor ensures:

- Clear disclaimers present
- Citations properly formatted
- Accessibility standards met (WCAG 2.1 AA)
- Reading level appropriate (Grade 10-12)

### 5. Scheduled Review

Content reviewed annually or when new evidence emerges

## Citation Standards

We follow these principles:

✅ **Direct links**: Every claim links to PubMed or DOI
✅ **Full citations**: APA 7th edition format
✅ **Study details**: Sample size, design, key limitations disclosed
✅ **No cherry-picking**: Report findings accurately, including null results
✅ **Effect sizes**: Report magnitude of effects, not just p-values

## Conflicts of Interest

We disclose all potential conflicts:

- No advisory board member may have financial interest in promoted products
- Sponsored content clearly labeled
- Research funding sources disclosed
- Affiliate relationships disclosed

[Current disclosures: None as of 2026-02-10]

## Corrections Policy

We correct errors promptly:

- **Minor errors** (typos, formatting): corrected silently, noted in revision history
- **Major errors** (scientific inaccuracy): correction notice at top of article,
  revised content clearly marked, original archived

Submit corrections: corrections@goodflippinvibes.com

## Contact

Questions about our editorial process?
Email: editorial@goodflippinvibes.com
```

---

## 🚨 Disclaimer Implementation

### Standard Disclaimer Template (Footer of Every Page)

```html
<footer class="site-footer">
  <!-- ... other footer content ... -->

  <section class="legal-disclaimers">
    <h2 class="sr-only">Important Disclaimers</h2>

    <div class="disclaimer medical-disclaimer">
      <h3>Medical Disclaimer</h3>
      <p>
        <strong
          >This website is not a substitute for professional medical advice,
          diagnosis, or treatment.</strong
        >
        The content on Good Flippin Vibes is for informational and educational
        purposes only. Always seek the advice of qualified health providers with
        questions about medical conditions. Never disregard professional medical
        advice or delay seeking it because of information on this site. If you
        think you may have a medical emergency, call your doctor or 911
        immediately.
      </p>
    </div>

    <div class="disclaimer research-disclaimer">
      <h3>Research Interpretation</h3>
      <p>
        We present scientific research findings to the best of our ability, but
        science is always evolving. Effect sizes, study quality, and
        interpretations may change as new evidence emerges. The practices
        discussed may not work for everyone, and individual results vary.
        Consult healthcare providers before making significant lifestyle
        changes.
      </p>
    </div>

    <div class="disclaimer affiliate-disclaimer">
      <h3>Transparency</h3>
      <p>
        Good Flippin Vibes may contain affiliate links or sponsored content,
        which will always be clearly labeled. We only recommend products or
        practices we believe may benefit readers, but we receive compensation
        for some recommendations. See our
        <a href="/about/disclosures">full disclosure policy</a>.
      </p>
    </div>
  </section>
</footer>
```

### Inline Disclaimers (Within Content)

```html
<!-- For specific health claims -->
<aside class="inline-disclaimer" role="note">
  <svg class="disclaimer-icon" aria-hidden="true"><!-- Info icon --></svg>
  <p>
    <strong>Important:</strong> Laughter is not a treatment for cardiovascular
    disease. If you have heart disease or risk factors, follow your healthcare
    provider's recommendations for evidence-based treatments (medication,
    exercise, diet changes).
  </p>
</aside>

<!-- For practices that could have risks -->
<aside class="inline-disclaimer caution" role="note">
  <svg class="disclaimer-icon" aria-hidden="true"><!-- Warning icon --></svg>
  <p>
    <strong>Caution:</strong> Some humor styles (aggressive, self-deprecating)
    may harm wellbeing. If you're experiencing depression or anxiety, consult a
    mental health professional rather than relying solely on self-help
    practices.
  </p>
</aside>
```

---

## 📊 Data Visualization Standards

### Effect Size Visualizations

```html
<!-- Visual representation of effect sizes -->
<div class="effect-size-chart">
  <h3>Understanding the Effect Size</h3>
  <p class="chart-description">
    This study found a <strong>small-to-medium effect (d = 0.31)</strong>
    of gratitude journaling on wellbeing. Here's what that means visually:
  </p>

  <div class="effect-scale">
    <div class="scale-bar">
      <div class="scale-segment" data-size="very-small">
        <span class="segment-label">Very Small<br />(0.0-0.2)</span>
      </div>
      <div class="scale-segment" data-size="small">
        <span class="segment-label">Small<br />(0.2-0.5)</span>
      </div>
      <div class="scale-segment highlighted" data-size="medium">
        <span class="segment-label">Medium<br />(0.5-0.8)</span>
        <div class="effect-marker" style="left: 38.75%">
          <div class="marker-dot"></div>
          <span class="marker-label">This study: 0.31</span>
        </div>
      </div>
      <div class="scale-segment" data-size="large">
        <span class="segment-label">Large<br />(0.8+)</span>
      </div>
    </div>

    <div class="scale-interpretation">
      <p>
        <strong>What this means:</strong> The effect is noticeable and
        meaningful, but modest. For comparison:
      </p>
      <ul>
        <li>
          Aspirin for heart attack prevention: d ≈ 0.02 (very small, but
          clinically important)
        </li>
        <li>Cognitive therapy for depression: d ≈ 0.70 (medium-large)</li>
        <li>Social connection on mortality: d ≈ 1.50 (very large)</li>
      </ul>
    </div>
  </div>
</div>
```

**CSS for Effect Size Chart**:

```css
.effect-scale {
  margin: 2rem 0;
}

.scale-bar {
  display: flex;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.scale-segment {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  border-right: 2px solid rgba(255, 255, 255, 0.2);
  transition: transform 0.2s ease;
}

.scale-segment:last-child {
  border-right: none;
}

.scale-segment[data-size="very-small"] {
  background: linear-gradient(135deg, #e5e7eb, #d1d5db);
}

.scale-segment[data-size="small"] {
  background: linear-gradient(135deg, #fef3c7, #fde68a);
}

.scale-segment[data-size="medium"] {
  background: linear-gradient(135deg, #dbeafe, #93c5fd);
}

.scale-segment[data-size="large"] {
  background: linear-gradient(135deg, #d1fae5, #6ee7b7);
}

.scale-segment.highlighted {
  transform: scale(1.05);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.5);
  z-index: 1;
}

.segment-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-align: center;
  line-height: 1.2;
  color: #374151;
}

.effect-marker {
  position: absolute;
  top: -30px;
  transform: translateX(-50%);
}

.marker-dot {
  width: 12px;
  height: 12px;
  background: #ef4444;
  border-radius: 50%;
  margin: 0 auto 4px;
  box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.2);
}

.marker-label {
  font-size: 0.875rem;
  font-weight: 700;
  color: #ef4444;
  white-space: nowrap;
}
```

---

## 🏗️ Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)

- [ ] Create `/about/editorial-standards` page
- [ ] Create `/about/scientific-advisory` page with bios
- [ ] Design & implement citation system (HTML/CSS/JS)
- [ ] Create evidence badge component library
- [ ] Implement standard disclaimer templates

### Phase 2: Content Audit (Weeks 3-4)

- [ ] Audit ALL existing science claims on site
- [ ] Map claims to research database
- [ ] Identify claims lacking evidence → remove or flag
- [ ] Rewrite overpromising claims with balanced messaging

### Phase 3: Systematic Updates (Weeks 5-8)

- [ ] Rewrite `/science` page with new framework
- [ ] Create dedicated pages per topic (laughter, gratitude, art, etc.)
- [ ] Add citations to every claim
- [ ] Implement evidence badges
- [ ] Add limitation sections

### Phase 4: Trust Signals (Weeks 9-10)

- [ ] Add author attributions to all science content
- [ ] Create "Last Reviewed" timestamps
- [ ] Implement editorial review notices
- [ ] Add Schema.org markup for credibility signals

### Phase 5: Testing & Launch (Weeks 11-12)

- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] User testing: do visitors understand evidence levels?
- [ ] Legal review of disclaimers
- [ ] Soft launch → gather feedback → iterate

---

## ✅ Success Metrics

### Credibility Indicators

- [ ] 100% of health claims have direct PubMed/DOI links
- [ ] 100% of science pages have evidence badges
- [ ] 100% of science pages have limitation sections
- [ ] 100% of science pages have author attribution
- [ ] 100% of pages have visible disclaimers

### User Trust Metrics (Post-Launch)

- [ ] Survey: "Do you trust the health information on this site?" (Target: 80%+ yes)
- [ ] Survey: "Are claims presented with appropriate context?" (Target: 85%+ yes)
- [ ] Bounce rate on science pages (Target: <60%)
- [ ] Time on page for science content (Target: >3 minutes)

### External Validation

- [ ] Submit site to HONcode (Health On the Net) certification
- [ ] Get backlinks from reputable health literacy organizations
- [ ] Positive mentions in health professional communities

---

## 🔗 Related Documents

- [GFV_SCIENCE_CITATIONS_RESEARCH.md](./GFV_SCIENCE_CITATIONS_RESEARCH.md) - Complete citation database
- [GFV_CONTENT_ARCHITECTURE.md](./GFV_CONTENT_ARCHITECTURE.md) - Site structure (to be created)
- [GFV_ACCESSIBILITY_AUDIT.md](./GFV_ACCESSIBILITY_AUDIT.md) - WCAG compliance (to be created)
- [GFV_TRUST_SIGNALS.md](./GFV_TRUST_SIGNALS.md) - Credibility elements (to be created)

---

**Document Status**: Draft v1.0
**Next Review**: After Phase 1 completion
**Owner**: Science & Editorial Team
