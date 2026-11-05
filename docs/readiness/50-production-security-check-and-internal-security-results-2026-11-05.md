# 50 — Production read-only security check and internal security results (5 Nov 2026)

CEO approval: two emails of 5 Nov 2026 ("I approve the exact read-only production security check you described"). The check list was confirmed by the CTO in chat before running. **Independent penetration testing is on hold (no budget): no request was sent to 7ASecurity, SEC Consult or Cure53.** Nothing was bought, created or installed.

## 1. How the check was run
- One read-only script, two SSH sessions as `gco` to the production host, 5 Nov 2026 01:28 UTC, one follow-up count query at 01:30 UTC, and a header check from the CTO's workstation.
- Read only: setting **names** and non-secret values (`AI_PROVIDER`, `AI_MASTER_SWITCH`), yes/no for the OpenAI key, counts and flags from the database inside `BEGIN READ ONLY`, file **presence** (never contents), listening ports, firewall and SSH settings, timer and backup file names and sizes, free disk.
- Not read: `.env`, `.env.ai`, `/etc/gco-backup-b2.env`, any key, password, name, email or message.
- Honest note: on the first run, `docker compose exec` consumed the rest of the piped script after section 3, so sections 4 to 11 did not run. They were re-run in a second session with stdin closed. No command in either run writes anything.

