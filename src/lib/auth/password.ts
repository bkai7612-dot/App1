import "server-only";
import { hash, verify } from "@node-rs/argon2";

// Argon2id (algorithm 2) with OWASP-recommended parameters (m=19 MiB, t=2, p=1).
const OPTS = { algorithm: 2 as const, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export async function hashPassword(pw: string): Promise<string> {
  return hash(pw, OPTS);
}

export async function verifyPassword(hashStr: string, pw: string): Promise<boolean> {
  try { return await verify(hashStr, pw); } catch { return false; }
}

// A pre-computed hash used to equalise timing when the account does not exist (anti-enumeration).
let dummy: Promise<string> | null = null;
export async function dummyVerify(pw: string): Promise<void> {
  dummy ??= hashPassword("serversentry-dummy-password-for-timing");
  await verifyPassword(await dummy, pw);
}

const COMMON = new Set(["password","password1","password123","123456789012","qwertyuiop12","letmein12345","serversentry","iloveyou1234","welcome12345","adminadmin12"]);

/** NIST SP 800-63B style: length over composition rules; block common/context passwords. */
export function passwordProblems(pw: string, context: string[] = []): string | null {
  if (pw.length < 12) return "Use at least 12 characters.";
  if (pw.length > 128) return "Use at most 128 characters.";
  const lower = pw.toLowerCase();
  if (COMMON.has(lower)) return "This password is too common.";
  if (/^(.)\1+$/.test(pw)) return "Avoid repeated characters.";
  for (const c of context) if (c && c.length >= 4 && lower.includes(c.toLowerCase())) return "Do not include your email or display name.";
  return null;
}
