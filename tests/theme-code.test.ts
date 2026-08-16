import test from "node:test";
import assert from "node:assert/strict";
import { auditLiquidAccessibility, compareThemeFileLists } from "../app/theme-code.server";
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

test("finds high-confidence accessibility problems in Liquid", () => {
  const content = `<html>\n<img src="x.jpg">\n<a href="/cart"><span aria-hidden="true"></span></a>\n<div tabindex="2">Focusable</div>\n<video><source src="movie.mp4"></video>`;
  const issues = auditLiquidAccessibility("sections/example.liquid", content);
  assert.deepEqual(issues.map((issue) => issue.rule), ["image-alt", "positive-tabindex", "video-captions", "document-language", "control-name"]);
  assert.equal(issues.find((issue) => issue.rule === "image-alt")?.line, 2);
});

test("accepts named controls, image alt text, language, and captions", () => {
  const content = `<html lang="en"><img src="x.jpg" alt=""><button aria-label="Close"><svg></svg></button><video><track kind="captions"></video></html>`;
  assert.deepEqual(auditLiquidAccessibility("layout/theme.liquid", content), []);
});
