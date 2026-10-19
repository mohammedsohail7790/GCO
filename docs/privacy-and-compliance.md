# Privacy and international compliance — technical controls and open legal work

> **This is an engineering document, not legal advice.** It describes what the platform can technically do and what GCO must still get from qualified lawyers and the accountant before operating in a new country. Every retention period, deadline and transfer mechanism below is **indicative** until counsel confirms it per client contract and jurisdiction. Nothing here is a compliance certification, and GCO makes no such claim publicly.

## 1. Roles

For the conversation data of a client's end users, **the client is the controller and GCO is the processor**; operators and managers act on GCO's behalf. For GCO's own staff, applicants, website visitors, hunters and client contacts, **GCO is the controller**. This split decides who answers a request, who signs what, and is the first thing a lawyer must confirm per client.

## 2. What the platform enforces today

| Control | How | Evidence |
|---|---|---|
| Tenant isolation | every query is scoped by tenant; roles are tenant-pinned (`lib/auth/tenantGuard.ts`) | E2E `05-tenant-isolation`, new specs 40–47 |
| Role-based access | permission matrix (`lib/auth/rbac.ts`), supervisors limited to their team | `06-rbac`, `39-supervisor-cto` |
| Strong sign-in | bcrypt, session revocation, optional TOTP 2FA with recovery codes | `35-two-factor` |
| Audit trail | sensitive actions write `AuditLog` (ids and counts, never content, tokens or subject ids) | privacy and billing tests assert this |
| Per-client **retention window** | `Tenant.messageRetentionDays`; `runRetention` removes personal content (messages, notes, AI facts and suggestions, escalation text, raw webhook payloads, moderation content) while keeping ids, timestamps, statuses and the **billing and earnings ledgers** | `tests/integration/privacy.test.ts` |
| **Data-subject requests** | clients raise export / erasure requests for their end users; due date from the strictest regime the client is under; CEO executes with the id re-entered (only a hash is stored); export returned once, not stored | privacy + `45-privacy` |
| Staff / applicant **anonymisation** | name/email replaced, login and 2FA removed, sessions revoked; ids kept so pay and audit history remain valid; job applicants anonymised after N days | privacy test |
| Regime and region fields | `Tenant.regulations`, `Tenant.dataRegion` record which regimes and where data lives, per client | admin Privacy screen |
| Secrets | webhook secrets per integration, invitation tokens hashed, no tokens in audit | existing + wizard tests |
| Backups | nightly PostgreSQL dump to Backblaze B2 (EU), see `docs/disaster-recovery.md` | **restore drill still NOT VERIFIED** |

Run daily (cron/systemd timer): `npx tsx prisma/ops/retention.ts` (add `--dry-run` to preview). Weekly operator reports: `prisma/ops/weekly-reports.ts`.

## 3. What is deliberately not automated

- **Backups are not edited by erasure.** An erased person can still exist in an older backup until it expires. The backup retention period must be set (and disclosed) so backups age out; counsel decides the acceptable period.
- **Client platform copies.** Erasing in GCO does not erase on the client's own platform — that is the client's duty as controller.
- **Financial records** (invoices, usage ledger, earnings, payouts) are kept for the legally required period (Italian accounting records are typically kept for years — the accountant sets the period). They contain no message text.
- **Audit logs** keep ids and counts only; they are not purged by these tools.
- Deleting a *user* row is never done; anonymisation keeps referential integrity.

## 4. Record of processing (draft, for the DPO/lawyer to complete)

| Processing | Subjects | Data | Purpose | Basis (to confirm) | Retention (to confirm) | Role |
|---|---|---|---|---|---|---|
| Handling client conversations | client's end users | messages, language, platform user id, notes, extracted facts | provide the contracted service | client's instruction (processor) | per client contract, default none until set | processor |
| Moderation | client's end users | content, media links, decisions, warnings | provide moderation | client's instruction | per client contract | processor |
| Operator pay and reports | operators | messages written, ratings, earnings, attendance | pay and manage staff | contract / legal obligation | statutory accounting period | controller |
| Hiring | applicants | name, email, CV text | recruitment | consent / pre-contract steps | default 12 months | controller |
| Sales CRM | prospects, hunters | company and contact details | sales | legitimate interest / contract | to confirm | controller |
| Website | visitors | contact/pilot form data, booking via Calendly | respond to enquiries | legitimate interest / consent | to confirm | controller |
| Security and audit | all users | ids, IP in some events, actions | security, accountability | legitimate interest | to confirm | controller |

