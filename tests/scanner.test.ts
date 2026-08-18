import assert from "node:assert/strict";
import test from "node:test";
import { detectShopifyPageType } from "../src/scanner";
import { checkShopifyStorefront, type ShopifyRuntimeSnapshot } from "../src/shopify-checks";

test("detects common Shopify page types", () => {
  assert.equal(detectShopifyPageType("https://store.test/"), "home");
  assert.equal(detectShopifyPageType("https://store.test/products/shirt"), "product");
  assert.equal(detectShopifyPageType("https://store.test/collections/sale"), "collection");
  assert.equal(detectShopifyPageType("https://store.test/cart"), "cart");
  assert.equal(detectShopifyPageType("https://store.test/custom", "template-product"), "product");
});

const completeProduct: ShopifyRuntimeSnapshot = {
  pageType: "product",
  productFormCount: 1,
  variantInputCount: 1,
  quantityInputCount: 1,
  addToCartControlCount: 1,
  visiblePriceCount: 1,
  productImageCount: 2,
  disabledAddToCartCount: 0,
  inventoryMessageCount: 0,
  cartItemCount: 0,
  cartFormCount: 0,
  checkoutControlCount: 0,
};

test("accepts a complete Shopify product page", () => {
  assert.deepEqual(checkShopifyStorefront(completeProduct), []);
});

test("reports missing product purchase essentials", () => {
  const issues = checkShopifyStorefront({ ...completeProduct, variantInputCount: 0, quantityInputCount: 0, visiblePriceCount: 0 });
  assert.deepEqual(issues.map((issue) => issue.rule), [
    "shopify-variant-id-missing",
    "shopify-quantity-input-missing",
    "shopify-product-price-missing",
  ]);
});

test("reports an unclear sold-out state", () => {
  const issues = checkShopifyStorefront({ ...completeProduct, disabledAddToCartCount: 1 });
  assert.equal(issues[0]?.rule, "shopify-unavailable-state-unclear");
});

test("requires checkout only when the cart contains items", () => {
  const emptyCart = { ...completeProduct, pageType: "cart" as const, productFormCount: 0 };
  assert.deepEqual(checkShopifyStorefront(emptyCart), []);
  const issues = checkShopifyStorefront({ ...emptyCart, cartItemCount: 1, cartFormCount: 1 });
  assert.equal(issues[0]?.rule, "shopify-checkout-control-missing");
  assert.equal(issues[0]?.severity, "critical");
});
