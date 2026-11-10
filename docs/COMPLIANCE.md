# Privacy, regulatory and legal compliance (UK)

> **This is not legal advice and does not establish compliance.** It documents how the software was designed and what remains for qualified UK specialists: a data protection practitioner and a media/defamation solicitor. Items marked **[LEGAL]** need professional review before launch.

## 1. Data protection by design (implemented)

| Principle | Implementation |
|---|---|
| Minimisation | No DOB, address, phone or ID documents. IPs stored only as keyed hashes. User agents truncated. Evidence re-encoded to strip EXIF/GPS. Only public gaming identifiers |
| Purpose limitation | Separate tables and views for public, moderation and security data. Public views expose summaries only |
| Storage limitation | Automated retention job (`src/lib/server/retention.ts`, daily cron) |
| Integrity/confidentiality | TLS, RLS, least-privilege DB role, AES-256-GCM for TOTP secrets, Argon2id, private evidence with audited access |
| Accountability | Hash-chained audit log, moderation records, DSR register with deadlines |
| Rights | Self-service export (access/portability), erasure with 30-day cooling-off, rectification/restriction/objection/complaint requests (`/account/privacy`), admin queue with one-month due dates |

## 2. Record of processing activities (draft) [LEGAL]

| Activity | Data subjects | Data | Lawful basis (proposed) | Retention |
|---|---|---|---|---|
| Account provision | Members | Email, display name, credentials, MFA | Contract (Art. 6(1)(b)) | Life of account + 30 days |
| Security monitoring | Members | Hashed IP, UA, security events | Legitimate interests (LI) | 12 months |
| Player profiles | Players (members **and non-members**) | Gaming usernames, public platform IDs | LI: **LIA required** | While active; correction/removal on request |
| Commendations | Submitters, players | Category, comment | LI | Life of profile |
| Reports & moderation | Reporters, reported players | Description, evidence, outcomes | LI: **LIA + DPIA required**; Art. 10 risk where allegations imply offences [LEGAL] | See section 3 |
| Billing | Subscribers | Stripe IDs, invoice status (no card data) | Contract; legal obligation (HMRC) | 6 years |
| Notifications & email | Members | Type, title | Contract / LI | 180 days after reading, 2 years maximum |

Processors needing DPAs and transfer assessments: Vercel, Supabase, Stripe, Resend. [LEGAL]

## 3. Retention schedule (implemented where marked ✓)

| Data | Retention | Mechanism |
|---|---|---|
| Evidence for rejected/removed reports | 90 days after decision | ✓ `delete_after` + retention job |
| Evidence for resolved reports | 180 days after outcome | ✓ |
| Evidence for published/disputed reports | While the report is public + 180 days after closure | ✓ set on resolve/remove |
| Deleted accounts | Disabled immediately, personal data erased after 30 days, tombstone row kept | ✓ |
| Sessions | 30 days after expiry/revocation | ✓ |
| Security events | 12 months | ✓ |
| Email tokens | 7 days after expiry | ✓ |
| Stripe event IDs | 90 days | ✓ |
| Audit logs | 6 years (proposed) | Manual DBA procedure with the append-only trigger disabled and the action logged [decision required] |
| Reports (text) | Retained while relevant to the profile; reviewed every 2 years | Process (manual) [decision required] |
| Billing records | 6 years | Stripe + payments table |

## 4. DPIA screening

A DPIA is **required** before launch. The processing involves systematic evaluation of individuals (reputation), potentially damaging allegations, data about people who aren't users, potential processing of offence-related allegations ("cheating", "threats"), and the possibility of children's data. The DPIA must cover the necessity and proportionality of publishing allegations, the LIA balancing for non-members, children, accuracy/rectification, reporter protection versus subject access rights, and international transfers. [LEGAL]

## 5. Cookies and PECR
Only strictly necessary cookies are used (inventory at `/cookies`). No analytics or advertising. The notice records acknowledgement; if optional cookies are ever added, they must default off and be consent-gated, with a withdraw mechanism.

## 6. Online Safety Act 2023: scope assessment (draft) [LEGAL]

