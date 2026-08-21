# Architecture

## System shape

The application is a modular monolith in one repository:

- React Router embedded Shopify app with App Bridge.
- Shopify OAuth and Prisma-backed session storage.
- Playwright QA engine invoked server-side by authenticated app actions.
- Prisma persistence backed by PostgreSQL in development and production through `DATABASE_URL`.
- Shop-scoped local artifact storage in development and private Cloudflare R2 storage in production.

The CLI and embedded app use the same deterministic QA engine.

## QA engine

Each page is scanned in an isolated browser context for desktop and/or mobile. The browser can be reused across page runs, while contexts and cookies remain isolated.

Collectors observe console messages, failed requests, HTTP errors, metadata, images, and screenshots. Rules convert observations into normalized issues. Each issue has a stable fingerprint derived from its rule, redacted URL, selector, and evidence identity.

## Normalized issue

Common fields remain queryable and stable:

- category/type;
- severity;
- rule identifier;
- message;
- optional selector;
- structured evidence;
- fingerprint.

Rule-specific evidence stays as structured JSON rather than requiring one database table per rule.

## Authentication and tenant isolation

Every app route authenticates through Shopify. The live storefront host is derived from the authenticated shop, scan records include the shop domain, and artifact responses verify both the scan identifier and shop ownership. Storefront passwords are ephemeral and preview secrets are redacted before persistence.

## Background jobs

PostgreSQL is the durable queue. The web process claims pending scans, recurring schedules, notification deliveries, and retention work. Health checks provide a fallback kick; production also calls the authenticated `/internal/scheduler` endpoint on a five-minute interval. Add a dedicated worker or Redis only after concurrency measurements justify it.

## Data lifecycle

Scan metadata and team settings are tenant-scoped by Shopify shop domain. Screenshots are private R2 objects and are only streamed after Shopify authentication and ownership checks. Completed scans expire after the configured retention window (90 days by default). The app-uninstalled webhook removes the shop's database records and artifact prefix idempotently.

## AI boundary

AI receives normalized findings and may group duplicates, explain impact, suggest remediation, and produce summaries. It must not decide whether a deterministic condition exists. Raw issues remain authoritative if AI fails.

## URL security

- Only HTTP and HTTPS on ports 80 and 443.
- Reject credentials, localhost, private, link-local, multicast, and metadata addresses.
- Revalidate navigation redirects.
- Bound page count, link count, redirects, requests, bytes, and scan duration.
- Redact preview tokens and secrets from output.
- Accept an optional storefront password in request memory only; never log, persist, or include it in results.
- Keep link checks same-origin and non-recursive in the MVP.
