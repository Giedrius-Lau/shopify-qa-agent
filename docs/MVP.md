# MVP

## Current milestone: local live-versus-preview web scanner

The scanner accepts one or more public page URLs and runs desktop and mobile checks.

The local Next.js interface accepts a published storefront URL and a full Shopify theme preview URL, runs identical checks against both, and displays screenshots and issues side by side. The API currently runs synchronously and stores screenshots under `public/scan-artifacts/`.

The comparison layer matches equivalent findings across themes and presents only new and resolved QA issues as changes. It also compares page metadata and provides an interactive screenshot overlay for visual changes that are not defects.

Shopify sections are detected through theme section containers. Each section receives a structural fingerprint and metrics for images, headings, buttons, links, and text. Accessibility and image findings are attributed to the nearest section so reports can explain which section changed and which regressions it introduced.

Included:

- screenshots;
- console errors;
- failed requests and HTTP errors;
- axe-core accessibility checks;
- basic metadata, SEO, DOM, and image checks;
- bounded same-origin broken-link checks;
- Shopify page-type detection;
- redacted report URLs;
- stable issue fingerprints;
- normalized JSON output.

## Next milestone: persistent scan jobs

- PostgreSQL persistence and a separate worker process.
- Store-level page discovery and explicit page selection.
- Queued scan progress and durable report URLs.
- Issue differences: new, resolved, and unchanged between live and preview.

## Later milestones

1. Shopify-specific product, variant, cart drawer, gallery, price, and sold-out rules.
2. Evidence-grounded AI explanations and executive summaries.
3. Shopify OAuth, embedded Admin UI, billing, teams, and schedules.

## Acceptance criteria for this milestone

- Multiple URLs scan successfully in one CLI invocation.
- One browser process is reused for all page runs.
- Sensitive preview query parameters never appear in JSON output.
- Broken links are checked with strict limits and no recursive crawl.
- Every issue has a deterministic fingerprint.
- Build, automated tests, and an end-to-end public URL scan pass.
