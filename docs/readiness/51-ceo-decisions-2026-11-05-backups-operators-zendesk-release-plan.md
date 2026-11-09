# 51 — CEO decisions of 5 Nov 2026 (second message): backups, operator scalability, Zendesk, release plan

Decisions received: install `age` from Ubuntu's official packages (approved); Backblaze restricted key, retention protections and an encrypted restore test on staging; local free test database (approved, test data only); CPX22 staging approved **in principle** (final price and VAT confirmed before purchase); load test approved in principle (€2.77 plus VAT) **after** the security and release tests; keep 24/7 as a core offer with accurate wording; 2FA right after the tested release; alerts before any real client; operator scalability across time zones; assess working inside a client's Zendesk. **Not authorised: a production release or real client data.**

## 1. Done today
| Item | Result |
|---|---|
| Local test stack (free: PostgreSQL 16 and Redis from Homebrew, fictional data only, run from a temporary folder, not started at login) | Running. Integration tests on the release branch with zod 4: **229 of 229**. End-to-end: see §6 |
| `age` on production | **Installed 5 Nov** at the CTO's instruction: `age 1.2.1-1build1` from Ubuntu 26.04 `universe` (Hetzner's Ubuntu mirror); dry run first showed one new package and nothing else. Recipients file **absent**, so backups are unchanged (still plain). All five services healthy afterwards |

## 2. Backups: the order of work
### 2.1 Install `age` on the server (approved; done 5 Nov)
```
ssh -i ~/.ssh/id_ed25519_gco_prod gco@188.245.22.254 'sudo apt-get install -y --no-install-recommends age && age --version'
```
Installing `age` alone changes nothing in the backups: the job only encrypts once the recipients file exists. **Do not create `/etc/gco-backup-age-recipients.txt` on production yet** (staging first, `38` Part B step 7).

### 2.2 Keys with the CEO (`38` Part B)
Two key pairs (primary and recovery) made on the CEO's computer. Private keys never reach the server or the CTO: primary in the CEO's password manager plus an offline encrypted copy; recovery with a trusted custodian in the EU. Only the two public keys come to me. **Change to `38`:** the CEO may install `age` on his Mac from Homebrew (`brew install age`, free) instead of downloading the release by hand.

### 2.3 Backblaze: restricted key and retention (`38` Part A, with one correction)
- New key `gco-backup-writer` with only `writeFiles,listFiles` on the backup bucket; the current key retired only after an upload and an offsite restore have worked.
- **Correction:** Backblaze's API documentation says hiding a file needs only `writeFiles`. With the lifecycle rule in `38` (hidden files deleted after 1 day), anyone with server root could hide every backup and have it deleted a day later. So, in addition:
  - **Enable Object Lock on the bucket** with a **default retention of 30 days in governance mode**. Backblaze states lifecycle rules cannot delete a locked file. The upload key does not get the capability to bypass governance, so the server cannot shorten it; the CEO's master key still can (a mistake can be corrected). Object Lock cannot be switched off once enabled; it costs nothing beyond normal storage (each dump is about 0.9 MB; 30 days is about 27 MB).
  - Keep the lifecycle rule (`daysFromUploadingToHiding: 30`) and raise `daysFromHidingToDeleting` from 1 to **7**, so an unexpected hide is noticed before deletion.
  - Compliance mode (not even the master key can delete) is stronger but makes an erasure request impossible for 30 days; it needs the lawyer's view first.
- The CEO does this in the Backblaze console (he owns the account); I check the result read-only with the new key's `b2 key list` output, never the secret.

### 2.4 Encrypted restore test on staging
Needs: a staging environment (the CPX22 once purchased, or staging on the production host as a fallback only for **fictional** data), `age` there, the recipients file. Then: back up fictional data → encrypted upload → CEO downloads with the read key and decrypts on his computer → I restore into a throwaway database and compare migrations and row counts (`scripts/restore-verify.sql`). Only after it passes and with written approval does the production backup job switch to encryption.

