# GCO × Paxmod — Paxmod Platform & API Discovery Review (Final Pass)

**Discovery-only. Implementation completely frozen.** No GCO application code, schema, dependency, or configuration was touched to produce this document. No credentials, API keys, passwords, tokens, or cookies are reproduced anywhere below.

**Method:** re-verification of Paxmod's public website, documentation, and full OpenAPI specification, plus hands-on exploration of the user's own authenticated free-tier Paxmod console (account creation was performed by the user directly — creating accounts is outside what I can do). Every claim below is labeled **VERIFIED**, **PARTIAL**, **NOT VERIFIED**, **CLIENT-DEPENDENT**, or **BLOCKED**, and cites its exact source.

---

## 1. Executive Summary

Paxmod is a real, live **synchronous AI content-moderation API** (`POST /text`, `POST /image`) for game and platform chat — confirmed by re-reading its complete, unabridged OpenAPI specification and by executing a real test call in the authenticated console. It is not a conversation platform, does not operate a managed human-review workforce, and — this was newly and directly confirmed this session — **its "Integrations" feature is a fixed list of named platform connectors (Facebook, Roblox, WordPress live; Discord, Twitch, Slack "coming soon") with no generic webhook or custom-system option anywhere in the product.**

This means: **as it exists today, Paxmod has no self-serve mechanism to push content to, or receive a decision from, an external system like GCO.** Neither original scenario (operators in Paxmod, or Paxmod → GCO) is directly supported by the verified product. The realistic near-term architecture — if nothing changes on Paxmod's side — is **GCO or the client calling Paxmod's existing moderation API directly**, with any human review happening inside Paxmod's own console (by whoever owns the account) or, if GCO's own operator workflow is wanted, GCO would need to build its *own* ingestion step that calls Paxmod as a moderation service, not receive anything *from* Paxmod.

---

## 2. Paxmod Product Model

Re-verified, consistent across public docs, the OpenAPI spec, and the live console:

- **Moderation engine:** an AI classifier scoring submitted text/images against configurable categories (Standard mode) or a single natural-language policy (Advanced mode). **VERIFIED** — directly exercised in the console playground this session; live response matched the documented schema exactly.
- **Dashboard:** a web console for the account owner — project configuration, a "Browse Flagged Messages" search view, and per-user analysis. **VERIFIED** — hands-on, this session.
- **API:** exactly two endpoints, both synchronous. **VERIFIED** — full OpenAPI spec re-read this session, confirmed complete (no truncation), only `/text` and `/image` exist.
- **Integrations:** a fixed menu of named platform connectors (Facebook, Roblox, WordPress live; Discord/Twitch/Slack "coming soon"). **VERIFIED** — hands-on, this session, in the console's own "Integrations" page.
- **Review workflow:** entirely inside Paxmod's own console; no review-queue API exists. **VERIFIED** (absence) — the OpenAPI spec has no such endpoint, and no equivalent appears anywhere in the console's navigation (Dashboard, Projects, Analytics, Integrations, Settings, Billing, Usage — all checked this session).
- **Human-review model:** no managed human-review team. **VERIFIED** — Paxmod's own blog post states this explicitly: *"Does Paxmod include human review? No managed human team, but it gives real-time automated decisions plus a dashboard for your own team to review and label flags."* (`paxmod.com/blog/webpurify-alternative`)

---

## 3. Verified API Surface

Source: `paxmod.com/openapi.json` (Paxmod API v1.1.0, re-read in full this session — confirmed exactly two paths, no others exist) and `paxmod.com/docs`.

