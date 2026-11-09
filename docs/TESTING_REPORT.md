# Testing report

## Summary

| Layer | How | Result |
|---|---|---|
| Unit | `npm test`: TOTP RFC 4226 vectors, replay, open-redirect guard, RBAC matrix | 7/7 pass |
| Developer integration & security | `npm run test:security`: real HTTP against the running app plus direct SQL attacks as the app role | **139/139 pass** |
| Independent QA, round 1 | Separate tester agent: black-box HTTP, code review, DB-role attacks, Playwright at 390px | 0 Critical, 0 High, **8 Medium**, ~14 Low/Info |
| Independent QA, round 2 (retest) | Same tester re-verifying the fixes | See the round 2 section |
| Build & supply chain | `next build`, `tsc`, `npm audit --omit=dev`, `npm run scan:secrets` | Pass; 0 production advisories |
| Manual / visual | Playwright walkthrough of every role (docs/prototype/*.png), desktop and mobile | No console errors, no horizontal overflow |

**Not tested, so these must not be considered working until verified:**
- Live Stripe Checkout and Portal: the sandbox couldn't reach api.stripe.com. Webhooks were tested with locally signed events.
- Live Steam OpenID: steamcommunity.com was unreachable.
- Supabase Storage driver.
- Resend email delivery.
- Passkeys on a real device and domain (verified only with Chromium's virtual authenticator, by the QA tester).
- Screen readers.
- An independent penetration test.

## What the developer suite covers (139 checks)

- **Headers & CSRF:** CSP nonce, HSTS, XFO, no X-Powered-By; mutations without the CSRF header or cross-origin are blocked; generic errors.
- **Accounts:** identical register responses for new and existing emails; weak passwords rejected; identical login errors; forgot-password indistinguishable; lockout; known-network bypass during lockout.
- **MFA:** commendations blocked without MFA or with an unverified email; a pending-MFA session can't use APIs; TOTP replay rejected; 5 wrong codes revoke the session; recovery codes are single-use; re-auth is required for a password change once the window expires.
- **Commendations:** duplicate, same-day and unknown-category submissions rejected; new-account and comment holds.
- **Reports:** never auto-published; duplicate open report rejected; a script disguised as a PNG and SVG rejected; polyglot payload stripped by re-encoding; random storage keys; size and date validation; chunked uploads over 16 MB rejected.
- **Evidence IDOR:** the uploader can view, other users and guests can't, path traversal returns 404, and access is audit-logged.
- **Premium:** guests and free users get 402 on comments, summaries and history (API and page HTML); Plus works; no submitter or reporter identifiers; past_due, cancelled and expired subscriptions lose access.
- **Mass assignment and escalation:** unknown fields rejected; normal users can't moderate or change roles; `/admin` returns 404.
- **Identity:** can't link, unlink, verify or claim someone else's; same-name profiles are kept separate; a forged Steam callback is rejected.
- **Moderation:** the state machine is enforced; a summary is required; junior moderators can't remove content or view the audit log; conflict of interest blocks moderating your own report; owner rights work without Plus; non-owners can't respond; appeals restricted to seniors; owners can't remove reports.
- **RLS (direct SQL as `serversentry_app`):** no cross-user reads; role, subscription and status forging blocked; public views are column-safe and read-only; the audit log is immutable even for staff; MFA secrets, evidence and sessions are isolated; users can't rewrite sessions; staff can't publish their own responses; admins can't restrict admins; seniors can't rename users; users can't forge verification proofs; the audit chain is intact.
- **Stripe webhooks:** unsigned or missing signatures rejected; signed events accepted; replay ignored; out-of-order events ignored; past_due and cancel remove access; metadata spoofing grants nothing.
- **Rate limits** and **session management:** revoke others, logout, can't revoke other users' sessions.

## Independent QA round 1: findings and fixes

| ID | Severity | Finding | Fix | Regression test |
|---|---|---|---|---|
| QA-01 | Medium | Open redirect through a tab character in `next` / `returnTo` (`/\t/evil.example`) | `safeNext` rejects all control characters and backslashes, URL-resolves and requires the same origin | unit test + suite |
| QA-02 | Medium | A moderator could publish their own response on a report about their own profile | API conflict check plus a DB trigger blocks staff moderating responses or appeals they wrote, own, or reported | suite (DB) |
| QA-03 | Medium | Admins could suspend or sign out peer admins and super admins | Trigger: only super_admin can restrict admin+; admins can restrict moderators; route target-role check | suite (DB) |
| QA-04 | Medium | Registration revealed existing emails (session cookie only for new accounts) | Registration never issues a session and returns an identical body; the user logs in after verifying | suite |
| QA-05 | Medium | RLS let users UPDATE their own session rows (forge `mfa_method`, extend expiry) | Policy dropped; revocation goes through the auth service with an owner check | suite (DB) |
| QA-06 | Medium | Mobile menu overlay clipped by the header's backdrop-filter; no Escape key or focus trap | Overlay rendered in a portal to `<body>`; Escape key, focus trap, focus restored; compact cookie banner | Playwright |
| QA-07 | Medium | 16 MB upload cap checked only Content-Length; chunked 80 MB bodies were parsed | Stream read with a hard byte cap before multipart parsing | suite |
| QA-08 | Medium | Anyone could keep an account locked out for up to 24 hours | Lock capped at 1 hour; the owner can still sign in with the correct password from a network with a successful sign-in in the last 90 days | suite |
| L-1 | Low | 500 errors on a NUL byte in search, `Origin: null` on uploads, `/mfa?next=%0B` | Control characters stripped or rejected; safe URL parsing | suite |
| L-2 | Low | The 72-hour commendation hold failed open (two transactions) | Moved into the insert trigger (atomic) | |
| L-3 | Low | Same-second Stripe events could re-grant Plus after cancellation | Tie-break: a terminal state is never overwritten by a same-second non-terminal one | |
| L-4 | Low | Verification could restart on an unlinked account | Blocked in the API and at approval | |
| L-5 | Low | Users could insert verification rows with a claimed SteamID | RLS insert check | suite (DB) |
| L-6 | Low | Senior moderators could rename any user | Trigger: only self or admins | suite (DB) |
| L-7 | Low | Bidi-override characters in display names (spoofing) | Rejected in all name inputs; stripped in search normalisation | |

## Security issue register (open / accepted risks)

| ID | Severity | Issue | Status / decision needed |
|---|---|---|---|
| R-1 | Medium (architectural) | The single app DB role can set `app.role='system'` itself. RLS guards against application logic bugs, **not** SQL injection or a compromised app server, which would reach MFA secrets and tokens | **Open.** All queries are parameterised (no injection found). Before launch, consider separate DB roles per trust level (e.g. an auth-service role) or SECURITY DEFINER functions for auth tables. Decide with the pentester |
| R-2 | Low | Staff contexts can read `password_hash` / `stripe_customer_id` columns via RLS (the UI never selects them) | Open; addressed by R-1 role split or column-restricted views |
| R-3 | Low | Users can write audit rows under their own ID (actor can't be forged) | Accepted: needed for user-initiated audit events; the chain gives tamper evidence |
| R-4 | Low | Staff can create notifications for any user | Accepted: moderation needs it; titles are templated |
| R-5 | Low | A victim's reset emails can be suppressed via the 3-per-hour per-email cap | Accepted trade-off against email flooding; account recovery is available |
| R-6 | Info | "Fresh re-auth" is satisfied for 10 minutes after a full MFA sign-in | Accepted (sign-in includes MFA) |
| R-7 | Info | Public statistics show counts of pending and rejected reports | Required by the product brief; review in the DPIA |
| R-8 | Medium | No automated malware scanning of uploads (mitigated by re-encoding images) | Open: add a scanning service before launch if non-image evidence is ever allowed |
| R-9 | Medium | No automated alerting on security-event spikes | Open: configure a log drain and alerts before launch |
| R-10 | n/a | Independent penetration test not done | **Launch gate** |
