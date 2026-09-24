# GCO — Public Website Roadmap / Discovery Specification

**Date:** 2026-08-29
**Type:** READ-ONLY discovery & planning document. **No code, schema, migration, test, package, or existing documentation was modified to produce this.**
**Commit under audit:** `6ffc8d5` (HEAD of `main`).
**Relationship to V1:** This document plans a *future* public marketing/recruitment website. The V1 application priorities (client technical questionnaire → client discovery → client API/sandbox → integration → controlled 3-day pilot) remain the priority and are unaffected. **This document does NOT implement anything.**

Reference sites (Cloudworkers, E-Moderators, New Media Services) and style references (Stripe, Linear) are inspirational only. Nothing is copied; GCO keeps its own identity and does not adopt others' claims, wording, layouts, or business-model assumptions.

---

## 1. Executive Summary

GCO currently has **no public website of any kind**. The repository is a single, private, multi-tenant conversation-operations application (`app/` + `lib/` + `workers/` + `prisma/`). The only route that reaches an anonymous visitor is `/login`; the root `/` immediately redirects to `/login` for authenticated users and has no public content. There are no marketing pages, no reusable public components, no public assets (no `public/` directory, no images, no fonts, no logos), no contact/lead/booking machinery, no email capability, and no CMS.

A future public website is needed for two purposes: a **B2B/client side** (convert qualified companies/platforms into conversations and pilots) and an **operator/recruitment side** (convert prospective operators through an application funnel).

Because the existing application is a hardened, security-critical multi-tenant product, the recommended architecture is a **separate public marketing site** (Option C: a separate site that may later share only non-sensitive design tokens), deployed independently from the application's domain, with a strict public→internal security boundary. The public site must **never** be able to reach the application's internal APIs, tenant data, operator data, or administrative endpoints. Any public form (lead capture, operator application, contact) must submit to public-facing cold storage/integrations and be reviewed by a human before anything reaches the internal system.

This document specifies: the codebase audit, recommended architecture, information architecture, both funnels, 3-day pilot positioning, brand/messaging direction, visual direction, trust/security messaging taxonomy, lead generation, operator application strategy, SEO/performance, technical dependencies, security boundary, phased roadmap, open decisions, what must NOT be built yet, and the next step.

**Key principle throughout — DO NOT OVERBUILD.** The simplest thing that converts prospects into conversations/pilots and operators into applications is the goal. No custom CRM, no custom booking engine, no chatbot, no unnecessary CMS, no microservices, no new database, no unnecessary APIs.

---

## 2. Existing Codebase Audit

### Framework & frontend
- **Next.js 16 (App Router, `app/`)**, React 18, TypeScript. `next.config.js` sets `output: 'standalone'` (Docker) + security headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`) for **all** routes.
- **Styling:** Tailwind CSS 3 + a single `brand` color token (`brand.500 #3563e9` etc.) in `tailwind.config.ts`; `globals.css` is minimal (base utilities + `bg-slate-50 text-slate-900` body). `clsx` + `tailwind-merge` present. **No component library** — `components/` is an empty directory (nothing tracked).
- **Routing (all internal/auth-only):** `/login`, `/operator`, `/manager`, `/admin`, `/client-panel`, plus the `/api/v1/*` API surface. Root `/` redirects to `/login` (or a role dashboard if already authenticated).
- **Auth:** session login via `/api/v1/auth/*`; `middleware.ts` gates role-prefixed routes as a UX convenience (server re-verifies on every API call); httpOnly cookie (`gco_at`); RBAC via `lib/auth/rbac.ts`; tenant isolation via `lib/auth/tenantGuard.ts`. **None of this is (or should be) reachable from a public marketing site.**
- **API:** `app/api/v1/**` becomes `https://<app-host>/api/v1/**`; all routes are authenticated/authorized, Zod-validated, tenant-scoped, masked on 5xx, rate-limited. `/api/v1/health` is the only unauthenticated route.
- **Background:** BullMQ worker (`workers/index.ts`) + standalone realtime WebSocket server (`workers/realtime-server.ts`, port 3001). Postgres (Prisma) + Redis.
- **Deployment config:** `Dockerfile` (multi-stage, `node server.js`) + `docker-compose.yml` (postgres, redis, web, worker). Docker has never actually been run in this environment (no Docker installed) — direct-process dev deployment is the proven path.

