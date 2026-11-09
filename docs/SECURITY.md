# Security

No system is unhackable, and this document does not claim ServerSentry is secure or compliant. It records the controls implemented, how they were tested, and the open risks. **An independent penetration test (OWASP ASVS 5.0.0, at a level agreed with a qualified security professional) is a mandatory launch gate.**

## Controls implemented

### Authentication & accounts
- Argon2id (m=19 MiB, t=2, p=1) passwords; 12–128 character policy with common-password and context checks; dummy hashing to equalise timing for unknown accounts.
- **Mandatory MFA** before commendations, reports, account linking, data export and all staff powers. Methods: passkeys (WebAuthn, user verification required), TOTP (AES-256-GCM-encrypted secret, ±1 step, **replay protection**), and 10 single-use recovery codes stored as keyed HMAC-SHA256.
- Staff privileges are active only in MFA-verified sessions; **admins need passkey sessions** (`ADMIN_REQUIRE_PASSKEY`). Unverified staff sessions are downgraded to `user` at the RLS layer.
- **Fresh re-authentication** (10 minutes) is required for password and email changes, MFA changes once enrolled, recovery-code regeneration, unlinking accounts, account deletion, role changes and account-recovery decisions.
- Brute force: per-IP and per-email login limits; escalating account lockout (from 5 failures, 15 minutes doubling up to 24 hours); 5 MFA attempts per pending session, then revocation; per-user MFA limit of 10 per 15 minutes.
- Sessions: 256-bit random tokens, stored as SHA-256; `__Host-` cookie, HttpOnly, Secure, SameSite=Lax; rotation after MFA; 7-day absolute / 3-day idle for users, 8-hour / 30-minute for staff; revocation on password reset or change, email change, suspension, role change and recovery; session list with remote sign-out.
- Anti-enumeration on register, login and forgot-password. Password reset requires a second factor when MFA is enrolled.
- Security notifications (in-app and email) for every security-setting change, new-device sign-ins and recovery-code use. "Report suspected compromise" revokes all other sessions and alerts admins.
- Account recovery for lost factors goes through an admin-reviewed, re-authenticated and audited flow. Staff accounts are excluded and use break-glass.

### Authorisation (BOLA/IDOR, privilege escalation, mass assignment)
- Every route checks authentication, ownership and permission server-side. Strict Zod schemas reject unknown fields.
- **Database-enforced:** RLS on every table; triggers prevent changing your own role, self-verification of accounts, linking to profiles you don't own, inserting reports or commendations with forged status, auto-publication, moderating with a conflict of interest, and non-owner responses or appeals. Billing tables are writable only in system context. The audit log and moderation actions are append-only, with no UPDATE/DELETE grant, plus a trigger and hash chain.
- Public data is served from column-safe views only.

### Web
- CSP with a per-request nonce and `strict-dynamic`; `frame-ancestors 'none'`; HSTS; nosniff; Referrer-Policy; Permissions-Policy; COOP/CORP; no `X-Powered-By`.
- CSRF: a required custom header plus an Origin/Sec-Fetch-Site check on every mutation; SameSite cookies. The Stripe webhook is authenticated by signature instead.
- XSS: React escaping. No user HTML is rendered (the only `dangerouslySetInnerHTML` is a server-generated QR SVG).
- SQL injection: parameterised queries everywhere; `LIKE` wildcards escaped.
- Open redirects: `safeNext()` allows relative paths only.
- SSRF: outbound requests go only to fixed hosts (Stripe SDK, Steam, Resend, Supabase). There are no user-supplied URLs.
- Errors: generic responses with incident IDs; details only in server logs.
- Request limits: 64 KB JSON, a 16 MB multipart cap, and limits on fields and files.

### Evidence uploads
Allowlist (PNG/JPEG/WebP) → magic-byte check → declared/actual type match → 5 MB and 3-file limits → decode with a pixel limit → **re-encode** (strips metadata and polyglot payloads) → random UUID key → private storage. Undecodable files are rejected. Access requires the uploader, or staff with permission; every view is audit-logged and served `no-store` with a sandbox CSP. Supabase uses 60-second signed URLs. A malware-scanning hook is not implemented (see the register).

### Payments
Stripe-hosted Checkout and Portal; no card data. Signature-verified webhooks with a timestamp tolerance; event-ID idempotency; out-of-order protection; customer→user mapping only from the server-created customer ID; entitlement checked server-side on every request.

### Secrets
Server-only environment variables (`src/lib/env.ts` imports `server-only`). No `NEXT_PUBLIC_` secrets. `.env*` is git-ignored. `npm run scan:secrets` scans the source and the client bundle. Separate app and admin DB credentials; the app role has no BYPASSRLS and no DDL.

### Monitoring
`security_events` covers logins (success/failure/locked), MFA failures, password and email changes, recovery, linking/unlinking, role changes, unauthorised access attempts, evidence access denials, new devices and reported compromise. `audit_logs` covers every privileged action, evidence access, data export and billing state change. **Gap:** there's no automated alerting pipeline yet (see the register).

## Security checklist (pre-launch)
- [ ] Independent penetration test completed; no unresolved Critical/High without a documented, approved risk decision
- [ ] ASVS 5.0.0 level chosen and mapped with the security professional
- [ ] Production, staging and development use separate Supabase projects, keys and Stripe accounts
- [ ] `ss` schema not exposed in the Supabase API; `anon`/`authenticated` have no grants (verify with `\dp ss.*`)
- [ ] RLS tests (`npm run test:security`) pass against staging
- [ ] Evidence bucket private, size and MIME limits set; no public policies
- [ ] `npm run scan:secrets` and `npm run audit:deps` clean in CI
- [ ] HSTS on the custom domain; TLS-only database connections
- [ ] Backup restore test done and recorded
- [ ] Alerting on security-event spikes configured (log drain → SIEM/alerts)
- [ ] Break-glass procedure for staff account recovery documented and tested
- [ ] All launch gates signed off (docs/COMPLIANCE.md)

## Security issue register
See [TESTING_REPORT.md](TESTING_REPORT.md#security-issue-register).
