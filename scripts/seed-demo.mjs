// Seeds CLEARLY-MARKED FICTIONAL demonstration data (is_demo = true everywhere).
// Never run against a production database containing real users.
import crypto from "node:crypto";
import { adminClient, refuseInProduction } from "./_db.mjs";

refuseInProduction("seed demonstration data");
const c = adminClient();
await c.connect();
await c.query("BEGIN");
await c.query("SET LOCAL search_path = ss, public");
await c.query("SELECT set_config('app.role', 'system', true)");

const pid = () => "SS-DEMO" + crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 5);
const ref = () => "R-DEMO" + crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 4);
const id = async (t, slug) => (await c.query(`SELECT id FROM ${t} WHERE slug = $1`, [slug])).rows[0].id;

const existing = await c.query(`SELECT count(*)::int AS n FROM player_profiles WHERE is_demo`);
if (existing.rows[0].n > 0) { console.log("Demo data already present. Run npm run db:remove-demo first to reseed."); await c.query("ROLLBACK"); await c.end(); process.exit(0); }

// Demo users cannot log in (unusable password hash).
const users = [];
for (let i = 1; i <= 8; i++) {
  const r = await c.query(`INSERT INTO users (email, email_normalized, password_hash, display_name, email_verified_at, is_demo, created_at)
    VALUES ($1, $1, '!demo-account-no-login', $2, now(), true, now() - interval '120 days') RETURNING id`, [`demo${i}@demo.serversentry.invalid`, `DemoMember${i}`]);
  users.push(r.rows[0].id);
}
const r6 = await id("games", "rainbow-six-siege"), lol = await id("games", "league-of-legends"), cs2 = await id("games", "counter-strike-2"), val = await id("games", "valorant"), mc = await id("games", "minecraft");
const ubi = await id("platforms", "ubisoft-connect"), steam = await id("platforms", "steam"), riot = await id("platforms", "riot-games"), xbox = await id("platforms", "xbox");
// L-05: console and other popular titles, so the demo isn't PC-only.
const fn = await id("games", "fortnite"), bo6 = await id("games", "call-of-duty-black-ops-6"), fc = await id("games", "ea-sports-fc-26"), apex = await id("games", "apex-legends");
const psn = await id("platforms", "playstation-network"), epic = await id("platforms", "epic-games"), ea = await id("platforms", "ea-app");

async function profile(name, game, platform, opts = {}) {
  const r = await c.query(`INSERT INTO player_profiles (public_id, display_name, display_name_normalized, game_id, platform_id, platform_user_id, is_demo, created_at, last_active_at)
    VALUES ($1, $2, lower($2), $3, $4, $5, true, now() - interval '200 days', now() - ($6 || ' days')::interval) RETURNING id, public_id`,
    [pid(), name, game, platform, opts.platformUserId ?? null, String(opts.activeDaysAgo ?? 3)]);
  const p = r.rows[0];
  await c.query(`INSERT INTO gaming_accounts (player_profile_id, platform_id, platform_user_id, username, username_normalized, verification_status, verification_method, is_demo, last_verified_at)
    VALUES ($1, $2, $3, $4, lower($4), $5, $6, true, CASE WHEN $5 = 'verified' THEN now() - interval '30 days' END)`,
    [p.id, platform, opts.status === "verified" ? opts.platformUserId ?? null : null, name, opts.status ?? "unverified", opts.status === "verified" ? "manual_review" : null]);
  return p;
}

const CATS = ["excellent_teammate", "helpful_player", "great_communication", "good_sportsmanship", "friendly_opponent", "team_leadership", "fair_play"];
const COMMENTS = ["Called every rotation clearly. Great to play with.", "Stayed calm when we were down 1-4 and helped us turn it around.", "Explained the map callouts to a new player without any attitude.", null, "GG. Super respectful even after a rough loss.", null, "Fantastic shot-calling, never flamed anyone.", null, "Helped me learn defender setups.", "Always fair, never abused bugs."];
async function commend(p, game, platform, n) {
  for (let i = 0; i < n; i++) {
    await c.query(`INSERT INTO commendations (player_profile_id, game_id, platform_id, category, comment, submitter_user_id, status, is_demo, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'approved', true, now() - ($7 || ' days')::interval)`,
      [p.id, game, platform, CATS[i % CATS.length], COMMENTS[i % COMMENTS.length], users[Math.floor(i / CATS.length) + (i % 3)], String(10 + i * 17)]);
  }
}
const REPORTS = [
  ["harassment", "published", "A community member alleges this player sent repeated insulting messages in team chat during a ranked match.", null, null],
  ["unsportsmanlike_conduct", "published", "A community member alleges this player deliberately team-killed after losing a round.", null, null],
  ["griefing", "disputed", "A community member alleges this player repeatedly destroyed team reinforcements during setup phase.", null, null],
  ["abusive_behaviour", "appealed", "A community member alleges abusive language in voice chat towards a teammate.", null, null],
  ["suspected_cheating", "published", "A community member alleges unusually precise tracking through walls. This is an unverified allegation; ServerSentry does not determine whether cheating occurred.", null, null],
  ["harassment", "resolved", "A community member alleged repeated hostile messages after a match.", "upheld", "After reviewing the submitted screenshots, a moderator found the report consistent with our Community Guidelines on harassment."],
];
async function report(p, game, platform, k, i) {
  const [cat, status, summary, ot, on] = k;
  const r = await c.query(`INSERT INTO reports (public_ref, player_profile_id, game_id, platform_id, category, description, incident_date, reporter_user_id, status, public_summary, outcome_type, outcome_note, published_at, resolved_at, is_demo, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, (now() - ($7 || ' days')::interval)::date, $8, $9, $10, $11, $12, now() - ($13 || ' days')::interval, CASE WHEN $9 = 'resolved' THEN now() - interval '2 days' END, true, now() - ($7 || ' days')::interval) RETURNING id`,
    [ref(), p.id, game, platform, cat, "FICTIONAL DEMONSTRATION REPORT. This text represents a reporter's private description and is never shown publicly.", String(20 + i * 9), users[i % users.length], status, summary, ot, on, String(15 + i * 8)]);
  if (status === "disputed") await c.query(`INSERT INTO report_responses (report_id, body, status, created_at) VALUES ($1, 'Demo response: I was setting up a rotation hole the team agreed on in voice chat. Happy for moderators to review.', 'published', now() - interval '5 days')`, [r.rows[0].id]);
  if (status === "appealed") await c.query(`INSERT INTO report_appeals (report_id, grounds, status) VALUES ($1, 'Demo appeal: the match in question was a custom game among friends and the language was mutual banter.', 'submitted')`, [r.rows[0].id]);
}

