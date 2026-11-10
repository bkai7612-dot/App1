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

## Package C: moderator tooling (from the user-testing round)
- Migration 013: claim timestamps, reply timestamps, reporter network hash, appeal questions.
- Report detail rebuilt: claim/release/take over, publication form with live public preview and safety checklist, reason templates, player-facing vs internal fields, internal notes, appeal questions, staff-only signals, evidence thumbnails.
- Reports list: per-player filter, assignee and claim age, "reply received", relative times. Queues split into tabs with counts, bulk selection, commendation submitter context, "My recent decisions" with undo. Overview counters link to their lists. User records show notes, actions and the user's submissions.

## Package D+E: polish and pre-launch (from the user-testing round)
- Migration 014: `complaints` table (RLS: own or staff), item references on privacy requests, subscription price and invoice fields.
- P-01 to P-14 and D5 as listed in TESTING_REPORT.md. L-01 operator details from config plus web complaint form and "complain about this decision" links; L-02 complete export; L-03 age policy (Terms and COMPLIANCE §6a, flagged for legal review); L-04 item-linked privacy requests and an erasure explanation; L-05 demo data (console titles, fixed contradictory text, no "most popular" claim); L-06 subscription transparency.
- Stripe invoice links and stored prices only appear after live webhooks deliver them. **Not tested against live Stripe.**

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
