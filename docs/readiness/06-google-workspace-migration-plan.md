# 06 — Google Workspace migration plan (plan only — nothing executed)

**Nothing was changed:** no subscription, account, alias, MX/DNS record, mail routing or mailbox. No mailbox content was read. This plan can be read without opening the codebase. The shorter option analysis from earlier work is in `docs/email-google-workspace-plan.md`; this document is the complete plan requested in the brief.

## 1. Current-state inventory (from repository documentation — **verify live before acting**)

| Item | What the documents say | Verified live? |
|---|---|---|
| DNS host | Cloudflare, Free plan, nameservers set at the registrar, DNSSEC not enabled, mail records "DNS only" | No (no Cloudflare access) |
| Mail provider | **Zoho Mail EU**, organisation `gco`, **Free plan** | No |
| Mailboxes | `founder@globalconversationoperations.com` (Cristian, Super Admin) and `mdsohail@…` (Administrator) — **two** | No |
| Aliases / groups / forwarding rules | not documented — **unknown**, must be exported from the Zoho admin console | No |
| MX | `mx.zoho.eu` (10), `mx2.zoho.eu` (20), `mx3.zoho.eu` (50) | No |
| SPF | `v=spf1 include:zohomail.eu ~all` (single record) | No |
| DKIM | Zoho selector `zmail` | No |
| DMARC | `v=DMARC1; p=none; rua/ruf=mailto:founder@…; sp=none; adkim=r; aspf=r` | No |
| Applications that send mail | **None today.** The platform sends no email (`docs/careers-applications.md`: "Email notifications: NOT implemented"). An optional SMTP channel was built and is **off** (`SMTP_URL` empty). The website shows `founder@…` as the contact address; the DMARC reports go to the same address. | Code verified |
| Historical email to keep | unknown — **CEO decision** | — |

**Constraint found:** Zoho's *Free* plan, per Zoho's pricing page, does **not** include IMAP/POP/ActiveSync. Google's standard mail-migration tools typically read the old mailbox over IMAP, so a mailbox on the free plan may need a **temporary paid Zoho plan, a Zoho export (EML/mbox) with a file import, or manual forwarding** to bring history across. This is the main technical risk to validate first.

## 2. Requirements and account plan

