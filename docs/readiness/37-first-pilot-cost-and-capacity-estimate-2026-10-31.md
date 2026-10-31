# 37 — First pilot (2–5 operators): simple cost and capacity estimate, DRAFT for CEO review (31 Oct 2026)

**What this is.** The operational and cost estimate the CEO asked for before approving production: operators, supervisor coverage, infrastructure costs, message capacity and quality targets. **It is a worksheet, not a quote or a promise.** Where a number is a CEO-confirmed figure it is marked *CEO*; where it comes from our own measurements it is marked *measured*; everything else is an **assumption or an input the CEO must supply**, and no such input has been invented. No purchase or paid service follows from this document.

## 1. Fixed monthly costs that already exist (before VAT)
Source: `docs/readiness/05-infrastructure-budget.md` (figures confirmed by the CEO on 21 Oct, not re-checked against invoices).

| Item | €/month | Note |
|---|---|---|
| Hetzner CPX32 server | 35.49 | *CEO* |
| Hetzner server backups | 7.10 | *CEO* |
| Hetzner IPv4 | 0.50 | *CEO* (Hetzner subtotal 43.09) |
| Google Workspace (2 mailboxes) | 16.20 | *CEO* |
| Backblaze B2 offsite backups | about 0 | first 10 GB free; usage tiny |
| Cloudflare Free, GitHub Free | 0 | |
| Domain | unknown (about 1–2 spread over a year) | read from the registrar invoice |
| Claude Pro and ChatGPT Plus | about 40 | *CEO estimate*; development tools, not pilot costs |
| **Platform subtotal for the pilot (server, backups, IP, Workspace)** | **about 59.3** | before VAT; with the two AI subscriptions about 99 |

VAT treatment depends on the tax regime (accountant). The pilot does **not** require a larger server on the current evidence, but that is **not yet proven**: see section 4.

## 2. Costs that this pilot may add (each needs a cost breakdown and the CEO's written approval first)
| Item | Why | Estimate basis |
|---|---|---|
| Temporary separate test server for the production-like load test | Load-testing on the production host is unsafe | Hetzner bills the same server type by the hour; derived from the CEO-confirmed monthly price, a two-day test is a few euros. **A quote from the Hetzner price page is needed before purchase; this is not a quote.** |
| Uptime monitoring and alert delivery | Today nothing alerts a person | Free tier first (UptimeRobot is already configured but unverified); paid plan only if the free tier is insufficient |
| Independent security test | Partner expectation | Unknown until quotes arrive |
| Legal review (DPA, pilot agreement, transfers, commission terms) | Required before real data and contracts | Unknown; the CEO is arranging |
| Accountant / e-invoicing route | A tax invoice cannot come from the internal print page | Unknown; accountant to advise |
| Operator labour and supervision | The main pilot cost | Section 3 |

## 3. Staffing model and the worksheet

**Principles (proposed).** Limited, staffed hours, not 24/7. At least **two** qualified operators on shift in every covered hour (one is the backup). One supervisor, initially the CEO or the CTO, reviewing a daily sample of replies and handling escalations. All coverage hours are entered as shifts so uncovered hours are visible.

**Worksheet (the CEO fills the shaded inputs; the formulas are exact).**

| Input | Symbol | Value |
|---|---|---|
| Covered hours per week | H | CEO to set |
| Operators on shift at the same time | N | at least 2 |
| Operators employed (for holidays, absence, rotation) | P | 2–5 |
| Pay per operator-hour or per accepted message | R | CEO input (the platform supports per-message rates; the demo's 6 cents per message is fictional) |
| Price charged to the client per message (or other model) | S | to be agreed with the client |
| Messages one operator can handle per hour at target quality | M | **assumption, to be measured in the pilot** |
| Occupancy (share of an hour actually answering) | O | **assumption**, planning value 60–75% to be validated |

- Staffed operator-hours per month ≈ H × 4.33 × N
- **Human message capacity per month ≈ staffed operator-hours × M × O**
- Concurrent conversations at once ≈ N × operator capacity setting (default 2)
- Operator cost ≈ staffed hours × hourly rate (or accepted messages × per-message rate)
- Revenue ≈ billable messages × S; gross margin = revenue − operator cost − fixed platform cost (about €59–99 a month)
- **Break-even messages per month ≈ fixed platform cost ÷ (S − operator cost per message)**

Example of the arithmetic only (shape, not figures): 40 covered hours a week with 2 operators on shift is about 346 staffed operator-hours a month; the capacity follows directly from the measured M and O once the pilot has run for two weeks. Until then, **no capacity or price figure should be quoted to a client.**

**Why the human, not the server, is the pilot's limit.** The only infrastructure measurement so far (development laptop, mock AI) was 1,000 messages per minute for 3 minutes with every message stored (*measured*, 19 Oct). A pilot of 2–5 operators produces a small fraction of that, but the server has not been tested under production-like conditions, so this is **a reason for optimism, not a capacity claim.**

## 4. What must be true before the estimate is trusted
1. Production-like load test passes at pilot size with headroom (target: at least 3× the expected peak, no lost messages, stable response times).
2. Backups: restricted key, encryption, offsite restore proven, failure alert.
3. Two-factor for founder and CTO; demo accounts off.
4. Real handling-time data from the pilot replaces M and O.
5. Legal documents reviewed and the first client's integration verified in a sandbox.

## 5. Quality targets (proposed for discussion; agreed with the client in writing)
| Measure | Proposed approach |
|---|---|
| First response time | Target set from a two-week baseline; initial figure agreed with the client for covered hours only; the platform's timer and reassignment enforce it per conversation |
| Quality | Supervisor reviews a daily sample of sent replies (accuracy, tone, resolution); pass-rate target agreed after the baseline; critical errors reviewed individually |
| Reliability | No lost replies; delivery failures visible and retried; zero client-isolation incidents |
| Escalations | Every escalation acknowledged within the same covered shift |
| Billing accuracy | Month-end reconciliation matches to the cent; disputes logged |
| Review | Weekly review in the first month; go/no-go with the CEO before adding volume |

## 6. Decisions needed
Covered hours and the number of operators; the pay basis (hourly or per accepted message) and rate; the pricing model offered to the first client; who acts as supervisor in the pilot; approval to price a temporary test server.
