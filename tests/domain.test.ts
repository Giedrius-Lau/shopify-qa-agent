import assert from "node:assert/strict";
import test from "node:test";
import { summarizeIssues, type PageScanResult } from "../src/domain";

test("summarizeIssues counts severities across page runs", () => {
  const page = { issues: [
    { type: "seo", severity: "high", rule: "a", message: "a", fingerprint: "a" },
    { type: "dom", severity: "medium", rule: "b", message: "b", fingerprint: "b" },
    { type: "image", severity: "high", rule: "c", message: "c", fingerprint: "c" },
  ] } as PageScanResult;
  assert.deepEqual(summarizeIssues([page]), { critical: 0, high: 2, medium: 1, low: 0 });
});