## 2. Results
| # | Check | Result | Status |
|---|---|---|---|
| 1 | Deployed code | `d9af8dc` (12 Oct 2026), **24 uncommitted changed files** in the server tree (unchanged since 3 Nov) | As expected; release not deployed |
| 2 | Services | postgres, redis, realtime healthy 5 weeks; web healthy 3 weeks; worker up 3 weeks (no health check defined). Rollback tags `pre-release-20261029` present for web, worker, realtime | OK |
| 3 | Migrations | **16 applied, 0 failed**, latest `20261012065733_two_factor` | OK |
| 4 | AI | `AI_PROVIDER=mock` in web, worker and realtime; `AI_MASTER_SWITCH` unset (this version predates the switch) | **AI is not calling any provider.** The switch itself goes live only with the release |
| 5 | OpenAI key | **absent** from all three running containers; `.env.ai` file absent. `.env` itself was not read | Better than recorded in `48` (blocker 15); confirm `.env` holds no key when the release is prepared |
| 6 | Security headers (public site and app, through Cloudflare) | Present: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`. **Missing: `Strict-Transport-Security`, `Content-Security-Policy`. `X-Powered-By: Next.js` is exposed** | Gap: fix F1 is built but not deployed |
| 7 | Network | Public: 22 (SSH), 80, 443 only. Application ports 3000, 3001, 3200, 3201 and Caddy admin 2019 bound to `127.0.0.1`. **Postgres and Redis not listening on the host.** Firewall (ufw) active: allows 22, 80, 443 from anywhere | OK; SSH is open to the whole internet |
| 8 | SSH | Password login **off**, keyboard-interactive **off**, key login on, root login `prohibit-password` (root by key only) | OK; root login could be set to `no` |
| 9 | Accounts | 7 users. **All 5 demo accounts are disabled** (changed 12 Oct, last used 28 Sep). Active: **1 Founder (`CEO_ADMIN`) and 1 Hunter**; manager, operator and client accounts are all demo and disabled. **0 active accounts use two-step sign-in. No CTO account.** 7 live sessions, all for active accounts | Demo accounts: done (corrects `48` blocker 5). **2FA: open** |
| 10 | Backups | Nightly timer active; newest dump 4 Nov 03:34 UTC (902,672 bytes), 2 and 3 Nov present. **Offsite upload to Backblaze B2 verified by the backup script on 3 and 4 Nov.** `age` **not installed**, recipients file **absent**: **backups are plain (unencrypted), on the server and offsite**. B2 key permissions were not checked (the credentials file was not read) | **Open: encryption, restricted key, offsite restore** |
| 11 | Disk | 58 GB free of 150 GB (61% used) | OK |

Also seen: `gco-staging-web/worker/realtime` images exist on the production host; whether staging containers run in a separate project was not checked.

## 3. Internal security checks (free tools, CTO workstation)
| Check | Result |
|---|---|
| Typecheck | clean, branch `p0/first-client-readiness` at `3789652` |
| Unit tests (incl. tenant guard, RBAC, route permissions, webhook signing, rate-limit keys, TOTP, secret strength) | **744 of 744 passed** today |
| Integration tests (real Postgres/Redis: tenant controls, webhook route and dedup, rate limits, client-portal leak tests) | **Not re-run today**: no local Postgres/Redis runtime on this workstation, and installing one needs approval. The 4 Nov result (**229 of 229 in 3 runs**, `48` §6) is on `8179167`; only two documents changed since, so it applies to the same code |
| End-to-end | 4 Nov on the same code: 307 passed, 2 skipped, 2 AI-only specs fail with AI off by design |
| Dependency audit (`npm audit --omit=dev`) | **2 high**: `zod` 3.25.76 (advisory GHSA-mrhx-c7xc-m3w5, memory exhaustion validating oversized constrained collections) and `openai` through it. The fix is `zod` 4, a major upgrade. Production runs the same `zod` 3 line |

Mitigation in place for the zod issue: the client webhook rejects bodies over 1 MB **before** parsing and caps events at 100.

### 3.1 Fix applied on the release branch (5 Nov, local, not deployed, not committed)
- `zod` 3.25.76 → **4.6.7** (released 12 Oct 2026) and `openai` 4.104.0 → **6.49.0** (released 23 Jul 2026; 7.x skipped because 7.51.0 was published the same day). `npm audit --omit=dev`: **0 vulnerabilities**.
- Code changes for zod 4: `z.record` now takes a key schema (`app/api/v1/admin/integrations/route.ts`); `invalid_type_error`/`errorMap` replaced by `error` with the same messages (`lib/crm/money.ts`). No test or screen depends on zod's own error wording (API error text from zod will read slightly differently).
- **Separate defect found and fixed:** `.gitignore` had `coverage/`, which also matched `app/api/v1/shifts/coverage/`, so that route (used by the manager shift planner and E2E spec `40`) **was never committed**. It existed only on the workstation, so the earlier gate runs passed, but a release from a clean `git archive` would have shipped without it. The rule is now `/coverage/` and the route is added. It was the only source file hidden this way.
- Results after the fix: typecheck clean, lint clean, **unit 744 of 744**, production build OK (coverage route present). Integration and E2E **not re-run** (no local Postgres/Redis on this workstation); they must be re-run in G1 on the frozen tag.

### 3.2 Request-size review (unauthenticated JSON routes)
| Route | Ceiling before parsing | Note |
|---|---|---|
| Client webhook, moderation ingest | Declared size **and** actual bytes (1 MB) | OK |
| Public contact, careers apply | Declared `Content-Length` only (20 KB) | A request without `Content-Length` (chunked) is not limited |
| Login, accept invitation, 2FA routes | **None** | Login also parses the body **before** its rate limit. Flat schemas with bounded fields, so the zod collection issue does not apply; the risk is memory use per request up to the edge's upload limit. bcrypt caps password work at 72 bytes, so no CPU risk |
**Fixed (5 Nov, local, not deployed, not committed):** `lib/api/body.ts` `readJsonWithLimit` reads the body stream and stops with `413` as soon as the limit is passed, whether or not `Content-Length` is sent; malformed or empty JSON stays `400`. Used by login, accept invitation, change password and the four 2FA routes (8 KB) and by the contact and careers forms (their existing 20 KB). The client webhook keeps its own 1 MB check (core pipeline, unchanged). The login rate limit stays after parsing because it is keyed on IP **and** email; with the 8 KB cap the parse before it is bounded. 5 new unit tests (`tests/unit/readJsonWithLimit.test.ts`), including a chunked body with no `Content-Length` and byte-versus-character counting. After the change: typecheck and lint clean, **unit 749 of 749**, production build OK. Not tested against a running server (no local Postgres/Redis); covered by G1 E2E on the frozen tag.

## 4. Remaining vulnerabilities, ranked
1. **Backups are unencrypted, on the server and in Backblaze**, and the B2 key's permissions are unverified (it may be able to delete). No offsite restore has ever been proven.
2. **No privileged account uses two-step sign-in** (Founder active without it; no CTO account).
3. **HSTS and CSP missing, `X-Powered-By` exposed** on production (F1 not deployed).
4. **`zod` high-severity advisory** (denial of service by memory) in production and in the release branch.
5. **SSH open to the whole internet** (key-only, so low risk; brute-force protection was not checked).
6. **Server tree has 24 uncommitted files**; deployments from a workstation are not reproducible.
7. **Failure alerts do not reach anyone** (watchdog not installed), so a failed backup would go unnoticed.
8. Access from India to real client data is a policy, not a technical control (`48` blocker 8).

## 5. Must be fixed before onboarding real clients
| Item | Needs |
|---|---|
| Encrypted backups with a restricted B2 key, and an offsite restore proven on staging | CEO at the computer to create keys (`38`); approval to install `age` (free, open source) |
| Release deployed after gates G1 to G6 (brings F1 headers, AI master switch, 2FA enforcement code) | CEO's written approval and window |
| Two-step sign-in enrolled and enforced for Founder and CTO; CTO account created | After the release |
| `zod` 4 and `openai` 6 upgrade (done locally, §3.1) and the byte-limited body reading (done locally, §3.2) re-tested with integration and E2E on the frozen tag | CTO; part of the release gates |
| Failure alerts installed (watchdog plus relay) | CEO approval of the Workspace relay |
| Legal, GDPR, invoicing and operator agreements reviewed (`49`) | Lawyer and accountant |

**Should follow soon (not blocking a small fictional-data rehearsal):** root SSH login set to `no`; SSH limited to known addresses or fail2ban; `X-Powered-By` removed; worker health check; OWASP ZAP scan on staging (free).

## 6. Costs asked for (Hetzner's own page, read 5 Nov 2026; prices excluding VAT, IPv4 included)
| Item | Plan | Price | Estimate |
|---|---|---|---|
| 48-hour load test (server deleted afterwards) | CPX32, 4 vCPU, 8 GB, Nuremberg | €0.0577/hour | **€2.77** (about **€3.30** if 19% German VAT applies) |
| Separate staging server with fictional data (recommended) | CPX22, 2 vCPU, 4 GB, 80 GB | €19.99/month, €0.0320/hour | **€19.99/month** (about **€23.79** with 19% VAT); Hetzner's optional backups add 20% (about €4.00), not needed for fictional data |
| Smaller staging (not recommended: the stack needs about 1.1 GB plus Postgres headroom) | CPX12, 1 vCPU, 2 GB | €11.99/month | €11.99/month |
| Staging on the existing production server | — | €0 | Not recommended for a client sandbox: shares disk, memory and access with production |

Exact figures (VAT treatment of the account, any price change) must be confirmed in the Hetzner console before anything is created. Nothing has been created.
