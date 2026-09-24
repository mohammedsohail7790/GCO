# GCO — Discovery Call Cheat Sheet

**Purpose:** an internal, practical document to keep open during the client discovery call and follow step-by-step. Grounded entirely in the actual repository at HEAD `6ffc8d5`. No client is named anywhere in this document. **Current integration: dev-mock. Current AI: mock provider.** Neither is a real client integration and neither should ever be represented as one during the call.

---

## 1. Call Objective

This call is **discovery, not a sales pitch and not a commitment to build anything yet.** The goal is to understand the client's platform — their API, authentication, webhook model, message/conversation semantics, and expected volume — well enough to scope a real integration afterward. **No integration decision, timeline, or technical commitment should be made on this call.** GCO's own adapter interface (`lib/integrations/adapter.ts`) is architecturally ready to receive a real client's adapter, but nothing gets built against an assumption — only against their actual, received API documentation and sandbox access. Today's demo shows what GCO already does using its own internal dev-mock integration; it does not show — and must not be described as — a working connection to their platform.

---

## 2. 30–60 Second Opening Script

> "Thanks for making time today. Before we get into your platform, let me quickly show you what GCO actually does — this is a live system, not slides. GCO takes a client's incoming conversations, automatically assigns them to a human operator under a response-time budget we enforce server-side, and gives that operator an AI-drafted reply to help them respond faster. The AI never sends anything itself — a human always reviews, can edit, and explicitly approves every message that goes out. I can show you that whole flow running live in a minute, using our internal test integration since we haven't connected to your platform yet. But the real purpose of today is the other direction: understanding your API, your authentication, how your webhooks work, and your expected traffic, so we can scope exactly what connecting your platform to GCO would actually involve — based on your real documentation, not our assumptions."

---

## 3. GCO Explanation for a Non-Technical Client

"Think of it as a relay with a safety check built in. A message comes in from your platform. GCO picks it up, creates or continues the right conversation, and hands it to an available human operator — automatically, with a clock running so nothing sits unanswered. While the operator is looking at it, an AI assistant prepares a suggested reply to save them time. **The AI does not send anything on its own.** The operator reads the suggestion, can change any part of it, and only when they explicitly click send does a reply go out. Every step — who handled it, how fast, what was sent — is tracked, so you get real usage and performance numbers, not estimates."

**Flow to say out loud:** *Incoming conversation → GCO → assignment to an operator → AI drafts a suggestion → human operator reviews/edits → human explicitly approves and sends → delivery is tracked → usage and KPIs are recorded.*

**Emphasize twice, in different words, because it's the differentiator:** the AI drafts, it never sends; a human is the only one who can send, and that's a structural property of the code, not a switch that could be left in the wrong position.

---

## 4. Live Demo Flow

Run against the local running stack, logged in as the seeded demo users (`admin@demo.gco`, `manager@demo.gco`, `operator1@demo.gco`, `client@demo.gco` — `[DEMO]`-labeled seed data from `prisma/seed.ts`, not real client data).

