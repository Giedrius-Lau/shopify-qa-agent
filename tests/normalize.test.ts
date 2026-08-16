import assert from "node:assert/strict";
import test from "node:test";
import { fingerprintIssue, normalizeIssues, redactSensitiveText, redactUrl } from "../src/normalize";

test("redacts Shopify preview and generic token query parameters", () => {
  const result = redactUrl("https://store.myshopify.com/?_bt=secret&key=secret2&preview_theme_id=123&token=abc");
  assert.equal(result.includes("secret"), false);
  assert.match(result, /preview_theme_id=123/);
  assert.match(result, /_bt=REDACTED/);
});

test("redacts secrets embedded in arbitrary evidence text", () => {
  const text = 'Request failed: https://store.test/path?_bt=secret&preview_theme_id=123 and ?token=another-secret';
  const result = redactSensitiveText(text);
  assert.equal(result.includes("secret"), false);
  assert.match(result, /preview_theme_id=123/);
});

test("fingerprints are stable and normalized issues are deduplicated", () => {
  const issue = { type: "seo" as const, severity: "medium" as const, rule: "missing-description", message: "Missing" };
  assert.equal(fingerprintIssue(issue, "https://example.com"), fingerprintIssue(issue, "https://example.com"));
  assert.equal(normalizeIssues([issue, issue], "https://example.com").length, 1);
});
