# 49 — Minimum work for one real client integration, and the decisions the lawyer and accountant must make (4 Nov 2026)

Questions for professionals are **questions, not advice**; nothing here is legal or tax advice.

## A. Minimum work for one real client integration (sandbox and two-way message flow)
**What already exists** (`docs/gco-webhook-contract.md`, tested against a simulator only): inbound signed webhook (client to GCO), outbound signed reply (GCO to client's HTTPS callback, delivered only on a 2xx answer, retries, idempotency key), signed `ping` in both directions, a Verify action, the go-live checklist, and (built, not in production) sandbox/production separation with stored check history. **No real client system has ever been connected.**
**Three possible paths. The first one needs no new GCO code and is the recommended minimum.**
| Path | What it means | GCO build | Client work |
|---|---|---|---|
| 1. Client implements GCO's contract | Their developers send signed events to our URL and accept our signed replies at their callback | none (configuration and verification only) | a small sender and receiver, signature code (sample in the contract) |
| 2. GCO builds a small bridge for their tool | A per-client adapter translating their helpdesk/CRM API into the contract | one adapter, about 1 to 3 weeks once their API documentation and sandbox are in hand (estimate; depends on the platform) | API access and a sandbox |
| 3. Native connector (WhatsApp, Zendesk and so on) | A full adapter inside the platform | larger; not advertised; only against a real client's sandbox | API access, sandbox, possibly a licence |
**Minimum steps for path 1 (owner):**
1. Client discovery and feasibility note: their platform, channels, languages, volumes, data fields, whether they can implement the contract (CTO with the client; templates exist in `docs/first-client-integration-*.md`). Decide path 1, 2 or 3.
2. **A public HTTPS address the client's sandbox can reach.** Our computer cannot receive their calls. Options: (a) a test tenant with a **sandbox** integration on production after the release (fictional data, CEO approval), or (b) a hosted staging server (a cost, needs approval). **This is a decision for the CEO.**
3. Release deployed (CEO approval): the sandbox/production control and check history are not in production yet.
4. Create the client's tenant and a **staged** integration with the callback URL (HTTPS, public hostname, default port, no credentials, no redirects); give the secret once through a secure channel (never email or chat).
5. Verify both ways: GCO's signed ping to their callback answers 2xx; their signed ping to our webhook is accepted; the checklist items pass.
6. **Two-way test conversation** agreed with the client: a test message in, an operator reply out, shown as Delivered, a repeated message ID ignored, a failed delivery retried and visible. Language routing tested with their languages.
7. Client confirms the end user received the reply; both sides record the result; promote the integration to **PRODUCTION** (typed confirmation); re-verify; CEO activates go-live.
8. First real-message smoke test with a conversation the client has agreed.
**Facts to confirm with the client before promising anything:** the contract is **text only** (1 to 4,000 characters per message; **no attachments or images**); batches of 1 to 100 events; body limit 1 MB; replies must be acknowledged within 8 seconds or are retried; whether their system can sign requests; end-user identifiers and personal data in message text; languages; hours; who they contact when a delivery fails; whether they require a fixed source address (GCO's outbound address is the server's single address).
**Effort on GCO's side for path 1:** about 2 to 3 days of CTO time after the client's details and the release; the time on the client's side is theirs. **Not covered:** native channels, attachments, client-specific data fields, SSO.

## B. Lawyer: decisions needed before the first pilot
1. **Data-processing agreement** (controller-to-processor) and its technical annex: clauses, the sub-processor list (hosting, network delivery, backups, mail) and how clients are told of changes; our drafts are unreviewed.
2. **Transfers outside the EU/EEA:** engineering access from India (currently closed to real client data by policy only), the providers' own transfers (backup and network providers), the safeguards (standard clauses, transfer assessment) or a rule that no such access exists.
3. **Pilot / services agreement:** scope, no service levels or guarantees, usage-based pricing structure and invoicing basis, term and termination, liability limits and insurance, confidentiality, subcontracting, data return and deletion at the end.
4. **Operators:** employment or contractor status in each country, confidentiality undertakings, monitoring and quality scoring of people, working from home, where operators are allowed to work from (EU/EEA only for the first client).
5. **Privacy documents:** privacy notice, record of processing, breach procedure (who notifies whom and when), retention schedule, handling of end-user requests (access, erasure) passed from clients.
6. **Sensitive content:** end-users' messages may contain special-category data; what the client must instruct, whether an impact assessment or a data-protection officer is needed.
7. **Partner and commission agreements:** recurring partner commission (10% of collected revenue), the HR-sourcing rule, subcontracting with UVS and Phoenix; flow-down terms; no financial terms in writing before review.
8. **Public claims:** review of the security page and partner materials against what is true (no certification or "independently tested" claims).
9. **Independent security test:** the engagement letter and confidentiality terms before the tester gets access.

## C. Accountant: decisions needed before the first pilot
1. **Invoice identity:** codice fiscale, registered business address, the legal form wording, PEC and SDI code, bank details.
2. **Tax regime and VAT treatment** for services to Italian clients (22%), to EU business clients (reverse charge and the required invoice wording) and to non-EU clients; which regime the sole proprietorship is in and what that means for invoices.
3. **E-invoicing route:** which provider or accountant transmits to the Italian exchange system, who issues the legal invoice (the internal print page is not one), numbering, credit notes, retention.
4. **Usage-based billing:** how a billing period, rounding and disputes are shown; how the system's figures reach the accountant (the CSV exports) and what format is needed.
5. **Paying operators and partners:** classification of payments (employees, contractors, agencies), withholding or social contributions, payments to people in other countries, the treatment of partner and sourcing commissions.
6. **Supplier invoices:** hosting, storage and test-server invoices from other EU providers (reverse charge, self-invoicing), and whether any are deductible costs.
7. **Cash and collection:** payment terms, late payment, currency (euro only today), how collected payments are recorded (commission rules depend on collected revenue).