const shadow = await profile("Shadow", r6, ubi, { status: "unverified", activeDaysAgo: 1 });
await commend(shadow, r6, ubi, 10);
for (let i = 0; i < REPORTS.length; i++) await report(shadow, r6, ubi, REPORTS[i], i);
// a pending report and a rejected one so all statistics are demonstrated
await c.query(`INSERT INTO reports (public_ref, player_profile_id, game_id, platform_id, category, description, incident_date, reporter_user_id, status, is_demo)
  VALUES ($1, $2, $3, $4, 'griefing', 'FICTIONAL DEMONSTRATION REPORT awaiting moderation.', current_date - 3, $5, 'submitted', true)`, [ref(), shadow.id, r6, ubi, users[7]]);
await c.query(`INSERT INTO reports (public_ref, player_profile_id, game_id, platform_id, category, description, incident_date, reporter_user_id, status, is_demo)
  VALUES ($1, $2, $3, $4, 'other', 'FICTIONAL DEMONSTRATION REPORT that was rejected by moderators.', current_date - 40, $5, 'rejected', true)`, [ref(), shadow.id, r6, ubi, users[6]]);

// Same username, different identities: must remain separate profiles.
const shadow2 = await profile("Shadow", cs2, steam, { status: "verified", platformUserId: "76561190000000001", activeDaysAgo: 12 });
await commend(shadow2, cs2, steam, 4);
await profile("Shadow", r6, xbox, { activeDaysAgo: 40 });
const nova = await profile("NovaStrike", val, riot, { status: "possible_match", activeDaysAgo: 2 });
await commend(nova, val, riot, 7);
const aurora = await profile("AuroraBuilds", mc, xbox, { activeDaysAgo: 5 });
await commend(aurora, mc, xbox, 3);
await profile("Kestrel", lol, riot, { activeDaysAgo: 8 });
const pixel = await profile("PixelRanger", fn, epic, { activeDaysAgo: 2 });
await commend(pixel, fn, epic, 5);
const ghost = await profile("GhostlyAim", bo6, psn, { activeDaysAgo: 1 });
await commend(ghost, bo6, psn, 3);
await report(ghost, bo6, psn, ["unsportsmanlike_conduct", "published", "A community member alleges repeated taunting of opponents after each elimination in public matches.", null, null], 1);
const volley = await profile("VolleyKing", fc, psn, { activeDaysAgo: 4 });
await commend(volley, fc, psn, 6);
const drift = await profile("DriftWraith", apex, ea, { activeDaysAgo: 6 });
await commend(drift, apex, ea, 2);

// Community votes (free members) and moderator-approved comments (Plus members).
async function votes(p, up, down) {
  for (let i = 0; i < up + down; i++) await c.query(`INSERT INTO player_votes (voter_user_id, player_profile_id, value, is_demo) VALUES ($1, $2, $3, true)`, [users[i % users.length], p.id, i < up ? 1 : -1]);
}
// Only 8 demo voters exist, so each profile can get at most 8 votes.
await votes(shadow, 5, 3); await votes(shadow2, 4, 0); await votes(nova, 6, 1); await votes(aurora, 3, 0); await votes(ghost, 3, 2); await votes(volley, 5, 0);
const PLAYER_COMMENTS = [
  [shadow, "positive", "Solid anchor on defence and always shares intel. Queued with him five times this season and every game was positive.", 6],
  [shadow, "negative", "Got very heated in voice chat after we lost the first two rounds. Calmed down later but it wasn't fun.", 14],
  [shadow, "neutral", "Mixed experience. Good callouts, but tends to go off on his own and ignore the plan.", 30],
  [nova, "positive", "Patient with newer players and explains utility usage clearly.", 9],
];
for (const [p, tone, body, days] of PLAYER_COMMENTS) {
  await c.query(`INSERT INTO player_comments (player_profile_id, author_user_id, tone, body, status, is_demo, created_at, moderated_at)
    VALUES ($1, $2, $3, $4, 'approved', true, now() - ($5 || ' days')::interval, now() - ($5 || ' days')::interval)`, [p.id, users[days % users.length], tone, body, String(days)]);
}
await c.query(`INSERT INTO player_comments (player_profile_id, author_user_id, tone, body, status, is_demo) VALUES ($1, $2, 'negative', 'Kept spamming the same voice line all match, even after the team asked them to stop.', 'pending', true)`, [shadow.id, users[5]]);

await c.query("COMMIT");
await c.end();
console.log("Seeded fictional demonstration data. Try searching for 'Shadow'.");
