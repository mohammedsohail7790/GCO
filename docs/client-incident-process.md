# Client Incident / Escalation Process

Applies to any incident affecting a real client's live operation (pilot or production). Response times below are placeholders - **[CLIENT AGREED SLA]** - until a specific SLA has been commercially agreed with that client; do not treat these as commitments GCO has made.

## Severity 1 - Critical

Service outage or inability to handle customer conversations at all (e.g. the platform is down, a client's integration is completely broken, no operator can access the system).

- **Detection:** automated health-check failure, or a client/operator report.
- **Acknowledgement:** [CLIENT AGREED SLA]
- **Investigation:** begins immediately on acknowledgement.
- **Escalation:** to GCO engineering and the client's named technical contact immediately.
- **Communication:** status update to the client at a cadence agreed in the SLA, minimum hourly during active investigation until resolved or downgraded.
- **Resolution:** target per [CLIENT AGREED SLA].
- **Post-incident review:** required within [CLIENT AGREED SLA] of resolution - root cause, what was done, what prevents recurrence.

## Severity 2 - Major degradation

A significant workflow is impaired but the platform is not fully down (e.g. one channel/integration failing while others work, elevated response latency, a specific tenant affected but not all).

- **Detection:** automated alerting where configured, or a client/operator report.
- **Acknowledgement:** [CLIENT AGREED SLA]
- **Investigation:** begins same business day.
- **Escalation:** to GCO engineering; client notified.
- **Communication:** update at agreed cadence until resolved.
- **Resolution:** target per [CLIENT AGREED SLA].
- **Post-incident review:** for a recurring or client-impacting Sev 2, same as Sev 1.

## Severity 3 - Non-critical defect

A defect with a workaround available, or a minor issue not blocking normal operation.

- **Detection:** operator/client report, or routine review.
- **Acknowledgement:** [CLIENT AGREED SLA]
- **Investigation:** scheduled into normal engineering work.
- **Escalation:** none required unless it worsens.
- **Communication:** acknowledged, resolution timeline shared once scoped.
- **Resolution:** scheduled, not immediate.
- **Post-incident review:** not required unless requested.

## Severity 4 - Question / enhancement / cosmetic

No functional impact.

- **Detection:** client/operator feedback.
- **Acknowledgement:** [CLIENT AGREED SLA]
- **Investigation:** as time permits.
- **Escalation:** none.
- **Communication:** response when addressed or deprioritized, with reasoning.
- **Resolution:** no fixed timeline.
- **Post-incident review:** not applicable.

## Notes

- This process assumes single-tenant impact by default; a Sev 1/2 affecting multiple tenants simultaneously escalates communication to all affected clients concurrently, not sequentially.
- Actual SLA numbers must be filled in per-client before a pilot begins, as part of `docs/pilot-acceptance-checklist.md`'s Business section.
