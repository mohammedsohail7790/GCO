# Website V2 - Phase B (services, industries, platform, escalation, repeat pilot requests)

## What was implemented

### Website
- **Services** (`/services` + six detail pages) - exactly the six approved services:
  Live Chat / Customer Support, Chat Moderation, Community Moderation, Multilingual Chat Operations,
  24/7 Chat Coverage, Dedicated / Outsourced Chat Teams. Every detail page has: hero, business need,
  what GCO manages, delivery model, operational workflow, capabilities, Supervision & QA, escalation,
  pilot callout, relevant industries, FAQ, related services and final CTA. One shared template renders
  data-driven content (`lib/content/services.ts`) - there is no duplicated page markup.
- **Industries** (`/industries` + five detail pages): Dating & Social, Online Communities, SaaS,
  E-commerce, Apps & Digital Platforms. Dating & Social is described as GCO's strongest initial
  specialisation; no page positions GCO as dating-only.
- **Platform** (`/platform`): capabilities that exist today (queues, assignment, timers, reassignment,
  workload/operator status, language-tagged conversations, supervisor visibility, escalation, reporting,
  activity monitoring, AI-assisted workflows with a human sending every reply, security controls).
- Homepage, How It Works, Pilot, footer and navigation updated; claims flags enabled with approved qualifiers.
- Metadata (title, description, canonical, Open Graph, Twitter) for every new page; sitemap now 20 URLs;
  robots unchanged apart from `/home` (added in Phase A). Pages are statically generated (revalidate 10 min).
- Mobile/accessibility: 44px touch targets (logo, footer, breadcrumbs, CTAs), native `<details>` FAQs
  (no JS), skip links, one `<h1>` per page, reduced-motion respected.

### Approved operational escalation (platform)
Operator -> Supervisor / Team Lead -> GCO Management / Client Contact.
- Data: `Escalation` (current state) + `EscalationEvent` (timeline, internal vs client-visible) -
  migration `20261005211102_add_escalations` (additive: 4 enums, 2 tables, indexes, FKs; no existing data touched).
  Every transition is also written to `AuditLog` (content-free metadata).
- API: `POST/GET /api/v1/escalations`, `GET /api/v1/escalations/:id`, `POST /api/v1/escalations/:id/actions`
  (claim | note | escalate | resolve). Logic and RBAC live in `lib/escalation/service.ts`.
- RBAC: OPERATOR raises (only a conversation they currently hold; reason + note required; one open
  escalation per conversation). MANAGER/ASSISTANT/CEO_ADMIN handle the supervisor level (claim, internal note,
  resolve, escalate to client decision). CEO_ADMIN/ASSISTANT handle the client-decision level. CLIENT sees only
  client-decision items and only client-visible messages (never operator/supervisor notes). Foreign or
  invisible escalations return 404 (existence never leaks across tenants).
- Realtime: reuses the existing tenant channel; event `ops.refresh` carries only an opaque `{ref}` - never content.
- UI: operator "Escalate" dialog + status badge; supervisor queue on the manager dashboard; management queue on the
  admin dashboard; "Decisions needed from you" card on the client panel.

### CRM: repeat pilot / contact submissions
Previously a repeat email was accepted but silently dropped (pre-existing: unique email). Now
(`recordRepeatInquiry` in `lib/crm/leads.ts`, used only by the public form): still ONE lead; owner, stage and
ownership timers untouched; a timestamped `pilot_request_received` / `contact_request_received` history entry
(full submission in metadata) and a notes entry are appended; only EMPTY safe fields (website, country) are filled;
nothing is overwritten. Hunter/CRM creation keeps its hard duplicate block. Leads are GCO's own sales CRM (not
tenant data); history is visible to the owning hunter and to MANAGER/CEO_ADMIN (existing `LEAD_VIEW_TEAM`).

## Assets and legal status
- **Screenshots:** none supplied. `PlatformPreview` renders real, sanitized screenshots from
  `lib/content/platformAssets.ts` and renders NOTHING while that list is empty (no mock-ups presented as the product).
  Needed: sanitized screenshots from demo data (queue, assignment/timers, manager dashboard, escalation queue),
  reviewed for PII, optimised and placed in `public/platform/`.
- **People imagery:** none (no approved team photos). Not faked.
- **Legal:** no approved Privacy Policy / Terms / Cookie wording exists, and none was invented. `/privacy`, `/terms`
  and `/cookies` still do not exist - pending company/legal text.
- **Calendly:** no URL yet. Book a Call -> `/contact`. Set `CALENDLY_SCHEDULING_URL` to enable.

## Remaining / Phase C recommendations
Sanitized platform screenshots; legal pages; Calendly URL; `/resources` (real articles); analytics with consent
approach; Organization structured data; per-page OG images; escalation reporting (counts, time-to-resolve) in the
CEO dashboard; optional notification channel for new escalations if required.

## Known observations (pre-existing, unchanged)
- A tenant-scoped MANAGER holds `LEAD_VIEW_TEAM` and can read GCO's sales leads.
