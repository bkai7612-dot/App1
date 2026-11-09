# Prototype walkthrough: what to test and what to look for

**Quickest way: press this link:** https://claude.ai/artifact/TTBK472MPTu4m1Ro7PLK5t. It's a clickable prototype with no sign-in; use the **View as** bar at the top to switch between guest, free member, Plus member, profile owner and moderator. The rest of this guide covers the full working app, which runs on the development server.

This is a working prototype running on a development server with **fictional demonstration data**. Payments run in simulated mode: real Stripe Checkout needs your Stripe keys.

## Test accounts

All accounts use the password **`Prototype-Test-2026!`**.

Two-factor authentication is mandatory. Either:
- add the TOTP secret **`JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP`** to any authenticator app (Google Authenticator, 1Password, Authy…) and type the 6-digit code, or
- click **"Use a recovery code"** and use one of the codes below. Each works **once**.

| Email | What it demonstrates | Recovery codes |
|---|---|---|
| `player@test.local` | Free member | `TEST1-PLAYE` … `TEST4-PLAYE` |
| `plus@test.local` | ServerSentry Plus subscriber | `TEST1-PLUSM` … `TEST4-PLUSM` |
| `owner@test.local` | Owns the demo "Shadow" (Rainbow Six Siege / Ubisoft) profile | `TEST1-OWNER` … `TEST4-OWNER` |
| `mod@test.local` | Senior moderator | `TEST1-MODER` … `TEST4-MODER` |

To reset the accounts and codes, run:

```bash
node scripts/create-test-accounts.mjs
```

To reset all demo data, run:

```bash
npm run db:remove-demo && npm run db:seed-demo
```

## Suggested tour (about 20 minutes)

### 1. As a guest (not signed in)
1. **Home:** check the iridescent hero, the search box, the "Example figures" label on the statistics and the honest platform labels (only Steam says "Verified linking").
2. **Search "Shadow":** there are three separate Shadow profiles (different games and platforms), never merged, with a warning that they share a username.
3. **Open the Rainbow Six Siege / Ubisoft "Shadow":** you can see +10 / −6 and the statistics breakdown. The Positive Feedback, Negative Reports and History tabs show the **Plus lock** with £0.99/month.

### 2. `player@test.local` (free member)
1. Sign in. You're asked for two-factor authentication.
2. On Shadow, click **Give Commendation**, pick a category and add a comment. Comments wait for moderation. Try commending again: the duplicate is blocked.
3. Click **Report behaviour**, fill the form and attach a screenshot. You'll get a reference number. The report is **not** published; follow it in **My Reports**.
4. Search for a name that doesn't exist, then choose **Add this player**.
5. **Account Settings → Security:** passkeys, authenticator, recovery codes, active sessions, security activity and "Report suspected compromise". Try **changing your password**: you'll be asked to confirm it's you.
6. **Account Settings → Privacy & data:** download your data, make a GDPR request, and see the delete-account flow.

### 3. `plus@test.local` (subscriber)
1. Open Shadow's **Positive Feedback**: approved comments are visible.
2. **Negative Reports:** moderator-written summaries labelled *Allegation*, *Disputed allegation*, *Under appeal* or *Resolved moderation outcome*, with the player's response. There are no reporter names and no evidence.
3. **Reputation History:** the 12-month chart.

### 4. `owner@test.local` (the reported player)
1. Open Shadow → **Negative Reports**. You can see reports about yourself **without paying**.
2. **Write a response** (it's moderated, then shown publicly and the report becomes *disputed*) or **Appeal**.
3. Note there's no Give Commendation or Report button on your own profile.

### 5. `mod@test.local` (senior moderator)
1. Open the user menu → **Moderation dashboard**, which shows the overview counters.
2. **Reports:** open the pending report, click **Start review**, then **Publish as allegation** (you must write a neutral summary) or **Reject**.
3. Look at the reporter history panel, abuse signals, evidence (every view is audit-logged) and moderation history.
4. **Other queues:** approve the commendation comment you left as `player@test.local`, approve or reject owner responses, decide appeals and review ownership claims.
5. **Users:** suspend a user or restrict their reporting (a reason is required).
6. Notice what you **can't** do: moderate your own reports, view the audit log (admins only) or change roles.

### 6. Things that should be blocked (try them)
- Visit `/admin` as `player@test.local`: you get a 404.
- Sign in, then close the tab at the 2FA step and try `/me/profile`: you're sent back to 2FA.
- As a free member, open `/api/players/<ID>/feedback?type=commendations`: you get 402 (Plus required).

### 7. Mobile
Open any page at phone width. The menu collapses into a full-screen drawer, and nothing scrolls sideways.

## What's simulated or not connected yet
| Area | State |
|---|---|
| Stripe Checkout | Code complete; needs your Stripe test keys. Plus is granted with `npm run dev:grant-plus` |
| Emails | Printed to the server log or the dev outbox file (no Resend key) |
| Steam verification | Implemented with Steam's official OpenID; not testable from this sandbox |
| Passkeys | Work on the domain set in `APP_URL`; through a preview proxy the domain may not match, so use TOTP or recovery codes |
| Admin (not moderator) powers | Need a passkey session by design |
