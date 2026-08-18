import type { QaIssue, ShopifyPageType } from "./domain";

export type ShopifyCheckIssue = Omit<QaIssue, "fingerprint">;

export interface ShopifyRuntimeSnapshot {
  pageType: ShopifyPageType;
  productFormCount: number;
  variantInputCount: number;
  quantityInputCount: number;
  addToCartControlCount: number;
  visiblePriceCount: number;
  productImageCount: number;
  disabledAddToCartCount: number;
  inventoryMessageCount: number;
  cartItemCount: number;
  cartFormCount: number;
  checkoutControlCount: number;
}

export function checkShopifyStorefront(snapshot: ShopifyRuntimeSnapshot): ShopifyCheckIssue[] {
  const issues: ShopifyCheckIssue[] = [];

  if (snapshot.pageType === "product") {
    if (snapshot.productFormCount === 0) {
      issues.push({
        type: "dom",
        severity: "critical",
        rule: "shopify-product-form-missing",
        message: "Product page has no add-to-cart form",
        evidence: { expected: "form posting to /cart/add" },
      });
      return issues;
    }

    if (snapshot.variantInputCount === 0) issues.push({
      type: "dom",
      severity: "high",
      rule: "shopify-variant-id-missing",
      message: "Product form does not submit a variant ID",
      evidence: { expected: "an input or select named id" },
    });
    if (snapshot.quantityInputCount === 0) issues.push({
      type: "dom",
      severity: "medium",
      rule: "shopify-quantity-input-missing",
      message: "Product form has no quantity input",
      evidence: { expected: "an input named quantity" },
    });
    if (snapshot.addToCartControlCount === 0) issues.push({
      type: "dom",
      severity: "high",
      rule: "shopify-add-to-cart-missing",
      message: "Product form has no add-to-cart control",
    });
    if (snapshot.visiblePriceCount === 0) issues.push({
      type: "dom",
      severity: "high",
      rule: "shopify-product-price-missing",
      message: "Product page has no visible price",
    });
    if (snapshot.productImageCount === 0) issues.push({
      type: "image",
      severity: "medium",
      rule: "shopify-product-image-missing",
      message: "Product page has no visible product image",
    });
    if (snapshot.disabledAddToCartCount > 0 && snapshot.inventoryMessageCount === 0) issues.push({
      type: "dom",
      severity: "medium",
      rule: "shopify-unavailable-state-unclear",
      message: "Add to cart is disabled without a visible availability message",
    });
  }

  if (snapshot.pageType === "cart" && snapshot.cartItemCount > 0) {
    if (snapshot.cartFormCount === 0) issues.push({
      type: "dom",
      severity: "high",
      rule: "shopify-cart-form-missing",
      message: "Cart has items but no cart form",
    });
    if (snapshot.checkoutControlCount === 0) issues.push({
      type: "dom",
      severity: "critical",
      rule: "shopify-checkout-control-missing",
      message: "Cart has items but no checkout button or link",
    });
  }

  return issues;
}
