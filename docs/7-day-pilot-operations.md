# 7-Day Pilot Operating Model

The day-by-day operating rhythm once a pilot is live. See `docs/7-day-pilot.md` for the sales-facing summary and `docs/pilot-acceptance-checklist.md` for what must be true before Day 1.

## Before Day 1

- Technical discovery complete (`docs/client-technical-discovery.md`, `docs/first-client-integration-discovery.md`)
- Integration feasibility assessed (`docs/integration-feasibility-template.md`)
- Integration implemented (if `REQUIRES CODE` items were found in feasibility - built and tested, not assumed)
- Credentials exchanged securely (never via chat/Telegram - see `docs/sales-to-engineering-handoff.md`'s Secure Credential Transfer note on the current gap here)
- Tenant configured (`docs/client-tenant-provisioning.md`)
- Webhook verified end-to-end (`docs/first-client-integration-acceptance.md` rows 1-9)
- Testing complete (inbound, outbound, duplicates, failure/retry, tenant isolation - `docs/first-client-integration-acceptance.md` in full)
- Operators trained on this client's workflow, tone, and escalation path
- Acceptance criteria agreed with the client in writing
- Acceptance checklist fully signed off (`docs/pilot-acceptance-checklist.md`)

## Day 1 - Launch

- Go-live for the agreed scope only
- Operator briefing: workflow, tone, escalation path, what's in/out of scope
- Initial monitoring: watch queue depth, assignment behavior, and the first handful of real conversations closely

## Days 2-6 - Live operation

- Daily operational review: quick check of volume, response times, anything unusual
- Issue tracking: log anything that comes up, however small, against `docs/client-incident-process.md` severity levels
- Integration monitoring: confirm inbound/outbound continue working, watch for delivery failures or duplicate events
- Operator feedback: informal check-in on workflow friction
- Customer/support metrics: track against `docs/pilot-metrics.md`, don't wait until Day 7 to start collecting

## Day 7 - Results review

- Metrics collection and review (`docs/pilot-metrics.md`) - actual numbers, not impressions
- Incident review: anything logged during Days 1-6, root cause and resolution status
- Client feedback: a real conversation, not just a metrics dump
- **Continuation recommendation based on measured results.** The purpose of this review is to give GCO and the client factual pilot results to evaluate together - not to justify a predetermined "yes." A pilot that surfaced real problems should say so plainly.
