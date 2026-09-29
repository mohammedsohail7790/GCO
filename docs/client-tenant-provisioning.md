# First Client Tenant Provisioning Runbook

The exact process for creating a new client environment. **Do not run this to create a real client tenant without an explicit go-ahead** - this document describes the process; it does not authorize running it.

Each step is labeled:
- **AUTOMATED** - a single existing API call does this.
- **MANUAL** - a person (GCO engineering) has to do this by hand today; no dedicated automation exists yet.
- **REQUIRES CLIENT** - the client must provide something before this step can happen.
- **REQUIRES GCO ADMIN** - only a CEO_ADMIN-permissioned person can perform this.

## 1. Client approved
**REQUIRES GCO ADMIN.** Confirmation from the sales/discovery process (`docs/sales-to-engineering-handoff.md` complete) that the client is approved to move into implementation.

## 2. Client requirements collected
**REQUIRES CLIENT, MANUAL.** `docs/client-technical-discovery.md` (the live call questionnaire) and `docs/first-client-integration-discovery.md` (the structured written discovery) both completed.

## 3. Provider identified
**REQUIRES CLIENT.** The specific channel/platform the client wants connected is named explicitly - not assumed from a vague request like "we want WhatsApp."

## 4. Provider docs reviewed
**REQUIRES PROVIDER ACCESS, MANUAL.** Engineering reviews the provider's actual API/webhook documentation (linked in `docs/first-client-integration-discovery.md`) - never assumed or guessed.

## 5. Feasibility completed
**MANUAL.** `docs/integration-feasibility-template.md` filled in and classified (READY / REQUIRES CONFIGURATION / REQUIRES CLIENT INFORMATION / REQUIRES PROVIDER ACCESS / REQUIRES CODE / BLOCKED) before any commitment is made to the client.

## 6. Tenant created
**AUTOMATED, REQUIRES GCO ADMIN.** `POST /api/v1/admin/tenants` - creates the `Tenant` row with name, slug, pricing/capacity defaults.

## 7. Integration created through the secure API
**AUTOMATED, REQUIRES GCO ADMIN.** *(Updated in Phase 11 - this used to require a direct database operation; it no longer does.)*

`POST /api/v1/admin/integrations` (CEO_ADMIN only, `INTEGRATION_MANAGE` permission - the same one the rotation endpoint already used) creates the `Integration` row:

- **Required fields:** `tenantId` (must exist), `adapterKey` (must be registered - `lib/integrations/registry.ts::listAdapterKeys()` - rejected at creation, not later at first webhook), `name`.
- **Optional fields:** `config` (non-secret, defaults `{}`), `status` (defaults `ACTIVE`; may be created `DISABLED` for staged provisioning - see step 8), `secret` (supply the client-platform-issued one, or omit to auto-generate).
- **Manager does not gain access** merely because Managers manage CRM data - CEO_ADMIN only, by design.
- **List/read:** `GET /api/v1/admin/integrations?tenantId=<id>`, same permission, safe metadata only (`SAFE_SELECT` excludes `webhookSecret`/`secretRef` at the query level).

## 8. Webhook secret securely configured
**AUTOMATED, MANUAL handoff.** The secret is generated/returned exactly once at creation (step 7) or via `PATCH /api/v1/admin/integrations/:id/webhook-secret` (rotation). Handing that value to whoever configures the provider's webhook (step 9) is a manual step that must use a secure channel - never chat/Telegram (see `docs/client-onboarding-checklist.md`).

## 9. Provider webhook configured
**REQUIRES CLIENT, MANUAL.** The client (or GCO, if given delegated access) registers `https://app.globalconversationoperations.com/api/v1/webhooks/<integrationId>` with the provider, using the secret from step 8 for signing.

## 10. Sandbox/test traffic verified
**MANUAL.** Send provider sandbox/test events through and confirm they reach GCO correctly - the first three rows of `docs/first-client-integration-acceptance.md`.

## 11. Tenant isolation verified
**MANUAL.** Row 15/19 of `docs/first-client-integration-acceptance.md` - confirm this tenant's data is invisible to any other tenant, for this specific tenant, not just "the mechanism works in general."

## 12. Inbound message test
**MANUAL.** Row 6-7 of `docs/first-client-integration-acceptance.md`.

## 13. Outbound message test
**MANUAL.** Row 10-11 of `docs/first-client-integration-acceptance.md`.

## 14. Duplicate delivery test
**MANUAL.** Row 5 of `docs/first-client-integration-acceptance.md`.

## 15. Failure/retry test
**MANUAL.** Row 12-13 of `docs/first-client-integration-acceptance.md`.

## 16. Operator assignment test
**MANUAL.** Row 8 of `docs/first-client-integration-acceptance.md`.

## 17. Realtime test
**MANUAL.** Row 9 of `docs/first-client-integration-acceptance.md`.

## 18. Security gate
**MANUAL, REQUIRES GCO ADMIN.** `docs/first-client-security-gate.md` fully checked, not just assumed passing because the platform-wide mechanisms were verified in earlier phases.

## 19. Pilot launch
**REQUIRES GCO ADMIN, REQUIRES CLIENT.** `docs/real-client-data-gate.md`'s 8-point rule satisfied, then `docs/7-day-pilot-operations.md` Day 1 begins.

## 20. Production monitoring
**MANUAL** during the pilot (`docs/7-day-pilot-operations.md` Days 2-6); becomes the ongoing operational posture if the client continues past the pilot. External uptime/error monitoring is still not configured platform-wide (see `docs/first-client-security-gate.md`) - during a pilot, monitoring means the daily operational review described in the pilot operations doc, not an automated external alert.

## What this runbook does not cover

Building a client-specific adapter (the actual provider integration code) is not a step in this runbook - it happens between steps 5 and 6, once feasibility confirms what needs to be built, and is scoped/estimated via `docs/client-integration-estimation.md`. This runbook assumes the adapter already exists or requires no code changes; if it doesn't, that work happens first, separately.
