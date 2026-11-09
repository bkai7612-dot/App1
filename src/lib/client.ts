"use client";

export class ClientApiError extends Error {
  constructor(public status: number, public code: string, message: string, public data?: Record<string, unknown>) { super(message); }
}

/** Fetch wrapper for same-origin JSON APIs. Adds the CSRF header required by every mutating endpoint. */
export async function api<T = Record<string, unknown>>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", "x-ss-csrf": "1" },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } }).error ?? {};
    throw new ClientApiError(res.status, err.code ?? "ERROR", err.message ?? "Something went wrong.", data as Record<string, unknown>);
  }
  return data as T;
}
