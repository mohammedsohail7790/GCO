# GCO — Discovery Call Preparation

**Grounded in repository HEAD `6ffc8d5`.** Every technical claim below traces to actual code or a document already in this repository — nothing about any client's platform, API, traffic, media needs, languages, compliance requirements, or timeline is assumed. Status vocabulary used throughout: **VERIFIED / PARTIAL / BLOCKED / NOT VERIFIED / CLIENT-DEPENDENT.**

---

## 1. Call Objective

**What I need to accomplish:** run a discovery conversation, not a sales close. The purpose is to learn the client's platform well enough to scope a real integration afterward — not to commit to an integration, a timeline, or a feature set on the call itself.

**What a successful call looks like:** the client understands what GCO already does (shown live), and I leave with a concrete picture of their API shape, authentication, webhook/event model, conversation/user identity semantics, and expected traffic — enough to know exactly what's still missing before any adapter code gets written.

**What I must leave the call with:** (a) whether they have documented API access and a sandbox; (b) their authentication and webhook-signing approach; (c) real (not schematic) payload examples, if available; (d) their conversation/user ID model; (e) expected pilot volume; (f) a named technical point of contact; (g) a shared understanding that GCO's next step is reviewing whatever they send — not building anything today.

---

## 2. GCO in 30 Seconds

> "GCO takes a client's incoming conversations, automatically assigns them to a human operator under a response-time budget we enforce, and gives that operator an AI-drafted reply to help them respond faster. The AI never sends anything itself — a human always reviews, edits if needed, and explicitly approves every message before it goes out."

---

## 3. GCO in 2 Minutes

"A message comes in from the client's platform. GCO durably queues it and either starts a new conversation or continues an existing one with that same end-user — automatically. The conversation is then assigned to an available human operator, database-safe so two operators can never both claim it, and a server-side SLA clock starts running; if it's not answered in time, GCO automatically reassigns it. While the operator has it open, an AI assistant drafts a suggested reply from the conversation's recent context — but that draft is clearly marked as a suggestion, never sent on its own. The operator reads it, can edit any part of it, and only when they explicitly click send does anything actually go out — that's the one and only code path in the whole system that creates an outbound message. Once sent, delivery is tracked per message, and every message is recorded exactly once in a usage ledger — even if the client's platform retries a webhook delivery, which real integrations do. Managers and clients can see live operational numbers — queue size, SLA breaches, response times, usage and spend — through their own dashboards."

---

## 4. What Is Ready Today

