# 64 — 17 Nov backup and encryption verification: session runbook and results template (15 Nov 2026)

**Status:** preparation only, written in staging. **Nothing in this document has been run.** It exists so the 11:00–12:30 CET session on 17 Nov is spent running real steps, not deciding what to run. References existing, already-committed tooling: `scripts/encrypt-backup.sh`, `scripts/decrypt-backup.sh`, `scripts/restore-drill.sh`, and the CEO's own step-by-step in `38`. Builds on the plan in `56` §1–2.

## 0. Rules for the session (unchanged, repeated so nothing is missed on the day)
- The CEO types and holds every private key and credential himself. I never see or receive a private `age` key, a Backblaze master/read/upload key, or a password.
- Screen sharing is off whenever a secret is actually on screen. Only the **public** `age1...` lines and Backblaze **capability names** (e.g. `writeFiles, listFiles`) are ever shown to me.
- Every restore in this session goes into a **new, throwaway database**, never production. It is destroyed at the end of the session.
- If any step fails, we stop, write down exactly what happened, and do not proceed to the next step on top of an unconfirmed one.

## 1. What must exist before 11:00 on 17 Nov (CEO, on his own machine, per `38`)
- [ ] `age` installed, `age --version` works.
- [ ] Two key files exist (`gco-backup-primary.txt`, `gco-backup-recovery.txt`), each produced by `age-keygen`.
- [ ] The two **public** `age1...` lines are ready to read aloud and will be confirmed by voice (first/last 8 characters) before use.
- [ ] Backblaze: the B2 command-line tool is installed (`b2 version` works) and the CEO is signed in with his own master key.
- [ ] A decision on who holds the **recovery** key custodian role, and that it has actually been handed to them (not just planned).

If any of these is not yet true, the session is still useful — we do whichever of these we can, and treat the rest as the next session's agenda, rather than skipping verification steps to "finish" artificially.

## 2. Step-by-step run order
| # | Step | Who runs it | Command / action | Pass condition |
|---|---|---|---|---|
| 1 | Safety check | Both | Password manager open; `gco-keys` folder confirmed not synced to any cloud drive; screen share off | Confirmed verbally |
| 2 | Key round-trip | CEO | `age-keygen` already done; encrypt a throwaway file to both public keys, decrypt with each private key (commands in `38` Part B step 4) | Both decrypts print the original text |
| 3 | Backblaze key audit | CEO, read aloud | `b2 key list` | Upload key shows **only** `writeFiles, listFiles` scoped to the backup bucket; a separate read key exists with `listFiles, readFiles` only; neither shows `deleteFiles`, `readFiles` (on the upload key), `writeKeys` or `writeBucketRetentions` |
| 4 | Install on staging | Me | Install `age` on the staging host; create `/etc/gco-backup-age-recipients.txt` containing the two public keys the CEO reads aloud; confirm with `cat` that the file holds exactly two `age1...` lines and nothing else | File exists, two lines, no private key text (the encrypt script itself refuses to run otherwise) |
| 5 | Real encrypted backup | Me, on staging | Produce a staging dump, then `scripts/encrypt-backup.sh <dump> <dump>.age /etc/gco-backup-age-recipients.txt` | Script prints `ok: ... (N recipients, sha256 ...)`; file is non-empty and starts with the `age-encryption.org/v1` header |
| 6 | Upload | Me | Upload the `.age` file with the **upload-only** key (never the master key) | Upload succeeds; confirm the key used had no delete permission, so this alone proves the restricted key is sufficient |
| 7 | Offsite download | CEO | Using the separate **read** key (kept off the server), download that file from Backblaze to his own machine | File downloaded, size matches |
| 8 | Decrypt | CEO, on his own machine | `AGE_IDENTITY_FILE=<his private key file> scripts/decrypt-backup.sh <downloaded>.age <plain-dump>` (he runs this, not me — the private key never leaves his machine) | Script prints `ok: N bytes written`; plain dump exists only on his machine |
| 9 | Restore and verify | Me, given the plain dump path | `SOURCE_URL=<staging DB, not production> scripts/restore-drill.sh` against a copy seeded to match, or a direct `pg_restore` of the decrypted dump into a new scratch database, followed by the same row-count/migration/tenant-isolation checks the script runs | `PASS` line: identical row counts, migrations applied, 0 tenant-isolation violations |
| 10 | Cleanup | Both | Drop the scratch database; delete the plain decrypted dump from the CEO's machine; confirm the `.age` file is the only copy that persists (in Backblaze, under the lifecycle rule) | Confirmed verbally, both sides |
| 11 | Object Lock scratch test (if time allows) | Both | Exactly the 7 steps in `56` §2, on a **new, empty** scratch bucket — never the production bucket | Each of steps 3–5 in `56` behaves as predicted; any surprise is written down, not assumed away |

## 3. What this session does **not** cover (deliberately out of scope for 17 Nov)
- Changing the **production** backup job to use real keys — that is a separate, later step, done only after this session passes and with the CEO's written approval (per `56` §1 "Afterwards").
- The production Backblaze bucket itself — only a new scratch bucket, if time allows (step 11).
- Any DNS, SMTP or email configuration — unrelated, on hold per the CEO's instruction pending the Zoho/Google audit (`60`).

## 4. Results template (to be filled in during/after the session — this section is currently empty on purpose)
| Step | Result (PASS/FAIL/NOT RUN) | Notes |
|---|---|---|
| 2. Key round-trip | | |
| 3. Backblaze key audit | | |
| 4. Install on staging | | |
| 5. Real encrypted backup | | |
| 6. Upload | | |
| 7. Offsite download | | |
| 8. Decrypt | | |
| 9. Restore and verify | | |
| 10. Cleanup | | |
| 11. Object Lock scratch test | | |

**Overall:** [PASS / PARTIAL / BLOCKED — to be written after 17 Nov, not before]

## 5. After the session
- If all of steps 2–10 pass: write the one-page repeatable procedure (promised to the CEO) and bring the production cutover request to him in writing, separately.
- If anything fails: stop, document exactly what failed and why, and bring options to the CEO rather than retrying silently.
- Either way, this becomes an input to the final release-readiness report (`59` §6, release sequence), alongside the coverage drill the same afternoon.
