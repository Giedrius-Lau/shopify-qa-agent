import assert from "node:assert/strict";
import test from "node:test";
import { parseRepeatableScanConfiguration, repeatableScanConfiguration } from "../src/scan-configuration";

const base = {
  pagePaths: ["/", "/products/bottle"],
  baselineThemeId: "gid://shopify/OnlineStoreTheme/100",
  comparisonThemeId: "gid://shopify/OnlineStoreTheme/200",
  viewports: ["desktop", "mobile"] as const,
  codeOnly: false,
};

test("repeatable scan configuration excludes secrets and consent", () => {
  const configuration = repeatableScanConfiguration({
    ...base,
    viewports: [...base.viewports],
    baselineThemeRole: "MAIN",
    storefrontPassword: "secret",
    explainWithAi: true,
  });
  assert.deepEqual(configuration, base);
  assert.equal("storefrontPassword" in configuration, false);
  assert.equal("explainWithAi" in configuration, false);
  assert.equal("baselineThemeRole" in configuration, false);
});

test("stored scan configuration is validated before reuse", () => {
  assert.deepEqual(parseRepeatableScanConfiguration(JSON.stringify(base)), base);
  assert.throws(() => parseRepeatableScanConfiguration(JSON.stringify({ ...base, pagePaths: ["//evil.example"] })), /valid/);
  assert.throws(() => parseRepeatableScanConfiguration(JSON.stringify({ ...base, viewports: ["tablet"] })), /viewport/);
  assert.throws(() => parseRepeatableScanConfiguration(JSON.stringify({ ...base, comparisonThemeId: "200" })), /comparison/);
});
