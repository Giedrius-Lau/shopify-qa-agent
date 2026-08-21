# MVP status

The hosted Shopify QA Agent MVP is feature complete for private beta.

## Delivered

- Embedded Shopify OAuth app with PostgreSQL session storage.
- Published-versus-unpublished theme selection from Shopify Admin.
- Theme source and template diff with section/file attribution.
- Desktop and mobile Playwright scans with screenshots and deterministic QA findings.
- Page discovery, multi-page selection, saved configurations, reruns, and scan history.
- Durable background queue and accurate progress reporting.
- Recurring schedules and optional email notifications.
- Shopify-staff team roles for scans, schedules, and billing administration.
- Shopify-managed plan detection and monthly scan/schedule usage limits.
- Private Cloudflare R2 artifacts, retention cleanup, and uninstall data deletion.
- Pre-push verification covering types, lint, tests, production build, and smoke startup.

## Private-beta exit criteria

- Compliance webhooks and public privacy/support pages are deployed.
- A production scheduler invokes `/internal/scheduler` every five minutes.
- Monitoring alerts on failed health checks and repeated scan failures.
- A small set of real stores validates scan accuracy and runtime limits.

## After beta

Add Shopify billing plan configuration, onboarding, richer notifications, observability, and dedicated worker capacity based on measured usage.
