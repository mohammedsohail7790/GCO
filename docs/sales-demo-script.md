# GCO Live Sales Demo Script

**Audience:** business owners, operations/customer-support managers, e-commerce businesses evaluating outsourced conversation operations.
**Duration:** ~9 minutes, live against the real production deployment.
**Environment:** `https://globalconversationoperations.com` (corporate site) and `https://app.globalconversationoperations.com` (CRM/platform). Both are the actual production system - nothing shown is a mockup.

## Before the call

- Demo accounts (see `[DEMO ONLY]` credentials sheet, not committed to this repo) for CEO_ADMIN, MANAGER, HUNTER, OPERATOR, CLIENT are already staged.
- Demo data already in place, so the call isn't spent on setup:
  - **Lead 1 - "[DEMO] Northwind Supply Co"**: fresh, unclaimed, sitting at `NEW`. Used to demo ownership/claiming live.
  - **Lead 2 - "[DEMO] Marlowe & Finch Goods"**: already claimed by the demo Hunter and walked to `PROPOSAL`. Used to demo the approval → commission → BPO handoff flow without spending live time on every pipeline stage.
  - **One inbound demo conversation** (a fictional "order hasn't shipped" message) has already come in through the real webhook ingestion pipeline and was auto-assigned to the demo Operator by the actual assignment engine - not manually forced. Sitting in queue, ready to answer live.
- All demo data is clearly marked `[DEMO]` / `@demo.gco` / `.test` domains. None of it is real client or customer data.

## 0:00-0:45 - GCO overview

Open `https://globalconversationoperations.com`. "GCO provides managed human conversation operations - trained, supervised operator teams handling chat, engagement, and moderation for businesses, backed by a real operations platform. What I'm going to show you today is the actual live system, not slides."

## 0:45-1:30 - Corporate website and services

Scroll through the homepage: 24/7 coverage, multilingual operators, supervision & QA, scalable staffing. Click through to `/services` and `/how-it-works` briefly. Point out the three-step process (onboarding → team setup & training → supervision & reporting).

## 1:30-2:30 - CEO/Manager dashboard

Log in as `admin@demo.gco`. Show the CEO dashboard: pipeline value, Hunter leaderboard, commission configuration, approvals queue. Switch to `manager@demo.gco` (or stay as CEO - CEO sees everything a Manager sees plus more) to show team-wide lead/pipeline visibility.

## 2:30-3:30 - Hunter lead ownership and pipeline

Log in as `hunter1@demo.gco`. Show "[DEMO] Northwind Supply Co" sitting unclaimed in the shared pool. **Claim it live** - this is a real, race-safe database operation (two Hunters clicking the same lead at the same instant, only one wins - explain briefly if asked). Walk it through one or two stage transitions (NEW → CONTACTED → ENGAGED) to show the pipeline UI.

Then switch to "[DEMO] Marlowe & Finch Goods", already at `PROPOSAL`. Click **Submit for Approval** live.

## 3:30-4:15 - Closure approval and first-payment commission

Switch to `manager@demo.gco` (or CEO). Show the pending approval, **approve it live**. Explain what just happened: the lead moved to Closed Won, and a BPO handoff was automatically queued - but explicitly **no commission was created yet**. This is the confirmed business rule: commission is 10% of the client's **actual first month's collected revenue**, never just for closing the deal. Once the (simulated) first payment is confirmed, click **Confirm Payment** and show the commission appear - server-calculated, exactly 10%, auditable.

## 4:15-5:30 - BPO handoff

Explain: once a deal closes, GCO's own operations pipeline picks it up automatically - a background worker creates the client's operational profile so the Operator team can start immediately. Show the resulting client/tenant now visible in the CEO dashboard. This is the same automated handoff mechanism, running live, that would onboard a real client.

## 5:30-7:00 - Operator conversation workflow

Log in as `operator1@demo.gco`. Show the already-queued demo conversation ("order hasn't shipped") sitting in their inbox - point out it arrived and was assigned automatically, no manual routing. **Send a live reply.** Show the conversation update in real time (the realtime/WebSocket layer - if useful, mention this is a live WebSocket connection, not polling).

## 7:00-8:00 - Security / tenant isolation / RBAC

Briefly, without diving into infrastructure detail: "Every client's data is isolated - one client's conversations, leads, and reporting are never visible to another. Every role only sees what it's supposed to: an Operator sees their assigned conversations, a Manager sees their team, a Client sees only their own account." (See `docs/technical-sales-presentation.md` slide 8 for the full backing detail if asked.)

## 8:00-9:00 - Integrations and client onboarding

"Today the platform ingests conversations through a general webhook-based integration layer we've already proven end-to-end - what you just saw arrive in the Operator's queue came through exactly that pipeline. Connecting a specific channel (WhatsApp, Instagram, live chat, a custom API) is a scoped integration project once we know your actual channels and access requirements - see the capability matrix." Do **not** claim WhatsApp/Instagram/Messenger/Shopify/WooCommerce are already live.

## 9:00-10:00 - 7-day pilot and next steps

"If this looks like a fit, the next step is a short discovery call to confirm scope and technical requirements, then a 7-day live pilot on your actual conversations - see `docs/7-day-pilot.md`." Close with the discovery-call CTA.

## Demo safety checklist (confirm before every call)

- [ ] No production secrets, API keys, database credentials, internal IPs, or SSH details visible on screen.
- [ ] Only `@demo.gco` / demo tenant data used - no real client or customer information.
- [ ] Demo integration cannot reach any real external customer (it's the `dev-mock` adapter - simulated delivery only, confirmed in `lib/integrations/adapters/devMock.ts`).
- [ ] AI is honestly described as demo/mock mode if the topic comes up (see presentation slide 11) - never claim production AI is active.
