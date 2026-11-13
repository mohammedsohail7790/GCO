# 61 — One coherent system: inbox Tier B, recruitment and partner paths (Tier C), partner commission application (14 Nov 2026)

**Status:** design for the CEO's approval. **Nothing is built.** Scheduled **after** the security-critical release (CEO decision, 14 Nov). Builds on `57` (what exists), `59` (plan, privacy drafts) and `58` (website).

## 1. Is Tier A inside Tier B's 8 to 10 days?
**Yes. Tier B includes everything in Tier A; the estimates are not additional.** Tier A (3 to 4 days) was the minimal slice: categories and statuses with history, notification, leads in the same list. Tier B's **8 to 10 working days are the total** for the full inbox (all eight categories, filters, search, detail view, notes, history, the lead list, partner intake endpoint, "not notified" banner, tests). Tier C (**2 to 3 weeks**) is **on top** of B: forms, pages and translations only, because B is built to hold them. These are estimates for one engineer, not commitments.

## 2. One system, not disconnected forms
**Principle:** every public submission becomes one **inbox item** with the same lifecycle, notification, permissions, history and retention. A "form" is only a front end that fills a category. Tier B builds the whole back end and a first version of each category's form; Tier C adds the polished pages, six languages and SEO **without changing the data model**.

**Categories (eight, as the CEO listed):** Customer Support / Chat Operators; Moderators; SDRs and Sales Representatives; Brokers; BPO Partnerships; Technology Partnerships; Direct Client Inquiries; Pilot Requests. A ninth **Other** catches anything not matching. "Hunters" and "other commercial partners" are sub-types of the sales-partner path (the applicant selects SDR, Hunter, Broker or Other).

**Inbox item (one record):** id; category and sub-type; source page; **form language**; received time; applicant name, email, phone, company, country, time zone; the category's own answers (a validated, versioned structure: for operators: desired role, languages with levels, experience, availability; for sales partners: B2B experience, territories, target sectors, network; for clients and pilots: service, volume, start date); **consent record** (privacy notice version shown, time); status; owner; notification state (sent, failed, retries); spam signals. **History table (append-only):** received, status change, internal note, reply logged, notification sent or failed, viewed by whom, retention action.

**Statuses:**
- Recruitment (operators, moderators): New, Contacted, Reviewing, Interviewed, Accepted, Rejected, Archived.
- Partners and sales partners: New, Contacted, Reviewing, Call held, Agreement sent, Active partner, Declined, Archived.
- Client inquiries and pilot requests: **the existing CRM pipeline stages**; each such item also **creates or updates a CRM lead**, linked both ways, so Hunters, approvals and commission rules keep working.

**Screens (Founder only):** one Inbox: category tabs and counts, filters (category, status, language, country, date, notified yes/no), search, sort by newest or oldest-unanswered, a detail view with everything submitted, status control, internal notes, history, a **Reply** button (opens his mail program with the address and subject filled in; one click logs "replied"), and a visible banner when any item is **not notified** or **older than N days without a status change**. A dashboard card shows New items by category.

**Notifications (essential, per the CEO):** for **every** submission: an in-app alert and an **email to founder@** with category, date and time, the sender's **name** and a **link that opens the item after sign-in**. The email never contains the message text, email, phone or other fields. Sending is queued and **retried**; a failed send marks the item "not notified" and raises the banner, so **nobody can submit without it being noticed**. A flood guard turns more than a set number per hour into one digest email, so spam cannot bury a genuine request. Needs the Workspace relay (`47`, awaiting approval) and the domain checks in `60`.

**Security and privacy built in:** Founder-only permission (CTO, managers, operators and clients cannot read applicants; a test proves it); every view audited; no personal data in application logs or notification emails; honeypot, rate limit, size limit, a minimum fill-time check and duplicate throttling kept; optional free Cloudflare Turnstile (approval needed); privacy notice version stored with each submission; retention job per category (periods set by the lawyer, `59` section 8); manual delete on request, audited; no file uploads (so no CVs; if ever added, they need storage, scanning and their own review).

