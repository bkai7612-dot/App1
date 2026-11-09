// Triggers the retention job via the protected cron endpoint (same code path as Vercel Cron).
import { loadEnv } from "./_db.mjs";
loadEnv();
const url = `${process.env.APP_URL ?? "http://localhost:3000"}/api/cron/retention`;
const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
console.log(res.status, await res.text());
if (!res.ok) process.exit(1);
