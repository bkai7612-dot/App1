import { test } from "node:test";
import assert from "node:assert/strict";
import { hotp, verifyTotp, base32Encode, base32Decode } from "../../src/lib/totp.ts";

// RFC 4226 Appendix D test vectors (secret "12345678901234567890").
const SECRET = base32Encode(Buffer.from("12345678901234567890"));
const VECTORS = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];

test("HOTP matches RFC 4226 vectors", () => {
  VECTORS.forEach((v, i) => assert.equal(hotp(SECRET, i), v));
});
test("base32 round trip", () => {
  const b = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  assert.deepEqual(base32Decode(base32Encode(b)), b);
});
test("TOTP accepts ±1 step and rejects replay", () => {
  const now = 1_700_000_000_000;
  const step = Math.floor(now / 30000);
  const code = hotp(SECRET, step);
  assert.equal(verifyTotp(SECRET, code, null, now), step);
  assert.equal(verifyTotp(SECRET, code, step, now), null, "replayed code must be rejected");
  assert.equal(verifyTotp(SECRET, hotp(SECRET, step - 1), null, now), step - 1);
  assert.equal(verifyTotp(SECRET, hotp(SECRET, step + 3), null, now), null);
  assert.equal(verifyTotp(SECRET, "12345", null, now), null);
  assert.equal(verifyTotp(SECRET, "abcdef", null, now), null);
});
