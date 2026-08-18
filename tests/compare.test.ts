import assert from "node:assert/strict";
import test from "node:test";
import { compareIssues, compareMetadata, compareSections, groupIssuesBySection, issueComparisonKey } from "../src/compare";
import type { QaIssue } from "../src/domain";

const issue = (rule: string, fingerprint: string, url?: string): QaIssue => ({ type: "network", severity: "medium", rule, message: rule, fingerprint, evidence: url ? { url, status: 404 } : undefined });

test("compares issues independently of fingerprint and preview query tokens", () => {
  const live = issue("http-error", "live", "https://store.test/assets/a.js");
  const preview = issue("http-error", "preview", "https://store.test/assets/a.js?preview_theme_id=2");
  assert.equal(issueComparisonKey(live), issueComparisonKey(preview));
  assert.deepEqual(compareIssues([live, issue("resolved", "r")], [preview, issue("added", "a")]), { added: [issue("added", "a")], resolved: [issue("resolved", "r")], unchanged: [preview] });
});

test("normalizes Shopify-generated selector ids between themes", () => {
  const live = { ...issue("color-contrast", "a"), selector: "#shopify-section-template--123__featured .card" };
  const preview = { ...issue("color-contrast", "b"), selector: "#shopify-section-template--987__featured .card" };
  assert.equal(issueComparisonKey(live), issueComparisonKey(preview));
});

test("matches Shopify sections and reports metric and structure changes", () => {
  const base = { name: "Featured collection", index: 1, headingCount: 1, buttonCount: 0, linkCount: 4, textLength: 100 };
  const live = { ...base, id: "shopify-section-template--1__featured_collection", imageCount: 4, structureFingerprint: "a" };
  const preview = { ...base, id: "shopify-section-template--2__featured_collection", imageCount: 5, structureFingerprint: "b" };
  const result = compareSections([live], [preview]);
  assert.equal(result.changed.length, 1);
  assert.deepEqual(result.changed[0]?.metrics, [{ field: "imageCount", live: 4, preview: 5, delta: 1 }]);
  assert.equal(result.changed[0]?.structureChanged, true);
});

test("matches section findings when duplicated themes render different dynamic selectors", () => {
  const live = { ...issue("color-contrast", "a"), selector: "#shopify-section-template--123__featured #ProductCard-839201", section: { id: "shopify-section-template--123__featured", name: "Featured products" } };
  const preview = { ...issue("color-contrast", "b"), selector: "#shopify-section-template--987__featured #ProductCard-992104", section: { id: "shopify-section-template--987__featured", name: "Featured products" } };
  assert.deepEqual(compareIssues([live], [preview]), { added: [], resolved: [], unchanged: [preview] });
});

test("compares repeated section findings as a multiset", () => {
  const section = { id: "shopify-section-featured", name: "Featured products" };
  const first = { ...issue("color-contrast", "a"), selector: ".card:nth-child(1)", section };
  const second = { ...issue("color-contrast", "b"), selector: ".card:nth-child(2)", section };
  const result = compareIssues([first, second], [{ ...first, fingerprint: "preview" }]);
  assert.equal(result.added.length, 0);
  assert.equal(result.unchanged.length, 1);
  assert.equal(result.resolved.length, 1);
});

test("does not present one-off browser and Shopify infrastructure noise as theme changes", () => {
  const live403 = { ...issue("http-error", "403"), message: "HTTP 403 response", evidence: { url: "https://store.test/telemetry", status: 403 } };
  const failedRequest = { ...issue("request-failed", "failed"), message: "GET request failed", evidence: { url: "https://store.test/telemetry" } };
  const frameHeader = { ...issue("console-error", "header"), type: "console" as const, message: "Invalid 'X-Frame-Options' header: 'ALLOW-FROM https://store.test/' is not a recognized directive." };
  const frameTitle = { ...issue("frame-title", "frame"), type: "accessibility" as const, message: "Frames must have an accessible name", evidence: { html: '<iframe src="https://shop.app/pay"></iframe>' } };
  assert.deepEqual(compareIssues([live403, failedRequest], [frameHeader, frameTitle]), { added: [], resolved: [], unchanged: [] });
});

test("groups findings under their Shopify section", () => {
  const sectionIssue = { ...issue("nested-interactive", "a"), section: { id: "shopify-section-slideshow", name: "Slideshow" } };
  const groups = groupIssuesBySection([sectionIssue, issue("http-error", "b")]);
  assert.deepEqual(groups.map((group) => [group.name, group.issues.length]), [["Slideshow", 1], ["Page-wide / network", 1]]);
});

test("reports only changed metadata fields", () => {
  const live = { title: "Store", description: null, canonical: null, lang: "en", h1Count: 1, imageCount: 2 };
  const preview = { ...live, imageCount: 3 };
  assert.deepEqual(compareMetadata(live, preview), [{ field: "imageCount", label: "Image count", live: 2, preview: 3 }]);
});
