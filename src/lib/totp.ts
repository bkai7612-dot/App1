import { createHmac, randomBytes } from "node:crypto";

/** RFC 4648 base32 + RFC 6238 TOTP (SHA-1, 30s, 6 digits) — compatible with standard authenticator apps. */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error("Invalid base32");
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: string, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const offset = h[h.length - 1] & 0xf;
  const code = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return (code % 1_000_000).toString().padStart(6, "0");
}

export function currentStep(now = Date.now()): number {
  return Math.floor(now / 1000 / 30);
}

/**
 * Verifies a code within ±1 step. Returns the matched step (for replay protection) or null.
 * Steps <= lastUsedStep are rejected to prevent code replay.
 */
export function verifyTotp(secret: string, code: string, lastUsedStep: number | null, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const step = currentStep(now);
  for (const s of [step - 1, step, step + 1]) {
    if (lastUsedStep !== null && s <= lastUsedStep) continue;
    if (hotp(secret, s) === code) return s;
  }
  return null;
}

export function otpauthUri(secret: string, account: string, issuer = "ServerSentry"): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
