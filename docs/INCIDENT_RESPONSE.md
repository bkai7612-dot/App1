# Incident & data breach response plan

## Roles
- **Incident lead:** an admin on call. **DPO/privacy lead:** [NAME]. **Legal:** [FIRM]. **Comms:** [NAME].
- Keep an incident log (time-stamped decisions) in a restricted location. Do not paste personal data or secrets into chat tools.

## 1. Detect and triage (target: 1 hour)
Sources include security alerts (spikes in `login_failure`, `mfa_failure`, `unauthorised_access_attempt`, `evidence_access_denied`, `compromise_reported`), an audit-chain break shown on the Audit page, vendor notices (Vercel, Supabase, Stripe), and user reports. Classify severity: **S1** confirmed exposure of personal data or admin compromise; **S2** suspected; **S3** contained vulnerability.

## 2. Contain
- Revoke sessions:
  - A user: Admin → Users → **Sign out all sessions**.
  - Everyone:

    ```sql
    UPDATE ss.sessions SET revoked_at = now(), revoked_reason = 'incident' WHERE revoked_at IS NULL;
    ```

- Suspend compromised accounts and demote compromised staff (super admin).
- Put the app into pre-launch mode by removing gate IDs from `SS_LAUNCH_GATES_APPROVED` and redeploying. This disables registration, payments and report submission/publication.
- Rotate credentials (below). Preserve evidence: take a database snapshot and export the audit/security logs before any cleanup.

## Credential rotation
| Secret | How | Effect |
|---|---|---|
| `serversentry_app` DB password | `ALTER ROLE ... PASSWORD`, update Vercel, redeploy | none |
| Supabase service-role key | Supabase → API → roll JWT secret/keys, update Vercel | none |
| `STRIPE_SECRET_KEY` / webhook secret | Roll in Stripe, update Vercel | none |
| `APP_HMAC_SECRET` | Generate new value | Invalidates outstanding email tokens and recovery-code hashes; users must regenerate recovery codes; IP hashes become unlinkable |
| `APP_ENCRYPTION_KEY` | Re-encryption migration required (decrypt with the old key, encrypt with the new) | Without migration, all TOTP enrolments break; users re-enrol |
| `CRON_SECRET`, `RESEND_API_KEY` | Roll and update | none |

Rotate routinely every 6–12 months, and immediately on suspected exposure. Keep development, staging and production secrets separate.

## 3. Assess reportability (UK GDPR Art. 33/34)
- Is it a personal data breach (confidentiality, integrity or availability)? What data, how many people, and are there special or offence-related categories (reports may allege offences)?
- If there's a risk to individuals' rights and freedoms, **notify the ICO without undue delay and, where feasible, within 72 hours of becoming aware**. If you notify after 72 hours, give the reasons. Use the ICO breach reporting service.
- If there's a **high risk**, tell the affected individuals without undue delay, in clear language: what happened, the likely consequences, what you're doing, and what they should do (for example, reset their password or re-enrol MFA).
- Record **every** breach in the breach register, even those not reported, with the reasoning.
- Notify processors and controllers as contracts require, and the police or Action Fraud where relevant.

## 4. Eradicate, recover and review
Patch, test (including the security suite), restore from backup if needed (follow the tested restore procedure), monitor closely for 30 days, and hold a post-incident review within 10 working days. Update this plan and the security issue register.

## Illegal content
- Threats, doxxing or harassment: remove immediately (senior moderator), preserve a minimal record, and suspend the accounts involved.
- Suspected CSEA: do **not** download or forward it. Restrict access, notify an admin, and report to the NCA/CEOP and the Internet Watch Foundation as advised by legal. Comply with the Online Safety Act reporting duties once they apply.
- Imminent risk to life: contact the emergency services.
