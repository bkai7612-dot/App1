# Local setup

Prerequisites: Node.js ≥ 20.11 (22 recommended), PostgreSQL 15+ (local or a Supabase **development** project).

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a database, for example:

   ```bash
   createdb serversentry
   ```

3. Copy the template and edit it:

   ```bash
   cp .env.example .env.local
   ```

   - `DATABASE_ADMIN_URL`: an owner connection, used only by scripts.
   - `DATABASE_URL`: `postgres://serversentry_app:<APP_DB_PASSWORD>@localhost:5432/serversentry` (least-privilege role created by the migration).
   - `APP_DB_PASSWORD` and `SS_SET_APP_ROLE_PASSWORD=true` (local only; lets the migration set that role's password).
   - Generate `APP_ENCRYPTION_KEY` and `APP_HMAC_SECRET` (each line of output is one value):

     ```bash
     node -e "for (let i=0;i<2;i++) console.log(require('crypto').randomBytes(32).toString('base64'))"
     ```

   - For local testing also set:

     ```
     TRUSTED_IP_HEADER=x-forwarded-for
     DEV_EMAIL_OUTBOX=./storage/dev-outbox.jsonl
     REPORT_MIN_ACCOUNT_AGE_HOURS=0
     STRIPE_WEBHOOK_SECRET=whsec_local_test_only
     ```

4. Apply the migrations:

   ```bash
   npm run db:migrate
   ```

5. Optionally add the fictional demo data:

   ```bash
   npm run db:seed-demo
   ```

6. Start the dev server and open http://localhost:3000:

   ```bash
   npm run dev
   ```

Without `RESEND_API_KEY`, emails (verification and reset links) are printed to the server console, and appended to `DEV_EMAIL_OUTBOX` if that's set. This never happens in production.

## Creating staff accounts locally

```bash
npm run admin:bootstrap -- you@example.com super_admin
```

Sign in, then add a **passkey** under Account Settings → Security. Admin powers only activate in passkey-verified sessions (set `ADMIN_REQUIRE_PASSKEY=false` **only** for local experiments). Moderators can use an authenticator app.

## Simulating Plus without Stripe

```bash
npm run dev:grant-plus -- you@example.com grant
```

Use `revoke` or `past_due` to test the other states. This refuses to run when `SS_LAUNCH_MODE=production`.

## Tests

Unit tests:

```bash
npm test
```

The security suite needs a running dev server and seeded demo data:

```bash
npm run test:security
```
