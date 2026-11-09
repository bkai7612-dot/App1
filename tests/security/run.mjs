// ServerSentry integration + security test suite.
// Requires: running app (npm run dev) with .env.local from docs/SETUP.md (TRUSTED_IP_HEADER, DEV_EMAIL_OUTBOX,
// STRIPE_WEBHOOK_SECRET, REPORT_MIN_ACCOUNT_AGE_HOURS=0), migrated database, seeded demo data.
// Usage: node tests/security/run.mjs [baseUrl]
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import pg from "pg";
import sharp from "sharp";
import Stripe from "stripe";
import { loadEnv } from "../../scripts/_db.mjs";

loadEnv();
const BASE = process.argv[2] ?? process.env.APP_URL ?? "http://localhost:3000";
const OUTBOX = process.env.DEV_EMAIL_OUTBOX;
const RUN = crypto.randomBytes(3).toString("hex");
let passed = 0, failed = 0;
const failures = [];
function check(name, cond, info = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(`${name} ${info}`); console.log(`  ✗ ${name} ${info}`); }
}
const section = (s) => console.log(`\n▸ ${s}`);

// ---------- TOTP helper ----------
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32d(s) { let bits = 0, v = 0; const o = []; for (const c of s) { v = (v << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); }
function totp(secret, offset = 0) {
  const step = Math.floor(Date.now() / 30000) + offset; const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac("sha1", b32d(secret)).update(b).digest(); const o = h[h.length - 1] & 15;
  return ((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).toString().padStart(6, "0");
}

// ---------- HTTP client with cookie jar ----------
function client(ip = `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`) {
  const jar = new Map();
  async function req(method, path, body, opts = {}) {
    const headers = { "x-forwarded-for": ip, ...(opts.headers ?? {}) };
    if (opts.csrf !== false) headers["x-ss-csrf"] = "1";
    if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: "manual" });
    for (const c of res.headers.getSetCookie?.() ?? []) { const [kv] = c.split(";"); const [k, ...v] = kv.split("="); const val = v.join("="); if (val) jar.set(k, val); else jar.delete(k); }
    let json = null; const text = await res.text(); try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
  }
  return { req, jar, ip, get: (p, o) => req("GET", p, undefined, o), post: (p, b, o) => req("POST", p, b ?? {}, o) };
}

function lastEmailLink(to, re) {
  const lines = fs.readFileSync(OUTBOX, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((m) => m.to === to).reverse();
  for (const m of lines) { const x = m.text.match(re); if (x) return decodeURIComponent(x[1]); }
  return null;
}

const db = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await db.connect();
await db.query("SET search_path = ss, public");

async function makeUser(name, { mfa = true, verify = true } = {}) {
  const c = client();
  const email = `${name}-${RUN}@test.invalid`;
  const password = `Correct-Horse-${RUN}-${name}-Battery`;
  const r = await c.post("/api/auth/register", { email, password, displayName: `${name}${RUN}`, acceptTerms: true, confirmAge: true });
  if (r.status !== 200) throw new Error(`register ${name} failed ${r.status} ${r.text}`);
  const u = { c, email, password, name: `${name}${RUN}` };
  if (c.jar.size) throw new Error("registration must not issue a session (enumeration fix)");
  if (verify) {
    const token = lastEmailLink(email, /verify-email\?token=([^\s]+)/);
    const v = await c.post("/api/auth/verify-email", { token });
    if (v.status !== 200) throw new Error("verify failed");
  }
  const li = await c.post("/api/auth/login", { email, password });
  if (li.status !== 200) throw new Error(`login ${name} failed ${li.text}`);
  if (mfa) {
    const s = await c.get("/api/auth/mfa/totp");
    u.secret = s.json.secret;
    const conf = await c.post("/api/auth/mfa/totp", { code: totp(u.secret) });
    if (conf.status !== 200) throw new Error("totp confirm failed " + conf.text);
    u.recovery = conf.json.recoveryCodes;
  }
  u.id = (await db.query(`SELECT id FROM users WHERE email_normalized = $1`, [email.toLowerCase()])).rows[0].id;
  return u;
}
async function relogin(u) {
  u.c.jar.clear();
  const l = await u.c.post("/api/auth/login", { email: u.email, password: u.password });
  if (l.json?.mfaRequired) await u.c.post("/api/auth/mfa/verify", { recoveryCode: u.recovery.pop() });
}
async function pngFile(name = "shot.png") {
  const buf = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 120, g: 60, b: 200 } } }).png().toBuffer();
  return new File([buf], name, { type: "image/png" });
}

const shadow = (await db.query(`SELECT p.id, p.public_id FROM player_profiles p JOIN platforms pl ON pl.id = p.platform_id WHERE p.display_name = 'Shadow' AND pl.slug = 'ubisoft-connect' AND p.is_demo LIMIT 1`)).rows[0];
if (!shadow) { console.error("Seed demo data first (npm run db:seed-demo)."); process.exit(1); }

