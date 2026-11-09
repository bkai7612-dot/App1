# Platform integrations: investigation and how to extend

Principle: integrate only through **official, documented and authorised** mechanisms, within the publisher's terms. No scraping, no anti-cheat bypass, no memory inspection, no credential collection, no invented endpoints. Where no authorised integration exists, the platform is labelled **Manual identification** and ownership claims go to moderators.

> The status below reflects the developer's knowledge at build time. **Re-verify each publisher's current developer programme and terms before implementing**, because access policies change.

| Platform | Official mechanism | Status in ServerSentry | What's needed |
|---|---|---|---|
| Steam | Steam OpenID 2.0 sign-in (documented in Steamworks "Web API / OpenID"); Steam Web API `ISteamUser/GetPlayerSummaries` for public persona names | **Implemented** (`src/lib/server/steam.ts`): proves control of a SteamID64 and verifies the assertion directly with Steam (`check_authentication`). **Not tested live**, because the dev sandbox couldn't reach steamcommunity.com | Optional `STEAM_WEB_API_KEY`; accept the Steam Web API Terms; test end-to-end in staging |
| Riot Games | Riot Sign On (RSO, OAuth 2.0) for approved production apps; `account-v1` gives PUUID and Riot ID | Manual / future integration point | Apply for a production key with RSO in the Riot Developer Portal; product registration and policy review |
| Xbox | Microsoft identity platform OAuth plus Xbox Live user token exchange; access to Xbox services is governed by Microsoft partner programmes | Manual / future | Confirm eligibility for Xbox services for a web product; Azure app registration; Microsoft terms review |
| PlayStation Network | No public third-party web sign-in or ownership API known | Manual | Contact Sony's partner programme; otherwise remain manual |
| Ubisoft Connect | No public third-party developer API known | Manual | Contact Ubisoft partnerships |
| Minecraft (Java) | Microsoft identity → Xbox Live → Minecraft services; new apps need Mojang/Microsoft permission | Manual (game) | Request API permission; out of scope until approved |

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
