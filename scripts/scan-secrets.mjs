// Scans the repository and (if present) the Next.js client build output for leaked secrets.
import fs from "node:fs";
import path from "node:path";
const PATTERNS = [
  ["Stripe live secret key", /sk_live_[0-9a-zA-Z]{10,}/], ["Stripe test secret key", /sk_test_[0-9a-zA-Z]{10,}/],
  ["Stripe webhook secret", /whsec_[0-9a-zA-Z]{10,}/], ["Stripe restricted key", /rk_(live|test)_[0-9a-zA-Z]{10,}/],
  ["Supabase service role JWT", /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]*cm9sZSI6InNlcnZpY2Vfcm9sZS/],
  ["Private key", /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/], ["Resend key", /re_[A-Za-z0-9]{20,}/],
  ["Postgres URL with password", /postgres(ql)?:\/\/[^:\s/]+:[^@\s]{6,}@(?!localhost|127\.0\.0\.1)/],
  ["AWS key", /AKIA[0-9A-Z]{16}/], ["GitHub token", /gh[pousr]_[A-Za-z0-9]{30,}/],
];
const SKIP = new Set(["node_modules", ".git", "storage", ".next"]); // .next/static (client bundle) is scanned separately below
const findings = [];
function walk(dir, clientOnly = false) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (SKIP.has(e.name) || SKIP.has(path.relative(".", p))) continue;
    if (e.isDirectory()) { walk(p, clientOnly); continue; }
    if (/\.(png|jpe?g|webp|ico|woff2?|gz|map)$/.test(e.name) || [".env.local", ".env"].includes(e.name)) continue;
    const s = fs.statSync(p); if (s.size > 5_000_000) continue;
    const text = fs.readFileSync(p, "utf8");
    for (const [name, re] of PATTERNS) if (re.test(text)) findings.push(`${name}: ${p}`);
    if (clientOnly) for (const v of ["SUPABASE_SERVICE_ROLE_KEY", "STRIPE_SECRET_KEY", "APP_ENCRYPTION_KEY", "APP_HMAC_SECRET", "DATABASE_URL", "STRIPE_WEBHOOK_SECRET"]) {
      const val = process.env[v]; if (val && val.length > 8 && text.includes(val)) findings.push(`Value of ${v} found in client bundle: ${p}`);
    }
  }
}
for (const l of fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8").split("\n") : []) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
walk(".");
walk(".next/static", true);
const tracked = fs.existsSync(".gitignore") ? fs.readFileSync(".gitignore", "utf8") : "";
if (!/^\.env$/m.test(tracked) || !/^\.env\.\*$/m.test(tracked)) findings.push(".gitignore does not exclude .env files");
if (findings.length) { console.error("Potential secrets found:\n" + findings.join("\n")); process.exit(1); }
console.log("No secrets detected in source or client bundle.");
