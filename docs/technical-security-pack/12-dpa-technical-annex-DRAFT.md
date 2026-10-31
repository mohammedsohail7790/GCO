# 12 — DPA technical annex and public technical privacy information — DRAFT (31 Oct 2026)

> **Status: internal technical draft for the CEO and for legal review. Not legal advice. Not a compliance, certification or independent-test claim.** It states technical facts verified by GCO's own testing, marks everything unverified with **[confirm]**, and lists known limitations plainly. The legal text of the Data Processing Agreement (adopting the Commission's controller–processor standard clauses and filling their annexes), the privacy notice and the transfer assessment are for a qualified lawyer (see `docs/legal-drafts/` and `docs/readiness/36`). Facts are as of 31 Oct 2026 for the **production system as deployed**; items marked *(release)* apply only after the planned release, which is not authorised yet.

## Part A — Annex II: technical and organisational measures

### A1. Access control and authentication
- Role-based access with eight roles (CEO/administrator, manager, supervisor *(release)*, operator, client, hunter, assistant, CTO); a central permission matrix enforced on the server; an automated structural test fails if any API route lacks a caller check unless explicitly listed as public. Evidence: `lib/auth/rbac.ts`, `tests/unit/apiRouteAccessChecks.test.ts`, E2E `06`.
- Passwords: bcrypt, cost 12; staff password policy (minimum 12 characters, no published demo password). Sessions: short-lived signed access tokens and hashed refresh tokens in HTTP-only, SameSite-strict cookies (secure in production); revocation at logout and password change; login rate limit of 10 per 15 minutes per address and account.
- Two-factor (authenticator app) with single-use recovery codes and replay protection is implemented and tested. **It is not enforced today;** the CEO has decided it will be mandatory for founder and CTO accounts, to be enabled after a staging rehearsal and separate production approval.
- Staff accounts are named; operator and manager accounts belong to exactly one client. Five demo accounts on the production system are to be disabled before real client data is loaded **[open]**.

### A2. Client separation
- Every record carries a client (tenant) identifier; for client users the tenant is taken from the session, never from the request; staff are checked against it; supervisors see only their team *(release)*. Evidence: `lib/auth/tenantGuard.ts`, E2E `05`, `20`, `39`–`51`.
- Separation is enforced **by the application, not by database row-level security** (disclosed limitation). Per-field response tests for client-facing endpoints are planned **[open]**.

### A3. Encryption and secrets
- **In transit:** HTTPS for the website and platform; HTTP is redirected (observed live 31 Oct); traffic is terminated at Cloudflare and again at the server's Caddy proxy with automatically issued certificates; realtime connections use TLS. **[confirm Cloudflare SSL mode is Full (strict).]** Strict-Transport-Security and a Content-Security-Policy are **not live** (report-only CSP *(release)*).
- **At rest:** database storage relies on the host's disk **[confirm whether Hetzner volume encryption is enabled; none is applied by GCO at application level]**. Authenticator seeds are encrypted in the database. Offsite backups use the storage provider's own server-side encryption **[confirm in the Backblaze account]**; **client-side encryption of dumps is available *(release)* but not active** until GCO management installs its public keys.
- **Secrets:** server-side environment files and the database only; none in source control (history scanned); per-integration webhook secrets shown once and rotatable with an audit entry; invitation tokens stored hashed.

### A4. Integrity, logging and audit
- Audit log of sensitive actions (sign-ins and failures, assignments, escalations, administrative, billing, privacy and integration changes) recording identifiers and counts, **not message text**. The absence of content is asserted by tests for the covered events and rests on call-site discipline elsewhere (no technical enforcement). No code path edits or deletes audit rows; there is no database-level immutability yet **[open]**.
- Input validation (schemas on every writing endpoint), webhook signature verification (HMAC-SHA256, replay window, 1 MB limit, 1–100 events, deduplication), outbound-request safeguards against server-side request forgery.

### A5. Availability, backup and recovery
- **Single server** (Hetzner CPX32 class, 4 vCPU, 8 GB) runs web, worker, realtime, PostgreSQL, Redis and proxy. No clustering or failover.
- **Backups:** nightly database dump (about 03:30 UTC) integrity-checked with `pg_restore --list`; local copies kept 14 days; offsite copy to a private Backblaze B2 bucket verified in the log each night; provider-level server backups also enabled **[confirm]**. **Recovery point up to about 24 hours.** No offsite expiry rule yet; no automatic alert on failed backup **[open]**.
- **Recovery tested:** a production dump was restored into an isolated environment and a code-plus-database rollback rehearsed twice on 29 Oct 2026 (identical results). A restore *from the offsite copy* has not been done **[open]**. Recovery *time* has not been measured under realistic conditions.

### A6. Resilience, testing and change control
- Automated tests: unit 730, integration 219, end-to-end 297 passing on the release candidate (29 Oct), including access rules, client separation, delivery retries, dead-letter recovery and assignment races. Load: one development-environment test (1,000 messages per minute for 3 minutes); **no production-like load test yet**.
- **No independent penetration test or audit has been performed.** An internal OWASP-ASVS-aligned self-assessment exists (`docs/readiness/19`). Dependency audit: 0 production vulnerabilities on 20 Oct 2026.
- Separate development, staging and production configurations; production refuses development adapters; releases follow a written plan with a tested rollback; additive database migrations.

### A7. Integration security
Per-client endpoint secrets; signed inbound events and outbound replies with an idempotency key; a reply counts as delivered only after a 2xx answer, otherwise retried (at-least-once); signed ping test in both directions before go-live; a client is never active until verified and approved by GCO management. Only the generic signed webhook connector exists; no native platform connector is built. Credentials are never displayed after creation.

