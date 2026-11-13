# 56 — Key-session sheet (Fri 13 Nov), operator coverage drill, real-model AI test preparation (12 Nov 2026)

Nothing here was applied. No key exists, no bucket created, no AI provider called, nothing bought.

## 1. Key session: Friday 13 Nov 2026, 11:00 to 12:30 CET (15:30 to 17:00 IST), subject to the CEO's final confirmation
**Rules:** private keys and Backblaze keys never go into email, chat, screen recordings or the repository; the CEO types and stores them himself; I only ever receive the two **public** `age1...` lines (confirmed by voice). Approved: install `age` on the CEO's Mac. Nothing on the production server or production bucket changes in this session.
| Time | Step |
|---|---|
| 0–10 | Safety check: private folder not synced to any cloud drive; password manager open; screen sharing off while any secret is on screen |
| 10–25 | `brew install age` (CEO's Mac; free); check `age --version`; make the folder `gco-keys` |
| 25–45 | `age-keygen -o gco-backup-primary.txt` and `age-keygen -o gco-backup-recovery.txt`; encrypt a made-up text file to both public keys and decrypt it with each private key (`38` Part B) |
| 45–55 | Store the private files: primary in the password manager plus an offline encrypted copy; recovery with a trusted EU custodian (decide who) |
| 55–75 | Backblaze: install the B2 command line; create the **upload-only key** (`writeFiles,listFiles`, backup bucket only) and a separate **read key** (kept off the server); confirm with `b2 key list` that no extra capability is present (`38` Part A) |
| 75–90 | Object Lock **scratch-bucket test** (section 2) if time allows, otherwise a second short session; read the two public keys aloud |
**Afterwards (separate approvals):** the public keys go into the recipients file on **staging first**; the key ID and key are entered on the server through a hidden prompt on a call, never typed into a file I can see; one nightly upload verified; then the real-key encrypted backup is downloaded by the CEO, decrypted on his computer and restored into a throw-away database; only then does the production backup job change, with the CEO's written approval.

## 2. Object Lock test on a free scratch bucket (production bucket not touched)
Do this on a **new empty bucket** with a throw-away file. Command names below are from memory of the B2 command line and **must be checked with `b2 <command> --help`** before use; Backblaze's page does not list the exact key capability names, so finding them is part of the test.
1. Create a scratch bucket with Object Lock enabled; set a short **default retention** (for example 1 day, governance mode) so the test can end quickly.
2. Create an **upload-only key** limited to that bucket.
3. With that key: upload a file (expect: succeeds; the retention applies). Try to delete it, overwrite it and shorten its retention (expect: **all refused**).
4. With the master key: override the retention on that file in governance mode (expect: allowed, and note the exact capability or option needed).
5. Add a lifecycle rule and check that it cannot delete the locked file.
6. Read the file back with a read key (expect: works).
7. After the retention ends, delete the bucket and its test keys.
**Record:** each result, the exact capability names, and any surprise. **Decision rule:** if step 3 shows the upload key can shorten or delete, the production bucket stays as it is. The production bucket is changed only with the CEO's explicit written authorisation and after the lawyer's view on retention versus erasure requests (`54` §2).

## 3. Operator coverage drill — six scenarios (tabletop plus demo stack; scheduled 17 Nov 15:00–16:00 CET)
**Correction (15 Nov):** this section originally listed four scenarios. The CEO has referred to "all six scenarios" in every message since, and he's right to expect six — two were missing. Added below (5 and 6), covering the continuity risks a single planned-absence or single-dropout test doesn't reach: more than one person out at once, and the escalation path itself failing.

**Who:** CEO (client contact and escalation), CTO (supervisor), two people playing operators using demo accounts. **Where:** the local demo copy, fictional data; the CEO can watch the screen share. **Length:** about 60–75 minutes for six scenarios.
| # | Scenario | What must happen | Pass if |
|---|---|---|---|
| 1 | Planned absence with 12 hours' notice | Absence recorded; coverage gap shown; backup operator named in the plan takes the shift | Gap visible within a minute; backup assigned and shown on the shift plan |
| 2 | Operator goes offline mid-shift, with conversations held | "On shift but offline" alert after 10 minutes; supervisor transfers the conversations with a handover note; backup called | Conversations answered by another operator within the response target; handover acknowledged |
| 3 | Nobody available within 30 minutes | Supervisor informs the client contact with an expected recovery time; queue handled in priority order | Client message sent within 30 minutes; gap logged (date, cause, minutes uncovered, client informed) |
| 4 | Shift time zones | Operator in another time zone reads the right shift time | Shift shown in the client's zone and the operator's local time without a question |
| 5 | Two operators out at once (unplanned) | Supervisor sees both gaps together, not as two separate alerts to piece together; decides whether the remaining operator(s) can absorb the queue or the client must be informed | Combined gap visible within a minute of the second dropout; a single, clear decision made and logged, not two uncoordinated reactions |
| 6 | The supervisor is also unreachable during an incident | Escalation does not dead-end at an absent supervisor; it reaches the client contact (CEO) directly within the response target | Client contact notified within 30 minutes even with no supervisor acknowledging; the gap in the escalation chain itself is the thing being tested, not just operator coverage |
**Measure:** time to notice, time to reassign, conversations missed, and every manual step. **Known gaps to observe, not fix today:** the supervisor finds a replacement by hand (no "who can cover?" list); there is no automatic second-level escalation if a supervisor doesn't respond (scenario 6 shows this by hand). Result and changes go into a short note for the CEO.

## 4. Real-model AI test: preparation (nothing activated; the CEO creates the OpenAI project and prepaid credit)
**Configuration (to confirm with the CEO before any activation):** staging stack only; model `gpt-4o-mini`; `AI_MASTER_SWITCH=enabled`, `AI_PROVIDER=openai`, the external-provider approval flag set on **staging only**; key stored only in the staging environment file (never in the repository, never in production); a test client with a **daily call cap of 200** and masking on; OpenAI project budget with alerts at 50% and 80%, and prepaid credit of about €10 with automatic recharge off (**to be verified in OpenAI's console**).
**Synthetic conversation set (to write before the test, about 40 conversations, all invented):** English, Italian, Spanish, French and Swedish support requests (order status, refund, cancellation, delivery problem, complaint, product question); short, long and multi-message threads; messages containing **fake** emails, phone numbers and IBANs (to prove masking before sending); out-of-scope and abusive messages; prompt-injection attempts ("ignore your instructions and..."); empty or one-word messages; wrong-language replies. **No real customer text anywhere.**
**What is measured:** draft language correct; masked values never present in what is sent (checked from the provider request log in a test, never from a real provider dashboard alone); no draft is ever sent without an operator action (the only send path is the operator's); refusals and provider errors do not block an operator; tokens, latency and cost per draft; draft **accepted unchanged / edited / not used**; reply time with and without drafts; spend against the cap.
**Not built yet:** a cost figure (tokens times price) in the productivity report. It will be added before the test so the €10 is also tracked inside the platform.
**Stop rules:** stop at once if spend reaches 80% of the cap, if any real conversation text could be involved, or if a draft is ever sent without an operator action.

## 5. Order of work from here (proposal, to be confirmed with the CEO)
1. 13 Nov: key session. 2. Real-key staging recovery and the Backblaze restricted key. 3. Object Lock scratch test. 4. Staging for 2FA reset rehearsal, alert relay and monitor. 5. Coverage drill. 6. Final test report and a deployment approval request. 7. After the release: verified-hours billing (supervisor-approved timesheets, attendance, overtime approval, audit; `54` §6).
