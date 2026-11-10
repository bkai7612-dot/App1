# Platform integrations: investigation and how to extend

Principle: integrate only through **official, documented and authorised** mechanisms, within the publisher's terms. No scraping, no anti-cheat bypass, no memory inspection, no credential collection, no invented endpoints. Where no authorised integration exists, the platform is labelled **Manual identification** and ownership claims go to moderators.

> The status below reflects the developer's knowledge at build time. **Re-verify each publisher's current developer programme and terms before implementing**, because access policies change.

## How players prove they own an account (best route first)

| Route | Platforms | Speed | Status |
|---|---|---|---|
| **Official sign-in**: Steam OpenID 2.0 | Steam | Instant | Implemented (`src/lib/server/steam.ts`); not tested live (sandbox) |
| **Official sign-in**: Battle.net OAuth (open developer portal) | Battle.net | Instant | Implemented (`src/lib/server/battlenet.ts`); needs `BATTLENET_CLIENT_ID/SECRET`; not tested live |
| **Discord verified connections** (`identify connections` scope) | PlayStation, Xbox, Riot, Epic, Battle.net, Steam | Instant if connected in Discord | Implemented (`src/lib/server/discord.ts`); needs `DISCORD_CLIENT_ID/SECRET`; not tested live. **The only automatic route for PlayStation** |
| **Profile code check** | Every platform (Ubisoft, EA, Nintendo, Rockstar, Roblox, mobile, other) | Moderator confirms, about 30 seconds each | Implemented and tested |
| **QR "use my phone"** | Any instant route above | Scan, then one tap on the phone | Implemented and tested up to the provider hand-off |

Automatic approval rules (to stop people claiming names that aren't theirs):
- An official sign-in or Discord connection must be **verified by the platform**.
- It is approved automatically only if its **account ID** matches the profile's recorded ID, or, on platforms with globally unique names (PSN, Xbox, Riot, Battle.net, Epic), its **exact name** matches.
- Otherwise the claim goes to a moderator **with the proven details**.
- A platform account can be verified on only **one** profile (database unique index).
- Verification is only needed to *claim* a profile; searching, voting, commenting and reporting never wait on it.

Official direct sign-ins that exist but need the publisher's approval before they can be added (planned integration points, not implemented):

| Platform | Mechanism | What's needed |
|---|---|---|
| Xbox | Microsoft identity platform + Xbox Live user token | Azure app registration; confirm Microsoft permits Xbox Live sign-in for this use |
| Riot Games | Riot Sign On (RSO) | Production API key with RSO approval |
| Epic Games | Epic Account Services | Epic Developer Portal product + brand review |
| PlayStation | none public | Sony partner programme; until then Discord or the code check |
| Ubisoft, EA, Nintendo | none public | Code check |

> Re-verify each publisher's current developer programme and terms before go-live; access policies change.

## Adding a game

```sql
INSERT INTO ss.games (slug, name, sort_order) VALUES ('apex-legends', 'Apex Legends', 80);
```

Put it in a new migration file such as `migrations/005_add_games.sql`. It appears in search, forms and the landing page automatically. To retire a game, set `active = false` (existing profiles remain).

## Adding a platform

1. Add a migration:

   ```sql
   INSERT INTO ss.platforms (slug, name, integration_status, identifier_label) VALUES ('epic-games', 'Epic Games', 'manual', 'Epic display name');
   ```

2. Keep `integration_status = 'manual'` until a real integration exists. Never mark `verified_linking` without one, because the UI uses it to say verification is official.
3. To build an integration, follow the Steam pattern:
   - a start function that creates an `account_verifications` row with a single-use, hashed state
   - a callback route bound to the signed-in user that validates the provider response **server-to-server**, using fixed provider URLs only (no user-controlled URLs, so no SSRF)
   - mark the account `verified` (the unique index ensures one verified owner per platform account), audit-log it, and notify the user
   - extend `src/app/api/identity/accounts/[id]/verify/route.ts` and `claim/route.ts` to route the new platform
4. Add tests for forged, replayed and expired callbacks.
