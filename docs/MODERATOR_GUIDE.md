# Moderator setup & guide

## Setting up staff

1. The person registers a normal account, verifies their email and enrols two-factor authentication.
2. Grant a role:
   - An admin can do this in **Admin → Users → Change role**. This needs re-authentication and is audited.
   - For the very first super admin, run this from a trusted machine:

     ```bash
     npm run admin:bootstrap -- <email> super_admin
     ```

3. Staff sign out and back in. Staff powers activate **only** in MFA-verified sessions, and admins need a **passkey or hardware security key** session. Privileged sessions expire after 8 hours, or 30 minutes idle.
4. Least privilege: start everyone as **moderator** and promote to senior only after training.

## Report workflow

```
submitted → under_review → published (Allegation) → disputed (owner responded) / appealed → resolved (outcome) / removed
              │                                                                              
              ├→ rejected                                                                    
              └→ (request more information: stays under_review; reporter is asked)
```

1. **Start review.** Read the private description, open the evidence (every view is logged) and check the **reporter history** and **automated signals** (report bursts, clusters of young accounts, repeat or frequently rejected reporters). Signals are context, not proof.
2. **Request more information** if it's unclear. The reporter sees your question in My Reports.
3. **Publish** only if the report is credible, within the guidelines and in the public interest of the community. Write a **neutral public summary**:
   - Frame it as an allegation: "A community member alleges that…"
   - No names, personal data, quotes from private messages, evidence or reporter details.
   - Never say "cheater", "criminal" or similar. ServerSentry never determines whether cheating occurred.
4. **Reject** if it's unsubstantiated, retaliatory, personal-data-heavy, off-platform, or part of brigading. Record your reason.
5. Senior moderators can **record an outcome** (upheld, or not upheld, which hides it) or **remove** published content.
6. **Appeals** are decided by a senior moderator who did **not** publish the report. Record your reasons. Upholding the appeal removes the report.
7. **Responses** from the profile owner are published unless they contain personal data or abuse.

**Conflicts of interest:** you can't act on reports you submitted, reports about profiles you own, or your own claims. The system enforces this. Hand over anything else you feel conflicted about.

## Commendations
Comments are checked for personal data, abuse and spam. Use **Approve without comment** to keep the recognition while dropping an unsuitable comment.

## Ownership claims and verification
- **Never** approve because a username matches.
- To mark an account **Verified**, issue the claimant a random one-time code and ask them to place it in a public field on the platform profile (bio or status). Confirm it yourself and record what you checked.
- Use **Possible match** for weaker evidence.
- Steam claims that were proven by OpenID but don't match a recorded SteamID come to you with the proven SteamID.
- Never ask for passwords, private messages or ID documents.

## User management (senior+)
Suspend or restrict reporting proportionately, and always record a reason. Only admins can restrict staff accounts. Role changes need an admin plus re-authentication.

## Illegal content and safety
Remove clearly illegal content (threats, doxxing, harassment) immediately and escalate to an admin. CSAM must **never** be viewed beyond what's necessary or downloaded. Follow the escalation in [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md#illegal-content). If there's an imminent risk to life, contact the emergency services.

## Account recovery (admins)
Approve only after out-of-band checks (control of the account email plus account-specific details), and record them. Staff accounts can't be recovered through this flow; use the documented break-glass procedure, which needs two admins.
