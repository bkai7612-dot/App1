# ServerSentry QA and security test report (Agent 2)

Scope: I tested the running dev app (localhost:3000) from outside with HTTP requests, read the code in src/ and migrations/, connected to the database directly as `serversentry_app`, and drove pages with Playwright at 390px width. I did not modify any file in /home/user/App1. Scripts and screenshots are in this folder (`t1_auth.mjs` … `t12.mjs`, `t7_rls.sh`, `t7b.sh`, `webauthn.mjs` (a software passkey authenticator), and `shots/`).

**No Critical or High findings.** The core controls held up: MFA, report moderation, the Plus paywall, RLS for guest and user contexts, evidence handling and the Stripe webhook.

## Findings (most severe first)

### M1. Open redirect through `next` / `returnTo` using a tab character (Medium)
- **Where:** `src/lib/safe-next.ts:4`. It blocks `\r` and `\n` but not `\t` or other characters that browsers strip from URLs.
- **Steps:** sign in, then open `/mfa?next=%2F%09%2Fevil.example`.
  - The server answers 307 with `Location: "/\t/evil.example"`.
  - In Chromium this went to `http://evil.example/` (confirmed with Playwright, `t9_redirect.mjs`).
  - The client-side path does the same: `/login?next=%2F%09%2Fevil2.example`, then submit the form, and the browser goes to `http://evil2.example/`.
  - The same function is used for the checkout `returnTo`.
- **Also:** `next=/%0B/x` makes the page crash with a 500.
- **Fix:** resolve with `new URL(next, appUrl)`, require the same origin, and return `pathname + search`. Alternatively, reject every control character and whitespace.

### M2. A moderator can publish their own right-of-reply response (Medium, conflict of interest)
- **Where:** `src/app/api/admin/responses/[id]/route.ts`. Nothing compares `author_user_id` with the acting moderator. The DB trigger `owner_submission_protect` (004) only checks `ctx_is_staff()` on UPDATE.
- **Steps:**
  1. Moderator M creates their own profile.
  2. User U reports it, and moderator M2 publishes the report.
  3. M posts `/api/reports/{id}/response`.
  4. M posts `/api/admin/responses/{respId}` with `{"decision":"publish"}`.
- **Result:** 200, and the response's status becomes `published`. Expected 403.
- **Related gap:** neither the code nor the trigger stops the reporter-moderator from moderating the owner's reply to their own report.

### M3. Admins can suspend and sign out peer admins and super_admins (Medium, privilege hierarchy)
- **Where:**
  - `migrations/001_schema.sql`, `users_protect()`: `IF OLD.role <> 'user' AND NOT ss.ctx_is_admin()` lets any admin restrict any staff account.
  - `src/app/api/admin/users/[id]/route.ts`: suspend, revoke_sessions and restrict actions have no target-role hierarchy check. `set_role` is correctly limited by `assignableRoles`.
- **Steps:** an admin with a passkey-verified session posts `/api/admin/users/{superAdminId}` with `{"action":"suspend","days":1,"reason":"x..."}`. Result: 200, and the super_admin is locked out. The same works on another admin, and `revoke_sessions` works on a super_admin.
- **Expected:** admins can only restrict roles below them, matching `assignableRoles`.

### M4. Registration reveals whether an email is already registered (Medium)
- **Where:** `src/app/api/auth/register/route.ts`, last line.
- **What happens:** for an existing email the response is `{"signedIn":false}` with no `Set-Cookie`. For a new email it is `{"signedIn":true}` with an `ss_session` cookie.
- **Note:** login and forgot-password responses are otherwise uniform, and their timings matched (about 40ms in both cases).
- **Fix:** return the same body for both. For example, always show "check your email" and only sign the user in after verification.

### M5. RLS lets a user rewrite every column of their own sessions (Medium, defence in depth)
- **Where:** `001_schema.sql:726` (`sessions_revoke_own`, `FOR UPDATE USING (user_id = ctx_user_id())`), with no column restriction.
- **What I did:** as `serversentry_app` with `app.role='user'` (`t7b.sh`), these all succeeded:
  - `UPDATE sessions SET mfa_method='webauthn', mfa_verified_at=now(), reauth_at=now(), expires_at=now()+'10 years'` (2 rows)
  - `UPDATE … SET revoked_at=NULL` (re-activates a revoked session)
- **Impact:** if any SQL injection appeared in user context, it could upgrade a session to "passkey" and get around `ADMIN_REQUIRE_PASSKEY`, or bring revoked sessions back.
- **Fix:** do revocation only in system context, or add a trigger that allows changing only `revoked_at` from NULL to `now()`.