### A8. AI
AI is **disabled platform-wide**: the master switch must equal `enabled`, is pinned to `disabled` in the deployment files *(release)*, and an external provider additionally needs a second approval. No client data is sent to any AI service. Enabling it would require a written amendment and a new sub-processor entry.

### A9. Organisational measures (for the lawyer to complete)
Named accounts; role-based need-to-know; confidentiality undertakings for staff (draft `legal-drafts/04`); for the first client, operators are located in the EU/EEA and **no person outside the EU/EEA accesses the client's personal data** (CEO decision 23 Oct, reconfirmed 31 Oct). Administrator access to production from outside the EU/EEA (currently the CTO, in India) is **closed for real client personal data** until the transfer assessment and safeguards are done.

### A10. Incident response (technical summary)
Alert routing by role exists in the platform (queue age, SLA, coverage, escalation, QA backlog) with optional email; breach procedure draft `legal-drafts/09` (assess, contain, record, notify the client without undue delay, who decides). Gaps **[open]**: no automatic alert for backup or uptime failure, no paging, no error-tracking service, no tested incident exercise.

### A11. Known limitations (to be disclosed, not hidden)
Single server; application-layer isolation only; two-factor not enforced; backups not client-side encrypted and offsite key currently able to delete; no offsite expiry; no independent test; no production-like load test; no alerting; audit rows not immutable at database level; no certification of any kind.

## Part B — Locations and sub-processors (draft Annex III)

| Sub-processor | Service | Data touched | Location | Status / to confirm |
|---|---|---|---|---|
| Hetzner Online GmbH | Hosting of application, database, logs | All client and personal data | Nuremberg, Germany | Active. Obtain and record the processing terms (DPA) accepted by GCO |
| Cloudflare, Inc. | DNS, reverse proxy, TLS termination | Traffic in transit (including message content passing the proxy); metadata | Global edge network | Active (free plan). **Transfer terms and EU processing options to be reviewed by a lawyer** |
| Backblaze, Inc. | Offsite database backups (private bucket) | Entire database dump (not encrypted by GCO today) | **[confirm bucket region]**; US-group provider | Active. Transfer assessment needed; client-side encryption planned |
| Google Ireland Ltd (Workspace) | Company email | Business contacts, possibly client contact emails | EU | Active (founder@, partnerships@); Zoho Mail EU remains in the mail records until retired |
| Zoho Corporation (EU) | Company email (legacy) | as above | EU | To be retired |
| GitHub | Source code, CI | Source code only; no client data | US | Active; confirm organisation ownership |
| Calendly | Public booking link | Visitor booking details | **[confirm]** | Only for prospects, not client data |
| UptimeRobot | Uptime monitor | Public URLs only | **[confirm]** | Configured, **unverified** |
| SMTP provider | Notification email | Notification titles | — | Off; any provider added only with notice |
| AI provider | — | none | — | Disabled; none engaged |

Changes to sub-processors: notice to the client with the right to object (draft DPA §2).

## Part C — Retention and deletion (technical description)
- **Tools implemented and tested; not activated:** per-client message retention (`Tenant.messageRetentionDays`) with redaction that keeps financial records; client-raised export and erasure requests for their end users with due dates; anonymisation of staff and applicant records; a retention job and timers exist but are **not installed**.
- **Provisional policy (CEO, pending legal review):** conversations 30 days after close or as the client instructs; applicants 6 months; financial records as tax law requires; audit log period to be set.
- **Backups:** erased data remains in local dumps for up to 14 days and in offsite dumps until an expiry rule is applied (30-day rule proposed, not applied). The contract must say so.
- **Not provided:** legal-hold flag; deletion of data held in client-side copies (the client's responsibility).

## Part D — International transfers and access
Primary storage in Germany. Transfers can arise through (1) Cloudflare and Backblaze (US-group providers), (2) any administrator access from outside the EU/EEA. Safeguards (standard contractual clauses, transfer impact assessment, provider terms) are **not yet in place** and need legal input. Rule in force: no real client personal data is accessed from India; development, testing, staging and demonstrations use fictional data only. See `docs/readiness/18` and `docs/legal-drafts/06`.

## Part E — Public technical privacy information (proposed website text; for legal review before publication)

> **How GCO handles data in conversation operations.** When GCO provides written conversation operations for a client, the client decides why and how the data of its customers is used and GCO processes it on the client's instructions under a data processing agreement. GCO also holds business contact data and applicant data for its own purposes.
>
> **Where data is held.** The platform runs on servers in Germany. We use a small number of service providers to operate it (hosting, network delivery, backups, email); the current list is available on request and clients are told in advance of changes.
>
> **Who can access it.** Access is limited by role and, for clients, by account. Each client's data is kept separate. For client operations, only authorised operators and supervisors assigned to that client can see its conversations.
>
> **How it is protected.** Encrypted connections, hashed passwords, role-based access checked on the server, an activity log of sensitive actions, daily backups with an offsite copy, and automated testing of access rules. We have not been independently audited or certified, and we do not claim to be.
>
> **Retention and deletion.** Retention periods are agreed with each client. We provide tools to export or erase data about an individual at the client's request. Backup copies are removed as backups expire.
>
> **AI.** AI is not used to process client conversations.
>
> **Questions and requests.** [privacy contact address and legal entity details to be supplied by the CEO].

## Part F — Evidence and confirmations still needed before this annex is shared
1. Hetzner and Backblaze account facts (disk encryption, bucket region and encryption, accepted processing terms) and Cloudflare SSL mode, by the account owner.
2. Legal entity details, privacy contact address, registered address (CEO).
3. Lawyer's review of Parts B to E and the DPA text; transfer assessment.
4. Installation of the CEO's backup public keys and a proven offsite restore; backup alerting.
5. Release (if the partner's wording relies on *(release)* items).
