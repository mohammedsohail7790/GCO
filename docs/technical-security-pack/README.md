# GCO Technical & Security Pack

**Audience:** internal engineering, the CEO, and — in sanitised form — partners, vendors and prospective clients.
**As of:** 2026-10-20, commit after `ad51553` (see `../readiness/10-ceo-readiness-report.md` for the exact state and test results).

This pack describes what the platform **actually does today**, with a verification status for every capability. It contains **no credentials, no sensitive server details and no exploit information**. Internal operational runbooks are kept separately (`../disaster-recovery.md`, `../recovery-runbook.md`, `../readiness/*`).

Status vocabulary: **Verified** (code + a successful test or operational evidence) · **Implemented, not verified** · **Partially implemented** · **Planned** · **Blocked** (needs external information, access or approval).

| # | Document | Internal / shareable |
|---|---|---|
| 01 | [Executive technical overview](01-executive-overview.md) | shareable |
| 02 | [System architecture](02-system-architecture.md) | shareable (diagram is sanitised) |
| 03 | [CRM and workflows](03-crm-and-workflows.md) | shareable |
| 04 | [API integration process](04-api-integration-process.md) | shareable |
| 05 | [Security controls](05-security-controls.md) | shareable summary; evidence paths are internal |
| 06 | [Data lifecycle and privacy](06-data-lifecycle-and-privacy.md) | shareable with the legal caveats |
| 07 | [Reliability and operations](07-reliability-and-operations.md) | internal detail, shareable summary |
| 08 | [AI capabilities and restrictions](08-ai-capabilities-and-restrictions.md) | shareable |
| 09 | [Deployment and environments](09-deployment-and-environments.md) | **internal** (runbook) with a sanitised summary |
| 10 | [Third-party services and limitations](10-third-party-services-and-limitations.md) | internal |
| 11 | [Readiness and open items](11-readiness-and-open-items.md) | shareable |
| — | [Client-facing overview (sanitised)](client-facing-overview.md) | **shareable externally** |

**Rules this pack follows:** no feature is described as live because a route, table or adapter exists; no certification, SLA, uptime figure, benchmark or client is claimed; "AI" always means **disabled**; the generic webhook adapter is never described as a provider integration.