### Public website / marketing assets — VERIFIED ABSENT
- **No public website / landing page / marketing components.** Only authenticated dashboards + login.
- **No reusable public UI components** (`components/` is empty).
- **No navigation / footer** outside the in-app dashboards (which are private, role-scoped and not reusable as marketing chrome).
- **No forms** (contact, lead, application) — the only forms are `/login` and in-app operational forms inside the authenticated app.
- **No contact functionality**, **no email functionality** (no nodemailer/SMTP/SendGrid/Resend/any mailer in the codebase), **no calendar/booking**, **no CRM**, **no analytics** (no GA/Plausible/PostHog).
- **No asset handling / no `public/` directory**, **no fonts** (`next/font` unused; no self-hosted fonts), **no logos / favicon / OG images / apple-icon / manifest**, **no robots.txt / sitemap / canonical**.
- **No CMS / content mechanism.**
- **No legal pages**: no privacy policy, no terms, no cookie-consent mechanism.

### Terminology that exists today (use consistently; do not distort)
- Product description (from product draft): a multi-tenant platform between a client's incoming message traffic and a team of **human operators**, using AI to **draft — never send — suggested replies**; operators review/edit/approve; delivery is tracked; usage is billed per message. Four (five with ASSISTANT) roles: platform operator/CEO_ADMIN, manager, operator, client.
- Differentiators already evidenced in code/tests: database-level race-safe assignment; **AI never sends, a human always does** (single outbound code path); idempotency-keyed usage (no double-billing); tenant isolation; RBAC; HMAC webhook verification; rate limiting; server-side SLA timers; dead-letter capture + recovery; realtime with polling fallback.
- **Operator compensation does NOT exist** in code (no payout calculation). The site must not fabricate compensation numbers or a public compensation model without approval/definition.
- **Real AI provider is BLOCKED BY CREDENTIAL** and **real client integration is BLOCKED** (no spec/sandbox; dev-mock adapter only). Media/attachments unsupported. These are not website concerns, but website claims must not overstate them.

---

## 3. Recommended Website Architecture

**Recommendation: Option C — a separate public marketing site, deployed independently, sharing only non-sensitive design tokens (never internal components or APIs).**

### Why not Option A (inside the existing Next app)?
- The existing app is a hardened, security-critical, multi-tenant product with a strict authentication/RBAC/tenant boundary. Adding public routes into the same app increases the attack surface on, and coupling to, the internal system.
- The app requires session/db/queue at runtime (`output: standalone`, Prisma, Redis). A marketing site does not — embedding it forces marketing deploys/iterations through the same heavyweight pipeline and runtime.
- Root `/` currently redirects to login; repurposing it for marketing would collide with the authenticated-dashboard routing model and middleware.
- Security headers are global today (e.g. `Permissions-Policy` camera/mic=()) which is fine but the public site should be allowed its own header/font/SEO policy.

### Why not Option B (fully separate, zero sharing)?
- Acceptable if we never want shared design tokens/SEO conventions. But Option C is barely more work and gives consistent visual identity by sharing a small token/utility layer. If a shared package feels premature, start Option B and promote shared tokens later — same end state, no over-build.

### Recommended shape (Option C)
A **separate, static-first, low-runtime Next.js (or plain static React/HTML) marketing site**:

