import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { withDb, SYSTEM, type DbContext, type Tx } from "@/lib/db";
import { env } from "@/lib/env";
import { randomToken, sha256 } from "@/lib/crypto";
import { isStaff, isAdminRole, type Role } from "@/lib/rbac";

export const SESSION_COOKIE = env.isProduction ? "__Host-ss_session" : "ss_session";

const USER_ABSOLUTE_MS = 7 * 24 * 3600_000;   // 7 days
const USER_IDLE_MS = 3 * 24 * 3600_000;       // 3 days
const STAFF_ABSOLUTE_MS = 8 * 3600_000;       // 8 hours (shorter privileged sessions)
const STAFF_IDLE_MS = 30 * 60_000;            // 30 minutes
export const REAUTH_WINDOW_MS = 10 * 60_000;  // fresh authentication window
export const PENDING_MFA_MS = 10 * 60_000;    // time allowed to complete MFA after password

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  mfaEnabled: boolean;
  emailVerified: boolean;
  suspended: boolean;
  reportingRestricted: boolean;
  createdAt: Date;
}

export interface AuthSession {
  id: string;
  mfaVerified: boolean;
  mfaMethod: string | null;
  reauthAt: Date | null;
  createdAt: Date;
}

export interface Auth {
  user: AuthUser;
  session: AuthSession;
  /** Session awaiting second factor: only MFA endpoints are usable. */
  pendingMfa: boolean;
  /** Effective database context. Staff privileges only apply to MFA-verified (and, for admins, passkey) sessions. */
  db: DbContext;
  /** True when the staff role is actually active in this session. */
  staffActive: boolean;
}

interface SessionRow {
  session_id: string; user_id: string; expires_at: Date; last_seen_at: Date; created_at: Date;
  mfa_verified_at: Date | null; mfa_method: string | null; reauth_at: Date | null; revoked_at: Date | null;
  email: string; display_name: string; role: Role; mfa_enabled: boolean; email_verified_at: Date | null;
  suspended_at: Date | null; suspended_until: Date | null; reporting_restricted_until: Date | null;
  deleted_at: Date | null; deletion_requested_at: Date | null; user_created_at: Date;
}

export function staffPrivilegeActive(role: string, mfaVerified: boolean, mfaMethod: string | null): boolean {
  if (!isStaff(role) || !mfaVerified) return false;
  if (isAdminRole(role) && env.adminRequirePasskey && mfaMethod !== "webauthn") return false;
  return true;
}

async function loadSession(token: string): Promise<Auth | null> {
  const tokenHash = sha256(token);
  const row = await withDb(SYSTEM, (tx) =>
    tx.one<SessionRow>(
      `SELECT s.id AS session_id, s.user_id, s.expires_at, s.last_seen_at, s.created_at, s.mfa_verified_at, s.mfa_method,
              s.reauth_at, s.revoked_at, u.email, u.display_name, u.role, u.mfa_enabled, u.email_verified_at,
              u.suspended_at, u.suspended_until, u.reporting_restricted_until, u.deleted_at, u.deletion_requested_at,
              u.created_at AS user_created_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1`,
      [tokenHash],
    ),
  );
  if (!row || row.revoked_at || row.deleted_at || row.deletion_requested_at) return null;
  const now = Date.now();
  const staff = isStaff(row.role);
  const idle = staff ? STAFF_IDLE_MS : USER_IDLE_MS;
  if (row.expires_at.getTime() < now || row.last_seen_at.getTime() + idle < now) return null;
  const suspended = !!row.suspended_at && (!row.suspended_until || row.suspended_until.getTime() > now);
  if (suspended) return null;

  const pendingMfa = row.mfa_enabled && !row.mfa_verified_at;
  if (pendingMfa && row.created_at.getTime() + PENDING_MFA_MS < now) return null;

  if (now - row.last_seen_at.getTime() > 60_000) {
    await withDb(SYSTEM, (tx) => tx.q(`UPDATE sessions SET last_seen_at = now() WHERE id = $1`, [row.session_id]));
  }

  const mfaVerified = !!row.mfa_verified_at;
  const staffActive = staffPrivilegeActive(row.role, mfaVerified, row.mfa_method);
  return {
    user: {
      id: row.user_id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      mfaEnabled: row.mfa_enabled,
      emailVerified: !!row.email_verified_at,
      suspended,
      reportingRestricted: !!row.reporting_restricted_until && row.reporting_restricted_until.getTime() > now,
      createdAt: row.user_created_at,
    },
    session: { id: row.session_id, mfaVerified, mfaMethod: row.mfa_method, reauthAt: row.reauth_at, createdAt: row.created_at },
    pendingMfa,
    // Privileged roles are downgraded to "user" for RLS unless the session is MFA (and passkey for admin) verified.
    db: { userId: row.user_id, role: staffActive ? row.role : "user" },
    staffActive,
  };
}

