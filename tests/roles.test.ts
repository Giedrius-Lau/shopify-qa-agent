import assert from "node:assert/strict";
import test from "node:test";
import { canManageTeam, canRunScans, isShopRole } from "../src/roles";

test("applies store team permissions", () => {
  assert.equal(canManageTeam("owner"), true);
  assert.equal(canManageTeam("editor"), false);
  assert.equal(canRunScans("owner"), true);
  assert.equal(canRunScans("editor"), true);
  assert.equal(canRunScans("viewer"), false);
  assert.equal(isShopRole("viewer"), true);
  assert.equal(isShopRole("admin"), false);
});
