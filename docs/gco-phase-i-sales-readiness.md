# Phase I - sales operations readiness

**Status: COMPLETE.** REAL CLIENT: NOT FOUND - REAL PROVIDER: NOT FOUND - REAL CONVERSATION: NOT VALIDATED.

## Audit result (what already worked and was left alone)
Pipeline stages (reused unchanged; "Negotiation" is `PROPOSAL` + next action), lead ownership and the 30-day lock, duplicate detection, activity logging, approval, Closed Won, first-payment confirmation, 10% first-month commission, BPO hand-off, onboarding, go-live - all verified again by the full regression. No Calendly API/webhook exists (a `CalendarBooking` table exists but nothing uses it); none was built.

## What was missing and added
- **Security fix:** `PATCH /crm/leads/:id/stage` had no permission check - any signed-in role, a CLIENT included, could move a lead (confirmed by a failing test before the fix). Now `LEAD_STAGE_CHANGE` (owning Hunter, Manager, CEO), plus a unit test that fails if any CRM handler lacks a permission check.
- **Additive migration** `20261007191554_add_lead_qualification_discovery`: `Lead.qualification` (Qualified / Not qualified / Needs follow-up), `discovery` (JSON), `nextAction`, `nextActionAt` (+ index). All nullable; existing rows untouched.
- **Discovery record** (business / operations / technical / commercial, short plain text, strict keys), explicit qualification (no scoring), next action + due date. History and audit store field names only.
- **Follow-ups due** from real dates (next action reached, or lock expiring), with days since contact derived from history; Hunter dashboard and team view.
- **Funnel dashboard** (`GET /crm/dashboard/funnel`, Manager/CEO; finance CEO-only so Manager access is unchanged): leads, owned/unassigned, qualification, stages, closed won/lost, follow-ups, onboarding in progress, live clients, first-month revenue, pending commission. Not recorded => labelled unavailable (calls held, Calendly bookings).
- **UI:** Sales console on `/admin` and `/manager` (funnel, follow-ups, all leads with the discovery panel, add lead, CEO-only "Add a Hunter login"); Hunter pipeline shows source, days since contact, qualification, next action, discovery panel and a follow-ups list.
- **Credential guard shared** (`lib/security/secretGuard.ts`, URL-aware so long profile links are not flagged, URLs carrying `?token=` are) on discovery fields, lead notes, activity notes, approval reasons and review notes.
- **Docs:** `docs/gco-sales-operating-playbook.md` (incl. exact future Calendly-integration requirements).

## Tests (final tree)
Baseline 339 / 87 / 223 -> unit **383**, integration **98**, E2E **232**; `tsc`, `eslint`, `next build` clean. New E2E 28 covers: stage RBAC, website lead + duplicate + claim + 30-day lock, discovery/qualification/next action with credential refusal, follow-ups, funnel (honest metrics, finance CEO-only), Closed Won with duplicate submit/decide, one handoff/tenant/onboarding/login (re-queue creates no duplicates), 5-way concurrent payment -> one 10% commission, tenant/role isolation.

## Deployment (2026-10-07)
Commit `b54456a`. Backup first (existing mechanism): `gco-postgres-20261007T192648Z.dump`, integrity check passed, B2 upload verified (sha1 `6db84a95...`). Migration applied from a one-off container; web `67f146dc0170` (rollback `gco-web:pre-phase-i` = `bc1d760751c7`) and worker `dbde9d834ff2` (rollback `gco-worker:pre-phase-i` = `1618c8cd03f3`) recreated; Postgres, Redis, realtime untouched (0 restarts). Verified read-only: health 200 (both hosts); 27 sitemap pages, login, hunter, manager, admin, invitation 200; 73 Calendly CTAs correct; all new/changed CRM endpoints 401 anonymously; unknown webhook 404; WebSocket 101; logs clean; `ALLOW_DEV_ADAPTERS` unset; the deployed bundle contains the new stage permission; production data identical (2 website leads, demo tenant, `dev-mock` demo integration) with the new columns null on every existing lead; SLA-capped demo conversation unchanged. The role-based stage check could not be exercised against production (no production client credentials) - it is verified by the E2E suite and the structural test. Nothing was created in production.
