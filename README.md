# ServerSentry

**Know Who You're Playing With.** ServerSentry is a community-powered gaming reputation network. Players can search for other players across games and platforms, give positive commendations, submit responsibly moderated reports and link verified gaming accounts. **ServerSentry Plus** (£0.99/month) unlocks approved comments, moderated report summaries and reputation history.

> ⚠️ **Not yet cleared for public launch.** Mandatory launch gates (independent penetration test, DPIA, Online Safety Act assessment, legal review of the reporting model, etc.) are enforced in code and remain open. See [docs/COMPLIANCE.md](docs/COMPLIANCE.md#launch-gates).

## Highlights

- **Security first:** Argon2id passwords; mandatory MFA (passkeys/WebAuthn, TOTP, hashed one-time recovery codes) before contributing; passkey-only admin powers; re-authentication for sensitive changes; session rotation; lockouts; rate limits; CSP nonces; CSRF protection.
- **Defence in depth in the database:** PostgreSQL Row Level Security on every table, a least-privilege app role, triggers that make privilege escalation, self-verification, self-publication and entitlement forging impossible even if API code is wrong, column-safe public views, and a hash-chained, append-only audit log.
- **Responsible moderation:** reports are never auto-published. Moderators write neutral public summaries, reporter identities and evidence stay private, owners have a free right of reply and appeal, appeals go to a different senior moderator, and conflict-of-interest checks apply.
- **Honest identity:** usernames are never merged. Steam ownership is proven via official OpenID; other platforms use moderator-reviewed claims until an authorised integration exists.
- **Premium enforced server-side:** Plus is derived only from signature-verified, idempotent, order-safe Stripe webhooks.

## Quick start (local)

```bash
npm install
cp .env.example .env.local   # then fill in values; see docs/SETUP.md
npm run db:migrate
npm run db:seed-demo         # fictional demo data (search "Shadow")
npm run dev
```

Full instructions are in [docs/SETUP.md](docs/SETUP.md).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | TypeScript |
| `npm test` | Unit tests (TOTP RFC vectors, redirects, RBAC) |
| `npm run test:security` | Integration + security suite against a running dev server (127 checks) |
| `npm run db:migrate` | Apply SQL migrations (uses `DATABASE_ADMIN_URL`) |
| `npm run db:seed-demo` / `db:remove-demo` | Add/remove fictional demonstration data |
| `npm run admin:bootstrap -- <email> [role]` | Create/promote the first staff account |
| `npm run dev:grant-plus -- <email> grant\|revoke\|past_due` | Dev-only simulated subscription |
| `npm run retention` | Trigger the data-retention job |
| `npm run scan:secrets` | Scan source and client bundle for leaked secrets |
| `npm run audit:deps` | Dependency vulnerability scan |

## Documentation

| Doc | Contents |
|---|---|
| [ARCHITECTURE](docs/ARCHITECTURE.md) | Stack decision, structure, database relationships, roles |
| [SETUP](docs/SETUP.md) | Local development |
| [DEPLOYMENT](docs/DEPLOYMENT.md) | Vercel + Supabase production setup, backups |
| [STRIPE](docs/STRIPE.md) | Stripe configuration |
| [MODERATOR_GUIDE](docs/MODERATOR_GUIDE.md) | Staff setup and moderation procedures |
| [SECURITY](docs/SECURITY.md) | Security controls, checklist, issue register |
| [COMPLIANCE](docs/COMPLIANCE.md) | UK GDPR, retention, DPIA, OSA, launch gates, legal review |
| [INCIDENT_RESPONSE](docs/INCIDENT_RESPONSE.md) | Incident and data breach response plan |
| [PLATFORM_INTEGRATIONS](docs/PLATFORM_INTEGRATIONS.md) | Platform API investigation; adding games & platforms |
| [TESTING_REPORT](docs/TESTING_REPORT.md) | Developer and independent QA results |
| [DEVELOPMENT_LOG](docs/DEVELOPMENT_LOG.md) | Features, bugs, fixes, known limitations |
