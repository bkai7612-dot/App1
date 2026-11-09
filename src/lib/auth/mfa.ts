import "server-only";
import {
  generateAuthenticationOptions, generateRegistrationOptions,
  verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON, type AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { randomBytes } from "node:crypto";
import type { Tx } from "@/lib/db";
import { decrypt, encrypt, hmac } from "@/lib/crypto";
import { env } from "@/lib/env";
import { generateTotpSecret, verifyTotp } from "@/lib/totp";

// ---------------- Recovery codes ----------------
// High-entropy one-time codes (10 x 10 chars of base32 ≈ 50 bits each), stored as keyed HMAC-SHA256 hashes.
export function generateRecoveryCodes(n = 10): string[] {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: n }, () => {
    const b = randomBytes(10);
    const s = Array.from(b, (x) => alphabet[x % alphabet.length]).join("");
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}
const normCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");

export async function replaceRecoveryCodes(tx: Tx, userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await tx.q(`DELETE FROM recovery_codes WHERE user_id = $1`, [userId]);
  for (const c of codes) {
    await tx.q(`INSERT INTO recovery_codes (user_id, code_hash) VALUES ($1, $2)`, [userId, hmac(normCode(c), "recovery")]);
  }
  return codes;
}

export async function consumeRecoveryCode(tx: Tx, userId: string, code: string): Promise<boolean> {
  const row = await tx.one(
    `UPDATE recovery_codes SET used_at = now() WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL RETURNING id`,
    [userId, hmac(normCode(code), "recovery")],
  );
  return !!row;
}

// ---------------- TOTP ----------------
export async function beginTotpSetup(tx: Tx, userId: string): Promise<string> {
  const secret = generateTotpSecret();
  await tx.q(
    `INSERT INTO mfa_totp (user_id, secret_enc, confirmed_at) VALUES ($1, $2, NULL)
     ON CONFLICT (user_id) DO UPDATE SET secret_enc = EXCLUDED.secret_enc, confirmed_at = NULL, last_used_step = NULL
     WHERE mfa_totp.confirmed_at IS NULL`,
    [userId, encrypt(secret)],
  );
  const row = await tx.one<{ secret_enc: string; confirmed_at: Date | null }>(`SELECT secret_enc, confirmed_at FROM mfa_totp WHERE user_id = $1`, [userId]);
  if (row?.confirmed_at) throw new Error("TOTP_ALREADY_CONFIRMED");
  return secret;
}

/** Verifies a TOTP code with replay protection (row-locked). */
export async function checkTotp(tx: Tx, userId: string, code: string, requireConfirmed = true): Promise<boolean> {
  const row = await tx.one<{ secret_enc: string; confirmed_at: Date | null; last_used_step: string | null }>(
    `SELECT secret_enc, confirmed_at, last_used_step FROM mfa_totp WHERE user_id = $1 FOR UPDATE`, [userId]);
  if (!row || (requireConfirmed && !row.confirmed_at)) return false;
  const step = verifyTotp(decrypt(row.secret_enc), code.trim(), row.last_used_step === null ? null : Number(row.last_used_step));
  if (step === null) return false;
  await tx.q(`UPDATE mfa_totp SET last_used_step = $2 WHERE user_id = $1`, [userId, step]);
  return true;
}

export async function hasConfirmedTotp(tx: Tx, userId: string): Promise<boolean> {
  return !!(await tx.one(`SELECT 1 FROM mfa_totp WHERE user_id = $1 AND confirmed_at IS NOT NULL`, [userId]));
}

// ---------------- WebAuthn / passkeys ----------------
const CHALLENGE_TTL = "5 minutes";

export async function passkeyRegistrationOptions(tx: Tx, sessionId: string, user: { id: string; email: string; displayName: string }) {
  const existing = await tx.q<{ credential_id: string; transports: string[] }>(
    `SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = $1`, [user.id]);
  const options = await generateRegistrationOptions({
    rpName: env.webauthnRpName,
    rpID: env.webauthnRpId,
    userName: user.email,
    userDisplayName: user.displayName,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.credential_id, transports: c.transports as AuthenticatorTransportFuture[] })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
  await tx.q(`UPDATE sessions SET webauthn_challenge = $2, challenge_expires_at = now() + interval '${CHALLENGE_TTL}' WHERE id = $1`, [sessionId, options.challenge]);
  return options;
}

async function takeChallenge(tx: Tx, sessionId: string): Promise<string | null> {
  const row = await tx.one<{ webauthn_challenge: string | null; challenge_expires_at: Date | null }>(
    `SELECT webauthn_challenge, challenge_expires_at FROM sessions WHERE id = $1 FOR UPDATE`, [sessionId]);
  // Challenges are single use.
  await tx.q(`UPDATE sessions SET webauthn_challenge = NULL, challenge_expires_at = NULL WHERE id = $1`, [sessionId]);
  if (!row?.webauthn_challenge || !row.challenge_expires_at || row.challenge_expires_at.getTime() < Date.now()) return null;
  return row.webauthn_challenge;
}

export async function passkeyRegistrationVerify(tx: Tx, sessionId: string, userId: string, response: RegistrationResponseJSON, nickname: string | null) {
  const challenge = await takeChallenge(tx, sessionId);
  if (!challenge) return false;
  let v;
  try {
    v = await verifyRegistrationResponse({
      response, expectedChallenge: challenge, expectedOrigin: env.appUrl, expectedRPID: env.webauthnRpId, requireUserVerification: true,
    });
  } catch { return false; }
  if (!v.verified || !v.registrationInfo) return false;
  const { credential, credentialDeviceType, credentialBackedUp } = v.registrationInfo;
  await tx.q(
    `INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter, transports, device_type, backed_up, nickname)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, credential.id, Buffer.from(credential.publicKey), credential.counter, credential.transports ?? [], credentialDeviceType, credentialBackedUp, nickname],
  );
  return true;
}

export async function passkeyAuthOptions(tx: Tx, sessionId: string, userId: string) {
  const creds = await tx.q<{ credential_id: string; transports: string[] }>(
    `SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = $1`, [userId]);
  if (creds.length === 0) return null;
  const options = await generateAuthenticationOptions({
    rpID: env.webauthnRpId,
    allowCredentials: creds.map((c) => ({ id: c.credential_id, transports: c.transports as AuthenticatorTransportFuture[] })),
    userVerification: "required",
  });
  await tx.q(`UPDATE sessions SET webauthn_challenge = $2, challenge_expires_at = now() + interval '${CHALLENGE_TTL}' WHERE id = $1`, [sessionId, options.challenge]);
  return options;
}

export async function passkeyAuthVerify(tx: Tx, sessionId: string, userId: string, response: AuthenticationResponseJSON): Promise<boolean> {
  const challenge = await takeChallenge(tx, sessionId);
  if (!challenge) return false;
  const cred = await tx.one<{ id: string; credential_id: string; public_key: Buffer; counter: string; transports: string[] }>(
    `SELECT id, credential_id, public_key, counter, transports FROM webauthn_credentials WHERE user_id = $1 AND credential_id = $2`,
    [userId, response.id]);
  if (!cred) return false;
  let v;
  try {
    v = await verifyAuthenticationResponse({
      response, expectedChallenge: challenge, expectedOrigin: env.appUrl, expectedRPID: env.webauthnRpId, requireUserVerification: true,
      credential: { id: cred.credential_id, publicKey: new Uint8Array(cred.public_key), counter: Number(cred.counter), transports: cred.transports as AuthenticatorTransportFuture[] },
    });
  } catch { return false; }
  if (!v.verified) return false;
  await tx.q(`UPDATE webauthn_credentials SET counter = $2, last_used_at = now() WHERE id = $1`, [cred.id, v.authenticationInfo.newCounter]);
  return true;
}
