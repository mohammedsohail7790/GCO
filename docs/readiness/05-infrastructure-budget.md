# 05 — Infrastructure budget (target ≈ €150 / month)

**Bottom line: the €150 target can neither be confirmed nor rejected yet.** Only two things were verifiable from here (the repository and public vendor pages): the services in use, and that several of them are on free plans. **No invoice, billing page or account was accessible, and the vendor pricing pages checked did not show EUR prices to the tool used** (Google showed INR, Hetzner showed "from … /month" without an amount, Zoho showed no paid prices). **No price below has been inferred from a resource name.** Nothing was purchased, upgraded, cancelled or resized.

Confidence: **High** = vendor page or repository states it · **Medium** = documented in the repository, not re-verified · **Unknown** = needs an invoice, account access or a quote.

## 1. Table for the CEO

| # | Item | Purpose | Current configuration (source) | Known cost | Monthly estimate | Type | Confidence / source | Action needed |
|---|---|---|---|---|---|---|---|---|
| 1 | Hetzner Cloud server | runs web, worker, realtime, Postgres, Redis, Caddy | "ubuntu-8gb-nbg1-6", 8 GB class, Nuremberg (`docs/deployment.md`); account owned by Cristian | **Unknown** (invoice) | **Unknown** | recurring | Unknown | read the latest Hetzner invoice; note: the Hetzner pages checked listed 4 vCPU/8 GB plans (CX33, CAX21) but showed no price and a temporary "unavailable" notice |
| 2 | Hetzner extras (IPv4, snapshots/backups option, volume, traffic) | — | none documented | Unknown | Unknown (likely small) | recurring | Unknown | check invoice lines |
| 3 | Backblaze B2 | offsite database dumps | private bucket, SSE, EU; nightly dump of ~1 MB today (`docs/disaster-recovery.md` §9) | vendor page: **$6.95 per TB per month**, first **10 GB free**, egress free up to 3× stored, transaction classes A–C free (currency shown as "$" with no code) | **≈ €0** at current size (a year of nightly 1 MB dumps ≈ 0.4 GB, no expiry) — grows slowly; verify with a real dump size | recurring, usage-dependent | High (vendor page) for the rates; Medium for size | none; watch size once real data exists |
| 4 | Cloudflare | DNS and proxy | Free plan (`docs/disaster-recovery.md` §5) | Free plan | **€0** | recurring | Medium | none |
| 5 | Domain name `globalconversationoperations.com` | domain | registrar not documented | Unknown | Unknown (annual, typically small when spread monthly) | recurring (annual) | Unknown | find the registrar invoice and renewal date |
| 6 | Zoho Mail (EU) | current company email | Free plan, 2 mailboxes (`docs/disaster-recovery.md` §6) | vendor page: Forever Free Plan = hosting for one domain, up to 5 users, 5 GB/user, **no IMAP/POP/ActiveSync on the free plan** | **€0** | recurring | High (vendor page) | note the IMAP limitation for migration (see `06`) |
| 7 | Google Workspace (if approved) | founder email, possibly all mail | not purchased | page fetched showed prices in **INR** (Starter ₹270, Standard ₹864 intro, per user/month, excl. tax), so **no EUR figure verified** | **Unknown in EUR**: users × per-user price (+ VAT as applicable) | recurring | Unknown | ask the CEO to read the EUR price on the Workspace sign-up page; 2 users planned |
| 8 | UptimeRobot | external uptime monitor | documented as owner account; actual monitors "not configured" (`docs/disaster-recovery.md`) | free tier exists (not verified here) | **€0 – Unknown** | recurring | Unknown | confirm plan/monitors |
| 9 | GitHub | source hosting, CI minutes | personal account `mohammedsohail7790`; plan unknown | Unknown | Unknown (free for private repos on the free plan; Actions minutes limited — not verified) | recurring | Unknown | confirm plan; a GitHub organization may add cost |
| 10 | Calendly | public booking link | external account of the CEO | Unknown | Unknown | recurring | Unknown | confirm plan |
| 11 | Email delivery for app notifications | optional SMTP channel (built, off) | `SMTP_URL` empty | not applicable until chosen | **€0 now**; if Google Workspace SMTP is used no extra charge expected (unverified); transactional providers have free tiers (unverified) | optional recurring | Unknown | decide provider |
| 12 | Error tracking (Sentry or similar) | not integrated | none | — | €0 now; optional | optional recurring | n/a | decide and quote |
| 13 | AI / API usage | **disabled by CEO direction** | master switch off; no live calls | **€0** | **€0** | usage-dependent (future) | High | none; budget cap required before enabling (`technical-security-pack/08`) |
| 14 | Staging environment | owner testing | not deployed | n/a | **+0 on the same server if RAM allows** (≈1–1.5 GB, tight on 8 GB); a second small server would add its price (Unknown) | recurring | Medium | decide host after checking server memory headroom |
| 15 | Legal / accounting (Fiscozen, lawyer, security review) | not infrastructure | — | Unknown | excluded from the €150 unless the CEO says otherwise | one-time / recurring | Unknown | CEO to confirm scope |
| 16 | One-time setup/migration | Google Workspace migration, restore drill, staging deploy | labour only if done in-house | €0 external if in-house | one-time | Medium | none |

## 2. What can be said safely

- **Verified-free or near-zero:** Cloudflare (Free), Zoho Mail (Free), Backblaze B2 at current data size, AI (disabled).
- **Costs that decide whether €150 is met:** the Hetzner invoice, the Google Workspace seats (if approved), a second server for staging (only if the first lacks RAM) and any monitoring/email provider — all **Unknown** here.
- **No "total" is stated** because adding unknowns to knowns would be a made-up number. When items 1, 2, 5, 7, 9 and 10 are filled from invoices, the total is a simple sum of the Monthly column.

## 3. Costs requiring account access or vendor confirmation

1. Hetzner latest invoice and current server type and price (CEO owns the account).
2. Domain registrar and renewal price.
3. Google Workspace EUR price per user for the chosen plan and billing period.
4. GitHub plan (and the organization plan if one is created).
5. UptimeRobot plan; Calendly plan; any other subscriptions the CEO pays outside the repository.
6. A real production dump size to project B2 storage.

## 4. If the total exceeds €150 (options, none applied)

| Option | Saves | Trade-off |
|---|---|---|
| Keep Zoho Free for mailboxes other than the founder (split delivery) | Google seats | more complex DNS/routing (`06`) |
| Run staging on the production host | a second server | competes for RAM; a staging mistake could affect production — mitigate with resource limits |
| Run staging only on demand (`docker compose up/down`) | server hours if a separate server is used | staging not always available |
| Stay on free tiers for uptime/monitoring | monitoring fees | fewer checks, slower alerts |

Do **not** reduce: backups, the offsite copy, or production sizing without the CEO's approval.
