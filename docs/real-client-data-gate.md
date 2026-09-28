# Real Client Data Gate

## The rule

**No real client data enters GCO until every one of the following is true:**

1. The client's tenant exists (created per `docs/client-tenant-provisioning.md`).
2. Tenant isolation has been verified **for that specific tenant** (not just "the mechanism works in general").
3. The required integration(s) have been tested end-to-end (per `docs/integration-feasibility-template.md` and `docs/pilot-acceptance-checklist.md`).
4. A backup covering that tenant's data is confirmed running.
5. The restore procedure has been confirmed (the general mechanism was verified in Phase 8; re-confirm it still works before this specific client's data is at stake if meaningful time has passed).
6. Operator access has been verified (correct users, correct roles, correct tenant scope).
7. Client acceptance testing has been completed (`docs/pilot-acceptance-checklist.md`, fully checked off).
8. The pilot scope has been approved in writing by the client.

This is a hard gate, not a guideline. If any item above is not true, do not enter real customer data - use clearly marked test data instead, exactly as the demo environment does.

## Why this exists

Every prior phase of this project has been careful never to introduce unverified production risk. This gate extends that same discipline to the first moment real, external customer data is at stake - which is categorically different from GCO's own test/demo data, no matter how well-tested the platform is in the abstract.

## Where this is enforced today

This is currently a **process** control, not a system-enforced one - nothing in the code physically prevents entering real data into an unverified tenant. Treat this document as the authority; do not create a shortcut around it under time pressure.
