# 01 — Executive technical overview

## What GCO does
GCO (Global Conversation Operations) provides **managed human conversation operations**: trained operators handle customer or community conversations on behalf of client companies — customer support, chat moderation, community moderation, multilingual coverage, extended-hours coverage and dedicated teams — supported by an operations platform. AI is **not** used (disabled by decision; see 08).

## Who uses the platform
| Role | Uses it for |
|---|---|
| Founder/CEO | overview of clients, profitability, payments, access control, privacy and billing |
| Manager / Supervisor | live queues, SLA, shifts, quality review, escalations, weekly reports, training, moderation oversight (a supervisor sees only their own team) |
| Operator | receives conversations, writes and sends replies, uses client instructions and quick replies, sees earnings, training, schedule |
| Client | live status of their operation, reports, invoices, change requests, privacy requests |
| Hunter (sales) | lead ownership, pipeline, commissions |
| Assistant / CTO | operational support / technical oversight, each with limited permissions |

## Three layers (and why the distinction matters)
1. **The CRM and management platform** (this repository): leads, onboarding, billing, people, reporting.
2. **The conversation-operations platform**: queues, assignment, SLA, operator workspace, moderation.
3. **Channel/provider integrations**: the link to each client's own platform. Today only a **generic signed HTTP contract** (`gco-webhook`) and a development simulator exist. **No named provider (WhatsApp, Instagram, SMS, email, a specific chat product) is integrated.** Each real client needs its own specification and acceptance testing (04).

## Current readiness (honest summary)
- Application functions are **Verified in a local/test environment** (see 11 for the numbers).
- **Not verified:** any real client integration, the production server from this audit, Docker/CI runs, a restore of a production backup, third-party penetration testing.
- Status: **READY FOR REVIEW; not ready for client launch** (see `../readiness/10-ceo-readiness-report.md`).

## Key remaining dependencies
A real client's API specification and sandbox; approved infrastructure access for staging deployment and a production restore drill; legal review of privacy policy, data-processing terms and retention; decisions reserved for the CEO (pricing, retention, email, AI).
