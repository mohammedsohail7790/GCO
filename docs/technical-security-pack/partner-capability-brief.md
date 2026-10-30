# GCO — Technical capability brief for BPO partners

*Draft of 2026-10-30, for the CEO's review before it is shared. It summarises the platform and says for each capability whether it is **live**, **release-ready** or **needs development** (legend below). It is not a contract, a certification or a service-level commitment. Delivery timelines are agreed only after GCO has validated your integration and operating requirements.*

## Status legend
- **Live** — running in GCO's production environment today.
- **Release-ready** — built and automatically tested in the release candidate; **goes live only when GCO's management approves the planned production release.** Until then it is not in production.
- **Needs development** — not built. Scoped and estimated with you before any commitment.

## 1. What this covers
GCO runs **written, human-handled conversation operations** (chat, email-style and ticket support, community moderation) for Italian and other EU-language work. The platform routes each conversation to a trained operator, tracks response times, supervises quality and reports on volume. Every reply is written and sent by a person. **AI is switched off platform-wide.**

## 2. Integration model (API and webhooks)
| Topic | How it works |
|---|---|
| Inbound (**live**) | Your platform sends signed HTTPS `POST` requests with JSON events to a per-integration endpoint. |
| Signing | HMAC-SHA256 over timestamp and raw body, 5-minute replay window, per-integration secret issued once through a secure channel. |
| Safety limits | 1 MB body limit, 1–100 events per request, duplicates ignored, bad signatures rejected before anything is stored. |
| Outbound | Operator replies are posted to your HTTPS callback URL with an idempotency key. A reply counts as delivered only on a 2xx answer; timeouts and 5xx are retried with backoff; delivery is at-least-once. |
| Connectivity test | Signed `ping` in both directions before go-live, with no data created. |
| Go-live | Integration is created staged, verified in both directions, checked against a pass/fail checklist, then activated by GCO management. |
| Needs development | Native connectors for specific channels (WhatsApp, Meta, Shopify and similar) and a website chat widget. These are built per client against that client's real API access and sandbox. |

Specification: `docs/gco-webhook-contract.md`. Effort is classified (simple / moderate / complex / blocked) only after your API documentation has been reviewed, in line with `docs/client-integration-estimation.md`.

## 3. Operations capabilities
| Capability | Status | What exists |
|---|---|---|
| Queue management | **Live** (shift preference: **release-ready**) | Conversations queue per client and language. Assignment is automatic, race-safe and respects operator capacity (default 2 at a time) and language. With no operator free, work stays queued and is retried every 15 seconds. The release adds a preference for operators who are on shift (it never excludes an available operator). |
| Operator supervision | **Live** (teams and supervisor role: **release-ready**) | Managers see live queues, can transfer a conversation, reopen it and handle escalations. The release adds supervisors who see only their own teams. |
| Quality assurance | **Live** | Supervisors score sent replies on accuracy, tone and resolution; only real reviews feed the QA summary. Configurable scorecards and operator appeals **need development**. |
| SLA monitoring | **Live** | Each assignment has a response deadline. On expiry the conversation is reassigned; after 5 consecutive expiries (configurable) it is flagged for a manager. Expiries and escalations are audited. |
| Escalation | **Live** | Operators escalate to a supervisor or manager; a case can be passed to the client for a decision. |
| Moderation | **Release-ready** | Operators claim batches of items and decide; supervisors resolve escalations; appeals go to a different reviewer. Verdicts are **not** sent back to a client platform (needs development). |
| People operations | **Release-ready** | Operator onboarding with a training gate and qualifications, shift plans, absences and handover notes, a knowledge base per client. Versioned approval of instructions and operator time-off requests **need development**. |
| Commercial back office | **Release-ready** | Operator pay and client billing with an audit trail. Invoices are commercial invoices, **not** tax invoices; Italian e-invoicing and accounting integration **need development**. |
| Reporting | **Live** (weekly reports: **release-ready**) | Role-based dashboards for operators, supervisors, managers, clients and management. **Downloadable exports (CSV, Excel, PDF) need development**; today reports are on-screen only. |
| Client contract and integration milestone tracking | **Needs development** | Contract dates, renewals and an integration timeline with owners and deadlines are planned. |
| Partner, broker and recruiter portals | **Needs development** | Not built. |

## 4. Data protection and security (summary)
- Role-based access checked on the server for every function; client data kept apart per client; supervisors see only their own teams.
- Hashed passwords and session revocation (**live**). Two-factor sign-in (**release-ready**); GCO plans to require it for privileged accounts.
- Audit trail of sensitive actions (**live**); message text is kept out of logs and audit records by convention in the code, not by an automated guarantee.
- Encrypted connections; hosting on a cloud server in Germany; nightly database backups with an offsite copy (backup encryption with keys held by GCO management is **release-ready** and is switched on once the keys are installed); separate development, test and production environments with fictional data outside production.
- Automated tests cover access rules, client separation, delivery retries and failure handling.
- Data-processing terms, sub-processor list and retention periods are provided in the contract process. They are currently drafts awaiting professional review.

## 5. Honest status
- The platform has been tested in a controlled environment against a **simulated** client platform. **No real client has been connected and no production traffic has been handled.**
- Still to be completed before a real launch: first real integration, third-party security test, a restore test from the offsite backup copy, a load test on a production-like setup, legal documents. Capacity has only been measured in a development environment (1,000 messages per minute for three minutes, mock AI); we make no production capacity claim.
- We make no certification, uptime or response-time guarantee today.
- Demonstrations use fictional data only (see the demo note in `docs/first-client-onboarding-process.md`).

## 6. What we need from you to assess an integration
Your API or webhook documentation, authentication method, a sandbox, expected volumes and languages, coverage hours, and escalation and reporting requirements.

Contact: founder@globalconversationoperations.com
