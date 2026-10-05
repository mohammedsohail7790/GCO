# Website V2 - business-claim register

Public-website wording that depends on a business decision is gated by flags in
`lib/content/site.ts` (`CLAIMS`). Every flag is `false` until the business confirms
the claim is currently deliverable. Flipping a flag changes the wording everywhere;
no other file needs editing. `tests/unit/websiteContentGates.test.ts` fails if gated
wording leaks while a flag is false (update that test when a claim is confirmed).

| Flag | Claim | Status | What the site says while `false` |
|---|---|---|---|
| `aroundTheClock` | 24/7 coverage | REQUIRES BUSINESS CONFIRMATION (no shift/roster model in the platform) | "Human Conversation Operations. Built to Scale." / "Coverage hours agreed per operation" / Services "Coverage Planning" |
| `multilingual` | Multilingual operator teams | REQUIRES BUSINESS CONFIRMATION (no language routing; operators have no language field) | "Languages agreed per operation" / Services "Language Coverage" |
| `qaProcess` | Formal conversation QA / review | REQUIRES BUSINESS CONFIRMATION (no QA tooling in the platform) | "Supervision & oversight" (manager dashboard: queues, assignment, timers) |
| `escalationProcess` | Defined escalation process | NOT CURRENTLY DELIVERABLE as a platform feature | Not mentioned |
| `freePilot` | The 7-day pilot is free | REQUIRES BUSINESS CONFIRMATION (docs/7-day-pilot.md titles it "Free Pilot"; terms not stated on the site) | "Start Your 7-Day Pilot" |
| `noCommitment` | No long-term commitment | REQUIRES BUSINESS CONFIRMATION | Not mentioned |

Other single sources of truth:

- `PUBLIC_EMAIL` - the only public contact address.
- `lib/config/scheduling.ts` - where "Book a Call" points: a valid https Calendly URL from
  `CALENDLY_SCHEDULING_URL`, otherwise `/contact`. Marketing pages revalidate every 10 minutes,
  so a newly-set URL is picked up at runtime without a rebuild.
- `NAV_ITEMS` - future routes (`/industries`, `/platform`, `/resources`) are listed with
  `enabled: false`; set `true` only once the page exists.
- `PILOT_STEPS` - the pilot process, mirroring `docs/7-day-pilot.md` (discovery before Day 1).