### M6. Mobile menu overlay renders without a background (Medium, UX/accessibility)
- **Where:** `Navbar.tsx:35` and `NavClient.tsx:85`. The `<header>` uses `backdrop-blur-xl`, which makes the header the containing block for `fixed` children. The `fixed inset-0 bg-ink/95` overlay is therefore clipped to the 64px header height.
- **What you see:** menu items are drawn straight over the hero text and can't be read (`shots/menu-open2.png`).
- **Also:**
  - The mobile menu has no Escape handler (aria-expanded stays true after pressing Escape) and no focus trap.
  - The cookie banner covers the profile stats and the security panel at 390px.
- **Fix:** render the overlay through a portal on `document.body`, or move the blur to a pseudo-element.

### M7. Report upload size cap bypassed with chunked encoding (Medium if self-hosted, Low on Vercel)
- **Where:** `src/app/api/reports/route.ts`. The 16MB check only reads the `Content-Length` header, and then `req.formData()` buffers the whole body.
- **Steps:** a streamed 80MB multipart POST with no `Content-Length` was fully parsed. The server answered 400 for a field error after about 0.7s (`t12.mjs`). This lets a client exhaust memory.
- **Also:** the per-user report rate limits (2/hour, 5/day) are used up before validation, so a user who submits a typo loses quota.

### M8. Anyone can keep any account locked (Medium/Low, availability)
- **Where:** `src/app/api/auth/login/route.ts`. Five wrong passwords lock the account for 15 minutes, doubling up to 24 hours. No knowledge of the account is needed, and the per-email limit (10 per 15 minutes) is enough to keep the lock going.
- **Steps:** POST five wrong passwords; the correct password is then refused (verified). There is no unlock path other than a password reset.

### Low / Info
- **L1. NUL byte in search causes 500s:** `/api/players/search?q=%00` and `/search?q=%00`. Postgres rejects 0x00 (`players.ts` `normalizeName`). Strip control characters first.
- **L2. `Origin: null` on POST /api/reports gives 500 instead of 403:** `new URL("null")` throws in the hand-written CSRF check (`reports/route.ts:30`). Reuse `checkCsrf()`.
- **L3. The `/search` HTML page has no rate limit:** 70 requests out of 70 returned 200, while the search API returns 429 after 60 per minute. Scrapers can use the page instead of the API.
- **L4. RLS gaps (database tests in `t7b.sh`):**
  - A staff context can read `password_hash` and `stripe_customer_id` for every user (84 hashes); `users_select` has no column restriction.
  - Staff can insert notifications addressed to any user, which could be used for phishing text.
  - Users can insert `audit_logs` rows under their own id with any action and detail, for example `admin.user.set_role`.
  - Users can insert `account_verifications` with any `method`, `nonce_hash` and `verified_platform_user_id`. Combined with a moderator choosing "approve_verified", a profile could be given someone else's SteamID.
  - Senior moderators can rename any user.
  - **Architectural:** the app role can set `app.role='system'` for itself (I confirmed it then reads `mfa_totp` and unused `email_tokens` and can change roles). RLS therefore protects against logic bugs, not against SQL injection or a compromised app server. A separate login role for system operations, or `SECURITY DEFINER` functions, would make it a real boundary.
- **L5. Verification can be restarted on an unlinked gaming account:** `identity/accounts/[id]/verify` doesn't exclude `verification_status='unlinked'`, so a later approval brings the link back.
- **L6. The 72-hour commendation hold "fails open":** the trigger stores the commendation as `approved`, and it is only switched to `pending` in a second transaction after commit (`commendations/route.ts`). In between it is publicly counted, and it stays approved if the second update fails.
- **L7. Stripe events with the same timestamp can apply out of order:** `last_event_at > at` is a strict comparison, so an older event created in the same second overwrites a newer one. Sending `canceled` then `active` at the same `created` time left the user with Plus.
- **L8. Victim's password resets can be suppressed:** the per-email forgot-password cap (3 per hour) silently drops requests, so an attacker can use it up.
- **L9. Right-to-left override characters are allowed in player display names:** `‮` was accepted (`/api/players`), which allows name spoofing.
- **Info:**
  - Public stats show how many unpublished, pending and rejected reports a profile has.
  - "Fresh re-auth" counts as satisfied for 10 minutes after any sign-in (`createSession` sets `reauth_at`).
  - Webhook events for unknown customers are marked processed and never retried.
  - Most pages have about 10 touch targets under 24px.

