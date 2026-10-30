# 34 — CEO decisions (30 Oct 2026), P0 review for the first paying client, minimum pilot configuration

Proposal and record only. **No production deployment is authorised at this stage** (CEO, 30 Oct). No new paid service, infrastructure upgrade or purchase without a cost breakdown and the CEO's written approval. Companion to `30`, `31`, `32`, `33`.

## 1. Decisions recorded (CEO, 30 Oct 2026)
| # | Decision | Effect on the plan |
|---|---|---|
| 1 | Move towards **recurring partner commission**: 10% of revenue **actually collected** from the introduced client, for the duration of the introduced service, subject to a written agreement. One unified **Partner** model with categories (hunter, broker, subcontractor) and per-category permissions and commission rules. | Replaces the confirmed one-time rule for **new** agreements once written terms exist. P1-11 becomes "Partner model". Existing documents that say one-time (see §4) are updated only when the agreement text is approved; nothing in the code changes now. |
| 2 | HR commission: 10% of approved operator earnings for three calendar months from first paid work, payable only after the operator is paid, first valid referral wins, no retroactive rate change. **Legal review before implementation or any contractual commitment.** | P1-12 proceeds only after legal review of the agreement terms. |
| 3 | **Two-factor mandatory for Founder and CTO**, with secure recovery. | P0-3. Needs a staging test of enrolment and recovery before production (see doc 26). Production change needs separate approval. |
| 4 | Agrees overall direction; wants to review the full 11-item P0 list and dependencies; wants **strictly required for the first paying client** separated from **what can follow after launch**. P1: gradual partner management, reporting, contracts, tasks, Founder dashboard. | Section 2 below. |
| 5 | Keep a clear **technical feasibility process** for Zendesk, Gorgias, Intercom, Shopify and proprietary systems; capacity claims only from production-like load tests. | Checklist in doc 31 §D is the process; P0-10 is the load test. |
| 6 | No new paid services, upgrades or purchases without cost breakdown and written approval. **No production deployment authorised now.** | The Saturday 31 Oct window is **not approved** and is on hold; docs 32/33 stay as prepared evidence. |
| 7 | Friday: review demo, inventory, roadmap, integration capabilities, risks; identify the **minimum safe, commercially usable configuration for a first pilot of 2–5 operators**. | Section 3 below. |

## 2. P0 triage: strictly required for the first paying client vs can follow

Legend: **A** = must be done before the first real client's data enters the system. **B** = needed soon after launch; run a documented manual workaround meanwhile. **C** = conditional on that client's requirements.

| ID | Item | Class | Why | Workaround if not done | Depends on |
|---|---|---|---|---|---|
| P0-1 | Release of the pending version | **A** | The first client needs the release's billing, earnings, shifts, knowledge, training and privacy tools; the live version lacks them | none | CEO's separate written approval; window-start checks (doc 33) |
| P0-2 | Offsite backup hardening: restricted key, 30-day rule, offsite restore proven, backup encryption on | **A** | Recovery requirement the CEO set before real data | none | Account owner creates key; CEO creates and holds the two age keys; approved retention |
| P0-3 | Access security: two-factor mandatory for Founder and CTO; demo accounts off; audit-log protection | **A** | CEO decision 3; published demo password on a live system is unacceptable with real data | none | Staging test of recovery first; CEO enrols first; CEO approval of the production change |
| P0-4 | Client contract profile + 16-milestone tracker | **B** (minimal part A) | Real data does not depend on it. The existing 11-item go-live checklist already gates activation | One manual milestone sheet per client (owner, dates), reviewed weekly; the contract data kept in the signed contract | Database migration; none blocking |
| P0-5 | Integration status/environment + per-client health | **A** for the sandbox/production field and stored verification; **B** for the health page | A client must never be "live" without verification; a dev simulation must never be Live | CTO checks webhook event logs and system health daily | P0-4 for dates (soft) |
| P0-6 | Finance essentials | **A**: real GCO legal and billing details; reconciliation figures per period. **B**: invoice PDF, payment record, overdue report | First invoice must carry correct legal details | The accountant issues the legal invoice from the reconciliation figures (this is required anyway: an internal PDF is not a tax invoice) | CEO/accountant supply legal details; P0-7 for CSV |
| P0-7 | Export service (CSV first) | **A** minimal (CSV for usage, invoices, reconciliation, operator earnings, audited); **B** XLSX/PDF, scheduled, client downloads | Billing reconciliation and operator pay need records outside the screen | none good: copying from the screen is error-prone | Audit log, permissions |
| P0-8 | Operator delivery status per reply | **A** | Operators must see a failed delivery; a lost reply is the worst failure for a client | none | none (small) |
| P0-9 | Client portal per-field leak tests | **A** | Client isolation is the core promise | none | none (small) |
| P0-10 | Production-like load test + monitoring | **A** for a load test at pilot scale and an uptime alert; **B** for fuller monitoring | We claim nothing unmeasured; a silent outage must reach someone | CTO checks health each morning | Staging copy; any paid monitoring needs a quote |
| P0-11 | Qualification enforcement in assignment | **C** | Only if the client requires certification; touches the core pipeline (needs explicit approval for that area) | With 2–5 operators the manager sets only qualified operators Available; the existing training gate applies | Client requirement |

