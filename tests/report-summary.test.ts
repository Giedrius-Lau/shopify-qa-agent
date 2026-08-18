import assert from "node:assert/strict";
import test from "node:test";
import type { PageScanResult, QaIssue } from "../src/domain";
import { buildReportSummary } from "../src/report-summary";

function issue(rule: string, severity: QaIssue["severity"]): QaIssue {
  return { type: "dom", severity, rule, message: rule, fingerprint: rule };
}

function page(url: string, issues: QaIssue[] = []): PageScanResult {
  return { requestedUrl: url, finalUrl: url, viewport: "desktop", viewportSize: { width: 1440, height: 900 }, pageType: "product", sections: [], startedAt: "2026-01-01T00:00:00.000Z", durationMs: 1, screenshotPath: "scan.png", metadata: { title: "Page", description: "Page", canonical: url, lang: "en", h1Count: 1, imageCount: 1 }, issues };
}

test("marks a report ready when no regressions are found", () => {
  const summary = buildReportSummary({ live: [page("https://shop.test/")], preview: [page("https://shop.test/")] });
  assert.equal(summary.decision, "ready");
  assert.equal(summary.pagesCompared, 1);
  assert.equal(summary.newConcerns, 0);
});

test("blocks publishing for a new critical regression", () => {
  const summary = buildReportSummary({ live: [page("https://shop.test/products/a")], preview: [page("https://shop.test/products/a", [issue("checkout", "critical")])] });
  assert.equal(summary.decision, "blocked");
  assert.equal(summary.priorities[0]?.page, "/products/a");
});

test("includes code accessibility findings in review priority", () => {
  const summary = buildReportSummary({ live: [], preview: [], codeAccessibilityIssues: [{ severity: "high", message: "Image needs alt text", filename: "sections/hero.liquid" }] });
  assert.equal(summary.decision, "review");
  assert.equal(summary.newConcerns, 1);
  assert.equal(summary.priorities[0]?.page, "sections/hero.liquid");
});
