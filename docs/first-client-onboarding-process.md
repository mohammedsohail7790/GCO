# First paying client — onboarding process and demo rules

*Draft of 2026-10-27. Gates, not dates: no stage has a promised duration until its inputs are validated (see `docs/client-integration-estimation.md`).*

## Stages and gates
| # | Stage | Owner | Output | Gate to the next stage |
|---|---|---|---|---|
| 1 | Commercial agreement | CEO | Signed services agreement and data-processing agreement | Both signed. Legal drafts in `docs/legal-drafts/` need professional review first. |
| 2 | Discovery | CTO | Completed `docs/client-technical-discovery.md` and `docs/integration-feasibility-template.md` | Integration classed simple, moderate or complex. If blocked, name the blocker. |
| 3 | Scope and SLA proposal | CTO and CEO | Languages, hours, volume, escalation rules, reporting, SLA targets | Client accepts in writing. Targets are written only after the volume and staffing are known. |
| 4 | Access exchange | CTO | Sandbox access, keys and secrets via a secure channel only | Never through chat or email. |
| 5 | Build and configure | CTO | Adapter or webhook setup, tenant, services, rates, invitations (setup wizard) | Staged integration passes pings in both directions. |
| 6 | Operator readiness | CEO and managers | Operators trained, client knowledge written, shifts planned | Training gate complete for each operator. |
| 7 | Acceptance test | CTO and client | Test conversation both ways, duplicate, retry and failure cases, isolation check (`docs/first-client-integration-acceptance.md`) | Joint sign-off. |
| 8 | Go-live decision | CEO only | Pilot starts (`docs/7-day-pilot-operations.md`) | Go-live checklist all Pass, restore test of production backups done, CEO approval in writing. |
| 9 | Pilot review | CEO and client | Measured results (`docs/pilot-metrics.md`) | Continue only on measured results. |

## Go-live conditions (CEO, 2026-10-27)
No real client goes live until all of these are complete: signed and professionally reviewed agreements; approved technical scope and integration requirements; data-processing arrangements; validated operator recruitment and training; integration and acceptance testing; security and backup-recovery checks; final written go-live approval. Commercial discussions and technical discovery may continue before these are complete, but no production data is accepted and no delivery dates are promised.

## What is not ready for a real client today
Real integration (needs the client's specification and sandbox), production backup restore test, third-party security test, legal documents, tax code and registered address on invoices, Italian e-invoicing. AI stays off.

## Demo rules (partners and prospects)
1. Run on the local or staging stack only, never production. The seed scripts refuse a production process.
2. Fictional data only: `npm run seed`, then `npx tsx prisma/demo-showcase.ts --reset`. Walkthrough: `docs/readiness/15-demo-walkthrough-simulated-data.md`.
3. Share the screen from a prepared session; do not hand over logins. No client names, real chats or credentials on screen.
4. Say plainly: replies go to a simulator, AI is off, no real client is connected, moderation verdicts are not returned to a platform, invoices are not Italian e-invoices.
5. Do not quote prices, dates or SLA figures in a demo.
6. The server's staging copy runs an older build until the release is deployed, so rehearse the demo locally first.
