import assert from "node:assert/strict";
import test from "node:test";
import { detectShopifyPageType } from "../src/scanner";

test("detects common Shopify page types", () => {
  assert.equal(detectShopifyPageType("https://store.test/"), "home");
  assert.equal(detectShopifyPageType("https://store.test/products/shirt"), "product");
  assert.equal(detectShopifyPageType("https://store.test/collections/sale"), "collection");
  assert.equal(detectShopifyPageType("https://store.test/cart"), "cart");
  assert.equal(detectShopifyPageType("https://store.test/custom", "template-product"), "product");
});