| Item | Status | Detail |
|---|---|---|
| Base URL | VERIFIED | `https://www.paxmod.com/api/v1` |
| `POST /text` | VERIFIED | `message` (required, ≤5000 chars), `user_id`, `context_id`, `advanced_threshold` (advanced mode) |
| `POST /image` | VERIFIED | `image_url` (required, public HTTPS), `user_id`, `context_id` |
| Authentication | VERIFIED | `Authorization: Bearer <api_key>` header; deprecated `api_key` body-field fallback |
| Synchronous behavior | VERIFIED | Confirmed both by spec and by a live executed call this session — one HTTP request, one JSON response, no callback |
| Response schema | VERIFIED (live-executed) | `status`, `id` (UUID), `service`, `request` (original/processed message + timestamp), `result` (`flagged`/`not_flagged`), `reason`, `content_moderation.flagged` + per-category `{flagged, score, threshold}` |
| Moderation capabilities | VERIFIED | Standard mode: 13 fixed text categories (Sexual, Hate and Discrimination, Violence, Dangerous and Criminal Content, Self-Harm, Medical Advice, Financial Advice, Legal Advice, PII, Harassment, Threatening, Profanities, Spam); Advanced mode: single free-text natural-language policy evaluated by an LLM, returned as one "Policy Violation" category; Image mode: separate category set, no advanced/whitelist support |
| Ban-awareness | VERIFIED | Passing `user_id` auto-flags content from users banned in the console, without a fresh AI call |
| Graceful degradation | VERIFIED | If a standard-mode provider is briefly down, the call still returns HTTP 200 with `degraded: true` and lists `unavailable_categories`; those fail open (not flagged) |
| Error codes | VERIFIED | `UNAUTHORIZED`, `INVALID_API_KEY`, `USAGE_LIMIT_EXCEEDED` (429, free tier 100 msgs/month), `EMPTY_MESSAGE`, `MESSAGE_TOO_LONG`, image-specific 400s, `INTERNAL_SERVER_ERROR`, `LLM_SERVICE_ERROR` (503, advanced mode, "safe to retry with backoff") |
| **Webhooks (either direction)** | **NOT VERIFIED — confirmed absent** | Not in the OpenAPI spec (re-read complete this session), not in `paxmod.com/docs`, not in the console's navigation |
| **Outbound events from Paxmod** | **NOT VERIFIED — confirmed absent** | No mechanism found anywhere checked this session |
| **Submitting a human decision via API** | **NOT VERIFIED — confirmed absent** | No endpoint exists to write a decision back; "feedback on moderation accuracy" is described only as a dashboard capability, never as an API call |
| Numeric rate limit (paid tier) | NOT VERIFIED | Only the free tier's 100 msgs/month cap is documented anywhere |
| Idempotency / dedup | NOT VERIFIED | No idempotency key mechanism documented; no analog to a dedup constraint |
| Sandbox environment (distinct from free tier) | PARTIAL | Marketing copy references "sandbox projects" for studios; no distinct sandbox base URL exists — the free tier is the de facto sandbox |
| Enterprise/private API beyond public docs | **CLIENT-DEPENDENT** | Advanced tier's "custom integration support" and "dedicated account manager" could plausibly include something unpublished — cannot be ruled out from outside |

---

## 4. Authenticated Console Findings

Hands-on, this session, in the user's own free-tier account. No credentials reproduced.

- **Dashboard:** account-level stats (Total Messages, Flagged Messages, Flagging Rate — all "24h" windows), a Projects list. Confirmed empty state and populated state (after creating one test project).
- **Projects → new-project wizard:** a 4-step flow (name → content type [Text/Image] → mode/category review → "get started"). A third project *category preset* also exists — "Marketing moderation: Auto-moderate your Facebook page comments" — alongside generic Text/Image, confirming Facebook comment moderation is a first-class, built-in feature, not a generic webhook capability.
- **Standard vs. Advanced, directly observed:** Standard mode showed exactly the 13 documented categories, individually toggleable. Advanced mode is confirmed to be **a single free-text box** ("Describe in plain English what should be blocked…") — nothing more elaborate than that.
- **API/playground:** the "Get started" step generated a real API key and a working `curl` example pre-filled with it. A live test message was submitted through the in-console playground ("you are an idiot and I will find you and hurt you") and returned a real, live response — `flagged: true`, `Violence: 0.9826`, `Harassment: 0.8814`, `Threatening: 0.5303` — matching the OpenAPI spec's schema exactly, field for field.
- **Analytics → per-project → "Browse Flagged Messages":** a searchable view (search by message text, filter by User ID) — this is the actual human-review queue. A separate "User Analysis" view also exists under Analytics.
- **Review latency, directly observed:** the Analytics page states plainly: *"Analytics data is updated hourly. Recent changes may take up to an hour to appear."* This is a real constraint on any "real-time human review" assumption, confirmed from the product itself, not inferred.
- **Integrations page, directly observed — decisive finding:** exactly six entries — **Facebook, Roblox, WordPress** (live, "Set up ___" buttons) and **Discord, Twitch, Slack** (all marked "Coming soon"). The page's own text: *"Want an integration that is not here yet? Tell us at contact@paxmod.com."* **No generic webhook, no custom/external-system connector, no way to add GCO.**
- **Settings → Profile / Workspace:** Workspace settings are limited to workspace naming and team-member role management (owner/admin/editor/viewer) — no API-key management, no webhook configuration, nothing integration-related.
- **Billing / Usage:** not required for this discovery pass beyond confirming their existence in navigation; not relevant to the architecture question.
- **Nothing resembling a webhook/API-settings/developer-tools section exists anywhere in the account.** Every navigable page was checked this session: Dashboard, Projects, Analytics (+ User Analysis), Integrations, Settings (Profile, Workspace), Billing, Usage.