- **Likely in scope as a user-to-user service.** Users generate content (commendation comments, report descriptions, which become moderator summaries, and player responses) that may be encountered by other users. Moderator-written summaries may reduce, but probably don't remove, user-to-user characteristics. Ofcom guidance must be checked.
- Carry out and record an **illegal content risk assessment** (harassment, threats, stalking/doxxing, fraud, CSEA). Implemented mitigations: no auto-publication, human moderation, a personal-data ban, evidence privacy, reporting and complaints routes (`/complaints`), suspension and reporting restrictions, rate limits and anti-brigading signals.
- **Children's access assessment:** registration requires a confirmation of age 18+, but browsing is open. Assess whether children are likely to access the service and whether highly effective age assurance is needed. Don't publish information about minors. [LEGAL]
- Maintain records, terms of service provisions on content handling, and complaints procedures. Review whenever features change.

## 6a. Age policy (L-03) [LEGAL]
- **Members must be 18+.** Enforced by self-declaration at registration (`confirmAge`, required). There is no age assurance beyond self-declaration.
- **Reported players can be any age.** A gaming username doesn't reveal age, so reports may concern children. Safeguards today: moderators publish neutral, behaviour-only summaries; no personal data; anyone (including a parent or guardian) can use the web complaint form; complaints are tracked with 2-day acknowledgement and 14-day decision targets.
- **For legal review before launch:**
  - whether self-declaration is enough under the Online Safety Act children's access assessment (Ofcom guidance on "highly effective age assurance");
  - whether publishing reports about players who may be children needs extra conditions (UK GDPR Art. 8, the ICO Children's Code / Age Appropriate Design Code), such as a higher evidence bar, shorter retention or not showing them publicly;
  - parental requests: how to verify a parent or guardian.
- Decision owner: operator, with a solicitor. Status: **open**. Launch gate `legal_review` must not be approved until this is answered.

## 7. Defamation and reputation [LEGAL]
Mitigations implemented:
- No auto-publication.
- A moderator-written neutral summary, explicitly labelled as an allegation.
- Clear labels for "disputed allegation" and "resolved moderation outcome (not a legal finding)".
- Right of reply and appeal.
- No overall score and no leaderboards.
- No paid removal.
- Reporter identities withheld.
- An audit trail.

The operator's position as a publisher of moderator summaries (Defamation Act 2013, s.5 website-operator defence and its regulations, and the effect of editing by moderators) needs specialist review. The public-reporting model must not launch without it.

## 8. Consumer law [LEGAL]
Plus is a digital service subscription. The following need review: the pre-contract information, the 14-day cancellation right and express-consent wording (Consumer Contracts Regulations 2013), VAT-inclusive pricing, the renewal/cancellation flow (Stripe portal), and whether the Digital Markets, Competition and Consumers Act 2024 subscription-contract rules apply when commenced.

## Launch gates

The software enforces these (`src/lib/launch-gates.ts`). In `SS_LAUNCH_MODE=production`, approved gate IDs must be listed in `SS_LAUNCH_GATES_APPROVED`, and **written sign-off must be recorded below** by the responsible person.

| Gate ID | Gate | Status | Approved by / date / evidence |
|---|---|---|---|
| auth_mfa_tested | Authentication & MFA testing | Developer + internal QA done; independent test pending | |
| access_control_tested | Ownership/access-control testing | Developer + internal QA done; independent test pending | |
| rls_tested | Database RLS testing | Developer + internal QA done; independent test pending | |
| secrets_reviewed | Secrets & configuration review | Pending | |
| evidence_storage_reviewed | Evidence storage review | Pending (Supabase bucket config) | |
| payments_reviewed | Payment security review | Pending; live Stripe untested | |
| privacy_terms_reviewed | Privacy notice & terms review | Pending [LEGAL] | |
| dpia_completed | DPIA | Pending [LEGAL] | |
| osa_assessed | Online Safety Act assessment | Pending [LEGAL] | |
| moderation_procedures | Moderation & complaints procedures | Draft (MODERATOR_GUIDE) | |
| backup_restore_tested | Backup & recovery test | Pending | |
| incident_plan | Incident response plan | Draft (INCIDENT_RESPONSE) | |
| pentest_completed | Independent penetration test (OWASP ASVS 5.0.0, level agreed with the tester) | **Pending** | |
| legal_review_reporting | Legal review of the reporting model | **Pending** [LEGAL] | |
| production_approved | Written production-readiness approval | Pending | |
