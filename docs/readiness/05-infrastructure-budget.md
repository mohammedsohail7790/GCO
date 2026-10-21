# 05 — Infrastructure budget (target €150 / month, **all-inclusive**)

## 0. Update 2026-10-21 — CEO-confirmed figures and the all-inclusive monthly picture

The CEO confirmed the Hetzner invoice lines and the subscription estimates. Figures marked *CEO* are taken from the CEO's message, not from an invoice I could see. Nothing was purchased, upgraded or changed.

| # | Item | Monthly, before VAT | Source | Notes |
|---|---|---|---|---|
| 1 | Hetzner CPX32 server | €35.49 | CEO | |
| 2 | Hetzner server backups option | €7.10 | CEO | |
| 3 | Hetzner primary IPv4 | €0.50 | CEO | subtotal Hetzner **€43.09** (matches the CEO's figure) |
| 4 | Google Workspace, 2 mailboxes | ≈ €14–16 | CEO (estimate) | confirm EUR price on the sign-up page; annual vs flexible billing changes it |
| 5 | Claude Pro | ≈ €20 | CEO (estimate) | |
| 6 | ChatGPT Plus | ≈ €20 | CEO (estimate) | |
| 7 | Backblaze B2 (offsite dumps) | ≈ €0 now | vendor page | first 10 GB free; see row 3 below |
| 8 | Cloudflare Free, Zoho Mail Free (until migration), GitHub Free | €0 | repository docs | Zoho ends after migration; GitHub org plan must be Free |
| 9 | Domain `globalconversationoperations.com` | **unknown** — annual price ÷ 12 | not supplied | typically €1–2 per month spread over a year; read the registrar invoice |
| 10 | UptimeRobot, Calendly | unknown (free tiers likely) | not supplied | |
| | **Subtotal before VAT (items 1–6)** | **€97.09 – €99.09** | | €43.09 + €14–16 + €20 + €20 |
| | + domain (assume ≤ €2) | **≈ €99 – €101** | | |

**Headroom against €150: about €49–€51 before VAT**, i.e. the target is met on the figures supplied, with room for the domain, monitoring and a possible error-tracking plan. This is an estimate built from the CEO's numbers; it becomes a confirmed budget when the domain, UptimeRobot/Calendly and the first real invoices are in.

### VAT — what changes the total and what is not yet known

VAT depends on how the business is taxed, which only the accountant (Fiscozen) can confirm. Three cases:

| Case | Effect |
|---|---|
| Vendor charges VAT and it is **deductible** (ordinary regime) | VAT is not a real cost; cash-out is higher, net cost is the before-VAT number |
| Vendor charges VAT and it is **not deductible** (e.g. flat-rate "forfettario" regime — to be confirmed) | VAT is a real cost — use the worst case below |
| Business customer with a valid EU VAT ID in the vendor's account | Hetzner (Germany) / Google (Ireland) can invoice **without** local VAT and the Italian reverse charge applies; the VAT ID must be entered in each vendor account |

Worst case, VAT fully non-deductible and charged on everything: Hetzner at German 19% = €51.27; Workspace €16 × 1.22 = €19.52; Claude Pro and ChatGPT Plus (consumer plans — their displayed EU price may already include VAT; if not, ×1.22 = €48.80). Total ≈ **€110.8 – €119.6 plus domain**, still below €150. Rates quoted are the standard statutory rates (Germany 19%, Italy 22%) and should be confirmed by the accountant.

### Questions to put to the accountant (Fiscozen)

1. Which tax regime applies (ordinario vs forfettario) — decides whether VAT on these costs is deductible.
2. Should the VAT ID be entered in the Hetzner and Google accounts (reverse charge)?
3. Can the Claude Pro / ChatGPT Plus subscriptions be invoiced to the business (consumer plans normally invoice the individual; business plans cost more).
4. Registered business address for invoices (see `docs/business-details-and-vat.md`).

### Other costs not in the monthly sum

| Cost | Status |
|---|---|
| Accountant (Fiscozen) | excluded; CEO already pays it |
| Lawyer review of contracts | not budgeted (CEO: no lawyer budget) — drafts are provided, see `docs/legal-drafts/` |
| Error tracking / paging | optional; free tiers exist; not enabled |
| AI usage | €0 — disabled; a spending cap is required before enabling |
| Second server for staging | not needed yet; staging can run on demand on the production host only after the memory check in `03-staging-setup.md` |

---

**CEO clarification (2026-10-20):** the €150 per month target covers **all existing infrastructure and services together**, not only new ones. The CEO will supply the missing billing information. When it arrives, fill the *Monthly estimate* column of the table below for every row (including rows that look free) and add the rows' sum; compare the sum with €150 before approving any new spend (Google Workspace seats, a staging server, monitoring).

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
