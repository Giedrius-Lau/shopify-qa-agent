import assert from "node:assert/strict";
import test from "node:test";
import { buildAiReportFactPack, parseAiReportExplanation } from "../app/ai-report.server";

test("builds a bounded fact pack without artifact URLs", () => {
  const facts = buildAiReportFactPack({
    scanId: "scan-1",
    live: [],
    preview: [],
    codeChanges: [{ filename: "sections/hero.liquid", status: "changed", kind: "section", scope: "current-page", affectedSections: ["Hero"], summary: "This file controls Hero." }],
  });
  assert.equal(facts.changedFiles[0]?.filename, "sections/hero.liquid");
  assert.equal(JSON.stringify(facts).includes("screenshot"), false);
  assert.equal(facts.releaseDecision, "ready");
});

test("accepts structured output and removes actions with invented evidence", () => {
  const output = JSON.stringify({ summary: "Review this change.", releaseRationale: "One verified concern exists.", actions: [
    { title: "Check the hero", reason: "A verified issue affects it.", evidenceIds: ["finding-1"] },
    { title: "Invented", reason: "Not supported.", evidenceIds: ["finding-99"] },
  ] });
  const parsed = parseAiReportExplanation(output, new Set(["finding-1"]), "test-model");
  assert.equal(parsed?.actions.length, 1);
  assert.deepEqual(parsed?.actions[0]?.evidenceIds, ["finding-1"]);
  assert.equal(parsed?.generatedBy, "test-model");
});

test("rejects malformed structured output", () => {
  assert.equal(parseAiReportExplanation('{"summary":1}', new Set(), "test-model"), undefined);
});