## 3. Tier B scope (8 to 10 working days)
| Part | Days |
|---|---|
| Data model, migration (additive), history, migration of the careers application and website leads into the inbox | 1 to 1.5 |
| Public endpoints for all eight categories with per-category validation and the spam controls; contact form gets "which service", volume and start date | 2 |
| Notification service: in-app and email, templates, queue, retry, flood guard, "not notified" banner | 1.5 to 2 |
| Founder inbox screens and filters, detail view, notes, history, reply button, dashboard card | 2.5 to 3 |
| Security and audit work, retention job (periods once approved), delete on request | 1 |
| Tests (unit, integration, end-to-end, permission matrix, notification failure and retry, leak and spam checks) and the migration and rollback rehearsal | 1 to 1.5 |
**Release rule:** the same gates as the security release (full tests in both AI configurations, migration rehearsal on a copy of production data, rollback, written approval), and the notification needs the relay installed first.

## 4. Tier C scope (a further 2 to 3 weeks, after B)
- **Work with GCO (operators, moderators):** a professional page and application in **Italian, English, French, German, Spanish and Swedish**, collecting contact details, country, time zone, desired role, languages **with levels**, experience, availability; mobile-friendly; privacy notice and consent line; confirmation message in the applicant's language.
- **Become a GCO Sales Partner:** its own page and form (SDR, Hunter, Broker or other; B2B experience, territories, sectors, network); the commission section (below), shown only once the lawyer approves it.
- **Partnership pages** for BPOs, brokers, technology and agency partners (separate from sales partners), each routed to its category.
- **SEO** for genuine open positions only (job-posting markup, language alternates, a sitemap), general "work with us" pages where no role is open.
- **Translations:** machine-assisted drafts clearly marked, **reviewed by a native speaker per language** before publication; the Founder can filter by language.
- Needs: the privacy notice live first, the lawyer's text, translators or reviewers, photography.

## 5. Partner (SDR, Hunter, Broker) application and the 10% recurring commission
**Application system:** the sales-partner form creates an inbox item. On **Accepted**, the Founder issues an **invitation** (the platform already creates Hunter accounts and sends one-time invitation links) and records the **written agreement** (date, version, signed copy reference). **No commission accrues without a recorded agreement.**
**What the platform does today:** a Hunter has a commission percentage (default **10%**) but commission is **one-time**: 10% of the **first month's** collected revenue, created when the first payment is confirmed; leads are claimed with a 30-day lock; approvals prevent self-approval.
**What the CEO's decision requires (recurring):** commission accrues on **each collected payment** from an **attributable** client for the **duration of the introduced service**; stops when the service ends or the agreement ends; reversals on refunds; per-partner agreement terms stored (rate, base, duration, attribution rule, termination). That is a **change to the billing and commission engine**: about **1 to 1.5 weeks** with tests, **after the lawyer's text exists** (the CEO's standing rule of 30 Oct: nothing implemented or published on commission terms before legal review). It does **not** block the inbox; the application form can exist first.
**Proposed website wording (draft for the lawyer; unpublished):**
> "Introduce new business customers to GCO and earn a **10% recurring commission** on eligible service revenue **actually collected** from the new, attributable clients you introduce, for the duration of the introduced service, **subject to a written agreement**. There is no salary, guaranteed income or upfront fee. Eligibility, attribution, payment timing and termination are defined in the agreement. Submitting this form creates no agreement and no entitlement."
Points the lawyer must settle: whether independent partners could be treated as commercial agents with statutory rights (EU and Italian rules), attribution and dispute rules, payment timing, termination, tax, whether a rate may be shown publicly.

## 6. Recommended schedule
1. **Now to the security release:** no inbox code. In parallel and not touching the release: this design, the privacy text for the lawyer, the legal block for the accountant, the visual proposal and image shortlist.
2. **After the release is deployed:** Tier B (8 to 10 working days), starting only when the relay is installed and tested.
3. **Then Tier C**, privacy notice first, then operators, partners, languages, SEO.
4. **Commission engine change** after the lawyer's wording, as its own small release.
No dates are promised; each follows the previous one's approval.
