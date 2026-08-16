import test from "node:test";
import assert from "node:assert/strict";
import { compareThemeFileLists } from "../app/theme-code.server";
import type { SectionSnapshot } from "../src/domain";

const section: SectionSnapshot = { id: "shopify-section-template--1__featured_collection", name: "featured-collection", index: 0, imageCount: 1, headingCount: 1, buttonCount: 0, linkCount: 2, textLength: 20, structureFingerprint: "x" };

test("maps changed template and section files to the scanned page", () => {
  const before = [
    { filename: "templates/index.json", checksumMd5: "a", size: 1 },
    { filename: "sections/featured-collection.liquid", checksumMd5: "a", size: 1 },
    { filename: "assets/theme.css", checksumMd5: "a", size: 1 },
  ];
  const after = before.map((file) => ({ ...file, checksumMd5: "b" }));
  const changes = compareThemeFileLists(before, after, "home", [section]);
  assert.equal(changes.find((change) => change.filename === "templates/index.json")?.scope, "current-page");
  assert.deepEqual(changes.find((change) => change.filename === "sections/featured-collection.liquid")?.affectedSections, ["featured-collection"]);
  assert.equal(changes.find((change) => change.filename === "assets/theme.css")?.scope, "theme-wide");
});

test("detects added and removed theme files", () => {
  const changes = compareThemeFileLists([{ filename: "snippets/old.liquid", checksumMd5: "a", size: 1 }], [{ filename: "snippets/new.liquid", checksumMd5: "b", size: 1 }], "product", []);
  assert.equal(changes.find((change) => change.filename === "snippets/old.liquid")?.status, "removed");
  assert.equal(changes.find((change) => change.filename === "snippets/new.liquid")?.status, "added");
});
