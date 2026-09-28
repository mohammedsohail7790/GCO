# Integration Feasibility Assessment Template

Complete this template for **every** proposed client integration before it is promised to the client - in a proposal, a pilot scope, or a casual conversation. An integration is not "feasible" until this is filled in with real answers, not assumptions.

Copy this template per integration (e.g. `docs/feasibility/<client>-<channel>.md`).

## Basic information

| Field | Answer |
|---|---|
| Provider | |
| Channel/system | |
| Client account type | (e.g. Shopify Plus, WhatsApp Business API tier, custom in-house system) |

## Technical capability

| Field | Answer |
|---|---|
| API availability | |
| Authentication method | |
| Required permissions/scopes | |
| Webhook availability | |
| Inbound message format | |
| Outbound message format | |
| Rate limits | |
| Retry behavior (provider's own) | |
| Idempotency requirements | |
| Customer data access | |
| Order/data lookup capability | |
| Media support (images, files, etc.) | |
| Sandbox availability | |

## Process

| Field | Answer |
|---|---|
| Approval requirements (e.g. Meta Business verification) | |
| Estimated engineering complexity | See `docs/client-integration-estimation.md` categories |
| External dependencies | |
| Security/privacy considerations | |
| Pilot feasibility | Can this realistically be ready before the agreed pilot start date? |
| Known blockers | |

## Status

Choose exactly one:

- **VERIFIED IMPLEMENTED** - built, deployed, and tested against this provider already.
- **INTEGRATION-READY / CLIENT-SPECIFIC** - the general mechanism (GCO's webhook ingestion + adapter interface) is proven; this specific provider's adapter has not been built.
- **REQUIRES TECHNICAL DISCOVERY** - not enough information yet to assess feasibility; discovery questions above are unanswered.
- **PLANNED** - assessed as feasible, not yet scheduled.
- **BLOCKED** - a specific, named blocker prevents proceeding (e.g. no API access, missing approval, client can't provide sandbox).

Never mark an integration VERIFIED IMPLEMENTED unless it has actually been built and tested against this provider.

## Sign-off

| | |
|---|---|
| Assessed by | |
| Date | |
| Reviewed against `docs/client-capability-matrix.md`? | |
