# 06 — Data lifecycle and privacy

> **Not legal advice and not a compliance claim.** Retention periods below are **provisional, pending legal review and approval**. GCO currently operates under the CEO's personal VAT registration while legal and fiscal arrangements are handled through Fiscozen; this document makes no statement about incorporation, tax or regulatory status.

## 1. Data categories
| Category | Examples | Purpose | Stored in | Access | Deletion mechanism |
|---|---|---|---|---|---|
| End-user conversations (client's customers) | message text, language, platform user id, notes, extracted facts (none while AI is off) | provide the contracted service | PostgreSQL (`Message`, `Conversation`, `Note`, `WebhookEvent`) | assigned operators, the client's managers; never other clients | retention job and per-person erasure (implemented, **not activated**) |
| Moderation content | text, https media links, decisions | moderation service | PostgreSQL | moderation operators, supervisors | same jobs |
| Staff data | name, email, role, shifts, earnings, QA scores | employment/pay | PostgreSQL | CEO, own manager/team, the person | anonymisation (name/email replaced, login removed; ids kept for pay history) |
| Applicants | name, email, phone, country, languages, message | recruitment | PostgreSQL (`CareerApplication`) | CEO only | purge job (anonymise after N days) |
| Client contacts / CRM | names, emails, company, notes | sales and onboarding | PostgreSQL | CEO, assigned hunter/manager | manual; CRM retention not automated |
| Financial records | invoices, usage ledger, earnings, payouts, commissions | accounting | PostgreSQL | CEO (own figures for operators/clients) | **kept** (legal/accounting retention; contains no message text) |
| Audit logs | actions with ids/counts | security and accountability | PostgreSQL | CEO/CTO | not purged |
| Logs | structured JSON (no message content found in the request path) | operations | Docker json-file (10 MB × 3 per container) | server administrators | rotates by size |
| Backups | whole-database dumps | recovery | server directory (14 days) and Backblaze B2 (**no expiry**) | server admin, B2 account owner | local 14-day sweep; **offsite not purged** |
| Attachments/files | **none** | — | — | — | — |

## 2. Provisional retention policy (CEO direction, **pending legal review**)
- **Conversations: 30 days.** **Applicants: 6 months.**
- **Current state: not configured and not running.** `Tenant.messageRetentionDays` is empty for every client; the retention job exists and has tests but is not scheduled; **no destructive deletion will be activated until the policy is approved and rehearsed in staging.**

## 3. Where retention exceptions or legal duties may apply (for the adviser)
- **Backups:** erased/expired data remains in local dumps for up to 14 days and in offsite dumps until a lifecycle rule exists. A 30-day offsite lifecycle was proposed, not applied.
- **Financial and accounting records** (invoices, ledgers, payouts, commissions) typically have statutory retention periods; the platform keeps them and keeps them free of message text.
- **Audit logs** keep ids only; retention period to be set.
- **Contractual or legal holds** (disputes, investigations) need a manual hold; the retention job has no "legal hold" flag yet — a limitation.
- **Client-side copies** are the client's responsibility.
- **Applicants who become staff** move into staff records governed by employment retention.

## 3b. Technical work to enforce an approved policy everywhere
1. Set `messageRetentionDays` per client and the applicant window; rehearse with `prisma/ops/retention.ts --dry-run` in staging (counts only).
2. Decide backup expiry (local and offsite) and implement it (a live-storage change needing approval).
3. Confirm log rotation meets the policy; add log redaction review.
4. Add a legal-hold flag if required.
5. Schedule the timers (`deploy/systemd`) only after approval.

## 4. Data-subject rights tooling (implemented, tested, not activated)
Client-raised export/erasure requests for their end users, due dates from the strictest regime recorded for the client, CEO execution against a stored hash (export returned once and not stored), staff/applicant anonymisation. Details: `../privacy-and-compliance.md`.

## 5. What is not done
Privacy policy, data-processing agreement and transfer terms are **not written** (lawyer needed); no data-protection impact assessment; no records-of-processing sign-off; sub-processor list drafted in `../privacy-and-compliance.md` §5 and to be verified; no claim of GDPR or any other compliance is made.
