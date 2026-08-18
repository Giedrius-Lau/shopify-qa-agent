import assert from "node:assert/strict";
import test from "node:test";
import { nextScheduledRun } from "../src/schedule";

test("calculates the next daily UTC run", () => {
  const now = new Date("2026-08-18T10:30:00.000Z");
  assert.equal(nextScheduledRun("daily", 12, now).toISOString(), "2026-08-18T12:00:00.000Z");
  assert.equal(nextScheduledRun("daily", 8, now).toISOString(), "2026-08-19T08:00:00.000Z");
});

test("keeps weekly runs on the same UTC weekday", () => {
  const now = new Date("2026-08-18T10:30:00.000Z");
  assert.equal(nextScheduledRun("weekly", 8, now).toISOString(), "2026-08-25T08:00:00.000Z");
});

test("rejects invalid schedule hours", () => {
  assert.throws(() => nextScheduledRun("daily", 24), /valid UTC hour/);
});
