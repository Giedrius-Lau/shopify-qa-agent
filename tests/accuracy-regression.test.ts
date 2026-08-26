import assert from "node:assert/strict";
import test from "node:test";
import { compareIssues, compareSections } from "../src/compare";
import { buildReportSummary } from "../src/report-summary";
import { compareThemeFileLists } from "../app/theme-code.server";
import type { PageScanResult, QaIssue, SectionSnapshot } from "../src/domain";

const section = (overrides: Partial<SectionSnapshot> = {}): SectionSnapshot => ({
  id: "shopify-section-template--100__featured_products",
  name: "Featured products",
  index: 0,
  imageCount: 4,
  headingCount: 2,
  buttonCount: 1,
  linkCount: 8,
  textLength: 120,
  structureFingerprint: "same-structure",
  ...overrides,
});

const issue = (overrides: Partial<QaIssue> = {}): QaIssue => ({
  type: "accessibility",
  severity: "high",
  rule: "color-contrast",
  message: "Elements must meet minimum color contrast ratio thresholds",
  selector: "#shopify-section-template--100__featured_products .price",
  section: { id: "shopify-section-template--100__featured_products", name: "Featured products" },
  fingerprint: "baseline-fingerprint",
  ...overrides,
});

const page = (overrides: Partial<PageScanResult> = {}): PageScanResult => ({
  requestedUrl: "https://shop.test/",
  finalUrl: "https://shop.test/",
  viewport: "desktop",
  viewportSize: { width: 1440, height: 900 },
  pageType: "home",
  sections: [section()],
  startedAt: "2026-08-26T00:00:00.000Z",
  durationMs: 100,
  screenshotPath: "/tmp/accuracy.png",
  metadata: { title: "Test store", description: "Test", canonical: "https://shop.test/", lang: "en", h1Count: 1, imageCount: 4 },
  issues: [issue()],
  ...overrides,
});

test("identical theme evidence produces no issue, section, or release delta", () => {
  const baseline = page();
  const comparison = page({
    issues: [issue({ fingerprint: "comparison-fingerprint" })],
    sections: [section({ id: "shopify-section-template--999__featured_products" })],
    screenshotPath: "/tmp/comparison.png",
  });

  assert.deepEqual(compareIssues(baseline.issues, comparison.issues), {
    added: [],
    resolved: [],
    unchanged: comparison.issues,
  });
  assert.deepEqual(compareSections(baseline.sections, comparison.sections), { added: [], removed: [], changed: [] });

  const summary = buildReportSummary({ live: [baseline], preview: [comparison], codeChanges: [] });
  assert.equal(summary.decision, "ready");
  assert.equal(summary.newConcerns, 0);
  assert.equal(summary.resolvedConcerns, 0);
  assert.equal(summary.changedSections, 0);
  assert.equal(summary.changedFiles, 0);
});

test("one section edit reports only that section and its template file", () => {
  const baselineSection = section();
  const changedSection = section({
    id: "shopify-section-template--999__featured_products",
    imageCount: 5,
    structureFingerprint: "changed-structure",
  });
  const sectionDiff = compareSections([baselineSection], [changedSection]);
  assert.equal(sectionDiff.changed.length, 1);
  assert.equal(sectionDiff.changed[0]?.name, "Featured products");
  assert.deepEqual(sectionDiff.changed[0]?.metrics, [{ field: "imageCount", live: 4, preview: 5, delta: 1 }]);

  const codeChanges = compareThemeFileLists(
    [
      { filename: "templates/index.json", checksumMd5: "before", size: 100 },
      { filename: "sections/featured-products.liquid", checksumMd5: "same", size: 200 },
      { filename: "assets/theme.css", checksumMd5: "same-css", size: 300 },
    ],
    [
      { filename: "templates/index.json", checksumMd5: "after", size: 101 },
      { filename: "sections/featured-products.liquid", checksumMd5: "same", size: 200 },
      { filename: "assets/theme.css", checksumMd5: "same-css", size: 300 },
    ],
    "home",
    [changedSection],
  );
  assert.deepEqual(codeChanges.map((change) => change.filename), ["templates/index.json"]);
  assert.equal(codeChanges[0]?.scope, "current-page");
});

test("missing checksums are not treated as proof that equal-size files are identical", () => {
  const changes = compareThemeFileLists(
    [{ filename: "sections/hero.liquid", checksumMd5: null, size: 200 }],
    [{ filename: "sections/hero.liquid", checksumMd5: null, size: 200 }],
    "home",
    [],
  );
  assert.equal(changes.length, 1);
  assert.equal(changes[0]?.status, "changed");
});
