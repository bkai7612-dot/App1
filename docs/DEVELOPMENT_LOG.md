# Development log

## Completed (implemented and tested; see TESTING_REPORT.md)
- **Phase 1, foundation:** Next.js 16/TS/Tailwind; black-purple iridescent design system (animated waves, glass cards, gradient borders, reduced-motion support); responsive nav and mobile drawer; landing page; Postgres schema with RLS; Argon2id auth; email verification; password reset; sessions.
- **Security layer:** mandatory MFA (passkeys, TOTP, recovery codes), passkey-only admin powers, re-auth, lockout, rate limits, CSP/CSRF/headers, audit chain, security events and notifications, session management, compromise reporting, account recovery.
- **Phase 2, profiles:** search with filters, pagination and rate limits; same-name profiles kept separate; profile pages with 5 tabs; identity statuses; add-player flow.
- **Phase 3, reputation:** commendations (dedupe, limits, moderation of comments, new-account hold); reports with sanitised private evidence; 8 moderation statuses; statistics breakdown; history.
- **Phase 4, moderation:** dashboard, report queue and detail, evidence review (audited), reporter-history and abuse signals, request-info loop, publish/reject/resolve/remove, responses, appeals (senior, different moderator), user management, audit log, privacy and recovery queues.
- **Phase 5, premium:** Stripe Checkout, Portal, verified idempotent webhooks, entitlement enforced server-side, premium lock UI, return-to-profile after payment, payment history. *Live Stripe untested.*
- **Phase 6, verification:** linking framework, audit trail, unlink, manual claims queue, Steam OpenID (official). *Live Steam untested.* Platform research in PLATFORM_INTEGRATIONS.md.
- **Phase 7, release prep:** production build, secret scanner, dependency audit, retention job and cron, launch gates enforced in code, deployment/backup/incident/compliance documentation, demo seed and removal, test accounts, prototype guide.

## Bugs found and fixed during development
1. RLS context functions not found → `search_path` set per transaction.
2. `notFound()` returned HTTP 200 because the root `loading.tsx` streamed → removed it.
3. The PL/pgSQL trigger shared by responses and appeals referenced a column missing on one table → `to_jsonb(NEW)` (migration 004).
4. Moderators couldn't set evidence retention (RLS too narrow) → migration 003.
5. Dev scripts had SQL parameter-type errors → explicit casts.
6. The secret scanner flagged Next's internal dev chunks → it scans source and `.next/static` only.
7. All the independent QA round 1 findings (QA-01 to QA-08, L-1 to L-7): see TESTING_REPORT.md.

## Outstanding
- Live verification of Stripe, Steam, Supabase Storage, Resend and passkeys on the production domain.
- Additional platform integrations (Riot RSO, Xbox) subject to approval.
- Security alerting pipeline (R-9); malware scanning if evidence types widen (R-8); DB role split (R-1).
- Screen reader audit; a formal WCAG 2.2 AA audit.
- All launch gates: pentest, DPIA, OSA assessment, legal reviews, backup restore test, sign-off.

## Known limitations
- Search uses trigram `ILIKE`; at large scale consider full-text search or a dedicated search service.
- Rate limiting is Postgres-backed. Fine at launch scale; move to Redis/Upstash under heavy load.
- The local storage driver isn't usable on Vercel (refuses), so production must use Supabase Storage.
- Reputation statistics are computed by a view per request; add caching or materialised counts at scale.
- Email templates are plain text.
- Admin accounts need a passkey on the real domain, so admin powers can't be used through preview proxies.