| # | Open/Click | What Happens | Say | REAL / DEV-MOCK |
|---|---|---|---|---|
| 1 | Go to `/login`, sign in as `operator1@demo.gco` | Redirects to `/operator` | "Standard session login — JWT-based, revocable on logout." | **REAL** |
| 2 | (Optional, technical audience) call `GET /api/v1/auth/me` | Returns role + tenant | "The session carries this operator's role and tenant — that's what pins every action to the right client, automatically." | **REAL** |
| 3 | Land on `/operator` (workspace) | Shows assigned conversations, empty or existing | "This one screen is the operator's entire working view." | **REAL** |
| 4 | (Terminal, prepared beforehand) send a signed request to `POST /api/v1/webhooks/{integrationId}` | Fast `202` acknowledgment, nothing visible yet | "This webhook is where your platform's real API would call in. Today it's our internal dev-mock integration standing in for yours — this exact step is what gets replaced once we build your adapter." | **DEV-MOCK / SIMULATED** (this is the inbound-message step itself) |
| 5 | Refresh `/operator` | New conversation appears with the inbound message | "GCO just created a conversation and matched it to this customer automatically." | **REAL** |
| 6 | Point at the conversation's assignment | Already assigned to this operator | "No manual queue handling — an available operator was claimed instantly, in a way that's race-safe at the database level." | **REAL** |
| 7 | Point at the SLA/response-deadline field | A concrete deadline is shown | "That's a server-computed deadline. If it's missed, GCO automatically reassigns — it doesn't rely on the operator noticing." | **REAL** |
| 8 | Point at the AI-suggested reply panel | A drafted reply text appears | "This is our mock AI provider — deterministic, not a live model. The architecture supports a real provider; we simply haven't connected a credential yet, so I won't claim live-AI quality today." | **REAL mechanism, DEV-MOCK/mock-AI content** |
| 9 | Point at the suggestion's "requires review" marker | Suggestion is clearly labeled as a draft, not sent | "Nothing has gone anywhere yet — this is explicitly a draft awaiting human review." | **REAL** |
| 10 | Edit a sentence in the reply box | Text changes | "The operator can change anything before it goes out." | **REAL** |
| 11 | Click Send | Message moves to sent/delivered | "This is the one and only place in the entire codebase that creates an outbound message — it requires this explicit human action. That's not a setting, it's how the code is structured." | **REAL** |
| 12 | Point at the message's delivery status | Shows delivered | "Delivery is tracked per message — confirmed here by our dev-mock adapter's simulated always-succeed response. A real client's actual delivery confirmation plugs into this same mechanism once built." | **REAL mechanism, DEV-MOCK simulated confirmation** |
| 13 | Switch to the client/usage view, `GET /api/v1/usage/summary` | Message count and spend shown | "Billed exactly once per message — verified even when a webhook delivery is retried, which real integrations do." | **REAL** |
| 14 | Switch to the manager view, `GET /api/v1/analytics/overview` | Queue size, SLA breach count, avg response time | "These are live operational numbers, not illustrative ones." | **REAL** |
| 15 | (If useful) attempt the same analytics call as a lower-privileged role, or a cross-tenant conversation lookup | Request is rejected (403/404) | "Every role and tenant boundary here has been directly tested by trying to break it, not just assumed." | **REAL** |
| 16 | (If useful, describe rather than demo live) tenant suspension / message-cap behavior | — | "A tenant's traffic can be capped or stopped — the cap is a soft ceiling we set with headroom, not a hard atomic wall, and I'd rather tell you that plainly than overstate it." | **REAL mechanism** (not demoed live against the shared demo tenant, to avoid disrupting it) |

Do not demonstrate: admin tenant/user-creation screens, dead-letter recovery, or anything from the public website roadmap — none advance the call's actual purpose.

---

## 5. What GCO Can Truthfully Claim Today

**VERIFIED** (fresh evidence, this repository, real tests against a real database/queue): authentication (JWT, session revocation); RBAC across 5 roles; tenant isolation (query/path/ID-guess/WebSocket vectors, all attacked and held); webhook HMAC verification and exact-duplicate deduplication; race-safe assignment; SLA timer + auto-reassignment; AI suggestion generation (mock provider only); human-only send path; usage ledger idempotency; dead-letter capture + audited recovery; realtime push with polling fallback. Regression: typecheck PASS, lint PASS, unit 29/29, integration 8/8, E2E 42/42, build PASS, migrations clean, 0 dependency vulnerabilities.

**PARTIAL:** `Tenant.status`/`messageCap` enforcement is real and tested, but `messageCap` is a **soft, non-atomic** ceiling (a count check, not a transactional reservation), and there is no admin UI/API to suspend an existing tenant — only a direct database action can do it today. Rate limiting covers 10 of 23 routes.

**BLOCKED (external dependency, not a code defect):** real AI provider validation (`OPENAI_API_KEY` empty — mock only); real client integration (only `dev-mock` exists — no client spec or sandbox in hand).

**NOT VERIFIED:** Docker build/run (never executed in this environment); CI execution on real infrastructure (workflow file exists, no run evidence); backup/restore (documented, never drilled); sustained/production-scale load (only short local bursts measured).

**Say it this way, not "fully production ready":** *"The GCO application foundation is hardened and pilot-ready from the application side. The remaining production validation depends on the real client integration, real AI credentials, and production infrastructure validation."*

---

## 6. Discovery Questions — Prioritized

### A. MUST ASK

