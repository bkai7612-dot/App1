import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getAuth, hasFreshReauth, type Auth } from "@/lib/auth/session";
import { can, type Permission } from "@/lib/rbac";
import { env } from "@/lib/env";
import { ApiError, forbidden, unauthorized, badRequest } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";
import { clientIp, ipHash, userAgent } from "@/lib/server/request";
import { withDb, SYSTEM } from "@/lib/db";
import { securityEvent } from "@/lib/server/audit";

export type AuthLevel = "public" | "pendingMfa" | "auth" | "mfa";

export interface RouteOptions<S extends z.ZodTypeAny | undefined> {
  /** public: anyone; pendingMfa: logged in, MFA may be pending; auth: fully logged in; mfa: MFA-enrolled, verified, email-verified */
  auth?: AuthLevel;
  permission?: Permission;
  /** Require fresh re-authentication (password + second factor within 10 minutes). */
  reauth?: boolean;
  body?: S;
  /** Rate limit per user (or per IP for guests). */
  rate?: { name: string; limit: number; windowSec: number };
  maxBodyBytes?: number;
}

export interface RouteCtx<B> {
  req: NextRequest;
  auth: Auth | null;
  body: B;
  params: Record<string, string>;
  meta: { ipHash: string; userAgent: string };
}

const MAX_JSON = 64 * 1024;

/**
 * CSRF defence for every mutating request:
 * 1. A custom header (x-ss-csrf) is required, which forces a CORS preflight that we never approve.
 * 2. If the browser sent Sec-Fetch-Site (a forbidden header pages can't forge), it must be same-origin.
 *    This also works behind proxies that rewrite the Host header.
 * 3. Otherwise, any Origin header must match the forwarded host, the Host header or APP_URL.
 */
export function checkCsrf(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  if (req.headers.get("x-ss-csrf") !== "1") throw new ApiError(403, "CSRF", "Request blocked.");
  const site = req.headers.get("sec-fetch-site");
  const origin = req.headers.get("origin");
  if (site) {
    if (site !== "same-origin") throw new ApiError(403, "CSRF", "Request blocked.");
    return;
  }
  if (origin) {
    let ok = false;
    try {
      const o = new URL(origin);
      const hosts = [req.headers.get("x-forwarded-host"), req.headers.get("host")].filter(Boolean);
      ok = hosts.includes(o.host) || o.origin === new URL(env.appUrl).origin;
    } catch { ok = false; }
    if (!ok) throw new ApiError(403, "CSRF", "Request blocked.");
  }
}

export function jsonError(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  const res = NextResponse.json({ error: { code, message, ...(extra ?? {}) } }, { status });
  if (status === 429 && extra?.retryAfter) res.headers.set("Retry-After", String(extra.retryAfter));
  return res;
}

export async function requireAuthLevel(auth: Auth | null, level: AuthLevel): Promise<void> {
  if (level === "public") return;
  if (!auth) throw unauthorized();
  if (level === "pendingMfa") return;
  if (auth.pendingMfa) throw new ApiError(401, "MFA_REQUIRED", "Complete two-factor authentication to continue.");
  if (level === "mfa") {
    if (!auth.user.emailVerified) throw new ApiError(403, "EMAIL_UNVERIFIED", "Verify your email address first.");
    if (!auth.user.mfaEnabled || !auth.session.mfaVerified)
      throw new ApiError(403, "MFA_ENROLMENT_REQUIRED", "Set up two-factor authentication to use this feature.");
  }
}

export function route<S extends z.ZodTypeAny | undefined = undefined>(
  opts: RouteOptions<S>,
  handler: (ctx: RouteCtx<S extends z.ZodTypeAny ? z.infer<S> : undefined>) => Promise<Response | object | null>,
) {
  return async (req: NextRequest, routeCtx: { params: Promise<Record<string, string>> }) => {
    try {
      checkCsrf(req);
      const auth = await getAuth();
      const level = opts.auth ?? (opts.permission ? "mfa" : "public");
      await requireAuthLevel(auth, opts.permission ? "mfa" : level);
      const meta = { ipHash: await ipHash(), userAgent: await userAgent() };

      if (opts.permission) {
        if (!auth || !auth.staffActive || !can(auth.user.role, opts.permission)) {
          if (auth) {
            await withDb(SYSTEM, (tx) => securityEvent(tx, auth.user.id, "unauthorised_access_attempt", meta, { path: req.nextUrl.pathname, permission: opts.permission }));
          }
          if (auth && can(auth.user.role, opts.permission) && !auth.staffActive)
            throw new ApiError(403, "STAFF_MFA_REQUIRED", "Staff access requires a session verified with your passkey or authenticator.");
          throw forbidden();
        }
      }
      if (opts.reauth && (!auth || !hasFreshReauth(auth))) {
        throw new ApiError(403, "REAUTH_REQUIRED", "Please confirm it's you to continue.");
      }
      if (opts.rate) {
        const who = auth ? `u:${auth.user.id}` : `ip:${await clientIp()}`;
        await rateLimit(`${opts.rate.name}:${who}`, opts.rate.limit, opts.rate.windowSec);
      }

      let body: unknown = undefined;
      if (opts.body) {
        const text = await req.text();
        if (text.length > (opts.maxBodyBytes ?? MAX_JSON)) throw new ApiError(413, "TOO_LARGE", "Request too large.");
        let raw: unknown;
        try { raw = text ? JSON.parse(text) : {}; } catch { throw badRequest("Invalid JSON."); }
        const parsed = (opts.body as z.ZodTypeAny).safeParse(raw);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          throw badRequest(first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input.", {
            fields: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })).slice(0, 10),
          });
        }
        body = parsed.data;
      }

      const params = routeCtx?.params ? await routeCtx.params : {};
      const result = await handler({ req, auth, body: body as never, params, meta });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      return handleError(e);
    }
  };
}

export function handleError(e: unknown): Response {
  if (e instanceof ApiError) return jsonError(e.status, e.code, e.message, e.extra);
  const pg = e as { code?: string };
  if (pg?.code === "42501") return jsonError(403, "FORBIDDEN", "You do not have permission to do that.");
  if (pg?.code === "23505") return jsonError(409, "CONFLICT", "That already exists.");
  if (pg?.code === "23514" || pg?.code === "22P02" || pg?.code === "22007" || pg?.code === "22008") return jsonError(400, "BAD_REQUEST", "Invalid input.");
  // Never leak internals: log details server-side with a correlation id.
  const incident = randomUUID();
  console.error(`[api-error] incident=${incident}`, e);
  return jsonError(500, "INTERNAL", "Something went wrong. Please try again.", { incident });
}

// Shared zod helpers
export const zUuid = z.string().uuid();
export const zText = (min: number, max: number) => z.string().trim().min(min).max(max);
export const zOptionalText = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