## 5. Sub-processors and transfers (verify with each vendor's current terms)

| Vendor | Used for | Location (as documented) | Transfer question for counsel |
|---|---|---|---|
| Hetzner Cloud | application servers and database | Nuremberg, Germany (EU) | none inside EU; DPA with Hetzner |
| Backblaze B2 | offsite database backups | EU region bucket | US company: confirm the EU-region terms and transfer mechanism |
| Cloudflare | DNS, proxy, TLS | global edge | US company: DPA + SCCs / Data Privacy Framework status |
| Zoho Mail (EU) or Google Workspace | email | EU (Zoho) / see plan | if Google: DPA and data-region choice (`docs/email-google-workspace-plan.md`) |
| Calendly | public booking link | US | US company: DPA / transfer basis |
| GitHub | source code (no personal data intended) | US | confirm no personal data is committed |
| OpenAI (or other AI provider) | **not enabled** (`AI_PROVIDER=mock`, no key) | — | if enabled: DPA, zero-retention terms, no training on data, region, per-client approval |

Each client DPA must list the sub-processors above that touch that client's data, with notice-of-change terms. International transfers outside the EEA need an Article 46 mechanism (e.g. SCCs plus a transfer impact assessment) unless an adequacy decision applies — **for counsel**.

## 6. Country and regime matrix (framework)

The platform already stores the applicable regimes per client and drives deadlines from them (`lib/privacy/regimes.ts`). Starting set: **EU GDPR, UK GDPR, California CCPA/CPRA, Brazil LGPD, Other**. Before serving a new country:

1. Counsel confirms the regime, the controller/processor split, request deadlines, breach-notification duty (e.g. 72 h under GDPR) and any local-law items (works-council rules for monitoring staff, data-localisation, children's data).
2. Add or adjust the regime entry (key, label, deadline, notes) — one file, tested.
3. Set the client's `regulations`, `dataRegion` and retention window in **Admin → Privacy**.
4. Update the DPA and sub-processor list for that client.

Children's data and special-category data (e.g. dating platforms) need a **DPIA** before onboarding; the moderation and AI modules raise the bar further.

## 7. Breach and incident response

Needed before the first paying client: a written incident procedure (who decides, who notifies the client controller without undue delay, how to contain), contact points, and a log. The platform supports it with audit logs, system-health, alerts and per-tenant suspension (`Tenant.status`); the **procedure and notification templates are not written yet**. `docs/client-incident-process.md` is the starting point.

## 8. Documents that must be produced by, or reviewed by, qualified professionals

| Document | Owner | Status |
|---|---|---|
| Website privacy policy (GCO as controller) | lawyer | **not written; not published** |
| Cookie / analytics notice and consent banner (if any non-essential cookies) | lawyer + engineering | none in use today; decide before adding analytics |
| Terms of service / client master agreement | lawyer | not written |
| **DPA** (processor terms) per client, with Annex of sub-processors and security measures | lawyer | not written; technical annex can be drawn from §2 |
| Standard Contractual Clauses / transfer impact assessments where needed | lawyer | not written |
| Employment / contractor terms for operators incl. confidentiality and monitoring notice | labour lawyer, per country | not written |
| Legal notice with company identity (needs the confirmed details, `docs/business-details-and-vat.md`) | lawyer + accountant | blocked on the details |
| Retention schedule signed off | lawyer + accountant | §2/§4 are drafts |
| DPIA for dating/moderation clients | DPO / lawyer | not started |
| Software ownership and source-code rights (the repository is on a personal GitHub account, `docs/disaster-recovery.md` §7) | lawyer | **open — assign the IP in writing to the company** |

I have intentionally **not** drafted or published a privacy policy or DPA text: a wrong or over-promising policy is worse than none. If the founder wants working drafts for the lawyer to mark up, I can prepare them clearly labelled as drafts and keep them out of the public site.

## 9. Before operating in a new market (checklist)

- [ ] Lawyer confirmed regime, roles, deadlines, breach duties, localisation
- [ ] Client DPA signed with sub-processor list and security annex
- [ ] Client's retention window and regime set in Admin → Privacy; dry run reviewed
- [ ] Hosting region confirmed in the DPA (`dataRegion`)
- [ ] DPIA done where required (children, dating, special categories, AI)
- [ ] Incident procedure and client contact for notifications agreed
- [ ] Backup retention disclosed and a **restore drill** completed
- [ ] Operators informed of monitoring (reports, QA) as local law requires
