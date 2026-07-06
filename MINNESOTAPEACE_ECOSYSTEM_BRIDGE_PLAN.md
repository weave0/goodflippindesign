# MinnesotaPeace Ecosystem Bridge Plan

## Current Constraint

The VS Code workspace is `z:\GFD`. The attached repository metadata mentions `weave0/minnesotapeace`, but no local MinnesotaPeace checkout or MinnesotaPeace files are present in this workspace. This plan is therefore the safe bridge asset to apply when that repo is available.

## Strategic Role

Treat MinnesotaPeace as a civic trust and mediation surface, not as a generic marketing page. Its role in SKY MONEY is to show credible local/public-interest value and create a calm path into support, sponsorship, and partnership conversations.

## Public Relationship Copy

Use this language in a footer or short about block:

> MinnesotaPeace is a civic peace and mediation-oriented public resource connected to the Good Flippin ecosystem. Good Flippin Design provides the studio infrastructure and publishing support; the public purpose is to make conflict-resolution, civic trust, and local problem-solving resources easier to find and understand.

Shorter credit:

> Built and maintained with support from Good Flippin Design.

## Recommended Page Placements

1. Header or footer support link:
   - Label: `Support civic peace tools`
   - URL: `https://goodflippindesign.com/donate.html?utm_source=minnesotapeace&utm_medium=site_nav&utm_campaign=sky_money_support`

2. Partner CTA:
   - Label: `Partner on civic trust resources`
   - URL: `https://goodflippindesign.com/investors.html?utm_source=minnesotapeace&utm_medium=partner_cta&utm_campaign=sky_money_sponsor#investor-intake`

3. Studio credit:
   - Label: `Good Flippin Design`
   - URL: `https://goodflippindesign.com?utm_source=minnesotapeace&utm_medium=footer&utm_campaign=ecosystem_bridge`

4. Overview link:
   - Label: `Good Flippin ecosystem overview`
   - URL: `https://goodflippindesign.com/ecosystem-overview.html?utm_source=minnesotapeace&utm_medium=about&utm_campaign=ecosystem_bridge`

## Analytics Events

Use the same SKY MONEY event names:

- `support_cta_click` for donation/support links.
- `sponsor_inquiry_click` for sponsor and partner links.
- `ecosystem_outbound_click` for links to GFD/GFV ecosystem pages.
- `partner_inquiry_submit` if MinnesotaPeace has a local partner form.

Recommended data attributes if the site uses vanilla click tracking:

```html
<a
  href="https://goodflippindesign.com/donate.html?utm_source=minnesotapeace&utm_medium=site_nav&utm_campaign=sky_money_support"
  data-sky-event="support_cta_click"
  data-sky-label="minnesotapeace_nav_support"
  >Support civic peace tools</a
>
```

## Trust-Safe Guardrails

- Do not place intrusive ads on mediation, crisis, legal, or conflict-sensitive pages.
- Do not imply nonprofit/tax-deductible status unless formally verified.
- Keep sponsor disclosure clear and calm.
- Avoid language that promises legal, therapeutic, or emergency outcomes.
- Position sponsors as supporting public resources, not influencing advice or outcomes.

## Suggested Section Copy

### Support Block

> MinnesotaPeace is part of a broader public-interest effort to make civic trust, conflict-resolution resources, and local problem-solving easier to navigate. Support helps maintain the site, improve plain-language resources, and connect this work with the wider Good Flippin ecosystem.

CTA: `Support civic peace tools`

### Partner Block

> Organizations interested in mediation, civic trust, local resilience, education, or public-interest technology can help fund practical resource pages, guides, and community-facing tools.

CTA: `Partner on civic trust resources`

## First Implementation Checklist

- Add one footer credit to Good Flippin Design.
- Add one support CTA with UTM parameters.
- Add one partner CTA to the GFD investor/sponsor intake.
- Add click tracking with SKY MONEY event names.
- Add a no-tax-deductible-status check to copy review.
- Manually test mobile layout and external link behavior.