---

## 5. GCO × Paxmod Integration Scenarios (Re-Evaluated)

### Scenario A — Operators Inside Paxmod

- **What GCO would need to provide:** A new, external-facing API for AI/operator assistance — **does not exist today**; GCO's AI pipeline is only ever invoked internally.
- **What Paxmod would need to provide:** Some extensibility point in its own console/workflow where a third-party suggestion or operator action could be injected — **no evidence this exists**; the console's UI (confirmed hands-on) has no such slot, and the Integrations page has no "connect an AI/operator assistant" option.
- **Do current Paxmod capabilities support it?** **No, not observed.** Paxmod's own AI already performs the classification decision (approve/flag/mute/ban) — the product doesn't have an obvious gap for a second, external AI to fill, and there's no confirmed mechanism for Paxmod to call out to one even if it did.
- **Missing API/interface:** Both directions are missing — a GCO-side external API (new engineering) and a Paxmod-side extensibility point (unconfirmed to exist at all).
- **Feasible without Paxmod custom development?** **No.** This would require Paxmod to build something not currently in their product, based on everything checked this session.

### Scenario B — Paxmod → GCO

- **What GCO already supports:** The full pipeline — inbound webhook boundary, adapter layer, queue, assignment, SLA, AI drafting, human approval, outbound send — all real and already tested (per the prior GCO architecture review), **provided something arrives at GCO's boundary in the first place.**
- **What Paxmod would need to expose:** A webhook (to push flagged content out) and a decision-submission API (to receive GCO's operator decision back) — **neither is verified to exist.**
- **Do current Paxmod capabilities support it?** **No, not observed.** The Integrations page — the one place this would live if it existed — offers only named platform connectors, not a generic outbound mechanism.
- **Missing webhook/event/API functionality:** Both the outbound push and the inbound decision-submission API are unconfirmed/absent.
- **Feasible without Paxmod custom development?** **No.** Same conclusion as Scenario A — this requires something Paxmod would have to build, not something GCO can configure around.

**Both scenarios currently fail for the same underlying reason: no verified two-way data channel exists between Paxmod and any external system beyond its six named platform integrations.**

---

## 6. Third / Alternative Architecture

**Evaluated:**

```
Application/Game
      ↓
GCO / integration layer
      ↓
Paxmod moderation API  (POST /text or /image, synchronous)
      ↓
moderation result (flagged/not_flagged + category scores)
      ↓
GCO decision/operator workflow, if a human step is wanted
```

This **is** technically feasible today, without any Paxmod custom development, because it only uses Paxmod's actual, verified, synchronous API exactly as documented. Concretely: a new GCO adapter (or a step inside GCO's existing ingest pipeline) would call `POST /text`/`POST /image` synchronously as part of processing an inbound message, treat the result as a signal (e.g., route flagged messages to a GCO operator for review, auto-clear unflagged ones), and GCO's own existing human-review/SLA/audit machinery handles everything downstream. **Human review, in this shape, lives entirely inside GCO — Paxmod is purely a synchronous classification service GCO calls, the same way GCO could call any AI provider.**

