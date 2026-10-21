# 11 — Readiness and open items

**Statement:** GCO can support, today, **controlled acceptance testing against a simulated client platform** by the team and the CEO. It has **not** been shown to be ready for a real client launch, and this pack does not claim it is.

## What GCO can support today (Verified in a local/test environment, 2026-10-20)
Operator conversation handling with SLA, language routing, capacity and shift preference; escalation; client billing and operator pay with audit trails; onboarding wizard and invitations; moderation workflow; training, reports, privacy tooling (tested, not activated); role-based dashboards; the generic signed webhook contract against test doubles. **Test evidence:** typecheck and lint clean; 720 unit, 217 integration and 296 end-to-end tests passed on the AI-on (mock) test stack (5 specs skip themselves by design); on a stack with AI off, 297 end-to-end tests pass and only the two specs that test AI features fail, as expected.

## Unresolved technical issues and gaps
| Area | State |
|---|---|
| Real client integration | **Blocked** (specification, sandbox, credentials, acceptance) |
| Docker build/run, GitHub Actions run | **Not tested** here |
| Production backup restore | **Not tested** (local drill passed); offsite key privileges and retention **open** |
| Production server state (hardening, secrets, timers) | **Not inspected** |
| Staging on a server | **Not deployed** (local equivalent verified) |
| Third-party security review | **Not done** |
| Error tracking / paging | **Planned** (needs accounts) |
| Rate-limit/lockout, 2FA enforcement for staff | 2FA optional |
| Row-level security | Not adopted (application-layer isolation) |
| Fiscal e-invoicing (SDI) | **Not built** (accountant) |
| Moderation verdict delivery to clients | **Planned** (client API) |

## Decisions and approvals awaiting the CEO
Provisional retention (30 days / 6 months) approval after legal review; pricing and operator pay per client (€0.07 per approved message is a provisional reference only, not configured); Google Workspace option and purchase; infrastructure budget and any extra server; GitHub organization and ownership agreement; AI remains disabled until an explicit approval; go-live.

## Missing credentials or access
Hetzner/Cloudflare/Backblaze/GitHub administrative access for verification; a production dump for the restore drill; SMTP/Sentry accounts; the first client's API documentation.

## Legal and contractual items
Privacy policy, data-processing agreement, terms, transfer terms, operator contracts, IP/ownership agreement — all **not written/reviewed**. The current VAT/fiscal arrangement is the CEO's personal registration with Fiscozen handling set-up; no legal status is asserted here.

## What requires additional work before a client launch
Close the Blocked items above; drill a production restore; deploy and validate staging on the server; complete a client-specific acceptance test; obtain the CEO's written approval.