**VERIFIED**, based on fresh evidence already established for this repository at HEAD `6ffc8d5` (typecheck PASS, lint PASS, unit 29/29, integration 8/8, E2E 42/42, build PASS, Prisma migrations clean, `npm audit --omit=dev` 0 vulnerabilities — per `docs/GCO_FINAL_V1_READINESS_AUDIT.md` and this conversation's own live verification sessions against the running local stack):

- Full message lifecycle: webhook → durable queue → race-safe assignment → SLA timer → AI draft → human review/edit/send → delivery tracking → usage ledger.
- Authentication (JWT, session revocation), RBAC across 5 roles, tenant isolation — all directly attacked in automated tests (query/path manipulation, ID guessing, cross-tenant WebSocket access) and held.
- Webhook HMAC signature verification and exact-duplicate deduplication.
- `Tenant.status` enforcement (a tenant can be stopped) and `Tenant.messageCap` enforcement (a per-tenant volume ceiling).
- Realtime WebSocket push (tenant-scoped) with an unconditional polling fallback — realtime is never the sole source of truth.
- Dead-letter capture with audited admin recovery.

**Say it as:** "The GCO application foundation is hardened and pilot-ready from the application side" — never as "fully production-ready."

---

## 5. What Is Not Ready / Still Dependent

None of the items below block today's application-side demo — they are boundaries to be honest about, not reasons the demo can't run.

- **Real client integration — BLOCKED.** Only `lib/integrations/adapters/devMock.ts` is registered (confirmed in `lib/integrations/registry.ts`); it is explicitly self-documented as a development/reference adapter, not a real client's contract. No adapter can be built until a real API spec and sandbox exist.
- **Real AI provider validation — BLOCKED.** `AI_PROVIDER` is set to the mock provider; `OPENAI_API_KEY` is empty. The OpenAI provider code exists in `lib/ai/providers/openai.ts` but has never been executed against a live API.
- **Production infrastructure — NOT VERIFIED.** Docker has never been built or run in this environment (`Dockerfile`/`docker-compose.yml` exist, per `docs/deployment.md`, but are code-reviewed only); CI workflow exists (`.github/workflows/ci.yml`) but no execution evidence is obtainable from this repository; backup/restore is documented in `docs/deployment.md` but explicitly labeled "NOT drilled/tested"; sustained/production-scale load has not been measured (only short local bursts, per `docs/load-testing.md`); observability is pull-based only (structured logs + `/admin/system-health`), with no alerting or error-tracking service wired up.
- **`messageCap` — a soft, non-atomic ceiling.** It is a `usageRecord.count()` check at request time, not a transactional reservation (`lib/tenant/activity.ts::isMessageCapReached`) — a concurrent burst right at the limit can overshoot it slightly. This is a documented, known property, not a defect discovered on the call — say it plainly if asked, and note a pilot cap should be set with real headroom.

**CLIENT-DEPENDENT** (cannot be assessed until the client answers): media/attachment support, language requirements, expected traffic volume, security/compliance requirements, data retention requirements, integration timeline.

---

## 6. Demo Script

Run against the local live stack, logged in as the seeded `[DEMO]` users from `prisma/seed.ts` (`admin@demo.gco`, `manager@demo.gco`, `operator1@demo.gco`, `client@demo.gco`) — clearly demo/test data, not real client data.

| Step | I do | Client sees | I say | REAL or DEV-MOCK/SIMULATED |
|---|---|---|---|---|
| 1. Login | Go to `/login`, sign in as `operator1@demo.gco` | Redirect to `/operator` | "Standard session login, JWT-based, revocable on logout." | **REAL** |
| 2. Operator workspace | Land on `/operator` | The operator's full working view — assigned conversations, if any | "This one screen is everything the operator needs." | **REAL** |
| 3. Incoming conversation | (prepared beforehand) send a signed request to `POST /api/v1/webhooks/{integrationId}` | Fast acknowledgment only, nothing visible yet | "This webhook is where a real client's platform would call in. Today it's our internal dev-mock integration standing in for theirs." | **DEV-MOCK / SIMULATED** — the send itself |
| 4. Assignment | Refresh `/operator` | New conversation, already assigned, with a visible SLA deadline | "GCO created the conversation and assigned it to an available operator automatically, with a response clock running." | **REAL** |
| 5. AI suggestion | Point at the drafted reply panel | A suggested reply, clearly marked as a draft | "This is our mock AI provider — deterministic, not a live model. The mechanism supports a real provider once we have a credential; I'm not claiming live-AI quality today." | **REAL mechanism, DEV-MOCK/mock-AI content** |
| 6. Operator review/edit | Edit a sentence in the reply box | Text changes | "The operator can change anything before it goes out — nothing is locked in." | **REAL** |
| 7. Explicit send | Click Send | Message state changes to sent | "This is the one and only code path in the entire system that creates an outbound message — that's structural, not a setting." | **REAL** |
| 8. Delivery/status | Point at the message's delivery status | Shows delivered | "Delivery is tracked per message — confirmed here by our dev-mock adapter's simulated always-succeed response; a real client's actual confirmation plugs into this same mechanism." | **REAL mechanism, DEV-MOCK simulated confirmation** |
| 9. Usage/KPI | Switch to the client usage view and the manager analytics view | Message count/spend; queue size, SLA breach count, avg response time | "These are live operational and billing numbers, not mockups — billed exactly once per message, even under duplicate delivery." | **REAL** |
| 10. Explain the boundary | (verbal, no click) | — | "Two things I want to be upfront about: step 3, the incoming message, and step 8's delivery confirmation, both ran through our own internal dev-mock integration — not your platform. Everything else you saw — assignment, SLA, the human-approval structure, delivery tracking, usage — is real application behavior that a real integration would plug straight into." | — |

---

## 7. Discovery Questions — Priority 1

- **Platform architecture:** "What kind of platform is this — messaging inbox, chat widget, something else — and what's the general shape of a conversation in your system?"
- **API:** "Do you have a documented API? What form — REST, GraphQL, webhook-first?"
- **Sandbox:** "Can we get sandbox access before touching production?"
- **Authentication:** "What authentication do you require for calls we make to you?"
- **Inbound events:** "What does a real inbound message payload look like?"
- **Webhooks:** "How do you sign webhook deliveries to us — algorithm and header?"
- **Outbound messaging:** "What API do we call to send a reply, and is the response synchronous or asynchronous?"
- **Delivery status:** "How do we learn a message was actually delivered?"
- **Conversation IDs:** "Do you have a stable conversation/thread ID? How is a new conversation distinguished from a continuing one?"
- **User IDs:** "Is your user ID stable long-term?"
- **Duplicates:** "Do you guarantee at-least-once or at-most-once delivery? Is there a stable event ID we can dedupe on?"
- **Ordering:** "Can webhook deliveries arrive out of order?"
- **Rate limits:** "What limits do you impose on calls we make to you?"
- **Pilot volume:** "What's your expected message volume — peak and average — for a pilot?"

---

## 8. Discovery Questions — Priority 2

- **Media/attachments:** "Can messages include images or files, and in what format?"
- **Languages:** "What languages does your traffic use? Any per-conversation language signal?"
- **Pagination:** "If any of your APIs return lists, what pagination scheme do they use?"
- **Errors/retries:** "What error codes do you return? Do you retry failed deliveries to us, and with what backoff?"
- **Security:** "Any specific security requirements beyond standard practice?"
- **Privacy:** "Any data-handling or privacy requirements we should know about?"
- **Data retention:** "Any requirement on how long we retain conversation data?"
- **Regional/compliance:** "Any regulatory framework — regional or industry-specific — we need to account for?"
- **Production access:** "What's the process and secure channel for exchanging production credentials once we're ready?"

---

## 9. Information / Artifacts to Request

- [ ] API documentation (sandbox + production)
- [ ] Sandbox URL
- [ ] Sandbox credentials
- [ ] Authentication documentation
- [ ] Webhook documentation (signing algorithm, header, secret provisioning)
- [ ] Real inbound payload examples
- [ ] Real outbound request/response examples
- [ ] Error-response documentation
- [ ] Retry policy documentation
- [ ] Rate-limit documentation (both directions)
- [ ] Delivery-status documentation
- [ ] Media/attachment specification, if applicable
- [ ] Conversation/thread ID semantics
- [ ] User ID semantics
- [ ] Timestamp format/timezone documentation
- [ ] Security/compliance requirements
- [ ] Data retention requirements
- [ ] Production onboarding process
- [ ] Named technical point of contact

---

## 10. Likely Client Questions

- **"Is GCO production ready?"** *Say:* "The application foundation is hardened and pilot-ready from the application side." *Truth:* real client integration, real AI, and production infrastructure remain unvalidated. *Don't promise:* full production readiness.
- **"Can AI send messages autonomously?"** *Say:* "No — a human always approves every send." *Truth:* exactly one function in the codebase creates an outbound message, requiring an authenticated operator action. *Don't promise:* nothing to walk back here — this is a clean, structural guarantee.
- **"How is our data isolated?"** *Say:* "Every tenant's data is scoped server-side and can't be reached by another tenant's session — we've directly tested that." *Truth:* application-layer isolation on a shared database, not separate databases per client. *Don't promise:* database-level (row-level-security) isolation — that's not what exists.
- **"Can you integrate with our API?"** *Say:* "We haven't yet — that's exactly what today's conversation is for." *Truth:* only `dev-mock` exists; the interface is architecturally ready to receive a real adapter. *Don't promise:* an integration timeline or that it will "just work."
- **"How long will integration take?"** *Say:* "That depends entirely on your API — we'll scope it once we've reviewed your documentation." *Truth:* no real spec exists yet to estimate against. *Don't promise:* a specific number of days/weeks.
- **"Do you support media?"** *Say:* "Not today — messages are text-only in the current system." *Truth:* `Message.content` is plain text; no attachment field anywhere. *Don't promise:* media support unless/until it's built and confirmed.
- **"What AI provider do you use?"** *Say:* "Today it's a deterministic mock provider; the architecture supports a real model like OpenAI, we just haven't connected a live credential yet." *Truth:* `OPENAI_API_KEY` is empty; the OpenAI code path has never run against a live API. *Don't promise:* live-AI quality or latency.
- **"What uptime/SLA do you provide?"** *Say:* "We don't have a published uptime SLA today." *Truth:* no production deployment or infrastructure validation exists yet. *Don't promise:* any specific uptime percentage.
- **"Are you compliant/certified?"** *Say:* "No certification exists today." *Truth:* no SOC2/GDPR-as-processor/ISO claim has ever been made. *Don't promise:* any compliance certification.
- **"What happens if the AI fails?"** *Say:* "The failure is recorded and the operator replies manually — it never blocks a human response." *Truth:* verified in automated tests; AI failure is caught and logged, never fatal to the flow. *Don't promise:* nothing to walk back — this is verified behavior.
- **"What happens if our API fails?"** *Say:* "Outbound sends retry automatically with backoff, then go to a recovery queue with a full audit trail if retries are exhausted." *Truth:* this generic mechanism is proven end-to-end against dev-mock; it has never been exercised against a real client's actual outage behavior. *Don't promise:* that this has been proven against their specific API.
- **"What happens with duplicate webhooks?"** *Say:* "They're deduplicated automatically at the database level — no double message, no double billing." *Truth:* verified directly with exact-duplicate delivery tests. *Don't promise:* nothing to walk back — this is verified.

---

## 11. If I Don't Know the Answer

Use one of these rather than guessing, then capture the question as a follow-up artifact request (§9):

1. "I don't want to guess on that — let me confirm it and follow up in writing."
2. "That's a great question, and it depends on details of your API we haven't seen yet — I'll add it to our follow-up list."
3. "I'd rather give you an accurate answer after we've looked at your actual documentation than speculate now."
4. "That's outside what I can verify from what's built today — let me check and get back to you."
5. "Good catch — that's exactly the kind of thing we need your spec to answer properly."
6. "I don't have a confirmed answer for that yet; I'll treat it as an open item for our technical follow-up."
7. "Rather than give you a half-answer, let me take that away and confirm it precisely."
8. "That needs to be confirmed during API discovery — I'll make sure it's on our list."

**How to capture it:** write the exact question down during the call, add it to the artifact/follow-up list in §9, and reference it explicitly in the post-call summary — don't let an unanswered question quietly disappear.

---

## 12. Discovery Call Flow

1. **Opening** — set the tone: discovery, not a sales close (§1, §2).
2. **GCO explanation** — the 2-minute walkthrough (§3).
3. **Demo** — the 10-step live sequence (§6), explicitly flagging dev-mock/mock-AI boundaries.
4. **Discovery** — Priority 1 questions (§7).
5. **Technical questions** — Priority 2 questions (§8), and answer anything they raise (§10, §11).
6. **Artifact collection** — walk through §9's checklist together, noting what they can send and when.
7. **Recap** — restate what was learned and what's still open.
8. **Next steps** — confirm the post-call engineering sequence (§14) and a follow-up timeframe for the artifacts, not for the integration itself.

---

## 13. Closing Script

> "To summarize: we now understand the shape of your API, your authentication approach, and roughly how your webhooks and conversations work. We're going to follow up with a written checklist of the specific documentation and sandbox access we still need. Once we have that, we'll review it against our existing integration design, flag anything that doesn't fit cleanly, and come back with a concrete plan — including what a controlled pilot on your actual traffic would look like. We're not committing to a timeline today, because that depends entirely on your real API, not on assumptions. The next technical step on our side is reviewing whatever you send us — nothing gets built before that."

---

## 14. Post-Call Engineering Decision Tree

**A. Complete API docs + sandbox received:** inspect the API → map their real payloads onto `NormalizedInboundMessage`/`OutboundSendRequest` → design the adapter, flagging any gap the current interface can't represent for explicit approval before touching it → implement strictly inside `lib/integrations/adapters/` → write adapter contract tests → validate against their real sandbox → run the full existing regression suite unmodified → propose a controlled pilot.

**B. Docs received but no sandbox:** do **not** build a speculative production integration → perform a design/mapping review only, on paper, against the documentation → request sandbox access before writing any adapter code.

**C. Incomplete documentation:** identify precisely which items from §9 are still missing → send targeted follow-up questions against those specific gaps → do not guess or infer missing behavior.

**D. Client requirement exceeds current GCO capabilities** (e.g., media, async delivery-status confirmation, non-standard conversation identity): identify the exact gap → determine whether it's adapter-only or requires a core/schema change → do **not** silently modify the core pipeline — bring any core-adjacent change back for explicit approval before writing it.

---

## 15. One-Page Cheat Sheet

**Say:** application-side pilot-ready. **Never say:** fully production-ready.
**Demo uses:** dev-mock integration + mock AI — always label both when shown.
**AI:** drafts only, never sends — one code path in the whole system sends, and it requires a human.
**messageCap:** soft ceiling, not atomic — set with headroom, don't call it a hard limit.
**Must leave the call with:** API docs/sandbox status, auth method, webhook signing scheme, conversation/user ID model, expected pilot volume, a technical contact.
**Don't promise:** timelines, media support, uptime SLA, compliance certification, real-AI validation — all of these are either client-dependent or genuinely not yet true.
**If unsure:** don't guess — say so, capture it as a follow-up artifact, move on.
**Next step after the call:** review whatever they send; nothing gets built before that.