**Tradeoffs:**
- **Pro:** Requires zero unverified Paxmod capability — everything needed (`POST /text`/`/image`, Bearer auth) is confirmed, live-tested, and documented.
- **Pro:** Fits cleanly into GCO's existing adapter pattern conceptually — though note this is the *reverse* integration direction from GCO's current `IntegrationAdapter` (which receives inbound webhooks from a client); calling Paxmod's API would be a new kind of outbound, synchronous dependency, not a new inbound adapter.
- **Con:** GCO would need new engineering — a synchronous call-out to a third-party moderation API is not something the current adapter interface (`verifyWebhookSignature`/`normalizeInbound`/`sendOutbound`) represents; this is a different integration shape entirely.
- **Con:** Only solves "get a moderation score" — it does not, by itself, explain what "GCO's operators reviewing Paxmod's flags" would even mean commercially, since GCO would only see whatever content the client's own application chooses to send to Paxmod (and then to GCO) — this depends entirely on what the actual game/platform's architecture looks like, which is unknown.
- **Con:** Doesn't resolve the original business question of *where humans should work* — it just gives a technically clean way to consume Paxmod's classification, with the human-review destination (GCO or elsewhere) still an open design choice.

---

## 7. Architecture Comparison

| | Scenario A (operators in Paxmod) | Scenario B (Paxmod → GCO) | Alternative (GCO calls Paxmod API directly) |
|---|---|---|---|
| Technically feasible today | No — requires unverified Paxmod extensibility | No — requires unverified Paxmod webhook/decision API | **Yes** — uses only verified, live-tested capability |
| Required Paxmod capability | An AI/operator-assistance injection point (not observed) | A push webhook + decision-submission API (not observed) | Nothing beyond the existing `POST /text`/`/image` (already verified) |
| Required GCO changes | A new external-facing AI API (does not exist) | None to the pipeline itself; one new adapter, contingent on an unconfirmed Paxmod webhook | A new outbound-call integration to Paxmod's API (new, but small, well-scoped engineering) |
| Real-time capability | Unknown — depends on unconfirmed Paxmod behavior | Unknown — depends on unconfirmed Paxmod webhook timing (console review itself is hourly-refreshed) | Real-time — Paxmod's API is ~500ms synchronous, confirmed |
| Human review | Ambiguous — unclear where it would even happen | Would happen in GCO, exactly as GCO already works — if the data ever arrived | Happens in GCO, using GCO's existing operator workflow, on content GCO decides to route there |
| Outbound decisions | Unconfirmed path back to Paxmod | Unconfirmed path back to Paxmod | Not applicable — GCO doesn't need to report a decision back to Paxmod in this shape |
| Complexity | High, and largely blocked by unknowns | High, and largely blocked by unknowns | Low-to-moderate, bounded by what's already verified |
| Dependency on Paxmod building something new | **Total** | **Total** | **None** |
| Suitability for a 3-day pilot | Not viable until Paxmod confirms capability | Not viable until Paxmod confirms capability | **Only one that's realistically pilotable today**, though its business value still needs Paxmod/Cristian's input |

---

## 8. Critical Questions for Paxmod

### Tier 1 — determines the architecture
1. Does Paxmod have any private/enterprise API, not present in public documentation, for pushing content or events to an external system?
2. Can an external system submit a moderation/review decision back to Paxmod through any API?
3. Is there a webhook or event stream of any kind, public or private?
4. Is there an API for the flagged-message review queue (the same data shown in "Browse Flagged Messages"), or is console-only access the only option?
5. Where does Paxmod expect a human reviewer to actually sit — is there any product plan for operators working outside Paxmod's own console?
6. Can Paxmod build a custom integration on request (the console explicitly invites this via `contact@paxmod.com`) — and on what timeline/cost?