1. **"Do you have documented API endpoints, with a sandbox and production base URL?"** *Why:* `normalizeInbound()`/`sendOutbound()` must be written against a real shape — nothing today is assumed beyond our own dev-mock contract. *Decision:* whether adapter work can start at all.
2. **"Can we get sandbox access?"** *Why:* no adapter can be contract-tested without one. *Decision:* gates the entire validation sequence before any pilot.
3. **"What authentication do you require for calls we make to you?"** *Why:* `sendOutbound`'s `config` parameter is currently unused — a real adapter needs a concrete scheme. *Decision:* how the integration's credentials get stored/passed.
4. **"How do you sign webhook deliveries to us — algorithm and header?"** *Why:* our inbound verification today is HMAC-SHA256 specific to dev-mock. *Decision:* the new adapter's signature-verification implementation.
5. **"Can you show us a real inbound payload example, not a schema?"** *Why:* `normalizeInbound()` must handle real edge cases (empty text, system messages). *Decision:* field-mapping logic.
6. **"What's the outbound send API, and is the response synchronous or asynchronous?"** *Why:* our outbound worker currently expects a synchronous return. *Decision:* whether the current interface suffices or needs an approved change.
7. **"Do you have a stable conversation/thread ID, and how is a new conversation distinguished from a continuing one?"** *Why:* our ingestion logic hardcodes a "most recent open conversation for this user" rule. *Decision:* whether that rule holds for their platform.
8. **"Is your user ID stable long-term?"** *Why:* it's the sole key we use for conversation continuity. *Decision:* whether an ID-mapping step is needed.
9. **"Is there a stable event ID we can use for deduplication, and do you guarantee at-least-once or at-most-once delivery?"** *Why:* our dedup relies on a stable ID or falls back to a body hash. *Decision:* reliability of our idempotency guarantee for their traffic.
10. **"How do we learn a message was delivered — response, callback, or polling?"** *Why:* determines if an async delivery-status addition is needed to the interface. *Decision:* a potential core-adjacent change, flagged for approval before building.
11. **"What's your expected message volume — peak and average — for a pilot?"** *Why:* our per-tenant cap is a **soft, non-atomic** ceiling that must be set with real headroom. *Decision:* the pilot's cap value.

### B. IMPORTANT IF TIME

12. What timestamp format/timezone do your payloads use? *Decision:* `sentAt` parsing in the adapter.
13. What error codes do you return, and do you retry failed deliveries to us? *Decision:* retry/error-classification mapping.
14. What rate limits do you impose on us? *Decision:* adapter-side call pacing, if any is needed.
15. Can messages include media/attachments? *Decision:* whether media becomes new schema/interface scope — GCO has zero support today.
16. What languages does your traffic use? *Decision:* whether language enforcement (currently unenforced) becomes required.

### C. FOLLOW-UP DOCUMENTATION (don't spend call time — request as artifacts)

17. Security/compliance requirements beyond standard practice.
18. Data retention requirements, if any.
19. Production credential exchange process.

---

## 7. Likely Client Questions + Safe Answers

- **"Is our data isolated?"** Yes — every tenant-owned record is scoped server-side from the session, never trusted from a request; directly attacked in tests (query manipulation, ID guessing, cross-tenant WebSocket access) and held every time. It's application-layer isolation on a shared database, not separate databases per client — a deliberate, documented tradeoff.
- **"Can AI send without human approval?"** No. Exactly one function in the codebase creates an outbound message, and it requires an authenticated operator's explicit action.
- **"What happens if AI fails?"** The failure is recorded and the operator can always reply manually — AI failure never blocks a human response.
- **"Can we test in sandbox?"** We'd need your sandbox — we don't have one of yours yet. What we can show today is our own internal test integration.
- **"What is your uptime SLA?"** We don't have a published uptime SLA today.
- **"Are you SOC2/GDPR certified?"** No certification exists today.
- **"How are duplicate webhooks handled?"** Database-level uniqueness on the event ID deduplicates automatically — tested directly against exact-duplicate delivery, with no double message and no double billing.
- **"What happens if volume exceeds the pilot cap?"** The cap is enforced, but it's a soft ceiling, not an atomic hard stop — a concurrent burst right at the limit could overshoot slightly, so we set it with real headroom above expected peak rather than treating it as an exact wall.
- **"Do you support media?"** Not today — messages are text-only in the current schema. **That needs to be confirmed during API discovery** as to whether it becomes required scope.
- **"How long will integration take?"** **That needs to be confirmed during API discovery** — it depends entirely on your real API's shape and how closely it matches our existing adapter interface.

---

## 8. Artifact Checklist

