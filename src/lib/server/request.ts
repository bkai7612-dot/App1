import "server-only";
import { headers } from "next/headers";
import { hmac } from "@/lib/crypto";

/**
 * Client IP from a TRUSTED proxy header only. Client-supplied headers are spoofable unless a proxy
 * you control overwrites them. Default: on Vercel use x-forwarded-for (set by Vercel's edge);
 * elsewhere trust nothing unless TRUSTED_IP_HEADER is configured.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const header = process.env.TRUSTED_IP_HEADER || (process.env.VERCEL ? "x-forwarded-for" : "");
  if (!header) return "untrusted-direct";
  const ip = (h.get(header)?.split(",")[0] ?? "unknown").trim();
  return ip.slice(0, 64);
}

/** IPs are stored only as keyed hashes (data minimisation). */
export async function ipHash(): Promise<string> {
  return hmac(await clientIp(), "ip").slice(0, 32);
}

export async function userAgent(): Promise<string> {
  const h = await headers();
  return (h.get("user-agent") ?? "unknown").slice(0, 300);
}

/** Coarse device descriptor for new-device detection without fingerprinting. */
export function deviceFamily(ua: string): string {
  const os = /windows/i.test(ua) ? "Windows" : /mac os|macintosh/i.test(ua) ? "macOS" : /android/i.test(ua) ? "Android" : /iphone|ipad|ios/i.test(ua) ? "iOS" : /linux/i.test(ua) ? "Linux" : "Other";
  const br = /edg\//i.test(ua) ? "Edge" : /firefox/i.test(ua) ? "Firefox" : /chrome|crios/i.test(ua) ? "Chrome" : /safari/i.test(ua) ? "Safari" : "Other";
  return `${br} on ${os}`;
}
