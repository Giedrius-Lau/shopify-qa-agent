import assert from "node:assert/strict";
import test from "node:test";
import { retentionDays } from "../src/retention-policy";

test("scan retention defaults to 90 days and rejects unsafe values", () => {
  assert.equal(retentionDays(undefined), 90);
  assert.equal(retentionDays("1"), 90);
  assert.equal(retentionDays("180"), 180);
  assert.equal(retentionDays("not-a-number"), 90);
});