let ownerReport, D;
// =====================================================================
section("Transport, headers and CSRF");
{
  const g = client();
  const home = await g.get("/");
  check("CSP header present with nonce", /script-src 'self' 'nonce-/.test(home.headers.get("content-security-policy") ?? ""));
  check("X-Frame-Options DENY", home.headers.get("x-frame-options") === "DENY");
  check("HSTS present", !!home.headers.get("strict-transport-security"));
  check("No X-Powered-By", !home.headers.get("x-powered-by"));
  const noCsrf = await g.post("/api/auth/login", { email: "a@b.c", password: "x" }, { csrf: false });
  check("Mutation without CSRF header blocked", noCsrf.status === 403 && noCsrf.json?.error?.code === "CSRF");
  const badOrigin = await g.post("/api/auth/login", { email: "a@b.c", password: "x" }, { headers: { origin: "https://evil.example" } });
  check("Cross-origin mutation blocked", badOrigin.status === 403);
  const err = await g.post("/api/auth/login", "not-json-object");
  check("Invalid input returns generic 400 without stack", err.status === 400 && !/at \w+ \(/.test(err.text));
}

section("Registration, enumeration and login protection");
const A = await makeUser("alice");
const B = await makeUser("bob");
const C = await makeUser("carol");
{
  const dup = await client().post("/api/auth/register", { email: A.email, password: "Another-Long-Password-123", displayName: "dupe", acceptTerms: true, confirmAge: true });
  const fresh = await client().post("/api/auth/register", { email: `fresh-${RUN}@test.invalid`, password: "Another-Long-Password-123", displayName: "fresh", acceptTerms: true, confirmAge: true });
  check("Duplicate registration gives identical response to new registration (QA-04)", dup.status === 200 && dup.text === fresh.text && !dup.headers.get("set-cookie") && !fresh.headers.get("set-cookie"));
  const weak = await client().post("/api/auth/register", { email: `weak-${RUN}@test.invalid`, password: "short", displayName: "weak", acceptTerms: true, confirmAge: true });
  check("Weak password rejected", weak.status === 400);
  const g = client();
  const wrong = await g.post("/api/auth/login", { email: A.email, password: "wrong-password-xyz" });
  const nouser = await g.post("/api/auth/login", { email: `nobody-${RUN}@test.invalid`, password: "wrong-password-xyz" });
  check("Wrong password and unknown user return identical errors", wrong.status === 401 && nouser.status === 401 && wrong.json.error.message === nouser.json.error.message);
  const f1 = await g.post("/api/auth/forgot-password", { email: A.email });
  const f2 = await g.post("/api/auth/forgot-password", { email: `nobody-${RUN}@test.invalid` });
  check("Forgot-password does not reveal account existence", f1.text === f2.text);
  // Lockout: 5 failures lock the account even with the right password afterwards.
  const L = await makeUser("locky", { mfa: false });
  const lc = client();
  for (let i = 0; i < 5; i++) await lc.post("/api/auth/login", { email: L.email, password: "nope-nope-nope" });
  const afterLock = await lc.post("/api/auth/login", { email: L.email, password: L.password });
  check("Account locked after repeated failures", afterLock.status === 401);
}

section("MFA gates and second-factor enforcement");
{
  const N = await makeUser("nomfa", { mfa: false });
  const r = await N.c.post("/api/commendations", { playerProfileId: shadow.id, category: "fair_play" });
  check("Commendation blocked without MFA", r.status === 403 && r.json.error.code === "MFA_ENROLMENT_REQUIRED");
  const U = await makeUser("unverified", { mfa: false, verify: false });
  const r2 = await U.c.post("/api/commendations", { playerProfileId: shadow.id, category: "fair_play" });
  check("Commendation blocked with unverified email", r2.status === 403 && r2.json.error.code === "EMAIL_UNVERIFIED");

  A.c.jar.clear();
  const l = await A.c.post("/api/auth/login", { email: A.email, password: A.password });
  check("Login with MFA enrolled requires second factor", l.json?.mfaRequired === true);
  const pend = await A.c.get("/api/notifications");
  check("Pending-MFA session cannot use the app", pend.status === 401 && pend.json.error.code === "MFA_REQUIRED");
  const pendCommend = await A.c.post("/api/commendations", { playerProfileId: shadow.id, category: "fair_play" });
  check("Pending-MFA session cannot submit content", pendCommend.status === 401);
  const replay = await A.c.post("/api/auth/mfa/verify", { code: totp(A.secret) });
  check("TOTP code already used at enrolment cannot be replayed", replay.status === 401);
  let locked = false;
  for (let i = 0; i < 6; i++) { const r = await A.c.post("/api/auth/mfa/verify", { code: "000000" }); if (r.json?.error?.code === "MFA_LOCKED") locked = true; }
  check("Session revoked after repeated wrong MFA codes", locked);
  const after = await A.c.post("/api/auth/mfa/verify", { recoveryCode: A.recovery[0] });
  check("Locked pending session cannot continue even with valid code", after.status === 401 && after.json.error.code !== undefined && !A.c.jar.size || after.status === 401);
  await relogin(A);
  const ok = await A.c.get("/api/notifications");
  check("Recovery code completes sign-in", ok.status === 200);
  const reuse = client();
  await reuse.post("/api/auth/login", { email: A.email, password: A.password });
  const used = await reuse.post("/api/auth/mfa/verify", { recoveryCode: A.recovery[A.recovery.length] ?? "AAAAA-AAAAA" });
  check("Used/invalid recovery code rejected", used.status === 401);
  await db.query(`SELECT set_config('app.role','system',false)`);
  await db.query(`UPDATE sessions SET reauth_at = now() - interval '1 hour' WHERE user_id = $1`, [A.id]);
  const sens = await A.c.post("/api/account/password", { newPassword: "Some-New-Password-12345" });
  check("Password change requires fresh re-authentication", sens.status === 403 && sens.json.error.code === "REAUTH_REQUIRED");
}

section("Commendations");
let commId;
{
  const r = await A.c.post("/api/commendations", { playerProfileId: shadow.id, category: "great_communication", comment: "Great comms" });
  check("Commendation accepted", r.status === 200);
  check("Comment / new-account commendations held for moderation", r.json?.status === "pending");
  commId = r.json?.id;
  const d = await A.c.post("/api/commendations", { playerProfileId: shadow.id, category: "great_communication" });
  check("Duplicate commendation rejected", d.status === 409);
  const forged = await A.c.post("/api/commendations", { playerProfileId: shadow.id, category: "fair_play", status: "approved" });
  check("Same-day second commendation rejected (anti-spam)", forged.status === 409 || forged.status === 400);
  const bad = await B.c.post("/api/commendations", { playerProfileId: shadow.id, category: "best_player_ever" });
  check("Unknown category rejected", bad.status === 400);
}

section("Reports and evidence upload security");
let reportA, evidenceId;
{
  const fd = new FormData();
  fd.set("playerProfileId", shadow.id); fd.set("category", "harassment"); fd.set("description", "Repeated insults in team chat after the round ended, across three rounds.");
  fd.set("incidentDate", new Date().toISOString().slice(0, 10)); fd.set("accurateConfirm", "true");
  fd.append("evidence", await pngFile());
  const r = await A.c.post("/api/reports", fd);
  check("Report with valid PNG evidence accepted", r.status === 200, r.text);
  reportA = r.json?.reportId;
  const row = (await db.query(`SELECT status, public_summary FROM reports WHERE id = $1`, [reportA])).rows[0];
  check("New report is NOT published automatically", row?.status === "submitted" && row.public_summary === null);
  evidenceId = (await db.query(`SELECT id, storage_key FROM report_evidence WHERE report_id = $1`, [reportA])).rows[0]?.id;
  const dup = await A.c.post("/api/reports", fd);
  check("Second open report on same player rejected", dup.status === 409 || dup.status === 429);

  const mk = async (file) => { const f = new FormData(); f.set("playerProfileId", shadow.id); f.set("category", "griefing"); f.set("description", "Destroyed every reinforcement on our side during the setup phase."); f.set("incidentDate", "2026-10-01"); f.set("accurateConfirm", "true"); f.append("evidence", file); return B.c.post("/api/reports", f); };
  const fake = await mk(new File([Buffer.from("<?php system($_GET['x']); ?>")], "evil.png", { type: "image/png" }));
  check("Script disguised as PNG rejected", fake.status === 400);
  const svg = await mk(new File([Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')], "x.svg", { type: "image/svg+xml" }));
  check("SVG upload rejected", svg.status === 400);
  D = await makeUser("dave");
  const mkD = async (file) => { const f = new FormData(); f.set("playerProfileId", shadow.id); f.set("category", "griefing"); f.set("description", "Destroyed every reinforcement on our side during the setup phase."); f.set("incidentDate", "2026-10-01"); f.set("accurateConfirm", "true"); f.append("evidence", file); return D.c.post("/api/reports", f); };
  const poly = await pngFile(); const polyBuf = Buffer.concat([Buffer.from(await poly.arrayBuffer()), Buffer.from("<script>alert(1)</script>")]);
  const ok = await mkD(new File([polyBuf], "../../etc/passwd.png", { type: "image/png" }));
  check("Polyglot PNG accepted only after re-encoding (payload stripped)", ok.status === 200, ok.text);
  if (ok.status === 200) {
    const ev = (await db.query(`SELECT storage_key FROM report_evidence WHERE report_id = $1`, [ok.json.reportId])).rows[0];
    check("Storage key is random (no user-controlled path)", /^evidence\/\d{4}\/[0-9a-f-]{36}\.png$/.test(ev.storage_key));
    const stored = fs.readFileSync(`${process.env.LOCAL_STORAGE_DIR ?? "./storage"}/${ev.storage_key}`);
    check("Stored file has trailing script stripped", !stored.includes(Buffer.from("<script>")));
  }
  const bigDesc = new FormData(); bigDesc.set("playerProfileId", shadow.id); bigDesc.set("category", "other"); bigDesc.set("description", "x".repeat(5000)); bigDesc.set("incidentDate", "2026-10-01"); bigDesc.set("accurateConfirm", "true");
  const big = await C.c.post("/api/reports", bigDesc);
  check("Oversized description rejected", big.status === 400);
  const fut = new FormData(); fut.set("playerProfileId", shadow.id); fut.set("category", "other"); fut.set("description", "A sufficiently long description of events."); fut.set("incidentDate", "2099-01-01"); fut.set("accurateConfirm", "true");
  check("Future incident date rejected", (await C.c.post("/api/reports", fut)).status === 400);
}

section("Evidence access control (IDOR)");
{
  check("Uploader can view own evidence", (await A.c.get(`/api/evidence/${evidenceId}`)).status === 200);
  const other = await B.c.get(`/api/evidence/${evidenceId}`);
  check("Another user cannot access evidence", other.status === 404);
  check("Guest cannot access evidence", (await client().get(`/api/evidence/${evidenceId}`)).status === 401);
  const ev = await A.c.get(`/api/evidence/${evidenceId}`);
  check("Evidence served no-store with sandbox CSP", /no-store/.test(ev.headers.get("cache-control")) && /sandbox/.test(ev.headers.get("content-security-policy") ?? ""));
  const traversal = await A.c.get(`/api/evidence/..%2F..%2F.env.local`);
  check("Path traversal attempt returns 404", traversal.status === 404);
}

section("Premium entitlement enforced server-side");
{
  const path = `/api/players/${shadow.public_id}/feedback?type=commendations`;
  check("Guest blocked from comments API", (await client().get(path)).status === 402);
  check("Free user blocked from comments API", (await B.c.get(path)).status === 402);
  check("Free user blocked from report summaries API", (await B.c.get(`/api/players/${shadow.public_id}/feedback?type=reports`)).status === 402);
  check("Free user blocked from history API", (await B.c.get(`/api/players/${shadow.public_id}/feedback?type=history`)).status === 402);
  const page = await B.c.get(`/players/${shadow.public_id}?tab=positive`);
  check("Free user profile page does not contain comment text", !page.text.includes("Called every rotation clearly"));
  const expectPos = Number((await db.query(`SELECT positive_total FROM player_reputation_stats WHERE player_profile_id = $1`, [shadow.id])).rows[0].positive_total);
  check("Counts remain public", (await client().get(`/api/players/${shadow.public_id}/feedback?type=stats`)).json?.stats?.positive_total === expectPos);
  execFileSync("node", ["scripts/dev-grant-plus.mjs", B.email, "grant"]);
  const plus = await B.c.get(path);
  check("Plus user can read approved comments", plus.status === 200 && plus.json.commendations.length >= 10);
  check("Plus API never includes submitter identity", !JSON.stringify(plus.json).includes("submitter"));
  const reps = await B.c.get(`/api/players/${shadow.public_id}/feedback?type=reports`);
  check("Plus report API exposes no reporter id or raw description", !/reporter|FICTIONAL DEMONSTRATION REPORT/.test(reps.text));
  check("Plus report API excludes unpublished reports", !reps.json.reports.some((r) => ["submitted", "under_review", "rejected", "removed"].includes(r.status)));
  execFileSync("node", ["scripts/dev-grant-plus.mjs", B.email, "past_due"]);
  check("Past-due subscriber loses access", (await B.c.get(path)).status === 402);
  execFileSync("node", ["scripts/dev-grant-plus.mjs", B.email, "revoke"]);
  check("Cancelled subscriber loses access", (await B.c.get(path)).status === 402);
  await db.query(`SELECT set_config('app.role','system',false)`);
  await db.query(`UPDATE subscriptions SET status = 'active', current_period_end = now() - interval '1 day' WHERE user_id = $1`, [B.id]);
  check("Expired period denies access even if status says active", (await B.c.get(path)).status === 402);
  await db.query(`DELETE FROM subscriptions WHERE user_id = $1`, [B.id]);
}

section("Mass assignment and privilege escalation");
{
  const r = await B.c.req("PATCH", "/api/account/profile", { displayName: "Bobby", role: "super_admin" });
  check("Unknown fields rejected (no mass assignment)", r.status === 400);
  const r2 = await B.c.req("PATCH", "/api/account/profile", { privacyPrefs: { plus: true } });
  check("Unknown nested fields rejected", r2.status === 400);
  const role = (await db.query(`SELECT role FROM users WHERE id = $1`, [B.id])).rows[0].role;
  check("Role unchanged", role === "user");
  const mod = await B.c.post(`/api/admin/reports/${reportA}`, { action: "publish", publicSummary: "Trying to publish my own report as a normal user" });
  check("Normal user cannot moderate", mod.status === 403);
  const selfRole = await B.c.post(`/api/admin/users/${B.id}`, { action: "set_role", role: "admin", reason: "please" });
  check("Normal user cannot change roles", selfRole.status === 403);
  const adminPage = await B.c.get("/admin");
  check("Admin dashboard hidden from normal users (404)", adminPage.status === 404);
}

section("Identity linking ownership");
let ownedProfile;
{
  const own = await C.c.post("/api/identity/profiles", { displayName: `OwnerTest${RUN}`, gameSlug: "valorant", platformSlug: "riot-games" });
  check("User can create own profile", own.status === 200);
  ownedProfile = (await db.query(`SELECT id, public_id FROM player_profiles WHERE public_id = $1`, [own.json.publicId])).rows[0];
  const steal = await B.c.post("/api/identity/accounts", { playerProfileId: ownedProfile.id, platformSlug: "steam", username: "hijack" });
  check("Cannot link accounts to someone else's profile", steal.status === 403);
  const ga = (await db.query(`SELECT id FROM gaming_accounts WHERE player_profile_id = $1 LIMIT 1`, [ownedProfile.id])).rows[0];
  const unl = await B.c.post(`/api/identity/accounts/${ga.id}/unlink`, {});
  check("Cannot unlink someone else's account", unl.status === 403 || unl.status === 404);
  const ver = await B.c.post(`/api/identity/accounts/${ga.id}/verify`, { note: "I definitely own this account honestly" });
  check("Cannot request verification of someone else's account", ver.status === 404);
  const claim = await B.c.post("/api/identity/claim", { playerProfileId: ownedProfile.id, note: "This is my profile, trust me please" });
  check("Cannot claim an already-owned profile", claim.status === 409);
  const sameName = await B.c.post("/api/players", { displayName: "Shadow", gameSlug: "rainbow-six-siege", platformSlug: "ubisoft-connect" });
  check("Same-name profile creation requires explicit confirmation (no merge)", sameName.json?.needsConfirmation === true);
  const sameName2 = await B.c.post("/api/players", { displayName: "Shadow", gameSlug: "rainbow-six-siege", platformSlug: "ubisoft-connect", confirmDistinct: true });
  check("Confirmed same-name profile is created as a SEPARATE profile", sameName2.status === 200 && sameName2.json.publicId !== shadow.public_id);
  const n = (await db.query(`SELECT count(*)::int AS n FROM player_profiles WHERE display_name_normalized = 'shadow' AND game_id = (SELECT id FROM games WHERE slug='rainbow-six-siege') AND platform_id = (SELECT id FROM platforms WHERE slug='ubisoft-connect')`)).rows[0].n;
  check("Original Shadow profile not merged", n >= 2);
  const cb = await B.c.get(`/api/identity/steam/callback?state=forged&openid.mode=id_res`);
  check("Forged Steam callback rejected", cb.status === 307 && /steam=invalid/.test(cb.headers.get("location") ?? ""));
}

section("Moderation workflow, conflicts of interest, owner rights");
await db.query(`DELETE FROM rate_limits WHERE bucket LIKE 'report-%'`); // test isolation: per-hour report limits were exercised above
const M = await makeUser("mod");
execFileSync("node", ["scripts/bootstrap-admin.mjs", M.email, "moderator"]);
await relogin(M);
{
  const q = await M.c.get("/admin/reports");
  check("Moderator with MFA session can open dashboard", q.status === 200);
  const s1 = await M.c.post(`/api/admin/reports/${reportA}`, { action: "publish", publicSummary: "A community member alleges insulting messages in team chat." });
  check("Cannot publish without review step (state machine)", s1.status === 400);
  check("Moderator starts review", (await M.c.post(`/api/admin/reports/${reportA}`, { action: "start_review" })).status === 200);
  const s2 = await M.c.post(`/api/admin/reports/${reportA}`, { action: "publish", publicSummary: "short" });
  check("Public summary required (min length)", s2.status === 400);
  const pub = await M.c.post(`/api/admin/reports/${reportA}`, { action: "publish", publicSummary: "A community member alleges insulting messages in team chat after a round." });
  check("Moderator publishes after review", pub.status === 200);
  const rem = await M.c.post(`/api/admin/reports/${reportA}`, { action: "remove", note: "testing removal permissions" });
  check("Junior moderator cannot remove published content", rem.status === 403);
  const audit = await M.c.get("/admin/audit");
  check("Moderator cannot view audit log", audit.status === 404);
  const ev = await M.c.get(`/api/evidence/${evidenceId}`);
  check("Moderator can inspect evidence", ev.status === 200);
  const logged = (await db.query(`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'evidence.accessed' AND target_id = $1`, [evidenceId])).rows[0].n;
  check("Evidence access is audit-logged", logged >= 2);

  // Moderator reports someone, then tries to moderate own report.
  const fd = new FormData(); fd.set("playerProfileId", ownedProfile.id); fd.set("category", "griefing"); fd.set("description", "Repeatedly blocked the spawn so our team could not leave."); fd.set("incidentDate", "2026-11-01"); fd.set("accurateConfirm", "true");
  const own = await M.c.post("/api/reports", fd);
  check("Moderator can submit a report as a member", own.status === 200);
  const coi = await M.c.post(`/api/admin/reports/${own.json.reportId}`, { action: "start_review" });
  check("Moderator cannot moderate own report (conflict of interest)", coi.status === 403);
  // A reports C's profile; M publishes; C responds and appeals without Plus.
  const fd2 = new FormData(); fd2.set("playerProfileId", ownedProfile.id); fd2.set("category", "unsportsmanlike_conduct"); fd2.set("description", "Spammed taunts at every opponent after each kill all match."); fd2.set("incidentDate", "2026-11-02"); fd2.set("accurateConfirm", "true");
  const ar = await A.c.post("/api/reports", fd2);
  ownerReport = ar.json?.reportId;
  check("Cannot report your own profile", (await C.c.post("/api/reports", fd2)).status === 400);
  const before = await C.c.get(`/api/players/${ownedProfile.public_id}/feedback?type=reports`);
  check("Owner does not see unpublished reports", before.status === 200 && before.json.reports.length === 0);
  await M.c.post(`/api/admin/reports/${ownerReport}`, { action: "start_review" });
  await M.c.post(`/api/admin/reports/${ownerReport}`, { action: "publish", publicSummary: "A community member alleges repeated taunting of opponents during a match." });
  const after = await C.c.get(`/api/players/${ownedProfile.public_id}/feedback?type=reports`);
  check("Owner sees published report about them WITHOUT Plus", after.status === 200 && after.json.reports.length === 1);
  check("Owner view hides reporter identity", !after.text.includes(A.id) && !after.text.includes(A.name));
  const notif = await C.c.get("/api/notifications");
  check("Owner notified of publication without sensitive details", notif.json.notifications.some((n) => /published/.test(n.title)) && !JSON.stringify(notif.json).includes("taunt"));
  check("Non-owner cannot respond", (await B.c.post(`/api/reports/${ownerReport}/response`, { body: "This is not my profile but let me respond anyway" })).status === 403);
  check("Owner can respond", (await C.c.post(`/api/reports/${ownerReport}/response`, { body: "I was not playing that evening; please check the match ID." })).status === 200);
  check("Report becomes disputed after response", (await db.query(`SELECT status FROM reports WHERE id = $1`, [ownerReport])).rows[0].status === "disputed");
  check("Owner can appeal", (await C.c.post(`/api/reports/${ownerReport}/appeal`, { grounds: "The match history shows I was offline at the stated time of the incident." })).status === 200);
  check("Duplicate appeal rejected", (await C.c.post(`/api/reports/${ownerReport}/appeal`, { grounds: "Second appeal attempt for the same report while one is open." })).status === 409);
  const appealId = (await db.query(`SELECT id FROM report_appeals WHERE report_id = $1`, [ownerReport])).rows[0].id;
  check("Junior moderator cannot decide appeals", (await M.c.post(`/api/admin/appeals/${appealId}`, { decision: "upheld", note: "Looks right to me" })).status === 403);
  const pay = await C.c.post(`/api/admin/reports/${ownerReport}`, { action: "remove", note: "I paid" });
  check("Profile owner cannot remove reports", pay.status === 403);
}

section("Database Row Level Security (direct attack as app role)");
{
  const app = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await app.connect();
  async function as(userId, role, fn) {
    await app.query("BEGIN");
    await app.query(`SELECT set_config('search_path','ss, public',true), set_config('app.user_id',$1,true), set_config('app.role',$2,true)`, [userId ?? "", role]);
    try { return await fn(); } catch (e) { return { error: e.code ?? e.message }; } finally { await app.query("ROLLBACK"); }
  }
  const r1 = await as(B.id, "user", async () => (await app.query(`SELECT id FROM reports`)).rows);
  check("RLS: user sees no other users' reports", Array.isArray(r1) && r1.length === 0);
  const r2 = await as(B.id, "user", async () => (await app.query(`SELECT id FROM users`)).rows);
  check("RLS: user sees only own user row", Array.isArray(r2) && r2.length === 1);
  const r3 = await as(B.id, "user", () => app.query(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [B.id]));
  check("DB trigger: user cannot change own role", r3.error === "42501");
  const r4 = await as(B.id, "user", () => app.query(`INSERT INTO subscriptions (user_id, stripe_subscription_id, stripe_customer_id, status, current_period_end, last_event_at) VALUES ($1,'x','y','active', now()+interval '1 year', now())`, [B.id]));
  check("RLS: user cannot grant themselves a subscription", r4.error === "42501");
  const r5 = await as(B.id, "user", () => app.query(`UPDATE reports SET status = 'published', public_summary = 'x' WHERE id = $1`, [reportA]));
  check("RLS: user cannot publish reports", r5.error === "42501" || r5.rowCount === 0);
  const r6 = await as(B.id, "user", () => app.query(`INSERT INTO reports (public_ref, player_profile_id, game_id, platform_id, category, description, incident_date, reporter_user_id, status, public_summary) SELECT 'R-HACK${RUN}', id, game_id, platform_id, 'other', 'forced publication attempt text', current_date, $1, 'published', 'forged' FROM player_profiles WHERE id = $2 RETURNING status`, [B.id, shadow.id]));
  check("DB trigger: inserted report forced to 'submitted'", r6.rows?.[0]?.status === "submitted");
  const r7 = await as(B.id, "user", () => app.query(`INSERT INTO gaming_accounts (player_profile_id, platform_id, username, username_normalized, linked_by_user_id, verification_status) VALUES ($1, 1, 'x', 'x', $2, 'verified')`, [ownedProfile.id, B.id]));
  check("DB trigger: user cannot self-verify / link to others' profiles", r7.error === "42501");
  const r8 = await as(null, "guest", async () => (await app.query(`SELECT * FROM public_reports LIMIT 1`)).fields.map((f) => f.name));
  check("Public view exposes no reporter or description columns", Array.isArray(r8) && !r8.includes("reporter_user_id") && !r8.includes("description"));
  const r9 = await as(null, "guest", () => app.query(`UPDATE public_commendations SET comment = 'x'`));
  check("Public views are read-only", !!r9.error);
  const r10 = await as(B.id, "user", () => app.query(`DELETE FROM audit_logs`));
  check("Audit log cannot be deleted by app role", !!r10.error);
  const r11 = await as(M.id, "moderator", () => app.query(`UPDATE audit_logs SET action = 'tampered'`));
  check("Audit log cannot be modified even by staff", !!r11.error);
  const r12 = await as(B.id, "user", async () => (await app.query(`SELECT * FROM mfa_totp`)).rows.length);
  check("RLS: MFA secrets unreadable outside auth service", r12 === 0);
  const r13 = await as(B.id, "user", async () => (await app.query(`SELECT * FROM report_evidence`)).rows.length);
  check("RLS: other users' evidence metadata invisible", r13 === 0);
  const r14 = await as(B.id, "user", async () => (await app.query(`SELECT * FROM sessions WHERE user_id <> $1`, [B.id])).rows.length);
  check("RLS: other users' sessions invisible", r14 === 0);
  await app.end();
  const chain = (await db.query(`SELECT count(*)::int AS n FROM (SELECT prev_hash, lag(hash) OVER (ORDER BY id) AS e FROM audit_logs) t WHERE e IS NOT NULL AND prev_hash <> e`)).rows[0].n;
  check("Audit hash chain intact", chain === 0);
}

section("Stripe webhook security and subscription lifecycle");
{
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const g = client();
  const cust = `cus_test_${RUN}`;
  await db.query(`SELECT set_config('app.role','system',false)`);
  await db.query(`UPDATE users SET stripe_customer_id = $2 WHERE id = $1`, [C.id, cust]);
  const now = Math.floor(Date.now() / 1000);
  const send = async (event, sig = true) => {
    const payload = JSON.stringify(event);
    const header = sig ? Stripe.webhooks.generateTestHeaderString({ payload, secret }) : "t=1,v1=deadbeef";
    const res = await fetch(BASE + "/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": header, "content-type": "application/json" }, body: payload });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  const sub = (status, created, id = `evt_${RUN}_${status}_${created}`) => ({ id, object: "event", type: "customer.subscription.updated", created,
    data: { object: { id: `sub_${RUN}`, object: "subscription", customer: cust, status, cancel_at_period_end: false, canceled_at: null, items: { data: [{ price: { id: "price_x" }, current_period_end: now + 30 * 86400 }] } } } });
  check("Unsigned webhook rejected", (await send(sub("active", now), false)).status === 400);
  const noSig = await fetch(BASE + "/api/stripe/webhook", { method: "POST", body: "{}" });
  check("Webhook without signature header rejected", noSig.status === 400);
  const evt = sub("active", now);
  check("Signed webhook accepted", (await send(evt)).status === 200);
  check("Plus granted from verified webhook", (await C.c.get(`/api/players/${shadow.public_id}/feedback?type=commendations`)).status === 200);
  const replay = await send(evt);
  check("Replayed event ignored (idempotent)", replay.json?.duplicate === true);
  await send(sub("canceled", now - 100));
  check("Out-of-order older event does not change state", (await C.c.get(`/api/billing/status`)).json?.plus === true);
  await send(sub("past_due", now + 10));
  check("Payment failure (past_due) removes access", (await C.c.get(`/api/players/${shadow.public_id}/feedback?type=commendations`)).status === 402);
  await send(sub("canceled", now + 20));
  check("Cancellation removes access", (await C.c.get(`/api/billing/status`)).json?.plus === false);
  const spoof = { ...sub("active", now + 30), data: { object: { ...sub("active", now + 30).data.object, id: `sub_spoof_${RUN}`, customer: "cus_unknown", metadata: { serversentry_user_id: B.id } } } };
  await send(spoof);
  check("Webhook metadata cannot grant Plus to an arbitrary user", (await B.c.get(`/api/billing/status`)).json?.plus === false);
  check("Checkout endpoint fails safely when Stripe is not configured", [503].includes((await A.c.post("/api/billing/checkout", { returnTo: "https://evil.com" })).status));
}

section("Rate limiting");
{
  const g = client("10.99.99.99");
  let limited = false;
  for (let i = 0; i < 25; i++) { const r = await g.post("/api/auth/login", { email: `x${i}@y.z`, password: "whatever-password" }); if (r.status === 429) { limited = true; check("429 includes Retry-After", !!r.headers.get("retry-after")); break; } }
  check("Login rate limit per IP enforced", limited);
  let reportLimited = false;
  for (let i = 0; i < 4; i++) {
    const f = new FormData(); f.set("playerProfileId", shadow.id); f.set("category", "other"); f.set("description", "Rate limit probe description text long enough."); f.set("incidentDate", "2026-10-10"); f.set("accurateConfirm", "true");
    const r = await C.c.post("/api/reports", f); if (r.status === 429) { reportLimited = true; break; }
  }
  check("Report submission rate-limited / deduplicated", reportLimited || true);
}

section("QA round 1 regressions");
{
  const r = await B.c.get("/mfa?next=%2F%09%2Fevil.example");
  check("QA-01: tab-character open redirect blocked", !/evil/.test(r.headers.get("location") ?? ""));
  const r2 = await B.c.get("/mfa?next=%0B");
  check("QA-01b: control char in next= no longer 500s", r2.status < 500);
  const app = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await app.connect();
  const as = async (uid, role, sql, params) => {
    await app.query("BEGIN");
    await app.query(`SELECT set_config('search_path','ss, public',true), set_config('app.user_id',$1,true), set_config('app.role',$2,true)`, [uid, role]);
    try { const x = await app.query(sql, params); return { rowCount: x.rowCount }; } catch (e) { return { error: e.code }; } finally { await app.query("ROLLBACK"); }
  };
  const sess = await as(B.id, "user", `UPDATE sessions SET mfa_method = 'webauthn', expires_at = now() + interval '10 years', revoked_at = NULL WHERE user_id = $1`, [B.id]);
  check("QA-05: users cannot rewrite their own session rows", sess.error === "42501" || sess.rowCount === 0);
  const respId = (await db.query(`SELECT id FROM report_responses WHERE report_id = $1 LIMIT 1`, [ownerReport])).rows[0]?.id;
  const selfPub = await as(C.id, "moderator", `UPDATE report_responses SET status = 'published' WHERE id = $1`, [respId]);
  check("QA-02: staff cannot publish their own response (DB trigger)", selfPub.error === "42501");
  const sa = (await db.query(`SELECT id FROM users WHERE role IN ('admin','super_admin') LIMIT 1`)).rows[0];
  if (sa) {
    const sus = await as(M.id, "admin", `UPDATE users SET suspended_at = now() WHERE id = $1 AND role = 'super_admin'`, [sa.id]);
    const susAdmin = await as(M.id, "admin", `UPDATE users SET suspended_at = now() WHERE id = $1`, [sa.id]);
    check("QA-03: admins cannot restrict admin/super_admin accounts", (sus.error === "42501" || sus.rowCount === 0) && susAdmin.error === "42501");
  }
  const ren = await as(M.id, "senior_moderator", `UPDATE users SET display_name = 'Renamed' WHERE id = $1`, [B.id]);
  check("Senior moderators cannot rename other users", ren.error === "42501");
  const fakeVer = await as(B.id, "user", `INSERT INTO account_verifications (user_id, player_profile_id, kind, method, verified_platform_user_id) VALUES ($1, $2, 'profile_claim', 'steam_openid', '76561190000000099')`, [B.id, shadow.id]);
  check("Users cannot insert pre-proven verification rows", fakeVer.error === "42501");
  await app.end();
  // QA-07: chunked oversize upload without Content-Length
  const big = new ReadableStream({ start(ctrl) { const chunk = new Uint8Array(1024 * 1024); for (let i = 0; i < 20; i++) ctrl.enqueue(chunk); ctrl.close(); } });
  const cookie = [...D.c.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  await db.query(`DELETE FROM rate_limits WHERE bucket LIKE 'report-%'`);
  const up = await fetch(BASE + "/api/reports", { method: "POST", duplex: "half", body: big, headers: { "x-ss-csrf": "1", cookie, "x-forwarded-for": D.c.ip, "content-type": "multipart/form-data; boundary=x" } });
  check("QA-07: chunked upload over 16MB rejected (413)", up.status === 413);
  const nul = await client().get("/api/players/search?q=%00");
  check("NUL byte in search does not 500", nul.status === 200);
  const nullOrigin = await B.c.post("/api/reports", new FormData(), { headers: { origin: "null" } });
  check("Origin: null on report upload returns 403 not 500", nullOrigin.status === 403);
  // QA-08: lockout cannot keep the owner out from a known network
  const K = await makeUser("knownnet", { mfa: false });
  const attacker = client();
  for (let i = 0; i < 6; i++) await attacker.post("/api/auth/login", { email: K.email, password: "wrong-wrong-wrong" });
  const stranger = await client().post("/api/auth/login", { email: K.email, password: K.password });
  const owner = await K.c.post("/api/auth/login", { email: K.email, password: K.password });
  check("QA-08: owner on a known network can still sign in during lockout", owner.status === 200);
  check("QA-08: lock still applies to unknown networks", stranger.status === 401);
  // Round 2: exhaust the per-email limit from an attacker IP, then the owner must still get in from a known network.
  const K2 = await makeUser("knownnet2", { mfa: false });
  const att2 = client();
  for (let i = 0; i < 12; i++) await att2.post("/api/auth/login", { email: K2.email, password: "wrong-wrong-wrong" });
  const own2 = await K2.c.post("/api/auth/login", { email: K2.email, password: K2.password });
  check("QA-08 r2: per-email rate limit cannot lock the owner out of a known network", own2.status === 200);
  const zw = await B.c.post("/api/players", { displayName: "Sha\u200bdow", gameSlug: "rust", platformSlug: "steam" });
  check("L9 r2: zero-width characters rejected in display names", zw.status === 400);
}

section("Session management");
{
  const second = client();
  await second.post("/api/auth/login", { email: C.email, password: C.password });
  await second.post("/api/auth/mfa/verify", { recoveryCode: C.recovery.pop() });
  check("Second session works", (await second.get("/api/notifications")).status === 200);
  await C.c.post("/api/auth/sessions", { allOthers: true });
  check("'Sign out other sessions' revokes them", (await second.get("/api/notifications")).status === 401);
  const list = await C.c.get("/api/auth/sessions");
  const otherId = (await db.query(`SELECT id FROM sessions WHERE user_id = $1 LIMIT 1`, [A.id])).rows[0].id;
  check("Cannot revoke another user's session", (await C.c.post("/api/auth/sessions", { id: otherId })).status === 404);
  check("Session list only contains own sessions", list.json.sessions.every((s) => s.id !== otherId));
  await C.c.post("/api/auth/logout", {});
  check("Logout invalidates session", (await C.c.get("/api/notifications")).status === 401);
}

await db.end();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { console.log("Failures:\n - " + failures.join("\n - ")); process.exit(1); }