- **Deployment isolation:** on its own domain/subdomain (e.g. `gco.com` for public, and the app on `app.gco.com` / `console.gco.com`). Independent builds, deploys, scaling, and rollbacks. Marketing traffic / CMS churn can never take down the operations app.
- **Security:** zero connection to the internal app in normal operation. The public site has **no DB, no Prisma, no Redis, no app API endpoints, no auth secrets**. It does not embed the internal app or call `/api/v1/*`.
- **Runtime surface:** ideally static (SSG) pages for SEO/speed/perf; a single small public contact/application endpoint (or external form provider — preferred, see §14) is the only dynamic surface.
- **Maintainability/iteration speed:** marketing copy, layouts, and content iterate independently, quickly, without touching the operations product or running its test suite.
- **SEO/performance:** clean URLs, semantic HTML, metadata/OG, sitemap/robots on a static host; no hydration heavy-lifting beyond what each page needs.
- **Authentication boundary / dashboard separation:** public site is fully anonymous; the operations app remains fully authenticated and isolated. The only seam is manual escalation of submitted leads/applications by a human into the internal system (see §17) — never automatic API access.
- **Shared components/tokens:** a minimal shared token set (colors, type scale, spacing) can be published as a tiny package or vendored copy; do **not** share internal `components/` (it's empty anyway) or API clients.
- **Future CMS needs:** if content grows, prefer a lightweight headless CMS or Markdown/MDX in the repo — not a heavyweight platform (§19 guardrail), and it must be public-side only.
- **Operational risk:** separation means the website is disposable and non-critical; the hardened app is the source of truth and stays isolated. This is the lowest-risk option for the existing security model.

### Explicit non-recommendations (do not overbuild)
- No microservices; no new database; no auth for the public site; no chatbot; no custom CRM/booking engine; no custom recruitment platform; no unnecessary CMS; no internal-API exposure.

---

## 4. Information Architecture

Recommended pages (justified; optional ones only if a demonstrated need appears):

```
/                     Home
/solutions            B2B — services GCO provides & how it combines people + technology
/how-it-works         The operational model / workflow
/pilot                The controlled 3-day pilot (positioning, not hard terms)
/technology           Technical approach (appropriate depth — see §6)
/security             Trust / security approach (claim-classified, see §9)
/about                About GCO
/contact              Contact / book a call
/operators            Operator opportunity (role, expectations, remote work, eligibility)
/operators/apply      Operator application (form)
```

**Optional — include only when justified (not now, by default):**
- `/case-studies` — only when a real, consented client result exists. Do NOT create an empty section.
- `/resources` — only if GCO produces genuinely useful content worth a home (whitepaper, glossary). Not yet.
- `/faq` — include a modest FAQ section on `/pilot` and `/operators` pages rather than a dedicated page unless volume warrants it.
- `/careers` — replace with `/operators` (GCO's near-term hiring is operators). A broader `/careers` only if non-operator roles are ever advertised.

**Login/support links:** a single discreet link to the client portal (`app.<domain>/login`) for existing clients; the public site otherwise has no auth.

**Information hierarchy rule:** the B2B side leads with problem → solution → operational model → pilot → trust → contact. The operator side leads with role → expectations → workflow → eligibility → apply. Page depth increases with conversion intent.

---

## 5. B2B Funnel

### Intended journey
```
Anonymous visitor
  │  sees what GCO does (Home) — positioning + primary CTA
  ▼
Understand GCO's problem space (/solutions) — the operational challenge GCO solves
  ▼
Understand the solution (/solutions, /how-it-works) — AI draft + human-approve model
  ▼
Understand the operational model (/how-it-works) — workflow, SLA, operators, delivery
  ▼
Understand the 3-day pilot (/pilot) — limited, controlled, measured, low-risk
  ▼
Build trust (/security, /technology, /about) — evidence-classified claims only
  ▼
Contact / book a call (/contact) — short qualification form + meeting request
  ▼
Qualification (human) → technical discovery → client questionnaire → API/sandbox → pilot
```

### CTAs & conversion points
- **Primary CTA:** "Book a call" / "Request a pilot" → `/contact`.
- **Secondary CTA:** "See how it works" → `/how-it-works` or `/pilot`; "Talk to GCO" in nav/footer.
- **Conversion points:** primary CTA on every B2B page where the visitor has enough context; a form on `/contact`; org/contact footer CTA on every page; exit-intent/bottom-of-page only where it adds real value (don't spam every scroll).

### Lead qualification points (on the form — keep minimum-viable, see §12)
- Company/platform name, contact name + email, use case, approximate message volume, languages, current operator workflow, optional technical contact + meeting booking.
- First-pass qualification happens in the form fields; deeper qualification (questionnaire, API/sandbox) happens **after** a human conversation, never on the site.

### Where technical information should (and should not) appear
- **Should:** `/technology` (architecture at the right non-copy depth: human-in-the-loop, multi-tenant, idempotency/no-double-billing, SLA timing, delivery tracking, integration abstraction, reliability/recovery), and light, non-technical echoes on `/how-it-works` and `/pilot`. `/security` for the trust posture.
- **Must NOT expose:** internal route/endpoint details, implementation specifics, credentials, infra topology, internal analytics, admin/internal/operator data, exact internal limits, security headers/schemes beyond what's safe to state, anything code-level that could aid an attacker. See §17 security boundary and §9 claim-classification — many "engineering features" must stay *internal*, not become *marketing*.

### Placeholders where real evidence is required (do NOT fabricate)
- Customer logos, statistics, case studies, revenue figures, testimonials, performance claims, SLA numbers (beyond the generic "server-enforced response-time budget"), and client names. **Label these as placeholders** in the content hierarchy; populate only with real, consented, evidence-backed material if/when it exists.

---

## 6. Operator Recruitment Funnel

### Intended journey
```
Visitor → Understand the operator role → expectations → benefits/process (handled at an
appropriate level) → eligibility/requirements → remote work → apply → screening →
onboarding → training → activation
```

### What must be public (site)
- What working with GCO means (role summary: handling assigned customer conversations through GCO's workspace with AI-drafted suggestions; a human approves every send).
- The workflow (assigned conversations, server-side SLA, review/edit/send, availability).
- Expectations (committing to availability, response within SLA, quality).
- Remote work reality (fully remote, async-friendly where it applies; be accurate).
- Eligibility/requirements (language proficiency, communication skill, location/time-zone considerations, availability, relevant experience).
- Benefits/process at an "appropriate level" — this means: describe the engagement model, pay-for-work approach, review/quality process, application-to-activation pipeline **without inventing specific compensation figures** (see §7 and §20).

### What must remain private / not public
- Internal pay rates, internal operator metrics, internal tooling detail, client identities, tenant/client conversation content, management/CEO_ADMIN internals. Operator compensation does not exist in code — do not publish a compensation schedule that has been neither defined nor approved.

### Where applications are stored & external recruitment system
- **Do not store applications in the GCO internal application** (no DB, no new schema, no internal API).
- **Preferred:** an external, purpose-built form/applicant source: a form provider (Tally/Typeform/Google Forms — pick one) that writes to a private spreadsheet/CRM/ATS-lite (e.g. a lightweight ATS or Notion/Airtable) that GCO staff review. This keeps recruitment data fully isolated from the operations platform.
- **Backend requirement (FUTURE):** a small public-only endpoint or provider webhook that accepts the application payload, validates it (Zod), and forwards to the storage/ATS; spam protection (CAPTCHA/honeypot/rate-limit); retention/consent handling. Do not build this now unless the external provider proves insufficient.
- Application lifecycle (received → screening → accepted/rejected → onboarding → training → activation): tracked in the external tool first; only a human decision (after screening) ever creates an operator in the internal system.

### Required application information (minimum viable — see §13)

---

## 7. 3-Day Pilot Positioning

The site may eventually explain the pilot to qualify prospects. Communicate (as a controlled, commercial offer — terms configurable, not hardcoded):

- **Limited duration** — a defined window (e.g. ~3 days / defined period) with a clearly-bounded engagement.
- **Controlled scope** — dedicated tenant/environment, defined operator capacity, defined traffic/message volume.
- **Qualified prospects** — eligibility/technical fit checked in advance (questionnaire + technical discovery); not a first-come free tier.
- **Defined traffic/message volume** — a stated cap; **do not promise unlimited messages or unlimited free service**.
- **Measurable KPIs** — response time/SLA handling, throughput, usage/spend, delivery, quality. GCO's existing analytics endpoints support measuring these; the site must present them as "measures agreed with the client" not guaranteed outcomes.
- **Human operator involvement** — emphasize operators are real and approve every send.
- **Technical discovery** — sandbox/API details established before the pilot.
- **Low-risk validation** — cost-contained, reversible, isolated, defined stop.
- **Conversion to paid operations if successful** — pilot success leads to a paid operating agreement; do not promise guaranteed results.

**Must NOT promise:** unlimited/low free service, unlimited messages, guaranteed results (e.g. response rates, satisfaction), unsupported integrations/platforms, unsupported languages, unsupported media, universal platform compatibility, or any specific SLA/target as a contract. Keep all commercial terms in configurable/negotiable phrasing; require approval before hardcoding pricing, caps, or SLA numbers into copy (placeholders otherwise).

---

## 8. Brand / Messaging Direction

### Positioning framework (see §20 for the concise one-liner + this narrative)
- **Brand essence:** "professional technology-enabled operations" — credible, operationally serious, trustworthy — not an "AI gimmick."
- **Voice:** confident, understated, precise, B2B. Explains what GCO does and how it works with evidence-backed claims. Avoids hype and generic AI-fluency. Favors clarity and specifics over adjectives.
- **Messaging pillars:**
  1. **Human judgment + AI draft** — GCO pairs human operators with AI suggestions; a human always approves what goes out.
  2. **Operational discipline** — enforced response-time budgets, fair assignment, delivery tracking, transparent usage.
  3. **Accountability & trust** — per-message accounting, audit trails, tenant isolation, controlled workflows.
  4. **Scale done carefully** — a controlled pilot before any broader commitment; measurable KPIs.
- **Proof-point discipline:** separate CURRENT VERIFIED CAPABILITIES from FUTURE CAPABILITIES (see §9). Never convert an internal engineering feature into an exaggerated marketing claim.

### Terminology rules
- Use "suggested replies / AI drafts" (not "AI that writes for you"); "human operators who approve every send"; "conversation operations"; "controlled pilot." Use "client," "operator," "manager," "platform operator" consistently with the internal roles. Do not invent new service names or modal descriptions unless approved.

---

## 9. Visual Design Direction

A **visual system direction**, not an implementation. Tone: Stripe/Linear-quality polish but distinctly GCO and operationally serious.

- **Typography:** a clean, confident grotesque/neo-grotesque for headings (e.g. a system/self-hosted UI-sans like Inter/Geist, or a premium display sans) + reliable sans for body; strong numeric/figures styling for metrics (tabular numerals); strict type scale and hierarchy. No trendy display-only sci-fi faces.
- **Spacing/layout:** generous whitespace, disciplined 8pt-based grid, clear content hierarchy, restrained max-width editorial layouts rather than dense dashboards.
- **Navigation:** slim, prominent top nav (B2B links + Contact CTA), minimal persistent footer with org links + portal link.
- **Hero treatment:** a single, clear value proposition with one primary action; avoid bloated carousels. Technical/data visualization of "message → human → reply" as clean, diagrammatic imagery is on-brand.
- **Cards / gradient:** structured, flat, information-dense cards with subtle borders/shadow; gradients used sparingly and tastefully, not overdone.
- **Subtle motion:** micro-interactions, scroll reveals, count-up metrics — restrained, purposeful, no distracting animations.
- **Technical/data visualizations:** clean diagrams of the workflow (webhook → queue → human review → send), SLA/SLA-clock concepts, delivery/usage accountability, and pilot-metric examples. Nothing that claims real client data unless real.
- **Operator imagery:** respectful, professional, realistic (remote-work context), not stock-photo-heavy; avoid cheesy "smiling headset operator" stock clichés.
- **Iconography:** a consistent custom/line-icon set; no clip-art.
- **CTA hierarchy:** one strong primary action per viewport (Book a call / Request a pilot / Apply as an operator) with clearly secondary links; color/weight signals intent.
- **Responsive behavior:** mobile-first; nav collapses cleanly; forms single-column on small screens; touch-friendly targets.
- **Avoid:** generic AI neon aesthetics, excessive glowing brains, cliché robots, childish SaaS illustrations, overdone gradients, fake dashboards, fake metrics. Communication should read "professional technology-enabled operations," not "AI gimmick."

---

## 10. Trust / Security Messaging

### Claim-classification taxonomy
Every public claim falls into exactly one bucket. Marketing copy must only use claims whose bucket permits public use, and must phrase them to avoid overstating.

| Claim area | Classification today | Public-safe wording guidance |
|---|---|---|
| Multi-tenant isolation (app-layer) | **VERIFIED TODAY** (in tests) | May say "client data is isolated"; phrase as architecture, not a certification. |
| RBAC / role-based access control | **VERIFIED TODAY** | May say "role-based access control for each client's people." |
| Authentication security (JWT, httpOnly, session revocation) | **VERIFIED TODAY** | May say "secure sign-in"; avoid implementation slogans. |
| HMAC webhook signature verification | **VERIFIED TODAY** | May say "webhook events are cryptographically verified." |
| Rate limiting | **VERIFIED TODAY** (partial coverage) | Phrase generally; do not claim "full coverage." |
| Usage tracking / per-message accounting | **VERIFIED TODAY** | May say "transparent, measurable usage"; "exact per-message billing" with care — terms configurable. |
| Human review (AI never sends) | **VERIFIED TODAY** | Strong differentiator — safe to lead with. |
| Server-side SLA timing | **VERIFIED TODAY** | May say "enforced response-time budgets"; do not quote specific numeric SLA promises. |
| Logging / audit trails | **VERIFIED TODAY** | May say "audit logging"; avoid claiming compliance certifications not earned. |
| Availability/uptime SLA | **REQUIRES PRODUCTION VALIDATION** | Do NOT promise uptime % until production infrastructure is validated. |
| Backup/restore, DR, failover | **REQUIRES PRODUCTION VALIDATION** | Do NOT claim until verified. |
| Real AI provider quality/reliability | **FUTURE / REQUIRES PRODUCTION VALIDATION** (mock provider now, credential-blocked) | Do not claim real-AI behavior as fact. |
| Real client integrations / platform support | **FUTURE** (blocked until client spec/sandbox) | Frame as "integration built against your platform's API" not "supports X platform." |
| Media/attachments, languages, 24/7, escalations | **FUTURE / NOT SUPPORTED** | Do not claim. Say capabilities are defined per client engagement. |
| Compliance certifications (SOC2/ISO, GDPR as a processor detail, etc.) | **DO NOT CLAIM** unless/until real | Leave out or mark as future/requires validation. |
| Encryption at rest / in transit | **FUTURE / REQUIRES PRODUCTION VALIDATION** | Neutral: "secure data handling"; verify before specifics. |
| "AI gimmick" / generic hype claims | **DO NOT CLAIM** | Never. |

### Security-boundary rule for the site
The public site itself must not become an attack surface into the internal app: no internal API exposure, no tenant/operator/client/internal data, no credentials, no internal infrastructure detail, no admin endpoints. See §17 for the full boundary.

---

## 11. Lead Generation Strategy

### Contact/booking flow (minimum viable)
```
CTA (Book a call / Request a pilot)
  → short qualification form (/contact)
  → confirmation + human review (email to GCO inbox) 
  → GCO qualifies (commercial + technical fit)
  → schedule meeting (calendar link) → questionnaire → API/sandbox → pilot
```

### Minimum useful form fields (keep it small; don't overbuild)
- Name (contact), work email, company/platform name.
- Use case / what you want to solve (free text, short).
- Approximate expected message volume (select: <100 / 100–1k / 1k–10k / 10k+/not sure).
- Languages needed (multi-select, free).
- Current operator workflow (select or short text: in-house / outsourced / none yet / other).
- Optional: preferred meeting time/calendar booking; optional technical contact line for later.

Do not add fields that don't feed qualification.

### Requirements (FUTURE; choose the lightest path)
- **Email handling:** a form-to-email provider or the site's own small endpoint that emails/feeds a GCO inbox (wait: prefer a form provider with email notification — no custom email infra; this app has no mailer today and §14 says don't build custom infra).
- **CRM integration:** none required initially — a spreadsheet/Notion inbox is enough at GCO's stage; a lightweight CRM only if lead volume proves the need. Do not build a custom CRM.
- **Calendar integration:** a reusable booking link (e.g. Calendly/Google appointment) — no custom booking engine.
- **Spam protection:** CAPTCHA + honeypot + basic rate-limit/validation; form provider can cover this.
- **Validation:** server/API-side Zod validation on the submission endpoint; client-side basic validation for UX.
- **Privacy/consent:** explicit consent checkbox + privacy note; retention agreed; GDPR/consent where applicable (see §14 legal).
- **Storage requirements (FUTURE, B2B):** the leads go to the external provider/inbox first; a human reviews before anything is acted on. If a dedicated storage/CRM is ever needed, it's external to GCO's app.

---

## 12. Operator Application Strategy

### Minimum viable fields
- Name, email (contact), location / time zone (select from a reasonable list), languages (multi-select + proficiency), relevant experience (short free text), availability (e.g. days/hours/window), communication-skills self-assessment (short text or simple select), and an optional resume/profile link/upload where appropriate. Only fields that feed screening.

### Privacy / consent / secure storage
- Consent checkbox for data processing + privacy note; retention policy agreed; the data lives in an external form/applicant tool (not GCO's internal DB). Access to applications restricted to recruitment staff. No sensitive special-category data collected at application time.

### Admin review / status / lifecycle
- Statuses handled in the external tool / light ATS: Received → Under review → Interview → Accepted / Declined → (if accepted) Onboarding → Training → Activated. GCO staff review; only an accepted, screened candidate is created as an `Operator` in the internal system by a human admin (via the existing internal admin flow), and only then does onboarding/activation begin.
- No automatic link from public application → internal operator creation.

### External recruitment system (recommendation)
- Prefer an external, purpose-built recruitment/application tool (form + lightweight ATS or spreadsheet/Notion) over storing applications in GCO. Rationale: GCO's internal app is a hardened operations product; candidate PII and pipelines are better managed in a dedicated recruitment tool with its own retention/compliance controls. GCO's internal app has no candidate/recruitment schema, and §19 is explicit about not adding one speculatively.

### Future API/backend support required (FUTURE, only if needed)
- If a custom form is chosen later: a small public endpoint (Zod-validated), spam protection, rate limiting, consent capture, and forwarding to the chosen storage/ATS (webhook/email). Explicitly **not built now** unless the external provider proves insufficient.

---

## 13. SEO / Performance Strategy

Not implemented; plan only.

- **Semantic HTML5**, one `<h1>` per page, logical heading hierarchy, correct landmarks.
- **Metadata:** per-page `title`/`description`, Open Graph + Twitter cards, canonical URLs, OpenGraph images (generate brand-consistent OG images; none exist yet).
- **Structured data where appropriate:** `Organization`/`Service`/`FAQPage`/`JobPosting` (for operator opportunity) — applied only where the content genuinely qualifies.
- **Sitemap (+ images) & robots.txt:** both missing today; add on the public site.
- **Performance / Core Web Vitals:** static-first rendering, optimized + eager/priority images, font/display optimization (`next/font` locally hosted — the existing app has no fonts at all), minified CSS/JS (`next build`), no unnecessary client JS, responsive design, accessibility (aria, labels, contrast, keyboard, focus states, reduced-motion).
- **Canonical/host concerns:** the public site is on its own domain; the internal app (which today handles `/login` etc.) stays excluded from public indexation (internal app must not be indexed — add robots meta/header on the app side as a *planned* change, not implemented here; this is a note for the future build, requires care not to disturb V1).
- **Verify afterward** with Lighthouse / PageSpeed CI once the public site build exists — nothing is measured today.

---

## 14. Technical Dependencies

The website's actual needs, each classified:

| Need | Status | Notes |
|---|---|---|
| Domain + DNS (public site host) | **REQUIRES DECISION** | Decide public domain (e.g. `gco.com`) vs app subdomain (`app.` / `console.`); boundary depends on it. |
| Hosting/deployment | **REQUIRES DECISION** | Static host (Vercel/Netlify/Cloudflare Pages) is ideal for static-first; independent from GCO app host. |
| Framework/build | **READY / AVAILABLE** | Next.js 16 already in-repo conventions; or static HTML/React — decide. No new dependency required beyond what a static host needs. |
| Design tokens/brand | **AVAILABLE (minimal)** | Only a `brand` blue token exists + nothing else. **REQUIRES DECISION** on full brand kit (type, palette, logo, favicon, OG images). |
| Contact/lead form | **REQUIRES EXTERNAL SERVICE** | Prefer a form provider (e.g. Tally/Typeform) or a small endpoint + email notification. No custom email infra; GCO has no mailer today. |
| Email handling | **REQUIRES EXTERNAL SERVICE** | Form-to-inbox/notification (e.g. provider webhook/email) — **READY** to choose provider; no SMTP infra in repo. |
| CRM | **REQUIRES DECISION** | Initially none/spreadsheet/Notion; lightweight CRM only if volume justifies. No custom CRM. |
| Calendar/booking | **REQUIRES EXTERNAL SERVICE** | Reusable booking link (e.g. Calendly/Google appointment). No custom booking engine. |
| Operator application storage | **REQUIRES EXTERNAL SERVICE** | External form + light ATS/spreadsheet/Notion; isolated from GCO app. |
| Spam protection | **AVAILABLE** (add CAPTCHA/honeypot/rate-limit to form endpoint) or **EXTERNAL** via provider. |
| CMS | **REQUIRES DECISION** | Start with Markdown/MDX/static content in the repo; add a lightweight headless CMS only if demonstrated need. |
| Image/brand assets | **REQUIRES DECISION** | No assets exist; need logo, favicon, OG, hero/operator imagery (respectful, non-stock-heavy). |
| Legal pages | **REQUIRES DECISION** | Privacy policy, terms, cookie/consent (where applicable) — none exist. Must be drafted (legal review) before any form collects data. |
| Analytics | **REQUIRES EXTERNAL SERVICE** | Privacy-light analytics (e.g. Plausible/GA4) — choose; none in GCO today. |
| SEO tooling | **AVAILABLE** | sitemap/robots/OG; `next/font` for self-hosted fonts. |

---

## 15. Security Boundary

The public marketing site **must not** weaken the existing GCO application security model.

```
            PUBLIC MARKETING SITE
              │  anonymous visitors only
              │  static pages; no DB, no auth, no internal API
              │
      lead / application / contact submission
              │  (validated, spam-protected, consent-captured)
              ▼
      PUBLIC-FACING BOUNDARY  ── human review + manual hand-off ──▶ external
              │  storage / form provider / ATS / inbox / booking
              │  NEVER reaches internal app automatically
              ▼
          GCO INTERNAL APPLICATION
              │  authenticated session + RBAC + tenant isolation
              ▼
          AUTHENTICATED DASHBOARD
```

### What must never be exposed on the public site
- Internal `/api/v1/*` routes (authenticated) — do not call or document them from the public site.
- Tenant data, operator data, client data, conversation/message content, internal analytics, usage/margin figures.
- Credentials, secrets, webhook secrets/tokens, internal tokens.
- Internal infrastructure detail (host, ports, queue/worker/realtime layout, DB/Redis topology), internal security headers/schemes beyond safe-to-state, admin/internal endpoints.
- Unverified security or availability claims (see §9 taxonomy).

### Controls at the boundary
- Forms are the **only** dynamic surface; they accept only the minimum validated fields, are spam-protected and consent-captured, and land in external review storage — not the internal DB.
- A human reviews every lead/application before any action; there is **no automatic** write into the internal system from the public site.
- If a future public endpoint is added (e.g. to receive application payloads), it is public-only, isolated, rate-limited, and forwards to external storage — never to internal APIs.

---

## 16. Future Roadmap

**These are FUTURE phases.** Current V1 client discovery remains the priority; none of this is scheduled against V1 work.

- **Phase A — Discovery / content / brand:** define brand kit (name usage, logo, palette, type), settle terminology, draft messaging architecture + content outline, decide domain/host. No code.
- **Phase B — Design system:** build the public token/design foundation (type, spacing, color, iconography, CTA hierarchy) — separate from the internal app's minimal tokens.
- **Phase C — B2B marketing site:** Home, /solutions, /how-it-works, /pilot, /technology, /security, /about, /contact (+ SEO/metadata/OG/sitemap/robots/fonts).
- **Phase D — Operator recruitment funnel:** /operators + /operators/apply + external application storage; screening→onboarding→training→activation process (human-driven).
- **Phase E — Lead/contact integrations:** wire form-to-email, booking link, CRM/lead tracking (light), consent/privacy legal pages.
- **Phase F — SEO/performance:** finalize structured data, image/OG optimization, CWV verification, indexability (and ensure the internal app is excluded from indexation).
- **Phase G — Analytics/conversion optimization:** privacy-light analytics, funnel measurement, iterating CTAs/layout from real behavior.

---

## 17. Open Decisions

1. **Domain/boundary:** public site host + domain vs app subdomain; final decision drives deployment isolation.
2. **Static-first framework:** Next.js public site vs plain static HTML/React (both fine; decide on team comfort + CMS ambitions).
3. **Hosting provider** (static CDN/host — Vercel/Netlify/Cloudflare Pages or similar).
4. **Contact/lead form mechanism:** form provider vs small public endpoint (default: provider, lightest).
5. **Booking/calendar integration** (choose provider).
6. **Operator application storage:** external form + light ATS/spreadsheet/Notion (recommended) vs a future small public endpoint forwarding to it.
7. **Content approach:** Markdown/MDX in repo now; when/what headless CMS (lightweight only), if at all.
8. **Brand kit scope:** full visual identity development (logo, palette, type, imagery) — needed before Phase C/B.
9. **Analytics provider** and consent-banner approach.
10. **Legal:** who drafts/reviews privacy policy + terms + cookie notice (required before collecting data).
11. **Commercial/pilot terms on copy:** which (if any) pricing/cap/SLA numbers may appear; require explicit approval and keep configurable (placeholders until then).
12. **Operator compensation messaging:** whether/how any compensation/process detail appears on the operator side; must be defined/approved first (no compensation exists in code today).

---

## 18. What Must NOT Be Built Yet

Per the "DO NOT OVERBUILD" instruction and V1 isolation — deferred until a demonstrated requirement exists:

- **No public site code at all** — this roadmap only; Phase A onward is future work.
- **No custom CRM**, custom booking engine, or custom email infrastructure.
- **No internal-database storage of leads/applications**; no new GCO schema/migration for website data.
- **No new internal APIs** for the website (future public endpoint is public-only, isolated, and only if the external provider proves insufficient).
- **No chatbot / no unnecessary AI** on the marketing site.
- **No microservices, no new database, no authentication for the public site.**
- **No unnecessary CMS** (start static/Markdown; lightweight headless only if demonstrated).
- **No fake evidence**: no fabricated customer logos, statistics, case studies, testimonials, revenue figures, performance/uptime/AI claims (per §9, §13).
- **No copy of reference sites**: no borrowed wording, branding, layouts, assets, claims, or business-model assumptions.
- **No modifications to the V1 application, code, database, migrations, tests, APIs, auth, dashboards, package.json, or existing docs** — this task creates only this roadmap document.

---

## 19. Recommended Next Step

1. **Hold.** Do not start building. Complete current V1 client discovery first.
2. Confirm the **open decisions** in §17 with Christian (domain/host, brand kit, form/booking/analytics providers, legal).
3. Execute **Phase A** (discovery/content/brand) as a lightweight, non-coding step to lock messaging + the B2B/operator funnels before any build.
4. Only then proceed to **Phase B/C (design system + B2B site)** and **Phase D (operator funnel)** in a separate repository/deploy from the V1 application.
5. Re-verify the §15 boundary and §9 claim-classification against real, evidence-backed copy before any public launch.

---

## Appendix — Operator application fields (from §13, consolidated for reference)
Name · Email · Location/time zone · Languages (+ proficiency) · Relevant experience (short) · Availability · Communication-skills note · Optional resume/profile link. Consent + privacy note; external storage; human review; lifecycle in external tool; only accepted+onboarded candidates become internal operators.