## 3. Staging server and load test costs
CPX22 (2 vCPU, 4 GB, 80 GB, Nuremberg): **€19.99 per month excluding VAT**, €0.0320 per hour, IPv4 included (Hetzner's own price page, 5 Nov). The VAT line on the CEO's Hetzner account decides the final figure; the CEO confirms it in the console's order summary before ordering. Load test: CPX32 for 48 hours, €2.77 plus VAT, run **after** §6 gates pass and deleted the same day. Nothing created.

## 4. Operators across time zones (what the platform does today)
| Need | Today | Gap |
|---|---|---|
| Shift scheduling | Shifts per tenant with overlap and absence checks; coverage per hour against the client's operating hours in the client's time zone | Shift times are shown in the viewer's browser time with **no time-zone label**, and operators have **no own time zone**. Freelancers in different zones can misread a shift |
| Handovers | Handover notes with attached conversations, to a team or a named operator, acknowledged once | — |
| Supervisor visibility | Supervisor role and teams; live queue, operators, coverage gaps, "on shift but offline" alerts | — |
| Escalation | Escalation with reason and path | — |
| Quality monitoring | QA reviews, training modules and qualifications | — |
| Replacing an unavailable operator | Absence recorded → coverage gap alert → manager reassigns or transfers held conversations | **No "who can cover?" list** (qualified, not on shift, not absent, right language); the manager finds a replacement by hand |

**Smallest useful additions (each a separate approval, no new paid service):** (1) operator time zone, and every shift shown with its time zone plus the operator's local time; (2) a "who can cover?" list for an absence or a coverage gap, filtered by qualification, language and existing shifts; (3) a written replacement procedure: backup operator named per shift, notice period, who approves. I recommend (1) and (3) before the first 24/7 project, (2) shortly after.

## 5. Working directly inside a client's Zendesk
**Yes, feasible for a first project without building an integration**, with these terms:
- **Access:** the client creates a **named Zendesk agent seat for each GCO operator and supervisor** (no shared logins), paid by the client (seat price depends on the client's Zendesk plan; not checked). The client enforces its own sign-in security (2FA or SSO). Operators see only the client's GCO group or views. Narrow custom roles need a higher Zendesk plan; we confirm the plan first.
- **Supervision:** a GCO supervisor seat with access to the same group; Zendesk's own views and reports (Explore) for queue, response and resolution times. The GCO platform still runs **shifts, attendance, handovers, training, QA and operator earnings**.
- **Reporting and billing:** per-ticket or per-hour figures come from the client's Zendesk reports (agreed in the contract), or hours from GCO shifts. The GCO per-message ledger, response timers, delivery tracking and audit trail **do not apply** to work done in Zendesk; quality reviews are logged in GCO by hand.
- **Data protection:** client data stays in the client's Zendesk (the client is the controller, GCO the processor). The DPA must name access to the client's system, the operators' countries, and seat removal within 24 hours of an operator leaving. The India-access restriction still applies: the CTO does not access the client's Zendesk.
- **What we need from the client:** Zendesk plan, number of seats, roles available, Explore access, sign-in policy, ticket volume by hour, languages, macros and the escalation contacts.
- **Later, if commercially justified:** a Zendesk connector (tickets into the GCO platform through Zendesk's API and webhooks) so the GCO timers, ledger and audit apply.

## 6. Release plan for written approval (replaces `48` §4 where they differ)
| Step | What | Status |
|---|---|---|
| G1 | Full automated suite on the frozen commit: typecheck, lint, unit, integration, end-to-end (AI off), production build | **Run locally 5 Nov on `9d305d5` (dev server, local Postgres 16/Redis):** typecheck and lint clean, unit 749/749, integration 229/229, build OK, end-to-end **307 passed, 2 skipped, 2 failed** (specs `01` and `08`, AI features, fail by design with AI off; `46` passed). Run 1 had 4 more failures (`24`, `25`, `27`, `53`, plus 32 dependent tests not run) because the local `.env` lacked `ALLOW_DEV_ADAPTERS=true`, which those specs document as required; run 2 with it set is the result above. To repeat on the final frozen tag |
| G2 | Tag the frozen commit and push the tag to GitHub | Needs the CTO's go-ahead to push |
| G3 | Migration rehearsal **on the server** in a throwaway directory and network: copy of the newest production dump, `prisma migrate deploy` (expect **16 → 30, 0 failed**), integrity checks, health with AI disabled | Needs CEO approval (writes a temporary directory and containers on the server, deleted afterwards; production untouched) |
| G4 | Rollback rehearsal there: old images on the new schema; database rollback by plain restore | With G3 |
| G5 | Encrypted backup and offsite restore proven on staging (§2.4) | Needs keys, `age`, staging |
| G6 | CEO's written approval naming the window; go/no-go note | Last |
| Release | Fresh backup → rollback tags → sync from the tag → build → migrate → verify (AI off, sign-in, tenant separation, headers, logs) → 24-hour watch. Code rollback about 3 minutes | Window proposed after G1-G6 |
| After | Same day: CEO enrols in 2FA, CTO account created and enrolled, then 2FA **enforced** for Founder and CTO. Then alerts (watchdog, Workspace relay, UptimeRobot free) live **before any real client** | Each its own approval |

**Alerts before the first client:** backup failure and missed backup (watchdog, built), site or health down (UptimeRobot free, external), critical application alerts by email (alert routes, built; needs the Workspace relay). The designated recipients are the CEO and the CTO.

**Earliest realistic window:** after G3 to G5, which depend on the keys session and the staging server. If those happen next week, the window could be the weekend of **21-22 November**; this is an estimate, not a promise.
