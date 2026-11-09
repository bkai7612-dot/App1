import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Keyed hash with server-side pepper (tokens, recovery codes, IP addresses). */
export function hmac(input: string, purpose: string): string {
  return createHmac("sha256", env.hmacSecret).update(`${purpose}:${input}`).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function key(): Buffer {
  const k = Buffer.from(env.encryptionKey, "base64");
  if (k.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be 32 bytes, base64 encoded");
  return k;
}

/** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(payload: string): string {
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1") throw new Error("Unsupported ciphertext version");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

/** Public, human-friendly identifiers (not a security boundary). */
export function publicId(prefix: string, len = 8): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return `${prefix}-${out}`;
}
