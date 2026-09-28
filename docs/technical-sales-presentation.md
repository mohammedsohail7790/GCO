# GCO Technical Sales Presentation

15 slides, business-audience language (no engineering jargon). PPTX generation was not attempted in this environment (no design/branding assets to build a deck template from, and no PPTX tooling available in this session) - this is the complete slide-by-slide content, ready to paste into a deck once branded slides exist.

---

### 1. GCO — Global Conversation Operations
Managed customer conversation operations for businesses. Human operator teams for chat, engagement, and moderation - trained, supervised, and always on.

### 2. The Problem
Customer conversations spread across channels become hard to manage consistently - coverage gaps, inconsistent tone, no supervision, and the overhead of hiring, training, and managing an in-house team.

### 3. What GCO Provides
Human operators + centralized operations platform + CRM + integrations. Real people, supervised and quality-controlled, backed by a platform built for coverage and scale - not an unsupervised outsourcing arrangement.

### 4. Client Journey
Lead → onboarding → channel connection → operators live → ongoing reporting. (Live-demonstrated in the walkthrough - see `docs/sales-demo-script.md`.)

### 5. GCO CRM
The operations platform we just showed live: pipeline management, approvals, commission tracking, and client operational visibility in one place - not a slide, a working system.

### 6. Operator Workflow
Message received → queued → automatically assigned → operator responds → activity and reporting captured. Demonstrated live against a real (demo) conversation in the walkthrough.

### 7. Sales / Hunter Workflow
Lead → ownership → outreach → pipeline → closing approval → automated client handoff. Demonstrated live in the walkthrough, including the approval and commission-on-first-payment logic.

### 8. Security & Isolation
- Every client's conversations, leads, and data are isolated from every other client.
- Every user role sees only what it's meant to (operators see their assignments; managers see their team; clients see only their own account).
- All access is authenticated; all traffic is encrypted (HTTPS/WSS).
- Full detail in `docs/technical-sales-presentation.md` slide 13 and the underlying security recheck kept in this repo's own Phase 8 hardening record - available on request, not included here to avoid exposing implementation detail.

### 9. Communication Channels
**Currently implemented (proven live):** the general webhook-based message pipeline used in the demo - receive, queue, assign, respond, report.
**Integration-ready (client-specific):** WhatsApp Business, Instagram, Messenger, custom client APIs/webhooks - each plugs into the same proven pipeline once that channel's access is available.
**Future/planned:** business email, website live chat widget.
(Full detail: `docs/client-capability-matrix.md`.)

### 10. E-commerce Integrations
Shopify and WooCommerce are **integration-ready, client-specific capabilities** - each requires that client's own store API credentials and a short scoping conversation about what data operators need surfaced (orders, customer history, etc.). Not pre-built or claimed as already connected to any store.

### 11. AI & Automation
The platform has AI-assist infrastructure built in (suggested replies, conversation memory). **Today, AI runs in demo/mock mode** - it is not connected to a live AI provider. Activating real AI-assisted suggestions requires a production AI credential and is a configuration step, not new development. We do not claim production AI is active until it genuinely is.

### 12. 7-Day Free Pilot
Scope agreed in advance → technical feasibility confirmed → client access arranged → Day 1 configuration and operator onboarding → Days 2-6 live pilot → Day 7 results review. Full detail: `docs/7-day-pilot.md`.

### 13. Security / Reliability
**Verified today:** encrypted connections throughout (HTTPS/WSS), isolated per-client data, role-based access control, automated database backups with a tested restore process, protected infrastructure (firewalled, key-only server access, automated intrusion protection).
**Honestly still in progress, not yet complete:** offsite backup storage (backups currently local to the primary server only) and external uptime/error monitoring are not yet configured - both are active near-term hardening items, not silently skipped.

### 14. Onboarding
Discovery call to understand your channels and volume → technical feasibility check → access/credentials arranged → configuration and operator training → live pilot → ongoing operation with reporting.

### 15. Next Step
Discovery call → technical assessment → 7-day pilot. [Book a Call / Contact Us - see the live corporate site.]

---

## Slide 9/10 status categories used above
Directly sourced from `docs/client-capability-matrix.md` - VERIFIED IMPLEMENTED, INTEGRATION-READY / CLIENT-SPECIFIC, PLANNED, PENDING CREDENTIAL / ACCOUNT. Kept identical wording across both documents so the sales narrative and the underlying capability matrix never drift apart.
