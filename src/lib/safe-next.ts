/**
 * Prevents open redirects: only same-origin relative paths are allowed.
 * Browsers strip tab/newline characters from URLs ("/\t/evil.com" becomes "//evil.com"), so ANY control
 * character or backslash is rejected, and the result is resolved with the URL parser and must stay same-origin.
 */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || typeof next !== "string" || next.length > 300) return fallback;
  if (!next.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  try {
    const base = "http://ss-internal.invalid";
    const u = new URL(next, base);
    if (u.origin !== base) return fallback;
    const out = u.pathname + u.search + u.hash;
    return out.startsWith("//") ? fallback : out;
  } catch {
    return fallback;
  }
}