**Strictly required list (A):** P0-1, P0-2, P0-3, P0-5 (field + verification), P0-6 (legal details + reconciliation), P0-7 (CSV minimum), P0-8, P0-9, P0-10 (pilot-scale load test + uptime alert). **Can safely follow after launch with a workaround (B):** the full milestone tracker and contract fields, the per-client integration health page, invoice PDF/payment record/overdue report, richer exports. **Conditional (C):** P0-11.

**Also required before real client data, outside the software** (not on the P0 list but blocking): legal documents reviewed (processing agreement, privacy notice, sub-processor list, retention), a decision on production access from India (below), the CEO's backup keys, and the first client's integration feasibility and sandbox.

**Critical path (order):** CEO approvals → staging tests (two-factor recovery, backup encryption, new fields) → small builds (P0-5 field, P0-7 CSV, P0-8, P0-9) → release approval and window → backup key and offsite restore → pilot-scale load test → legal documents → first client's integration sandbox → go-live gate.

## 3. Minimum safe and commercially usable configuration for a first pilot (2–5 operators)

**Principle:** small, supervised, limited hours, one client, one integration, everything reversible. Numbers below are planning assumptions to confirm with real handling times; they are not commitments.

**People and coverage**
- **2–5 named operators**, each with a personal account (never shared), an assigned language set, and the client's required training/qualification completed. At the default setting of 2 concurrent conversations each, 3 operators serve up to 6 conversations at the same time; coverage hours must be chosen so that at least **two** qualified operators are on shift (one is the backup).
- **One supervisor** with the QA and escalation role (the manager role, or the CTO/CEO while the team is this small), reviewing a daily sample of replies and handling escalations.
- **Limited coverage hours**, not 24/7. Hours are set from the roster that can actually be staffed, and the shift plan is entered for the whole pilot period so uncovered slots are visible.
- **Response-time target** set conservatively for the pilot and agreed in writing; widened or tightened only from measured results. No uptime or SLA guarantee beyond what the pilot measures.

**Platform configuration**
- One tenant for the client with the correct timezone, hours, SLA seconds, per-message (or the agreed) billing model, VAT, payment terms and a message-retention period.
- **Integration:** the generic signed webhook interface, or a client-specific connector only after the feasibility checklist (doc 31 §D) is "feasible" and a sandbox exists. Staged → verified both directions → checklist → Founder go-live. A configured integration never counts as live.
- Knowledge base populated with the client's instructions, approved quick replies and escalation contacts; operators complete the client's training modules.
- **AI off.** Moderation, privacy tools and weekly reports enabled only if the client's scope needs them.
- Client users: one or two accounts (single client role today); the client sees only its own data.

**Security and recovery (before real data)**
- Two-factor mandatory for Founder and CTO; recommended for managers and operators (not enforced by default today).
- Demo accounts off; every account named; password policy as implemented.
- Nightly backups with the offsite copy; the **offsite restore proven**; backup encryption on with the CEO's keys; restore drill repeated after the first week.
- **Access to production by the CTO for real client data stays closed until the remote-access review** (`18`, `legal-drafts/06`) is resolved by legal advice or an EU-based administrator is named; until then development and testing use fictional data only.
- Uptime alert to Founder and CTO; daily morning check; incident contact list agreed with the client.

**Commercial and finance**
- Written pilot agreement (scope, hours, languages, response target, price, duration, data terms) reviewed legally.
- Billing reconciled at month end from the platform figures; the accountant issues the legal invoice; operator earnings reviewed and paid from the ledger.
- Partner commissions (if the client was introduced) follow the written agreement only, on collected revenue.

**Pilot exit criteria (agreed in advance)**
Measured response times against the target; QA pass rate; zero client-isolation incidents; delivery success and no lost replies; billing reconciliation matching to the cent; operator feedback; a go/no-go review with the CEO before extending or adding volume.

**What this configuration does not include:** hundreds of operators, 24/7 coverage, multiple clients, native connectors for platforms that are not built, e-invoicing integration, partner/recruiter portals, exports beyond CSV. These follow the roadmap.

## 4. Documents to update when the partner agreement text is approved (not now)
They currently state the one-time rule: `docs/gco-sales-operating-playbook.md`, `docs/technical-security-pack/03-crm-and-workflows.md`, `docs/operations-features.md`, `docs/gco-first-client-runbook.md`, the Hunter console text, and the schema comment on `Commission`. Updating them before the agreement is approved would misstate what the software does.

## 5. Costs
No cost is added by this document. Items that may need a cost breakdown and written approval: monitoring/uptime service, accounting/e-invoicing provider, infrastructure upgrade if the pilot-scale load test shows a limit, legal review fees, and any client-platform licences.
