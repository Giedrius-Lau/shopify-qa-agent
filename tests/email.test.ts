import assert from "node:assert/strict";
import test from "node:test";
import { isValidNotificationEmail } from "../src/email";

test("validates notification email addresses", () => {
  assert.equal(isValidNotificationEmail("qa@example.com"), true);
  assert.equal(isValidNotificationEmail("not-an-email"), false);
  assert.equal(isValidNotificationEmail("a@b"), false);
  assert.equal(isValidNotificationEmail(null), false);
});
