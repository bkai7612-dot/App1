import fs from "node:fs";
import path from "node:path";
import { adminClient } from "./_db.mjs";

const client = adminClient();
await client.connect();
await client.query(`CREATE TABLE IF NOT EXISTS public.ss_schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
const dir = path.resolve("migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const done = new Set((await client.query("SELECT name FROM public.ss_schema_migrations")).rows.map((r) => r.name));
for (const f of files) {
  if (done.has(f)) continue;
  process.stdout.write(`Applying ${f} ... `);
  await client.query("BEGIN");
  try {
    await client.query(fs.readFileSync(path.join(dir, f), "utf8"));
    await client.query("INSERT INTO public.ss_schema_migrations (name) VALUES ($1)", [f]);
    await client.query("COMMIT");
    console.log("ok");
  } catch (e) {
    await client.query("ROLLBACK");
    console.log("FAILED");
    console.error(e.message);
    process.exit(1);
  }
}
// Optionally (local/dev) give the app role a login password from env.
if (process.env.APP_DB_PASSWORD && process.env.SS_SET_APP_ROLE_PASSWORD === "true") {
  await client.query(`ALTER ROLE serversentry_app LOGIN PASSWORD '${process.env.APP_DB_PASSWORD.replace(/'/g, "''")}'`);
  console.log("Set login password for serversentry_app.");
}
await client.end();
console.log("Migrations complete.");
