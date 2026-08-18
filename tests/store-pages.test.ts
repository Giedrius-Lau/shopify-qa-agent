import assert from "node:assert/strict";
import test from "node:test";
import { normalizePagePaths } from "../src/page-paths";

test("normalizes, deduplicates, and preserves storefront page paths", () => {
  assert.deepEqual(normalizePagePaths(["/", " /products/bottle ", "/"]), ["/", "/products/bottle"]);
  assert.deepEqual(normalizePagePaths(undefined, "/cart"), ["/cart"]);
});

test("rejects empty, external, and excessive page selections", () => {
  assert.throws(() => normalizePagePaths([]), /at least one/);
  assert.throws(() => normalizePagePaths(["//evil.example/path"]), /valid/);
  assert.throws(() => normalizePagePaths(Array.from({ length: 11 }, (_, index) => `/pages/${index}`)), /no more than 10/);
});
