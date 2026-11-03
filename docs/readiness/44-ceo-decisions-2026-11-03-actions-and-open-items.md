# 44 — CEO decisions of 3 Nov 2026: what was done, what is drafted, what is still open

**Status:** nothing was sent, bought, installed or published. Production is unchanged. Items needing the CEO's input are marked **[CEO]**.

## 1. Backup keys (decision 1)
The step-by-step instructions already exist, unchanged and re-read on 3 Nov: `38-backup-keys-step-by-step-for-the-ceo-2026-10-31.md` (Part A restricted Backblaze key, Part B two `age` keys, Part C offsite restore proof). To be sent to the CEO as a separate document, not pasted into a chat. Nothing secret is ever sent by email: only the two public `age1...` lines come back to the CTO, confirmed by voice.
Open: **[CEO]** confirms when the keys exist. Then the CTO installs `age` and the recipients file on **staging first**; production only after separate written approval.

## 2. Alerts and monitoring (decision 2)
**Sending mailbox `founder@globalconversationoperations.com`: technically possible, but not recommended as set up in `43`.** Two ways to send from it:
| Way | What the server holds | Concern |
|---|---|---|
| App password for the founder mailbox (what `43` assumed) | A password for that mailbox. An app password is not limited to sending: it can also be used to read that mailbox | A server-side secret that opens the CEO's own inbox. Needs two-step verification on the mailbox |
| Google Workspace **SMTP relay** (Admin console → Gmail → Routing), allowed by the server's fixed IP address, "send as" the founder address | No password at all | Needs a one-time Workspace admin change and a fixed server IP (it has one). Per Google's help pages and third-party guides the relay authenticates by IP address; **confirm the exact options in Google's admin help before relying on it** (I could not read Google's English admin page) |
Recommendation: use the relay with the founder address as the visible sender, so no mailbox password sits on the server. The watchdog needs a small change to send without login (it already supports STARTTLS; unauthenticated relay is a configuration, `SMTP_URL` without credentials). **[CEO]** approves the Workspace relay setting (a configuration change); recipients are the CEO and CTO addresses **[CEO]** to confirm the exact two.
**Free external uptime monitor (approved to explore, free only, no client data):** it only needs the public health address, which returns no client data. Candidates and what I could and could not verify (3 Nov): UptimeRobot, free tier with 5-minute checks (the CEO's notes say an account may already be configured; **sources disagree on whether the free plan may be used commercially**, so read UptimeRobot's current terms before relying on it: [overview of the conflicting reports](https://dev.to/velprove/uptimerobot-commercial-use-free-alternatives-for-business-sites-in-2026-5d75)); Better Stack and HetrixTools free tiers: **not verified**, I found no reliable limits. A paid plan is not proposed. Action when approved: create the monitor on the health address, alert the same two people, check that it raises and clears an alert against staging.
Installation of the watchdog stays staged: staging first, production after approval.

## 3. Temporary load-test server (decision 3): quote request, nothing bought
**Scope (proposed):**
- One separate Hetzner Cloud server of the same type as production (CPX32), same location (Nuremberg), created only for the test and **deleted at the end**. Fictional data only; no production data, no real credentials, AI off.
- Deploy the release candidate plus the P0 branch from a clean checkout (the same containers as production).
- Tests using the repository's `scripts/loadtest.ts` against the webhook-to-processed path: steps of 30, 100, 300 and 1,000 messages per minute for 10 minutes each; a 2-hour steady run at 100 per minute; concurrent operator screens (5 and 15) and realtime connections; a restart of the application and of the database container mid-run; a check that no message is lost, duplicated or billed twice; response-time percentiles and server load recorded.
- Pass criterion (from `37`): at least three times the expected pilot peak with no lost messages and stable response times. **The expected pilot peak is not known yet [CEO]**: it needs covered hours, operators and an estimate per operator (worksheet `37`).
- Duration: server held about 48 hours (set-up, runs, write-up), then deleted.
**Cost (corrected 3 Nov evening):** my first figure of about €0.022 per hour came from third-party sites and was **wrong**. Hetzner's own page for the CPX32 (Regular Performance) shows **€35.99 per month or €0.0577 per hour excluding VAT**, IPv4 included in the price, 20 TB of traffic included in the EU locations ([Hetzner CPX32 listing](https://www.hetzner.com/cloud/regular-performance/)). The page reading was done by a text tool: **the exact figure must be confirmed in the Hetzner console when the server is configured**. 48 hours is about **€2.77 excluding VAT**, or about **€3.30 if German VAT of 19% applies** (VAT treatment for the company's account is not confirmed). 72 hours would be about €4.15 / €4.94, so the €5 ceiling holds for **48 hours, not much longer**. Snapshots or extra volumes would add cost and are not planned.

## 4. Independent security test quotations (decision 4): drafted, nothing sent
Vendors named by the CEO: **7ASecurity, SEC Consult, Cure53.** This replaces the first-pass candidate list in `40` (which was unverified). I have **not** verified any of these firms' accreditations, prices, locations or availability, and I did not invent contact details: the request goes to each firm's own contact form or sales address, taken from its website by whoever sends it.
- Scope text for the request is `40` section 1, with the CEO's priority order: **tenant isolation, authentication and sessions, permissions (all roles), APIs and webhooks, sensitive-data protection**, then admin/billing routes and the CSV export service, headers and TLS. Staging, fictional data, grey-box accounts for each role, aligned with OWASP ASVS level 2 and API Top 10.
- Questions every firm must answer: `40` section 2. One addition: **who exactly performs the test and from which country** (relevant to our own data-transfer rules), and whether a retest and an attestation letter are included.
- Comparison table to fill when replies arrive:
| | 7ASecurity | SEC Consult | Cure53 |
|---|---|---|---|
| Scope covered (tenant isolation, auth, permissions, API, data) | | | |
| Days and price excl. VAT, fixed or day rate | | | |
| Retest included | | | |
| Report and attestation letter | | | |
| Earliest start / report lead time | | | |
| Testers' location, confidentiality, insurance | | | |
| Sample report supplied | | | |
Draft email: `40` section 5, addressed to each firm. **[CEO/CTO]** the CTO can send the three requests as the company's technical contact once the CEO confirms the sender name and address. No purchase is authorised.

## 5. Billing details (decision 5): proposed details from our records, for the CEO's verification
From the repository records (`docs/business-details-and-vat.md`, `lib/config/business.ts`, legal drafts), **not** from any database:
| Field | Record | State |
|---|---|---|
| Legal name | Osarunwense Cristian Idiaghe | recorded (CEO-confirmed) |
| Legal form | Sole proprietor (ditta individuale) | recorded; **[CEO]** confirm exact wording used on invoices |
| Trading name | Global Conversation Operations | recorded |
| Partita IVA | IT03228830307 | recorded; check digit valid |
| Codice fiscale | not recorded on purpose (personal data) | **[CEO]** supplies |
| Registered business address | not recorded (home address not assumed) | **[CEO]** supplies, with the accountant |
| PEC / SDI code (electronic invoicing) | not recorded | **[CEO]** and accountant |
| VAT treatment (22% standard, or special regime / reverse charge for foreign business clients) | system default is 22% with a free-text note | **accountant must decide**; do not issue before this is known |
| Invoice email, bank details for payment | invoice email is a setting; bank details not recorded | **[CEO]** |
The internal invoice page is a working document, **not** a valid tax invoice: an Italian invoice normally goes through the electronic invoicing system via the accountant. Nothing will be issued. A one-page "proposed invoice details" sheet can be produced from this table once the blanks are filled.

## 6. Security page wording (decision 6)
The complete final proposed wording is `39-security-page-final-wording-for-review-2026-10-31.md`, with the evidence behind every sentence in `35`. Re-checked on 3 Nov against what has changed since: the "Backups" and "Monitoring" rows stay as written, because the alerts are built but **not installed**, and "encrypted backups" must still not be written. The CSV export service is not mentioned on purpose. Nothing is published. Publication needs the CEO's separate written approval and a release route. Items still to confirm before publication are listed at the end of `39` (Backblaze bucket region and encryption; live re-check on the day).

## 7. Engineering access from India and GDPR (decision 8): the restriction is NOT technically verified
The CEO's approval to say this is conditional on it being **technically verified**. It is not, so the statement cannot be made in that form yet.
- **What is verified (3 Nov, repository search):** no code path or setting treats access by country or location (no geo-blocking in the login or middleware code). So the application itself does not enforce any location restriction.
- **What is true today:** no real client personal data exists in production (simulated data plus the CEO's own staff and applicant records, per `18`), and all development, testing and demos use fictional data. So the restriction currently holds by **fact and by policy**, not by technical control.
- **What is not controlled technically:** the CTO has server and backup access (per `18`: whoever holds root or a Backblaze key can read all conversations once they exist). The planned controls that would make the restriction technical are **not in place**: encrypted backups with keys held by the CEO (waiting on the keys), break-glass production access with CEO approval (`21`, procedure written, not enforced on the server), and database/shell access limited to an EU-based holder. I did not check the live server for this (production access is off-limits without a specific approval).
- **Statement that is accurate today and safe for UVS (if the CEO chooses to disclose):** "No real client personal data is accessed from outside the EU/EEA. Today there is no real client data on the platform, and development and testing use fictional data. Before the first real client, access to client data from outside the EU/EEA remains closed pending legal and data-protection review, and we are putting technical controls in place to enforce it." Do **not** say "technically blocked" or "technically prevented".
- **To make the restriction technical (each needs approval, staging first):** (1) encrypted backups with the CEO-held keys (item 1); (2) production root and database access becoming break-glass, held by an EU approver; (3) server SSH keys inventory and review; (4) log/error scrubbing check once real data exists; (5) legal review of transfers (SCCs, transfer assessment). The CTO will keep the restriction in place as instructed.

## 8. UVS (decisions 7 and 9)
Updated plan in `42` (see its section 6): subcontracting for European-language queues is the primary topic; reciprocal referral is exploratory; **no financial terms promised**; demonstrate the newest version in the test environment with fictional data, labelling each item as live in production / built, tested, not yet released / needs development; no launch dates, certifications, service levels or prices. Meeting time not yet confirmed by UVS (the CEO will tell us).

## 9. Production (decision 10)
Unchanged. Requires the CEO's separate written approval after the final readiness review.