/** Current authentication (memoised per request). Returns null for guests. */
export const getAuth = cache(async (): Promise<Auth | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 200) return null;
  return loadSession(token);
});

async function setCookie(token: string, maxAgeMs: number) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { httpOnly: true, secure: env.isProduction, sameSite: "lax", path: "/", maxAge: 0 });
}

/** Creates a new session (always a fresh random token; prevents session fixation). */
export async function createSession(
  tx: Tx,
  user: { id: string; role: string },
  meta: { ipHash: string; userAgent: string; mfaVerified?: boolean; mfaMethod?: string | null },
): Promise<string> {
  const token = randomToken(32);
  const absolute = isStaff(user.role) ? STAFF_ABSOLUTE_MS : USER_ABSOLUTE_MS;
  await tx.q(
    `INSERT INTO sessions (user_id, token_hash, expires_at, mfa_verified_at, mfa_method, reauth_at, ip_hash, user_agent)
     VALUES ($1, $2, now() + ($3 || ' milliseconds')::interval, $4, $5, $6, $7, $8)`,
    [user.id, sha256(token), String(absolute), meta.mfaVerified ? new Date() : null, meta.mfaMethod ?? null,
     meta.mfaVerified ? new Date() : null, meta.ipHash, meta.userAgent],
  );
  await setCookie(token, absolute);
  return token;
}

/**
 * Upgrades a pending session after successful MFA by REPLACING it with a new token
 * (token rotation on privilege change).
 */
export async function upgradeSessionAfterMfa(tx: Tx, auth: Auth, method: "totp" | "webauthn" | "recovery_code", meta: { ipHash: string; userAgent: string }) {
  await tx.q(`UPDATE sessions SET revoked_at = now(), revoked_reason = 'rotated_after_mfa' WHERE id = $1`, [auth.session.id]);
  await createSession(tx, { id: auth.user.id, role: auth.user.role }, { ...meta, mfaVerified: true, mfaMethod: method });
}

export async function markReauth(tx: Tx, sessionId: string, method?: string) {
  await tx.q(
    `UPDATE sessions SET reauth_at = now(), mfa_verified_at = coalesce(mfa_verified_at, now()),
       mfa_method = CASE WHEN $2::text IS NULL THEN mfa_method WHEN $2 = 'webauthn' THEN 'webauthn' ELSE coalesce(mfa_method, $2) END
     WHERE id = $1`,
    [sessionId, method ?? null],
  );
}

export async function revokeSession(tx: Tx, sessionId: string, reason: string) {
  await tx.q(`UPDATE sessions SET revoked_at = now(), revoked_reason = $2 WHERE id = $1 AND revoked_at IS NULL`, [sessionId, reason]);
}

export async function revokeAllSessions(tx: Tx, userId: string, reason: string, exceptSessionId?: string) {
  await tx.q(
    `UPDATE sessions SET revoked_at = now(), revoked_reason = $2 WHERE user_id = $1 AND revoked_at IS NULL AND ($3::uuid IS NULL OR id <> $3)`,
    [userId, reason, exceptSessionId ?? null],
  );
}

export function hasFreshReauth(auth: Auth): boolean {
  return !!auth.session.reauthAt && Date.now() - auth.session.reauthAt.getTime() < REAUTH_WINDOW_MS;
}
