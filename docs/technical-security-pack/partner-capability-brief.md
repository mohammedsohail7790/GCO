# GCO — Technical capability brief for BPO partners

*Draft of 2026-10-27, for the CEO's review before it is shared. It summarises the platform as it exists today. It is not a contract, a certification or a service-level commitment. Delivery timelines are agreed only after GCO has validated your integration and operating requirements.*

## 1. What this covers
GCO runs **written, human-handled conversation operations** (chat, email-style and ticket support, community moderation) for Italian and other EU-language work. The platform routes each conversation to a trained operator, tracks response times, supervises quality and reports on volume. Every reply is written and sent by a person. **AI is switched off platform-wide.**

## 2. Integration model (API and webhooks)
| Topic | How it works |
|---|---|
| Inbound | Your platform sends signed HTTPS `POST` requests with JSON events to a per-integration endpoint. |
| Signing | HMAC-SHA256 over timestamp and raw body, 5-minute replay window, per-integration secret issued once through a secure channel. |
| Safety limits | 1 MB body limit, 1–100 events per request, duplicates ignored, bad signatures rejected before anything is stored. |
| Outbound | Operator replies are posted to your HTTPS callback URL with an idempotency key. A reply counts as delivered only on a 2xx answer; timeouts and 5xx are retried with backoff; delivery is at-least-once. |
| Connectivity test | Signed `ping` in both directions before go-live, with no data created. |
| Go-live | Integration is created staged, verified in both directions, checked against a pass/fail checklist, then activated by GCO management. |
| Not yet built | Native connectors for specific channels (WhatsApp, Meta, Shopify and similar) and a website chat widget. These are built per client against that client's real API access and sandbox. |

Specification: `docs/gco-webhook-contract.md`. Effort is classified (simple / moderate / complex / blocked) only after your API documentation has been reviewed, in line with `docs/client-integration-estimation.md`.

## 3. Operations capabilities
| Capability | What exists today |
|---|---|
| Queue management | Conversations queue per client and language. Assignment is automatic, race-safe and respects operator capacity (default 2 at a time) and shift. With no operator free, work stays queued and is retried every 15 seconds. |
| Operator supervision | Supervisors and managers see live queues and their own teams, can transfer a conversation, reopen it, resume an operator who has been paused and handle escalations. |
| Quality assurance | Supervisors score sent replies in a QA review; only real reviews feed the QA summary. |
| SLA monitoring | Each assignment has a response deadline. On expiry the conversation is reassigned; after 5 consecutive expiries (configurable) it is flagged for a manager. Expiries and escalations are audited. |
| Moderation | Operators claim batches of items and decide; supervisors resolve escalations; appeals go to a different reviewer. Verdicts are **not** yet sent back to a client platform. |
| People operations | Operator onboarding with a training gate, shift plans and absences, a knowledge base per client. |
| Commercial back office | Operator pay and client billing with an audit trail. Invoices are commercial invoices; Italian e-invoicing is not built. |
| Reporting | Role-based dashboards for operators, supervisors, managers, clients and management. |

## 4. Data protection and security (summary)
- Role-based access checked on the server for every function; client data kept apart per client; supervisors see only their own teams.
- Hashed passwords, session revocation, optional two-factor sign-in.
- Audit trail of sensitive actions; message text is kept out of logs and audit records.
- Encrypted connections; hosting on a cloud server in Germany; separate development, test and production environments with fictional data outside production.
- Automated tests cover access rules, client separation, delivery retries and failure handling.
- Data-processing terms, sub-processor list and retention periods are provided in the contract process. They are currently drafts awaiting professional review.

## 5. Honest status
- The platform has been tested in a controlled environment against a **simulated** client platform. **No real client has been connected and no production traffic has been handled.**
- Still to be completed before a real launch: first real integration, third-party security test, a full restore test of production backups, legal documents.
- We make no certification, uptime or response-time guarantee today.
- Demonstrations use fictional data only (see the demo note in `docs/first-client-onboarding-process.md`).

## 6. What we need from you to assess an integration
Your API or webhook documentation, authentication method, a sandbox, expected volumes and languages, coverage hours, and escalation and reporting requirements.

Contact: founder@globalconversationoperations.com
