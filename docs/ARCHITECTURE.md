# Architecture

## Stack (and the one deviation from the brief)

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 3, Lucide icons |
| Backend | Next.js route handlers (`src/app/api/**`) and server components; Zod validation |
| Database | PostgreSQL 16 (Supabase-hosted in production), hand-written SQL migrations, RLS |
| Files | Supabase Storage private bucket (production) / private local directory (development) |
| Payments | Stripe Checkout + Billing Portal + verified webhooks |
| Email | Resend HTTP API |
| Hosting | Vercel (Node.js runtime), Vercel Cron for retention |

**Deviation: authentication is implemented in-app instead of with Supabase Auth.** The security requirements call for Argon2id password hashing, passkeys/WebAuthn as a second factor, mandatory MFA gates per feature, passkey-only admin privileges, re-auth windows and token rotation. Supabase Auth hashes with bcrypt and doesn't offer WebAuthn as a second factor. Supabase is still used for Postgres (with RLS) and Storage. Next.js 16 replaced Next 15 because the Next 15 dependency tree carried high-severity advisories (`npm audit`).

## Project structure

```
migrations/            SQL migrations (schema, RLS policies, triggers, views)
scripts/               migrate, seed/remove demo, bootstrap staff, retention, secret scan
src/proxy.ts           per-request CSP nonce (Next 16 "proxy", formerly middleware)
src/app/               pages (server components) + api/ route handlers
  api/auth/**          register, login, MFA (TOTP, passkeys, recovery), reauth, sessions
  api/account/**       profile, password/email change, export, privacy requests, deletion
  api/players/**       search, create, feedback (entitlement-gated)
  api/commendations, api/reports/**, api/evidence/[id]
  api/identity/**      own profiles, linking, verification, claims, Steam OpenID
  api/admin/**         moderation, appeals, verifications, users, privacy, recovery
  api/billing/**, api/stripe/webhook, api/cron/retention
  admin/**             moderation dashboard (staff only, 404 for others)
src/lib/
  db/                  pool + withDb(ctx) transaction wrapper that sets RLS context
  auth/                password (Argon2id), session, mfa (TOTP/WebAuthn/recovery), flows
  server/              api wrapper, rate limiting, audit, notify, email, storage, stripe, players
  rbac.ts              role/permission matrix
tests/unit, tests/security
```

## Request security pipeline

Every API route uses `route()` (`src/lib/server/api.ts`):

1. A CSRF check (custom header + Origin/Sec-Fetch-Site).
2. Session lookup by SHA-256 of the cookie token, with expiry, idle timeout, suspension and pending-MFA checks.
3. The required auth level: `public`, `pendingMfa`, `auth` or `mfa` (email verified, MFA enrolled and verified this session).
4. The permission check (`rbac.ts`). Staff powers apply only when `staffActive`, which needs an MFA-verified session, and a passkey session for admins.
5. The optional re-authentication window (10 minutes).
6. The rate limit (Postgres-backed, shared across instances).
7. Strict Zod body validation, which rejects unknown keys on sensitive endpoints.
8. The handler, with generic error responses. Details go to server logs with an incident ID.

All queries go through `withDb(ctx)`, which sets `app.user_id`/`app.role` for RLS. Unverified staff sessions are **downgraded to `user`** at the database level.

## Database relationships

```
users 1─* sessions, mfa_totp(1:1), webauthn_credentials, recovery_codes, email_tokens, security_events
users 1─* notifications, data_subject_requests, account_recovery_requests
users 1─* subscriptions, payments              (written only by system context / webhooks)
games 1─* player_profiles *─1 platforms
users 0..1─* player_profiles (owner_user_id; created_by)
player_profiles 1─* gaming_accounts *─1 platforms
player_profiles 1─* account_verifications *─1 users (claims, link verifications)
player_profiles 1─* commendations *─1 users (submitter)
player_profiles 1─* reports *─1 users (reporter)
reports 1─* report_evidence, report_responses (1 active), report_appeals (1 open)
moderation_actions → (target_type, target_id)   append-only
audit_logs   append-only, hash-chained (prev_hash → hash)
stripe_events   webhook idempotency
rate_limits     fixed windows
```

Public reads use **column-safe views**: `public_reports`, `public_report_responses`, `public_commendations`, `player_reputation_stats`. They never expose reporter or submitter IDs, raw descriptions or evidence. The base tables are private under RLS.

Key constraints:

- Same-name profiles are allowed (no merging), and `(platform, game, platform_user_id)` is unique when known.
- A platform account can be **verified** on only one profile.
- One commendation per submitter, profile and category.
- One open report per reporter and profile.
- One active response and one open appeal per report.
- A published report must have a moderator summary.

## Roles

| Capability | user | moderator | senior_moderator | admin | super_admin |
|---|---|---|---|---|---|
| Search, view, commend, report, link own accounts | ✓ (MFA) | ✓ | ✓ | ✓ | ✓ |
| Review reports/evidence, request info, publish, reject | | ✓ | ✓ | ✓ | ✓ |
| Moderate commendations, responses, ownership claims | | ✓ | ✓ | ✓ | ✓ |
| View users & moderation history | | ✓ | ✓ | ✓ | ✓ |
| Decide appeals, remove published content, record outcomes | | | ✓ | ✓ | ✓ |
| Suspend users / restrict reporting (staff: admin only) | | | ✓ | ✓ | ✓ |
| Assign user↔moderator↔senior roles | | | | ✓ | ✓ |
| Assign admin/super_admin | | | | | ✓ |
| Audit log, billing status, privacy requests, account recovery, launch gates | | | | ✓ | ✓ |

"Premium" is **not a role**. It is derived from subscription state. No role can access Stripe or Supabase secrets, database credentials or infrastructure; those live only in Vercel/Supabase dashboards, with separate access control. Nobody can act on their own account, their own reports or reports about profiles they own (enforced in the API **and** in database triggers).