## What passed
- **Accounts and sign-in:**
  - Password rules (length and repeated characters); unverified email blocks protected features.
  - Verification tokens, reset tokens (single use, expiry, older tokens invalidated) and email-change tokens behave correctly.
  - Login messages and timings match for unknown email vs wrong password; lockout works.
  - A pending-MFA session is refused by 10 protected APIs and redirected away from 5 protected pages, including /admin.
  - Five wrong MFA codes revoke the session; per-user MFA rate limit applies.
  - TOTP replay is rejected, and so is an older time step after a newer one has been used.
  - Recovery codes are normalised and single use; reset requires a second factor.
- **Sessions:**
  - The session token rotates after MFA; a fixed (attacker-chosen) cookie is ignored.
  - Logout invalidates the session on the server; "sign out all others" works; another user's session id can't be revoked.
  - Cookie is HttpOnly and SameSite=Lax.
- **CSRF:** missing header, cross-origin `Origin`, `Origin: null`, `Sec-Fetch-Site: cross-site` and simple form posts are all blocked. There are no CORS headers.
- **Search:**
  - Duplicate "Shadow" profiles stay separate (6 profiles); no internal ids in the API.
  - `%`, `_`, quotes, SQL injection strings, emoji, full-width characters and 5000-character queries are safe.
  - Page numbers are clamped (1–500); API rate limit is 60 per minute.
- **Identity:**
  - Can't link, verify, unlink or claim someone else's profile or account.
  - Strict schemas reject mass-assignment fields.
  - Unlink needs re-auth after 10 minutes.
  - Forged Steam callback is rejected; the state value is single use and tied to the user; a guest is sent to login.
  - Manual claims go to moderator review; a same-name profile needs explicit confirmation.
- **Commendations:**
  - Ten parallel requests store exactly one.
  - Self-commend and self-report are blocked; forged status or submitter is ignored; comments wait for moderation.
- **Reports and evidence:**
  - Never published automatically; forged status is ignored; parallel duplicates store one; future incident dates are rejected.
  - Rejected uploads: HTML disguised as PNG, SVG, MIME mismatch, 4 files, 6MB, truncated images.
  - Polyglot images and EXIF are removed by re-encoding; path-traversal filenames are ignored (random storage keys).
  - Evidence returns 401/404 to guests, the reported owner and other users; it is not served statically; headers include nosniff, a sandbox CSP and no-store.
- **No reporter identity or raw description leaks to the reported owner:** checked in pages, the feedback API, notifications and the data export.
- **Moderation permissions:**
  - Non-owners can't respond or appeal.
  - Normal users get 403 on admin APIs and 404 on admin pages.
  - Moderators can't remove content, decide appeals or suspend; seniors can't change roles, view the audit log, or suspend staff.
  - Staff can't act on their own report or account.
  - A reporter who is a senior moderator can't decide the appeal on their own report (blocked by a DB trigger).
- **Admins and passkeys:**
  - An admin with a TOTP-only session has no staff powers, even after TOTP re-auth.
  - Passkey registration challenge is single use; assertion replay and counter regression are rejected.
  - Admins can't grant admin or super_admin or demote another admin; `set_role` needs fresh re-auth.
  - Staff accounts can't use the recovery flow; staff sessions expire after 30 minutes idle.
- **Plus paywall:**
  - Guests and free users get 402 on the API, and no comments, summaries or history appear in page HTML for any tab.
  - past_due, canceled and expired-period subscriptions lose access; cancel-at-period-end keeps access.
  - API output carries no reporter or submitter fields.
- **Stripe webhook:** wrong secret, garbage signature, old timestamp and missing signature are rejected. Spoofed metadata grants nothing, unknown customers are ignored, duplicate events are deduplicated, and older out-of-order events are ignored.
- **RLS for guest and user contexts:**
  - A guest can read nothing from the private tables (only linked accounts, which are public).
  - Users can't escalate their role, change protected fields, insert subscriptions, publish reports, take over profiles, self-verify or approve commendations.
  - The app role isn't superuser and has no BYPASSRLS.
- **XSS and headers:**
  - React escaped the summary, response and comment payloads, and no dialogs fired.
  - Display names containing `<` or `>` are rejected.
  - The nonce CSP (`'unsafe-eval'` appears in dev only), HSTS, XFO DENY, nosniff, COOP/CORP and Referrer-Policy headers are present.
  - Error responses don't leak internals; the cron endpoint needs its secret.
