# Shopify QA Agent

An embedded Shopify app that compares a store's published theme with a theme preview and produces deterministic QA findings.

## Install on a development store

Requires Node.js 20.19 or newer and a Shopify Partner or developer account.

Create a PostgreSQL database and copy `.env.example` to `.env` with its `DATABASE_URL` before starting locally.

```bash
npm install
npx playwright install chromium
npm run setup
npm run dev
```

The Shopify CLI will ask you to sign in, select or create an app, and choose a development store. Press `p` in the CLI after it starts to open the install page. Once installed, the app runs inside Shopify Admin.

Inside the app:

1. Enter a page path such as `/`, `/collections/all`, or `/products/example`.
2. Paste Shopify's complete preview-theme URL.
3. Select desktop, mobile, or both.
4. Enter the storefront password only when the development store is protected.
5. Click **Run comparison**.

The published URL is derived from the authenticated shop, so an installed merchant cannot scan a different store. The scanner detects Shopify's password page and unlocks it automatically. The password is kept only in request memory and is never logged, persisted, or returned. Preview tokens are redacted before results are stored.

The comparison separates findings into **New in preview**, **Resolved in preview**, and **Unchanged**, reports metadata changes, provides a screenshot reveal slider, and describes changes by Shopify section. Recent scan results are stored per shop in Prisma; screenshots are served only after Shopify authentication and shop ownership checks.

## Current capabilities

- Chromium scans at desktop (`1440x900`) and mobile (`390x844`) viewports
- Full-page screenshots
- Browser console errors
- Failed requests and HTTP 4xx/5xx responses
- `axe-core` accessibility violations
- Basic title, meta description, canonical, language, H1 and image metadata
- Missing alt attributes and broken images
- Bounded same-origin broken-link checks
- Shopify page-type detection
- Stable issue fingerprints and sensitive URL token redaction
- Normalized JSON output with severity summary
- Basic SSRF protection for arbitrary URLs and redirects

## Standalone scanner

The QA engine can still be used from the command line without installing the Shopify app.

Run both viewports:

```bash
npm run scan -- https://example.com/products/example
```

Run one viewport:

```bash
npm run scan -- https://example.com --viewport mobile
```

Scan multiple selected pages in one browser session:

```bash
npm run scan -- \
  https://example.myshopify.com/ \
  https://example.myshopify.com/collections/all \
  https://example.myshopify.com/products/example-product
```

Progress is written to stderr and normalized JSON to stdout, so output can be saved directly:

```bash
npm run scan -- https://example.com > report.json
```

Screenshots are stored under `scan-artifacts/` and are intentionally ignored by Git.

## Verification

```bash
npm test
npm run typecheck
npm run build
```

The current app includes Shopify OAuth/session storage, an embedded dashboard, a durable background scan queue, scan persistence, protected artifacts, and deterministic live-versus-preview comparison.

Evidence-grounded AI explanations are optional. Set `OPENAI_API_KEY` in the production environment and optionally override `OPENAI_MODEL` (the default is `gpt-5.6-luna`). A merchant must explicitly enable AI for each scan; the option is off by default and discloses exactly which report facts are sent. Screenshots, passwords, theme source, and storefront URLs are excluded. Without a key—or if the AI request fails—the deterministic report and release recommendation still complete normally.

Product decisions and architecture are documented in `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, and `docs/MVP.md`.
