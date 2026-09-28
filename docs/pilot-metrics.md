# Pilot Success Metrics

A neutral measurement framework for a 7-day pilot. **Targets are never invented by GCO** - they're agreed with the client during discovery (`docs/client-technical-discovery.md`) and recorded in the pilot scope before Day 1. This document defines *what* gets measured, not what a "good" number is for any given client.

## Volume metrics

- Number of conversations handled
- Number of messages handled
- Operator workload (conversations/messages per operator)

## Response metrics

- First response time (time from message received to first operator reply)
- Average response time across all replies
- Resolution time (time from conversation opened to closed, where applicable)

## Outcome metrics

- Handled conversations (successfully resolved within the pilot)
- Escalations (count and reason)
- Unresolved conversations at pilot end

## Quality metrics

- Customer satisfaction - **only if the client provides a measurement mechanism** (e.g. their own CSAT survey). GCO does not invent a satisfaction score without the client's own data.
- SLA adherence - measured against whatever SLA was actually agreed for the pilot, not an assumed industry-standard figure.

## Technical/integration metrics

- Integration failures (count, by type)
- Duplicate events received (and confirmed correctly deduplicated - not double-processed)
- Delivery failures (outbound messages that did not reach the customer)

## How this gets used

At the Day 7 review (`docs/7-day-pilot-operations.md`), these are reported as **facts**, not spun toward a predetermined "continue" recommendation. The continuation decision is made jointly by GCO and the client based on what was actually measured against what was actually agreed.