- Plan: Google Workspace **Business Starter** is the likely minimum (custom-domain email, admin console; storage and feature limits to be read from Google's current plan page); Standard/Plus only if more storage or retention/vault is needed. **EUR price not verified** (the pricing page shown to the tool used INR) — the CEO should read the EUR price at sign-up.
- Seats: 2 (founder, administrator). Optional free **groups** for role addresses (`support@`, `billing@`) instead of paid seats.
- Domain verification: a TXT record (`google-site-verification=…`) in Cloudflare — added **before** any MX change.
- Admin ownership: the CEO is the **super admin**; a second super admin (the CTO) and a recovery email/phone not on the same domain; 2-step verification enforced.

## 3. Proposed mailbox and group mapping

| Address | Target | Note |
|---|---|---|
| `founder@` | Google user (Cristian) | public contact address; keep as is on the website |
| `mdsohail@` | Google user (administrator) | or demote to an alias if not needed |
| `support@`, `billing@`, `security@` (future) | Google **groups** (no seat) or aliases of `founder@` | create only when needed |
| `dmarc@` (future) | group to receive DMARC reports | avoids reports depending on one person's mailbox |

## 4. Historical email

Decision for the CEO: (a) start clean, (b) migrate everything, (c) migrate the founder's mailbox only. If migrating: validate with a **test mailbox** first; options are Google's data-migration service (needs IMAP — see constraint), a Zoho export + import, or a temporary Zoho paid month. Do not open message contents during planning; compare folder and message counts only.

## 5. DNS and MX changes (Cloudflare, all **DNS only**, not proxied)

| Name | Type | Value | When |
|---|---|---|---|
| `@` | TXT | `google-site-verification=<token>` | step 2, before cutover |
| `@` | TXT (SPF) | `v=spf1 include:_spf.google.com ~all` (Option A, Zoho retired) or `v=spf1 include:_spf.google.com include:zohomail.eu ~all` (while both send) — **exactly one SPF record** | step 4 |
| `google._domainkey` | TXT | public key generated in the Google admin console (2048-bit) | step 4, before cutover |
| `@` | MX | `smtp.google.com` priority 1 (or Google's five legacy MX records) | step 6 (cutover) |
| old Zoho MX | — | remove only after validation | step 8 |
| `zmail._domainkey` | TXT | keep until Zoho is retired | step 8 |
| `_dmarc` | TXT | unchanged `p=none` initially | see §6 |

Lower the MX TTL to 300 s 24 hours before cutover.

## 6. SPF, DKIM, DMARC plan

1. SPF merged into one record (stay under 10 DNS lookups); 2. publish the Google DKIM key and start authentication in the admin console until it shows "authenticating"; 3. keep DMARC `p=none` for 2–4 weeks and read the aggregate reports at a group address; 4. tighten to `p=quarantine; pct=25 → 100`, then `p=reject` only after a clean month. Any future sender using the domain (the optional SMTP channel, a CRM tool, a billing tool) must be added to SPF/DKIM first.

## 7. Application changes

None required for the platform to keep working (it does not send mail). If the optional notification email channel is switched on, set `SMTP_URL`/`SMTP_FROM` (Google SMTP relay or an app password) — this needs an approved credential and the SPF/DKIM above. The website contact address stays `founder@`.

## 8. Deliverability and sender verification tests

Before and after cutover: send to/from Gmail, Outlook and a neutral test inbox; check "Show original" for `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`; check the Google admin email log; confirm the website contact form's `mailto:` and any printed address.

## 9. Cutover sequence and expected impact

1. T-24h: lower TTL; back up/export Zoho mailboxes. 2. Create the Workspace account, add and verify the domain (Zoho keeps working). 3. Create users, groups, aliases. 4. Publish SPF + Google DKIM; start DKIM. 5. Migrate history (if chosen). 6. **Change MX to Google** — mail now arrives in Google; senders retry for hours if they hit the old MX during propagation. 7. Run the §8 tests. 8. After a 30-day quiet period remove Zoho MX leftovers, `zmail` DKIM and the SPF include; cancel Zoho.
**Expected impact:** minutes to a few hours of mixed delivery around step 6; **no loss expected** because senders retry, but a mistake in step 4–6 can bounce or misroute mail. Do it in a low-traffic window with the CEO present.

## 10. Rollback

Within the first 30 days: set MX back to the three Zoho records (TTL is short), keep Zoho active; mail sent during the Google window stays in Google (re-forward or export it). SPF may keep both includes during the whole window. Rollback is safe only while the Zoho account still exists — do not cancel it early.

## 10b. Preserving all existing email, and a REHEARSED rollback (CEO requirement)

The CEO requires that **existing emails are preserved** and that a **tested rollback plan exists before anything changes**. Nothing here has been executed.

**Preservation rules**
1. Take a **complete export of every Zoho mailbox before any change** (Zoho export of each mailbox to EML/mbox, stored in a CEO-controlled location) and record per-folder message counts. This export is the safety net independent of any migration tool.
2. **Never delete or downgrade the Zoho account or mailboxes until 30 days after cutover** and until the validation in §11 passes; Zoho stays the source of truth for history until then.
3. Migrate history by **copy, not move**; compare counts (per folder) between Zoho and Google after migration; sample a few messages by subject only.
4. Keep all aliases/forwarders documented before cutover and recreate them in Google; test each alias.

**Rehearsal on a throwaway domain (no impact on the real domain)** — recommended before the real cutover:
1. Register a cheap test domain (or use a subdomain such as `mail-test.<domain>` if the CEO approves; cost is small and one-time) and add it to a **Google Workspace trial/test account**.
2. Create a Zoho **test mailbox on the test domain** with a handful of dummy messages in several folders.
3. Perform the full sequence of §9 on the test domain: DNS (TXT, SPF, DKIM), migration (IMAP or export/import), MX change, delivery tests from Gmail/Outlook, DMARC check.
4. **Rehearse the rollback:** set the test domain's MX back to Zoho, send new messages, confirm delivery returns to Zoho and nothing sent during the Google window is lost (it stays in Google and can be re-forwarded or exported).
5. Record timings (DNS propagation observed, migration duration), problems found, and update this plan. Only when the rehearsal rollback worked is the real cutover scheduled.

**Go/no-go for the real cutover:** export taken and verified; rehearsal completed including rollback; CEO present; low-traffic window; TTL lowered 24 h before; a person assigned to send and receive test mail from outside.

## 11. Post-migration validation

DMARC aggregate reports show only expected senders; no bounce reports; the CEO confirms receiving external mail; calendar/recovery settings checked; Zoho shows no new mail for a week.

## 12. Ownership and account recovery

Super admin = CEO; second super admin = CTO; recovery contact not on the domain; 2-step verification for admins; document where recovery codes are kept (owner's vault, never the repository); register the Workspace account in the infrastructure-accounts inventory (`08`).

## 13. Estimated costs

Recurring: seats × EUR price (**Unknown**, see `05`), plus VAT as applicable. One-time: €0 external if done in-house; a temporary Zoho paid month **only if** IMAP is needed (**Unknown**). Optional: Google Vault/Plus plans.

## 14. What needs CEO approval, access or coordination

| Need | Who |
|---|---|
| Decide Option A (everything on Google) or C (Google for founder, Zoho for the rest, split delivery) — recommendation **A** | CEO |
| Purchase the subscription and own the super-admin account | CEO |
| Zoho admin access (export mailboxes, aliases, forwarding list) | CEO |
| Cloudflare access to add/change DNS records | CEO / CTO |
| Choose whether to migrate old mail | CEO |
| Maintenance window and a person to test | CEO + CTO |
