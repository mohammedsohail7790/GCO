# 68 — 17 Nov coverage drill: exact runbook and results template (16 Nov 2026)

**Status:** preparation only. **Nothing in this document has been run.** Written so the 15:00–16:00 CET session is spent running the six scenarios, not deciding how to run them. Scenarios themselves are in `56` §3 (corrected 15 Nov to six). This doc adds the exact mechanics: which are real platform actions, which are deliberately manual/tabletop, and the API calls or screens each one actually uses.

## 0a. Verified today, on the demo stack, for real (not just read from code)
Before writing this down as fact, I actually ran each: creating an absence (`POST /api/v1/absences`) immediately showed a gap on `GET /api/v1/shifts/coverage` (`"staffed":0,"gap":true`); setting an operator's time zone (`PATCH /api/v1/operators/[id]/timezone`) worked and returned it correctly; raising an escalation (`POST /api/v1/escalations`) succeeded and created a `SUPERVISOR`-level, unclaimed, open item. All three match what's described below. Local demo stack shut down after this check — nothing left running.

## 0. Honest framing, read before the session
Two of the six scenarios test a **real automated mechanism** in the platform (coverage visibility, escalation routing, timezone display). The other parts of every scenario — "a supervisor decides who covers," "someone calls the backup operator," "noticing someone is offline" — are **manual, tabletop actions**, because that automation doesn't exist yet (`56` §3 names this directly: "the supervisor finds a replacement by hand, no 'who can cover?' list"). The drill measures how long the *manual* parts take, which is the whole point — it is not a sign the platform is broken that a human has to decide who covers a shift.

## 1. Who and what, before 15:00
- **CEO** — plays the client contact and the final escalation point.
- **CTO** — plays the supervisor.
- **Two more people** (anyone available) — play Operator A and Operator B, using demo accounts.
- **Stack:** the local demo copy, fictional `[DEMO]` tenant and data only. Screen-shared so the CEO can watch throughout.
- **Before starting:** confirm the demo stack is up (dev server, worker, realtime server, Postgres, Redis — same four as every verification this week) and seeded (`npm run seed`), and that Operator A and Operator B are signed in, in separate windows, both set to `AVAILABLE`.

## 2. Scenario-by-scenario mechanics
| # | Scenario | What's real (platform) | What's manual (tabletop) |
|---|---|---|---|
| 1 | Planned absence, 12 hours' notice | Supervisor records it: `POST /api/v1/absences` (`kind: "LEAVE"`); the gap is then visible on `GET /api/v1/shifts/coverage` | Deciding who the backup operator is, and telling them |
| 2 | Operator goes offline mid-shift, conversations held | The live team view (`GET /api/v1/reports/live` or the dashboard) shows the operator's status change from `AVAILABLE`/`BUSY` to `offline` | Noticing it (no automated "on shift but offline" alert exists yet); the supervisor manually transferring each held conversation (`POST /api/v1/assignments/[id]/transfer`) with a handover note; calling the backup |
| 3 | Nobody available within 30 minutes | The queue and SLA timers behave as normal (conversations stay queued, in priority order) | The supervisor deciding to inform the client contact, and actually doing it (a message, in this drill, not a real client); logging the gap (date, cause, minutes uncovered) by hand, since there's no built-in "coverage incident" log yet |
| 4 | Shift time zones | An operator's shift time is shown correctly in both the client's time zone and the operator's own local time, with no manual conversion (per `lib/auth/rbac.ts`'s operator-timezone work, already tested) | Nothing — this one should need no manual step if it's working correctly; if it does, that's the finding |
| 5 | Two operators out at once (unplanned) | Same absence/coverage visibility as #1, called twice | The supervisor deciding whether the one remaining operator (or none) can absorb the combined queue — a single judgment call, not two separate reactions |
| 6 | The supervisor is also unreachable during an incident | An operator can still raise an escalation (`POST /api/v1/escalations`, one of `DECISION_NEEDED`/`CLIENT_APPROVAL_NEEDED`/`SENSITIVE_SITUATION`/`CANNOT_RESOLVE_SAFELY`) regardless of whether a supervisor is online to see it immediately | Who actually notices the escalation and reaches the CEO when the normal escalation path (the supervisor) doesn't respond — there's no automatic second-level escalation timer; that gap is the point of this scenario |

## 3. What to measure, every scenario
- **Time to notice** the gap (from when it started, not from when someone happened to look).
- **Time to reassign/cover** (from noticing to a backup operator actually handling it).
- **Conversations missed or delayed** beyond the normal response target.
- **Every manual step taken** — written down as it happens, not reconstructed afterward.

## 4. Results template (empty on purpose — fill in during/after the session)
| # | Scenario | Time to notice | Time to reassign | Missed/delayed | Manual steps taken | Pass/fail against `56`'s stated pass condition |
|---|---|---|---|---|---|---|
| 1 | Planned absence | | | | | |
| 2 | Offline mid-shift | | | | | |
| 3 | Nobody available 30 min | | | | | |
| 4 | Time zones | | | | | |
| 5 | Two out at once | | | | | |
| 6 | Supervisor unreachable | | | | | |

**Overall:** [to be written after 17 Nov, not before — PASS / PARTIAL / weaknesses found]

## 5. After the session
Write up the real results and any weakness found — especially around scenario 6's missing second-level escalation and scenario 2's missing "on shift but offline" alert, since both are already-known gaps (`56` §3) and the drill either confirms their real-world impact or shows they're smaller than expected. This feeds directly into the release-readiness report, alongside the backup/key verification the same day (`64`).
