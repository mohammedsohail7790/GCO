# 47 — Prepared, not applied: Workspace mail relay, uptime monitor, 48-hour load test, security-test requests (4 Nov 2026)

**Nothing here has been applied.** No Workspace setting changed, no account created, no server created, no email sent.

## 1. Alerts: Google Workspace SMTP relay (prepared; applying it is a separate approval)
**Recipients:** `founder@globalconversationoperations.com` and the CTO's existing verified technical address (a dedicated company address later). **Sender shown:** `founder@globalconversationoperations.com`.
**Settings to enter** (Google's help page "Route outgoing SMTP relay messages through Google": Admin console → Apps → Google Workspace → Gmail → Routing → SMTP relay service → Configure; needs the Gmail Settings administrator privilege; set at the top-level organisation; changes can take up to 24 hours):
| Setting | Value | Why |
|---|---|---|
| Allowed senders | **Only registered Apps users in my domains** (the founder address is a user) | Tightest option; not "any addresses" |
| Authentication | **Only accept mail from the specified IP addresses**: the production server's fixed public IPv4 (read from the Hetzner console; not recorded here). Leave "Require SMTP Authentication" **off** | No password exists to steal |
| Require TLS encryption | **On** | Refuses unencrypted connections |
| Server and port | `smtp-relay.gmail.com`, port 587 | |
Limits per Google's page: 10,000 messages per user per day; 100 recipients per transaction. Our alerts are a handful per day.
**Watchdog settings** (`/etc/gco-watchdog.env`, root-only): `SMTP_URL=smtp://smtp-relay.gmail.com:587`, `SMTP_FROM=founder@globalconversationoperations.com`, `ALERT_TO=founder@globalconversationoperations.com,<CTO technical address>`. **Code change made today (local, tested):** the watchdog now **refuses to send over an unencrypted connection by default** (`SMTP_REQUIRE_TLS=1`; previous behaviour sent plain text if the server did not offer TLS) and works without a login (already supported; verified by a test that an unencrypted server gets nothing). 12 local tests pass.
**Test plan (staging first):** note the staging server uses a **different public IP** from production, so testing there needs that IP added to the relay rule: **a second Workspace change, which needs its own approval**. Alternative: test the relay only at first install on production, which is itself a production change. Expected checks: one alert and one recovery email when the app container is stopped for 10 minutes; a backup-freshness alert; a failed-backup notification.
**Not verified:** the exact current wording of Google's admin screens; that Google accepts a "From" address that is a registered user for relay in this tenant; delivery to the recipients' inboxes (not spam).

## 2. UptimeRobot monitor for the public health address (prepared; account not created)
- **Terms:** UptimeRobot's own terms (changelog dated 26 May 2026) say the service is "available for any use, including commercial and business use". The free plan has a Fair Use Policy I did not read in full; check it when creating the account.
- **What is monitored:** `https://globalconversationoperations.com/api/v1/health`. Its public response contains only database and queue "up/down" and latency, no client information (read 4 Nov). **Type:** keyword monitor for `"healthy":true`; 5-minute interval on the free plan; alert contacts: the same two addresses; **no public status page**.
- **Who creates it:** an account is a business account in the CEO's name: **the CEO creates the account** (with two-step sign-in on) and adds the monitor, or tells me when it already exists. I do not create accounts. Test: point a second monitor at a deliberately wrong keyword and expect an alert, then delete it.
- Limit: a monitor outside the server is the only thing that reports the server itself being down.

## 3. 48-hour load test (prepared; no server created)
**Cost.** Hetzner CPX32 at **€0.0577 per hour excluding VAT** (page read 3 Nov; **to be confirmed in the Hetzner console**), 48 hours = **€2.77**; **€3.30 if 19% German VAT applies**; 72 hours would be €4.94 with VAT. Includes IPv4 and 20 TB traffic. No snapshots, volumes or extra IPs. Final cost to be stated from the console before creating, then the CEO's final approval. If the console shows a higher figure, the test stops at the €5 ceiling.
**Throughput is not human capacity.** Two separate questions:
1. **System throughput** (what the load test measures): how many messages per minute the platform can accept, store, queue and assign without loss.
2. **Human capacity** (what it does not measure): how many messages up to five operators can actually answer. This needs handling time per message, which we do not have: it comes from the pilot. For illustration only, if one operator finishes 15 to 30 messages an hour (assumption), five operators on shift answer about 75 to 150 an hour, i.e. **1 to 2.5 messages per minute**. At 5 messages per minute arriving, a queue builds. So **the platform's limit is far above what five people can answer**; the human side sets the pilot's real capacity, and the system numbers must never be quoted as service capacity.
**Benchmarks (labelled by purpose):**
| Step | Rate | Duration | Purpose |
|---|---|---|---|
| Realistic pilot | 2 to 5 per minute steady, plus a burst of 30 in one minute | 30 min | Behaviour at expected pilot load, including a campaign burst |
| Headroom | 30, 100, 300 per minute | 10 min each | Margin over the pilot (at least 3 times peak) |
| Stress | 1,000 per minute | 10 min | Find the ceiling; **not a service figure** |
| Soak | 100 per minute | 2 hours | Slow leaks, queue build-up |
| Operators | 5 concurrent operator sessions answering (scripted), then 15 | 20 min | Assignment, realtime updates under load |
| Failure | Restart the application, then the database container, mid-run | | No lost, duplicated or double-billed message |
**Pass criteria:** no lost or duplicated message in any step; every accepted message stored once and billed once; acknowledgement and assignment times stable at the pilot and headroom steps; recovery after restarts without manual repair. **Safety:** fictional data only, AI off, no production data or credentials, a separate server deleted at the end, dev-mock adapter only. Tool: `scripts/loadtest.ts` (webhook to processed); operator-session scripting still needs to be written (about a day).

## 4. Independent security test: request text for each firm (nothing sent)
**Sender:** Global Conversation Operations | Partnerships Team, `partnerships@globalconversationoperations.com`. **Addresses (from each firm's own site, 3 Nov):** 7ASecurity: `sales@7asecurity.com` or its "Free Consultation" form; SEC Consult: its contact page (no sales address verified); Cure53: `hello@cure53.de`.
> Subject: Request for quotation: independent web application and API security test
>
> Hello, Global Conversation Operations is a multilingual conversation-operations company preparing its first client pilot. We would like a quotation for an independent security test of our platform, on a staging environment with fictional data only.
>
> Scope, in priority order: (1) isolation between client tenants, (2) authentication and sessions, including optional two-step sign-in, (3) role-based permissions for six roles, (4) the API and signed webhook endpoints, (5) protection of sensitive data. Then administration and billing routes, a CSV export service, security headers and TLS. Grey-box with accounts for each role; aligned with OWASP ASVS level 2 and the OWASP API Security Top 10. Out of scope: denial-of-service, social engineering, production, third-party services.
>
> Please tell us in writing: (a) a fixed price or day rate and number of days, with VAT treatment, payment terms, and whether the report, debrief and **retest** are included; (b) your accreditations and how we can verify them; (c) who would perform the test and from which country; (d) a sample report with client details removed; (e) earliest start date and time from end of testing to report; (f) confidentiality, data handling, insurance and liability terms; (g) what you need from us; (h) whether you will provide an attestation letter stating what was tested and when. [For SEC Consult only: does your offer cover API testing explicitly?] We expect testing in November or early December 2026. This is a request for information; it does not commit us to any purchase.
>
> Kind regards, Global Conversation Operations | Partnerships Team
**Comparison table to fill** is in `44` section 4. What I know so far, from their own sites only (accreditations not checked with registries): 7ASecurity (Dublin, Ireland; ISO 27001 and insurance shown; sample reports not offered on the front page), SEC Consult (ISO 27001 and CREST badges shown; part of Atos), Cure53 (Berlin; no certifications listed; reports published only on the client's request; insurance and NDA terms mentioned).
