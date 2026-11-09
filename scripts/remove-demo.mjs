// Removes ALL demonstration data (is_demo = true) and any content attached to demo profiles.
import { adminClient } from "./_db.mjs";
const c = adminClient();
await c.connect();
await c.query("BEGIN");
await c.query("SET LOCAL search_path = ss, public");
await c.query("SELECT set_config('app.role', 'system', true)");
const profs = (await c.query(`SELECT id FROM player_profiles WHERE is_demo`)).rows.map((r) => r.id);
const users = (await c.query(`SELECT id FROM users WHERE is_demo`)).rows.map((r) => r.id);
// report_evidence/responses/appeals cascade from reports; reports & commendations cascade from profiles.
await c.query(`DELETE FROM reports WHERE is_demo OR player_profile_id = ANY($1::uuid[]) OR reporter_user_id = ANY($2::uuid[])`, [profs, users]);
await c.query(`DELETE FROM commendations WHERE is_demo OR player_profile_id = ANY($1::uuid[]) OR submitter_user_id = ANY($2::uuid[])`, [profs, users]);
await c.query(`DELETE FROM gaming_accounts WHERE is_demo OR player_profile_id = ANY($1::uuid[])`, [profs]);
await c.query(`DELETE FROM account_verifications WHERE player_profile_id = ANY($1::uuid[])`, [profs]);
await c.query(`DELETE FROM player_profiles WHERE is_demo`);
await c.query(`DELETE FROM users WHERE is_demo`);
await c.query("COMMIT");
const left = await c.query(`SELECT (SELECT count(*) FROM ss.player_profiles WHERE is_demo) + (SELECT count(*) FROM ss.users WHERE is_demo) + (SELECT count(*) FROM ss.reports WHERE is_demo) + (SELECT count(*) FROM ss.commendations WHERE is_demo) AS n`);
await c.end();
console.log(`Removed ${profs.length} demo profiles and ${users.length} demo users. Remaining demo rows: ${left.rows[0].n}`);
if (Number(left.rows[0].n) !== 0) process.exit(1);