- [ ] API documentation
- [ ] Sandbox URL
- [ ] Sandbox credentials
- [ ] Authentication documentation
- [ ] Webhook documentation
- [ ] Real inbound samples
- [ ] Outbound samples
- [ ] Error responses
- [ ] Retry policy
- [ ] Rate limits
- [ ] Event catalog
- [ ] Delivery status documentation
- [ ] Media specification
- [ ] ID semantics (conversation/thread + user)
- [ ] Timestamp semantics
- [ ] Compliance/data-retention requirements
- [ ] Production onboarding process
- [ ] Technical point of contact

---

## 9. Post-Call Engineering Decision Tree

**CASE A — Full documentation + sandbox received:**
inspect API → map payloads onto `NormalizedInboundMessage`/`OutboundSendRequest` → design the adapter (flag any interface gap for explicit approval) → implement adapter only inside `lib/integrations/adapters/` → write adapter tests → sandbox test → full existing regression run unmodified → controlled pilot.

**CASE B — Documentation received but no sandbox:**
do **not** build a speculative production integration → perform a design review only (map their docs onto the interface on paper) → request sandbox access before writing adapter code.

**CASE C — Incomplete documentation:**
identify the exact gaps → send targeted follow-up questions against those specific gaps → do not guess, ever.

**CASE D — Requirement unsupported by current GCO** (e.g., media, async delivery-status, non-standard conversation identity):
identify the gap precisely → determine whether it's adapter-only or requires core/schema work → do **not** silently modify the core pipeline — bring any core-adjacent change back for explicit approval first.

---

## 10. Closing Script

> "To summarize: we now understand the shape of your API, your authentication approach, and roughly what your webhook and traffic model looks like. We're going to follow up with a written checklist of the specific documentation and sandbox access we need. Once we have that, we'll review it against our existing integration design, flag anything that doesn't fit cleanly, and come back with a concrete plan — including what a controlled pilot on your actual traffic would look like. We're not going to commit to a timeline today, because that depends entirely on your real API, not on assumptions. The next technical step on our side is reviewing whatever you send us — nothing gets built before that."

---

## 11. What I Must Not Promise

| DO NOT SAY | SAY INSTEAD |
|---|---|
| "GCO is fully production ready." | "The GCO application foundation is hardened and pilot-ready from the application side; production validation is still pending real integration, AI credentials, and infrastructure work." |
| "We can integrate with your API immediately." | "We can start reviewing your API the moment we receive it — implementation follows that review." |
| "Integration will take X days." | "That depends on your API's shape — we'll scope it once we've reviewed your documentation." |
| "AI has been validated with OpenAI." | "AI suggestion generation is verified against our mock provider; a real provider requires a credential we don't yet have configured." |
| "We guarantee X% uptime." | "We don't have a published uptime SLA today." |
| "We are SOC2/GDPR certified." | "No certification exists today." |
| "We support media." | "Not today — that would be new engineering scope if you confirm you need it." |
| "messageCap is a hard atomic limit." | "It's a soft ceiling we set with real headroom above expected volume." |
| "Docker deployment is already validated." | "Docker has not been built or run in our environment yet." |
| "CI is already validated." | "A CI workflow exists; we don't have execution evidence to point to yet." |
| "We can support any language." | "Language handling exists as a field today but isn't enforced — we'd scope that based on your actual needs." |
| "We can handle unlimited volume." | "We size a pilot's cap against your stated expected volume, with headroom — not as an unlimited commitment." |

---

## 12. One-Page Call Checklist

**BEFORE CALL**
- [ ] Demo working
- [ ] Login tested
- [ ] Operator workspace tested
- [ ] AI mock behavior understood
- [ ] Dev-mock clearly understood
- [ ] Opening script ready

**DURING CALL**
- [ ] Understand platform
- [ ] Get API docs
- [ ] Ask about sandbox
- [ ] Ask authentication
- [ ] Ask webhook behavior
- [ ] Ask outbound send
- [ ] Ask IDs/idempotency
- [ ] Ask delivery status
- [ ] Ask media
- [ ] Ask languages
- [ ] Ask rate limits
- [ ] Ask expected pilot volume
- [ ] Ask compliance/retention

**AFTER CALL**
- [ ] Save documentation
- [ ] Review API
- [ ] Identify gaps
- [ ] Do not guess
- [ ] Design adapter
- [ ] Confirm scope before implementation
