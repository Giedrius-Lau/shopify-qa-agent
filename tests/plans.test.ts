import assert from "node:assert/strict";
import test from "node:test";
import { isPlanTier, monthStart, PLAN_LIMITS, remainingUsage } from "../src/plans";

test("plan tiers and limits remain explicit", () => {
  assert.equal(isPlanTier("free"), true);
  assert.equal(isPlanTier("enterprise"), false);
  assert.ok(PLAN_LIMITS.paid.scansPerMonth > PLAN_LIMITS.free.scansPerMonth);
});

test("usage never reports a negative remainder", () => {
  assert.equal(remainingUsage(25, 10), 15);
  assert.equal(remainingUsage(25, 30), 0);
});

test("month boundaries use UTC", () => {
  assert.equal(monthStart(new Date("2026-08-18T22:30:00Z")).toISOString(), "2026-08-01T00:00:00.000Z");
});