### Tier 2 — implementation details, once Tier 1 is answered
7. If a webhook exists: real payload schema, signing method, delivery guarantees, retry policy.
8. If a decision API exists: its contract and required fields.
9. Real numeric rate limits on paid tiers (only the free tier's 100/month is documented).
10. Idempotency/dedup semantics for repeated calls.
11. Ordering guarantees, if content can arrive out of sequence.
12. Expected latency beyond the documented ~500ms p50.
13. Whether `context_id`/`user_id` semantics can support GCO's conversation-continuity model.
14. Multi-tenant/multi-project model — how would GCO's own multi-tenant structure map onto Paxmod's project concept.

### Tier 3 — pilot/business
15. Expected message volume for a pilot.
16. Which specific moderation categories matter for the actual use case.
17. Real sample content/dataset for testing.
18. What "success" looks like from Paxmod's or the end customer's side.

---

## 9. 3-Day Pilot Recommendation

**What GCO can build independently (no Paxmod dependency beyond the existing public API):**
- A new, isolated integration point that calls `POST /text` (and/or `/image`) synchronously with real or representative test content, using a real Paxmod free-tier API key.
- Routing a `flagged: true` result into GCO's existing operator workspace as a review item, using GCO's already-verified assignment/SLA/audit machinery.

**What requires Paxmod (and is NOT assumed to work):**
- Anything resembling Scenario A or B as originally framed — both remain blocked pending Tier 1 answers.
- Any claim that Paxmod can push data to GCO, or receive a decision back — **do not build against this assumption.**

**What can be mocked (openly labeled as such, never presented as real):**
- If real Paxmod categories/thresholds aren't yet finalized for the actual use case, a placeholder project configuration can be used for the pilot's technical proof — labeled clearly as provisional.

**What must be verified before any further implementation:**
- Tier 1 questions, in full, before spending engineering time on anything beyond "GCO calls Paxmod's existing API directly."
- Real expected volume, before sizing anything.

**Concretely, the smallest realistic 3-day pilot today:** GCO calls Paxmod's live `POST /text` API against a small set of real or representative sample messages, routes flagged results into a GCO test tenant's operator workspace, and the team reviews the output together. This proves the *only* verified integration path — it does not prove, and must not be described as proving, either original scenario.

---

## 10. Final Recommendation

**What we know:** Paxmod's real, verified API is a synchronous, two-endpoint content-classification service with no managed human-review team and no confirmed data channel to any external system beyond six named platform integrations (three live, three "coming soon"), none of which is GCO.

**What we don't know:** Whether Paxmod has an unpublished/private mechanism for exactly this kind of integration, whether they'd build one on request, and — more fundamentally — where Paxmod or Cristian's own team actually wants human review to live, independent of what's technically easiest.

**What is blocked:** Both original scenarios (A and B), pending Paxmod's direct answer to Tier 1.

**What should NOT be built yet:** Any adapter code, any new GCO external-facing API, any schema change, any claim that a webhook or decision-API exists — none of this is justified by verified evidence.

**What Paxmod needs to answer:** The six Tier 1 questions in §8 — above all, whether any mechanism exists (public or private) to move content or decisions between Paxmod and an external system.

**What architecture becomes preferable depending on their answers:**
- If Paxmod confirms a webhook/decision API exists or can be built → **Scenario B becomes viable**, and GCO's existing pipeline is already positioned for it.
- If Paxmod confirms an AI/operator-assistance injection point exists or can be built → **Scenario A becomes viable**, contingent on GCO building the new external-facing API this would require.
- If neither exists and Paxmod won't build one → **the alternative architecture (§6)** is the only technically honest path: GCO calls Paxmod's existing API directly as a moderation step, with human review living wherever the business decides — most naturally inside GCO, using what already works, but that's a business decision, not a technical inevitability.

---

## 11. Evidence / Sources

| Claim | Source |
|---|---|
| Product overview, "How it works" | `https://paxmod.com` |
| Quickstart, Standard/Advanced mode, category lists, example responses | `https://paxmod.com/docs` |
| Complete API surface (re-read in full this session, confirmed only 2 paths) | `https://paxmod.com/openapi.json` |
| Pricing tiers | `https://paxmod.com/pricing` |
| Free trial, no credit card, company facts, compliance claims | `https://paxmod.com/faq` |
| Gaming-specific marketing claims (WebSocket, Discord/Slack alerts, telemetry sync — all PARTIAL/unverified in technical docs) | `https://paxmod.com/services/game-moderation` |
| **Decisive: no managed human-review team** | `https://paxmod.com/blog/webpurify-alternative` |
| Company background, usage stats | `https://paxmod.com/about-us` |
| Account creation (performed by the user, not by me) | `https://paxmod.com/login` |
| Live console: Dashboard, Projects (creation wizard, Standard/Advanced live UI), Analytics (Browse Flagged Messages, User Analysis, hourly-refresh notice), Integrations (six-item list, no generic option), Settings (Profile/Workspace, no API/webhook config) | Authenticated Paxmod console, explored hands-on this session |
| Live API test execution matching OpenAPI schema exactly | In-console playground, this session (result not reproduced with the account's actual API key; the response structure and category scores are quoted as observed) |

---

## 12. Repository / Implementation Status

**IMPLEMENTATION STATUS: FROZEN**

Files modified: none.
Files created: `docs/GCO_PAXMOD_PLATFORM_API_DISCOVERY_REVIEW.md` (this document, rewritten this session).
Application code changed: NO
Implementation performed: NO
Committed: NO
Pushed: NO

---

## A. What I Should Tell Cristian

> "I re-verified Paxmod's whole platform end to end — public docs, their full OpenAPI spec, and I went hands-on inside an actual free-tier account. Confirmed: their real API is two synchronous endpoints — send a message or image, get a moderation score back, same request. No webhook, no queue API, no way for them to push content to us or for us to send a decision back — I checked their Integrations page directly and it's just Facebook, Roblox, and WordPress live, with Discord/Twitch/Slack coming soon. Nothing generic, no way to add GCO. Their own blog literally says they don't run managed human review — it's a dashboard for whoever owns the account, and even that's only refreshed hourly. So neither of the two ideas from the call — operators staying in Paxmod, or Paxmod sending work to us — is actually supported by what exists today. The one thing that is buildable right now, with zero guesswork, is us calling their moderation API directly and handling review on our side. Before we build anything, I want Paxmod to tell us straight: do they have a private integration mechanism they just haven't published, and would they build a custom one for us? That answer decides everything else."

## B. What Cristian Should Ask Paxmod

1. Do you have any private or enterprise API — not in your public docs — for pushing content or events to an external system?
2. Can an external system send a moderation decision back to Paxmod through any API?
3. Is there a webhook or event stream in any form, published or not?
4. Is there an API for the flagged-message review queue, or is your console the only way to see it?
5. Where do you expect a human reviewer to actually work — is there any roadmap for operators outside your own console?
6. Your Integrations page says you'll build a custom integration on request — what would that actually involve, and on what timeline?
7. What are your real rate limits and latency at production volume, beyond the free tier?
8. What's your expected volume/category fit for our specific use case, so we can size a pilot properly?

## C. Decision Tree

```
IF Paxmod confirms a webhook + decision-submission API exists or will be built
    → Scenario B: Paxmod → GCO (GCO's existing pipeline is already positioned for this)

IF Paxmod confirms an AI/operator-assistance injection point exists or will be built
    → Scenario A: Operators inside Paxmod (requires new GCO external-facing API)

IF Paxmod confirms neither, and won't build one
    → Alternative: GCO calls Paxmod's existing POST /text /image API directly,
      human review lives in GCO using what's already built
```

## D. Confidence

- **Paxmod's API is exactly two synchronous endpoints, no webhook exists publicly** — **HIGH.** Confirmed by re-reading the complete OpenAPI spec twice and by a live executed API call matching it exactly.
- **The Integrations page has no generic/custom-system option** — **HIGH.** Directly observed, hands-on, in the authenticated console this session — not inferred from marketing text.
- **Paxmod has no managed human-review team** — **HIGH.** A direct, explicit quote from Paxmod's own published content, not an inference.
- **No private/enterprise API exists beyond what's public** — **LOW.** This is genuinely unknowable from outside the company; the Advanced tier's "custom integration support" language keeps this open.
- **Neither Scenario A nor B is currently buildable** — **HIGH**, given the above, but this conclusion is only as strong as "no private API exists," which itself is LOW confidence — so the overall recommendation to ask Paxmod directly (rather than conclude the door is fully closed) is the right level of caution.
- **The alternative architecture (GCO calls Paxmod directly) is technically feasible today** — **HIGH.** Every capability it depends on was independently verified twice, including live execution.
- **This alternative is the right business answer** — **LOW.** That depends entirely on what Cristian and Paxmod actually want, which is not a technical question and wasn't assessed here.
