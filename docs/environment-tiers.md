# DEMO vs PILOT vs PRODUCTION CLIENT

Three distinct tiers exist in GCO's production system. They must never be confused with each other.

## DEMO

The persistent sales-demo environment (`[DEMO] Everline Retail Co` tenant, `*@demo.gco` accounts, fictional leads/conversations - see `docs/sales-demo-script.md`). Purpose: live sales demonstrations. Contains only fictional data. **Never used for real client operations, real customer conversations, or real revenue.** Not deleted between demos - it's meant to persist and be reused.

## PILOT

A real prospective client's tenant, during their agreed 7-day pilot window (`docs/7-day-pilot.md`, `docs/7-day-pilot-operations.md`). Contains **real** customer data, gated by `docs/real-client-data-gate.md` before it's allowed to start. Time-bounded and scope-defined. Ends in an explicit continuation decision, not an automatic transition to full production.

## PRODUCTION CLIENT

A client who has continued past their pilot into ongoing operation. Same tenant as the pilot (no new tenant needed at this transition unless scope materially changed), now unbounded in time and, typically, in scope (within whatever was commercially agreed).

## The rule

- Demo accounts/data must never be used to service a real client's actual customers.
- A future real client's tenant must never share users, leads, or conversations with the demo tenant.
- Pilot and Production Client tenants both fall under `docs/real-client-data-gate.md` and `docs/first-client-security-gate.md` - Demo does not, because it never contains real data in the first place.

Phase 10 confirmed (see final report) that the current demo tenant is correctly isolated - all demo users, leads, the demo conversation, and the demo integration belong to exactly one tenant, and no second tenant exists yet for any of it to leak into.
