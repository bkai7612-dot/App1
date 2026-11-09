// Creates (or promotes) the first super administrator. Run from a trusted machine with DATABASE_ADMIN_URL.
// Usage: node scripts/bootstrap-admin.mjs <email> [role]   (password read from SS_BOOTSTRAP_PASSWORD or prompted)
import readline from "node:readline";
import { hash } from "@node-rs/argon2";
import { adminClient } from "./_db.mjs";

const [email, role = "super_admin"] = process.argv.slice(2);
if (!email || !["moderator", "senior_moderator", "admin", "super_admin"].includes(role)) {
  console.error("Usage: node scripts/bootstrap-admin.mjs <email> [moderator|senior_moderator|admin|super_admin]"); process.exit(1);
}
async function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((r) => rl.question(q, (a) => { rl.close(); r(a); }));
}
const c = adminClient();
await c.connect();
await c.query("BEGIN");
await c.query("SET LOCAL search_path = ss, public");
await c.query("SELECT set_config('app.role', 'system', true)");
const norm = email.trim().toLowerCase();
const ex = await c.query(`SELECT id FROM users WHERE email_normalized = $1`, [norm]);
let userId;
if (ex.rows[0]) {
  userId = ex.rows[0].id;
  await c.query(`UPDATE users SET role = $2 WHERE id = $1`, [userId, role]);
  console.log(`Promoted existing user to ${role}.`);
} else {
  const pw = process.env.SS_BOOTSTRAP_PASSWORD || (await ask("Password (min 12 chars): "));
  if (!pw || pw.length < 12) { console.error("Password too short"); process.exit(1); }
  const h = await hash(pw, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const r = await c.query(`INSERT INTO users (email, email_normalized, password_hash, display_name, role, email_verified_at) VALUES ($1, $2, $3, $4, $5, now()) RETURNING id`,
    [email.trim(), norm, h, role === "super_admin" ? "Administrator" : "Moderator", role]);
  userId = r.rows[0].id;
  console.log(`Created ${role} ${email}.`);
}
await c.query(`INSERT INTO audit_logs (actor_user_id, actor_role, action, target_type, target_id, detail) VALUES (NULL, 'system', 'bootstrap.role_granted', 'user', $1, $2)`, [userId, JSON.stringify({ role, via: "bootstrap-admin script" })]);
await c.query("COMMIT");
await c.end();
console.log("Next: sign in, then enrol a passkey under Account Settings > Security. Staff powers activate only in MFA-verified sessions (passkey for admins).");
