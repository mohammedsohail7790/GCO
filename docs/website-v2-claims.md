# Website V2 - business-claim register

Public-website wording that depends on a business decision is gated by flags in
`lib/content/site.ts` (`CLAIMS`). Flipping a flag changes the wording everywhere; no other
file needs editing. `tests/unit/websiteContentGates.test.ts` pins the approved truth and fails
on anything outside it (invented numbers, certifications, guarantees, unapproved services,
voice/call-centre services, autonomous-AI language).

## Status (Phase B, approved by Cristian)

| Flag | Claim | Status | Approved wording / qualifier |
|---|---|---|---|
| `freePilot` | The 7-day pilot is free | **APPROVED** | "Start Your 7-Day Free Pilot" |
| `noSetupFee` | No setup fee for the pilot | **APPROVED** | "No setup fee" |
| `noCommitment` | No long-term commitment | **APPROVED** | "No long-term commitment"; after the pilot the client decides whether to continue under agreed commercial terms |
| `aroundTheClock` | 24/7 coverage | **APPROVED, qualified** | A capability subject to project staffing - never implied automatic for every client; "confirmed per project, based on staffing, before go-live" |
| `multilingual` | Multilingual support | **APPROVED, qualified** | English, Italian, French, German, Spanish, Swedish; staffing confirmed per project before go-live |
| `qaProcess` | QA | **APPROVED as "Supervision & QA"** | No QA department, certifications, statistics or quality percentages are claimed |
| `escalationProcess` | Escalation | **APPROVED + implemented** | Operator -> Supervisor / Team Lead -> GCO Management / Client Contact (no extra tiers) |

## Still NOT claimed (do not add without approval)
Operator counts, language counts beyond the six listed, volume figures, response-time promises,
guarantees, uptime figures, certifications (ISO/SOC 2/GDPR), customer logos, testimonials, case
studies, voice / call-centre services, autonomous AI ("AI replaces operators").

## Other single sources of truth
- `PUBLIC_EMAIL` - the only public contact address (`founder@globalconversationoperations.com`).
- `lib/config/scheduling.ts` - "Book a Call": a valid https Calendly URL from `CALENDLY_SCHEDULING_URL`,
  otherwise `/contact`. **No Calendly URL exists yet.**
- `lib/content/services.ts`, `industries.ts`, `platform.ts`, `escalation.ts`, `platformAssets.ts` - page content.
- `NAV_ITEMS` - `Resources` stays disabled until the route exists.
- `PILOT_STEPS` - the pilot process, mirroring `docs/7-day-pilot.md` (discovery before Day 1).
