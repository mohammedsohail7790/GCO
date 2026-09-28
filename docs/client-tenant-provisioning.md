# First Client Tenant Provisioning Runbook

The exact process for creating a new client environment. **Do not run this to create a real client tenant without an explicit go-ahead** - this document describes the process; it does not authorize running it.

Each step is labeled:
- **AUTOMATED** - a single existing API call/UI action does this.
- **MANUAL** - a person (GCO engineering) has to do this by hand today; no dedicated automation exists yet.
- **REQUIRES CLIENT** - the client must provide something before this step can happen.
- **REQUIRES GCO ADMIN** - only a CEO_ADMIN-permissioned person can perform this.

## 1. Client approval
**REQUIRES GCO ADMIN.** Confirmation (from the sales/discovery process - see `docs/sales-to-engineering-handoff.md`) that the client is approved to move into implementation.

## 2. Tenant creation
**AUTOMATED, REQUIRES GCO ADMIN.** `POST /api/v1/admin/tenants` (CEO_ADMIN only) - creates the `Tenant` row with name, slug, pricing/capacity defaults.

## 3. Client profile
**MANUAL, REQUIRES CLIENT.** Business details, contacts, escalation contacts recorded per `docs/sales-to-engineering-handoff.md` and `docs/client-technical-discovery.md`. No dedicated "client profile" object exists beyond the `Tenant` row itself and these documents.

## 4. Admin/user roles
**AUTOMATED, REQUIRES GCO ADMIN.** `POST /api/v1/admin/users` per user, with the appropriate role (`MANAGER`, `OPERATOR`, `CLIENT`) and `tenantId`.

## 5. Operators
**AUTOMATED, REQUIRES GCO ADMIN.** Creating a user with role `OPERATOR` via the same endpoint above also creates the `Operator` profile and a default `OperatorService` row automatically (see `app/api/v1/admin/users/route.ts`).

## 6. Integration configuration
**MANUAL, REQUIRES GCO ADMIN.** No admin API currently exists to create a new `Integration` row - only `PATCH /api/v1/admin/integrations/:id/webhook-secret` exists, and that rotates the secret on an **already-existing** integration. Creating the integration record itself today requires a direct, reviewed database operation by engineering. **This is a known gap** worth a small follow-up feature (a proper `POST /api/v1/admin/integrations` route) before repeated real-client onboarding makes the manual step a bottleneck - not built in this phase per the "no speculative feature development" instruction.

## 7. Channel configuration
**MANUAL, REQUIRES CLIENT.** Depends entirely on which channel/adapter is in scope - see the relevant `docs/integration-feasibility-template.md` assessment for that channel.

## 8. Routing/assignment
**AUTOMATED.** The existing assignment engine (`lib/assignment/engine.ts`) handles conversation routing to available operators automatically once operators exist for the tenant - no per-client configuration needed beyond operator capacity (settable per-Operator).

## 9. Security configuration
**MANUAL, REQUIRES GCO ADMIN.** Webhook secret generation/rotation (`PATCH /api/v1/admin/integrations/:id/webhook-secret`) is automated once the integration exists; confirming the client's own API credentials are handled via a secure exchange (never chat/Telegram) is a manual process step, not a system feature.

## 10. Test data
**MANUAL, REQUIRES GCO ADMIN.** Use clearly marked test data during acceptance testing (step 11), never real customer data at this stage - see `docs/first-client-security-gate.md` / `docs/real-client-data-gate.md`.

## 11. Acceptance testing
**MANUAL.** Execute `docs/pilot-acceptance-checklist.md` in full before declaring the tenant pilot-ready.

## 12. Pilot activation
**REQUIRES GCO ADMIN, REQUIRES CLIENT.** Both sides confirm scope/dates per `docs/7-day-pilot.md`; pilot begins.

## 13. Pilot completion
**MANUAL.** Run the Day 7 review in `docs/7-day-pilot-operations.md`, using the metrics defined in `docs/pilot-metrics.md`.

## 14. Production continuation
**REQUIRES GCO ADMIN, REQUIRES CLIENT.** A decision, not an automatic transition - based on the pilot's measured results, agreed explicitly with the client.
