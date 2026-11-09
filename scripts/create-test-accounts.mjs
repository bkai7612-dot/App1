// DEVELOPMENT/STAGING ONLY: creates ready-to-use test accounts with KNOWN credentials and a known TOTP secret,
// so a human tester can click through every role. Refuses to run in production.
import crypto from "node:crypto";
import { hash } from "@node-rs/argon2";
import { adminClient, refuseInProduction, loadEnv } from "./_db.mjs";

loadEnv();
refuseInProduction("create test accounts with known passwords");
const KEY = Buffer.from(process.env.APP_ENCRYPTION_KEY, "base64");
const enc = (s) => { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv("aes-256-gcm", KEY, iv); const ct = Buffer.concat([c.update(s, "utf8"), c.final()]); return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join("."); };
const hm = (s) => crypto.createHmac("sha256", process.env.APP_HMAC_SECRET).update(`recovery:${s}`).digest("hex");

const PASSWORD = "Prototype-Test-2026!";
const TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"; // shared test secret: add to any authenticator app
const ACCOUNTS = [
  { email: "player@test.local", name: "TestPlayer", role: "user" },
  { email: "plus@test.local", name: "TestPlusMember", role: "user", plus: true },
  { email: "owner@test.local", name: "TestOwner", role: "user", ownsShadow: true },
  { email: "mod@test.local", name: "TestModerator", role: "senior_moderator" },
];

const c = adminClient();
await c.connect();
await c.query("BEGIN");
await c.query("SET LOCAL search_path = ss, public");
await c.query("SELECT set_config('app.role', 'system', true)");
const pwHash = await hash(PASSWORD, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
const out = [];
for (const a of ACCOUNTS) {
  const r = await c.query(`INSERT INTO users (email, email_normalized, password_hash, display_name, role, email_verified_at, mfa_enabled, created_at)
    VALUES ($1, $1, $2, $3, $4, now(), true, now() - interval '10 days')
    ON CONFLICT (email_normalized) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, mfa_enabled = true,
      failed_login_count = 0, locked_until = NULL, suspended_at = NULL, reporting_restricted_until = NULL RETURNING id`, [a.email, pwHash, a.name, a.role]);
  const id = r.rows[0].id;
  await c.query(`INSERT INTO mfa_totp (user_id, secret_enc, confirmed_at) VALUES ($1, $2, now()) ON CONFLICT (user_id) DO UPDATE SET secret_enc = EXCLUDED.secret_enc, confirmed_at = now(), last_used_step = NULL`, [id, enc(TOTP_SECRET)]);
  await c.query(`DELETE FROM recovery_codes WHERE user_id = $1`, [id]);
  const codes = Array.from({ length: 5 }, (_, i) => `TEST${i}-${a.name.slice(4, 9).toUpperCase().padEnd(5, "X")}`);
  for (const code of codes) await c.query(`INSERT INTO recovery_codes (user_id, code_hash) VALUES ($1, $2)`, [id, hm(code.replace(/[^A-Z0-9]/g, ""))]);
  if (a.plus) await c.query(`INSERT INTO subscriptions (user_id, stripe_subscription_id, stripe_customer_id, status, current_period_end, last_event_at)
      VALUES ($1::uuid, 'dev_sub_' || $1::text, 'dev_cus_' || $1::text, 'active', now() + interval '30 days', now())
      ON CONFLICT (stripe_subscription_id) DO UPDATE SET status = 'active', current_period_end = now() + interval '30 days'`, [id]);
  if (a.ownsShadow) {
    await c.query(`UPDATE player_profiles SET owner_user_id = $1 WHERE id = (SELECT p.id FROM player_profiles p JOIN platforms pl ON pl.id = p.platform_id
      WHERE p.display_name = 'Shadow' AND pl.slug = 'ubisoft-connect' AND p.is_demo ORDER BY p.created_at LIMIT 1)`, [id]);
  }
  out.push({ ...a, codes });
}
await c.query("COMMIT");
await c.end();
console.log(`\nPassword for all accounts: ${PASSWORD}\nTOTP secret (add to an authenticator app): ${TOTP_SECRET}\n`);
for (const a of out) console.log(`${a.email.padEnd(20)} ${a.role.padEnd(17)} recovery codes: ${a.codes.join(", ")}`);
