# Founder email on Google Workspace — plan for `founder@globalconversationoperations.com`

**Status:** plan only. **No DNS record, mailbox or provider setting has been changed.** DNS is at Cloudflare and mail is at Zoho Mail EU today; changing either needs the founder's admin access.

## 1. What exists today (from `docs/disaster-recovery.md` §5–6)

| Item | Value |
|---|---|
| Mail host | Zoho Mail EU, org `gco`, **Free plan** |
| Mailboxes | `founder@` (the founder, Super Admin) and `mdsohail@` (Administrator) — only two |
| MX | `mx.zoho.eu` (10), `mx2.zoho.eu` (20), `mx3.zoho.eu` (50) |
| SPF | `v=spf1 include:zohomail.eu ~all` (exactly one record) |
| DKIM | selector `zmail` (Zoho) |
| DMARC | `v=DMARC1; p=none; rua=mailto:founder@…; ruf=mailto:founder@…; sp=none; adkim=r; aspf=r` |
| DNS | Cloudflare, mail records are **DNS only** (grey cloud) |
| Used by the product | `founder@` is the public contact address (`lib/content/site.ts`) and the DMARC report address |

The authoritative statement of "mail works" is the 2026 test: SPF, DKIM and DMARC all passed in Gmail.

## 2. The constraint that decides everything

A domain has **one** active set of MX records. The same address (`founder@`) can therefore live in **one** mailbox system only. Having `founder@` on Google while other addresses stay on Zoho is possible in only one clean way: **point MX at Google and have Google hand non-Google recipients to Zoho ("split delivery")**. The alternative is moving everyone to one provider.

## 3. Options

| | A. Everything on Google Workspace | B. Everything stays on Zoho | C. Google for the founder, Zoho for the rest (split delivery) |
|---|---|---|---|
| Founder gets Google Workspace | yes | no | yes |
| Moving parts | lowest long-term (one system) | none | highest (two systems, routing rule, SPF/DKIM for both) |
| Cost | Google seats for 2 people (paid) | free Zoho plan | Google seat for the founder + Zoho free for the rest |
| Risk of lost mail during change | low: only 2 mailboxes to migrate | none | medium: routing rule must be right; test first |
| Needs | migrate `mdsohail@` mailbox and history | — | Google admin routing + Zoho still accepts mail for the domain |

**Recommendation: A**, because there are only two mailboxes, so consolidation is trivial and removes the whole class of "mail landed in the other system" problems. Choose **C** only if keeping the free Zoho plan for role mailboxes (`support@`, `billing@`, …) matters. **Do not** run both providers with MX on both or "equal priority" — mail would be delivered randomly to either.

I could not verify Google's current Admin-console wording for split delivery from this environment; follow Google's current "split delivery" guide when doing C, and pilot it first (§6).

## 4. Target DNS (A or C — MX points at Google)

Apply in Cloudflare, all **DNS only**:

| Name | Type | Value | Notes |
|---|---|---|---|
| `@` | MX | `smtp.google.com` priority `1` | Google's current single-record setup. (Legacy alternative: the five `aspmx.l.google.com` records.) Remove the three Zoho MX **only after** the checks in §6 pass. |
| `@` | TXT | `google-site-verification=<token from Admin console>` | proves domain ownership; keep the existing Zoho verification TXT |
| `@` | TXT (SPF) | **A:** `v=spf1 include:_spf.google.com ~all`  **C:** `v=spf1 include:_spf.google.com include:zohomail.eu ~all` | **exactly one** SPF record; never add a second. Stay under 10 DNS lookups. |
| `google._domainkey` | TXT | public key generated in Google Admin (Gmail → Authenticate email), 2048-bit | start authentication in the console after publishing |
| `zmail._domainkey` | TXT | keep as is **(C only)**; remove after Zoho is retired (A) | Zoho mail keeps signing with its own selector |
| `_dmarc` | TXT | start unchanged (`p=none`) | tighten later, see §5 |

## 5. DMARC roll-out (after the switch)

1. Keep `p=none` for 2–4 weeks and read the aggregate reports sent to `rua`. Every legitimate sender (Google, Zoho in C, any billing/CRM tool that sends as the domain) must pass SPF or DKIM **aligned** with `globalconversationoperations.com`.
2. Move to `p=quarantine; pct=25`, then 50, then 100 if reports stay clean.
3. Move to `p=reject` only when nothing legitimate fails for a full month.
4. Keep `rua` pointing at a mailbox that survives the migration. Send app mail (invitations, reports) through an authenticated sender included in SPF/DKIM — the platform does not send email yet (invitation links are shown to staff and passed on manually).

## 6. Cut-over runbook (A)

1. **24 h before:** lower TTL of the MX records to 300 s. Export/back up the Zoho mailboxes (IMAP backup or Zoho export).
2. Create the Google Workspace account, add the domain, verify with the TXT record (Zoho keeps working).
3. Create `founder@` and `mdsohail@` in Google; add the domain aliases you need (`support@`, `billing@`) **before** the switch.
4. Publish SPF (merged record), the Google DKIM TXT, then in Google Admin start DKIM authentication; wait until it shows **authenticating**.
5. Migrate old mail with Google's data-migration tool (IMAP from Zoho).
6. Change MX to Google. Mail now arrives in Google. Keep Zoho MX out; keep the Zoho account alive for 30 days (rollback = put the Zoho MX back, TTL is short).
7. **Verify:** send to and from Gmail, Outlook and a test inbox; open "Show original" and confirm `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`; check Google's Admin email-log search; confirm the website contact form and any address printed on the site still deliver.
8. After 30 quiet days: remove Zoho records (MX already gone; `zmail._domainkey`; `include:zohomail.eu`), cancel Zoho.

**C (split delivery)** differs only at step 6: after MX goes to Google, add the Zoho mail server as a routing host and route recipients that are *not* Google users to Zoho; test with a throwaway address on each side before announcing. Outbound mail from Zoho mailboxes keeps working because SPF includes both.

## 7. Uninterrupted delivery checklist

- [ ] Founder's written go-ahead and Cloudflare + Zoho + Google admin access in one session
- [ ] TTL lowered 24 h before
- [ ] Mail backup taken
- [ ] SPF is a single merged record; DKIM published and authenticating **before** MX changes
- [ ] Test matrix passed (send/receive: Gmail, Outlook, Zoho (C), forwarding)
- [ ] `PUBLIC_EMAIL` stays `founder@…` (no code change needed)
- [ ] DMARC reports reviewed before tightening

## 8. What I need from the founder

1. A or C?
2. Google Workspace plan/seats confirmed (billing is theirs).
3. A scheduled 1–2 hour window and admin access to Cloudflare, Zoho and Google.
