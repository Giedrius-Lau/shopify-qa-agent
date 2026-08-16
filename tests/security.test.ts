import assert from "node:assert/strict";
import test from "node:test";
import { assertSafePublicUrl, isPrivateAddress } from "../src/security";

test("recognizes private and public IP addresses", () => {
  assert.equal(isPrivateAddress("127.0.0.1"), true);
  assert.equal(isPrivateAddress("10.1.2.3"), true);
  assert.equal(isPrivateAddress("169.254.169.254"), true);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("::1"), true);
});

test("rejects unsafe URL forms before DNS lookup", async () => {
  await assert.rejects(() => assertSafePublicUrl("file:///etc/passwd"), /Only HTTP/);
  await assert.rejects(() => assertSafePublicUrl("http://localhost"), /Local addresses/);
  await assert.rejects(() => assertSafePublicUrl("https://user:pass@example.com"), /credentials/);
  await assert.rejects(() => assertSafePublicUrl("https://example.com:8080"), /ports/);
});
