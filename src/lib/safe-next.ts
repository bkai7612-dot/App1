/** Prevents open redirects: only same-site relative paths are allowed. */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || /[\r\n]/.test(next)) return fallback;
  if (next.length > 300) return fallback;
  return next;
}
