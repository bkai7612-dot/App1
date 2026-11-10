# Deployment (Vercel + Supabase)

> Do not deploy with real users or live payments until every launch gate in [COMPLIANCE.md](COMPLIANCE.md#launch-gates) is approved. With `SS_LAUNCH_MODE=production` the app keeps registration, payments and report submission/publication **disabled** until the gates are listed in `SS_LAUNCH_GATES_APPROVED`.

## 1. Supabase (separate projects for staging and production)

1. Create a project in a UK/EU region. Enable **Point-in-Time Recovery** (Pro plan) and note the backup retention.
2. Run the migrations from a trusted machine:

   ```bash
   DATABASE_ADMIN_URL="postgres://postgres:<pw>@db.<ref>.supabase.co:5432/postgres?sslmode=require" npm run db:migrate
   ```

   Do **not** set `SS_SET_APP_ROLE_PASSWORD` in production. Set the app role's password manually in the SQL editor:

   ```sql
   ALTER ROLE serversentry_app LOGIN PASSWORD '<long random>';
   ```

3. Runtime connection: use the Supavisor **transaction pooler** URL with user `serversentry_app.<project-ref>` and `sslmode=require`. All objects live in schema `ss`, which is **not** exposed through the Supabase Data API. The migration revokes `anon`/`authenticated` access; keep `ss` out of "Exposed schemas".
4. Storage: create a **private** bucket called `evidence` (no public access, 5 MB file limit, allowed MIME types `image/png,image/jpeg,image/webp`). Evidence is only served via the app (access-checked, audited) through 60-second signed URLs.
5. Never put the service-role key anywhere except the Vercel server environment variable `SUPABASE_SERVICE_ROLE_KEY`.

## 2. Vercel

1. Import the repository. The framework preset is Next.js and the Node.js runtime is ≥ 20.
2. Set the environment variables (Production and Preview **separately**; never reuse production secrets in preview):

   | Variable | Notes |
   |---|---|
   | `APP_URL` | e.g. `https://serversentry.example` (must match the passkey RP ID domain) |
   | `SS_LAUNCH_MODE` | `staging` or `production` |
   | `SS_LAUNCH_GATES_APPROVED` | comma-separated approved gate IDs |
   | `DATABASE_URL` | app role, pooler, TLS |
   | `APP_ENCRYPTION_KEY`, `APP_HMAC_SECRET` | 32 random bytes each, unique per environment |
   | `WEBAUTHN_RP_ID` | apex domain, e.g. `serversentry.example` |
   | `STORAGE_DRIVER=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_EVIDENCE_BUCKET` | |
   | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PLUS_MONTHLY` | see [STRIPE.md](STRIPE.md) |
   | `RESEND_API_KEY`, `EMAIL_FROM` | verified sending domain (SPF/DKIM/DMARC) |
   | `OPERATOR_LEGAL_NAME`, `OPERATOR_COMPANY_NUMBER`, `OPERATOR_ADDRESS`, `CONTACT_EMAIL`, `PRIVACY_EMAIL`, `COMPLAINTS_EMAIL`, `ICO_REGISTRATION_NUMBER` | Public legal details shown on Terms, Privacy and Complaints. Pages say "(not yet configured)" until set: **required before launch** |
   | `CRON_SECRET` | random; Vercel Cron sends it as a Bearer token |
   | `STEAM_WEB_API_KEY` | optional |

   Never set `DATABASE_ADMIN_URL`, `DEV_EMAIL_OUTBOX` or `TRUSTED_IP_HEADER` on Vercel. Never prefix secrets with `NEXT_PUBLIC_`.
3. `vercel.json` schedules `/api/cron/retention` daily.
4. Add a custom domain. HSTS is sent automatically; submit the domain to the HSTS preload list only once you're sure.
5. Before each release, run the CI checks:

   ```bash
   npm ci && npm run typecheck && npm test && npm run build && npm run scan:secrets && npm run audit:deps
   ```

## 3. Backups and restoration

- **Database:** Supabase daily backups plus PITR. Monthly, **restore into a scratch project**, run `npm run db:migrate` (it should be a no-op) and a smoke test, then record the result in the launch-gate evidence.
- **Storage:** evidence is intentionally short-lived (see the retention schedule). If you need storage backups, mirror the bucket to encrypted, access-restricted storage with the same deletion schedule.
- **Secrets:** stored in Vercel/Supabase only. Rotation procedures are in [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md#credential-rotation).

## 4. Removing demo data before launch

```bash
DATABASE_ADMIN_URL=... npm run db:remove-demo
```

This exits non-zero if any demo rows remain. Never run `db:seed-demo` against production (the script refuses when `SS_LAUNCH_MODE=production`).