- **Mobile and accessibility (390px):**
  - No horizontal page overflow on home, search, profile, pricing, login, register, account/security, me/profile or the report form.
  - All inputs are labelled; there is a skip link; focus rings are visible; `lang="en-GB"`; one h1 per page.
  - With reduced motion requested there are 0 running animations, versus 15 without.

## Round 2 retest

Scripts: `r2_retest.mjs` and `r2_lock.mjs`. The test helper was updated for the new flow: register, then verify email, then log in. I tried to bypass each fix through the HTTP API and directly in the database as `serversentry_app`.

| Item | Result | Evidence and bypass attempts |
|---|---|---|
| QA-01 open redirect | **PASS** | 16 payloads to `/mfa?next=` all stayed same-origin with no 5xx: `%09`, `\t`, `\n`, `\\`, `//`, `/./%2F/`, `/.//`, `/..//`, `%2e%2e//`, NBSP, U+2028, U+3000, `%5C%5C`, `/@evil`, and a query/fragment `//`. `next=%0B` now falls back to `/me/profile` (it was a 500). |
| QA-02 response/appeal conflict of interest | **PASS** | Moderator publishing or rejecting their own response: 403, status stays `pending`. A direct database UPDATE in moderator context is blocked by the trigger (`conflict of interest`). A reporter-moderator can't moderate the reply to their own report: 403. An uninvolved moderator can still publish, and a senior can still review an unrelated appeal. |
| QA-03 staff hierarchy | **PASS** | An admin gets 403 for suspend, revoke_sessions and restrict_reporting against both super_admin and admin, and the super_admin stays signed in. The DB trigger blocks an admin context directly. No regressions: admins can suspend moderators, seniors can suspend users but not moderators, super_admins can suspend admins. |
| QA-04 registration enumeration | **PASS** | Identical body and no cookie for new, existing and case/whitespace-variant emails. Timings were 49ms vs 50ms. |
| QA-05 session RLS | **PASS** | A user-context `UPDATE sessions` (mfa_method, expiry, un-revoke) now changes 0 rows. Revoking another user's session id returns 404. Revoking your own session and "sign out all others" still work. |
| QA-06 mobile menu | **Not re-verified** | I didn't re-run the Playwright check in round 2. |
| QA-07 upload size cap | **PASS** | An 80MB chunked upload with no Content-Length gets 413 in 87ms. `Origin: null` and a malformed Origin both get 403 instead of 500. Normal report submission still works. |
| QA-08 lockout denial of service | **FAIL (partial)** | Working parts: the lock is capped at 60 minutes; the owner on a known network can sign in while the account is locked; unknown networks and wrong passwords are still refused. **Bypass:** the per-email login rate limit (`login-email`, 10 per 15 min, `login/route.ts`) runs before the known-network check. An attacker sends 9 bad attempts (their 10th was already rejected with 429), and the owner then gets **429 even with the correct password from their known network**. Repeating this every 15 minutes keeps the owner out indefinitely. Fix: apply the known-network exemption, or a separate bucket per ip-hash and email, before or instead of the global per-email limit. |
| L1 NUL/control characters in search | **PASS** | `%00`, `Sha%00dow`, `%0B`, `%7F` and RLO return 200 from both the API and `/search`. |
| L2 `Origin: null` on /api/reports | **PASS** | 403. |
| L4 RLS hardening | **PASS** | Inserting a verification that carries `verified_platform_user_id` is blocked by RLS. A senior renaming a user is blocked. |
| L5 verification on an unlinked account | **PASS** | 404. |
| L6 72-hour commendation hold | **PASS** | A young account's commendation is stored as `pending` at insert time. |
| L7 Stripe same-second tie | **PASS** | A same-second `active` after `canceled` is ignored; a later reactivation still applies. |
| L9 bidi characters in names | **Partial** | RLO/RLI, NUL and DEL are rejected. Still accepted: RLM U+200F, ALM U+061C and zero-width space U+200B. These can make lookalike names, and search normalisation doesn't strip ZWSP or ALM. Add `​-‏؜﻿` to the regex. |
| Regression: auth flows | **PASS** | Register, verify, log in and enrol TOTP (10 recovery codes) all work. The MFA-pending session is blocked until TOTP. Recovery-code login and logout work. Login error messages are uniform. |

**Not covered by this retest:**
- QA-06 (mobile menu portal, Escape and focus trap).
- The compact cookie banner.
- L3 (`/search` page has no rate limit); it wasn't on the fix list.
- The architectural point that the app role can set `app.role='system'` itself is unchanged.

**Note:** unverified accounts can log in (`mfaRequired:false`), but they are blocked from features (403 EMAIL_UNVERIFIED). That is fine.
