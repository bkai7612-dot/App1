// Shared helper for maintenance scripts. Uses the OWNER/ADMIN connection (DATABASE_ADMIN_URL),
// which is never available to the web application at runtime.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

export function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    const p = path.resolve(process.cwd(), f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m || process.env[m[1]] !== undefined) continue;
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
    }
  }
}

export function adminClient() {
  loadEnv();
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) { console.error("DATABASE_ADMIN_URL is required for maintenance scripts."); process.exit(1); }
  const isLocal = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url);
  return new pg.Client({ connectionString: url, ssl: isLocal ? undefined : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" } });
}

export function refuseInProduction(what) {
  if ((process.env.SS_LAUNCH_MODE ?? "development") === "production") {
    console.error(`Refusing to ${what} while SS_LAUNCH_MODE=production.`);
    process.exit(1);
  }
}
