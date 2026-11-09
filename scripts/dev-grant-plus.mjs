// DEVELOPMENT ONLY: simulate an active ServerSentry Plus subscription without Stripe, for local testing.
import { adminClient, refuseInProduction } from "./_db.mjs";
refuseInProduction("grant fake subscriptions");
const [email, action = "grant"] = process.argv.slice(2);
if (!email) { console.error("Usage: node scripts/dev-grant-plus.mjs <email> [grant|revoke|past_due]"); process.exit(1); }
const c = adminClient();
await c.connect();
await c.query("SET search_path = ss, public");
await c.query("SELECT set_config('app.role', 'system', false)");
const u = (await c.query(`SELECT id FROM users WHERE email_normalized = $1`, [email.toLowerCase()])).rows[0];
if (!u) { console.error("No such user"); process.exit(1); }
const status = action === "grant" ? "active" : action === "past_due" ? "past_due" : "canceled";
await c.query(`INSERT INTO subscriptions (user_id, stripe_subscription_id, stripe_customer_id, status, current_period_end, last_event_at)
  VALUES ($1::uuid, 'dev_sub_' || $1::text, 'dev_cus_' || $1::text, $2, now() + interval '30 days', now())
  ON CONFLICT (stripe_subscription_id) DO UPDATE SET status = EXCLUDED.status, current_period_end = EXCLUDED.current_period_end, last_event_at = now()`, [u.id, status]);
await c.end();
console.log(`Dev subscription for ${email}: ${status}`);
