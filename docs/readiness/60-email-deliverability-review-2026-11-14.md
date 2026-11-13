# 60 — Email deliverability and email-domain security: technical review (14 Nov 2026)

**Status:** review and recommendations only. **No DNS record was changed, no email was sent, no test campaign was run, no mailbox or Google Workspace setting was opened.** The only things inspected are **public DNS records** of `globalconversationoperations.com`, read on 14 Nov through a public DNS resolver. Every change below needs the CEO's approval.

## 1. Why this matters now
The CEO reports a significant number of delivery failures on the Founder and Partnerships mailboxes while commercial outreach is expanding. A domain's sending reputation is slow to build and quick to damage; a new domain that starts sending cold email to many addresses can be throttled or junked by Gmail and others for months. The platform's own alert emails (backup failures, application notifications) will also use this domain, so its reputation protects our own operations.

## 2. What the public DNS shows (read 14 Nov)
| Record | Value found | Assessment |
|---|---|---|
| Name servers | Cloudflare | Fine. Mail records must stay "DNS only" (they are TXT/MX, which are never proxied) |
| MX | single record, priority 1, `smtp.google.com` | **Correct for Google Workspace.** Incoming mail goes to Google |
| SPF (TXT on the domain) | `v=spf1 include:_spf.google.com include:zohomail.eu ~all` | **Valid, but contains a leftover.** `include:zohomail.eu` authorises Zoho's EU mail servers to send as our domain. Our MX no longer points to Zoho (the Workspace migration in `16` moved it), so Zoho should no longer be needed. Every extra authorised sender widens who can send "as us". `~all` (soft fail) is acceptable while we monitor |
| SPF lookups | Google's include is flattened (IP ranges); Zoho's adds a nested include | Well under the limit of 10 DNS lookups, but verify with a checker after any change (a record over the limit fails silently) |
| DKIM, Google | `google._domainkey` present, **2048-bit RSA key** | Good strength. **The record being published does not prove Google is signing.** Signing must be switched on ("Authenticate email" in the Admin console); only a received message's headers can confirm it (see section 4) |
| DKIM, Zoho | `zmail._domainkey` present | **Leftover** from the old Zoho setup; harmless but should go when Zoho is deleted |
| Other Zoho records | `zoho-verification` TXT; a Zoho site-verification | Leftovers; keep until Zoho is deleted (`16`), then remove |
| DMARC | `v=DMARC1; p=none; rua=mailto:founder@…; ruf=mailto:founder@…; sp=none; adkim=r; aspf=r` | **Monitoring only: it tells receivers to take no action** on mail that fails authentication, so it gives **no protection against spoofing yet**. Reports go to the **Founder mailbox**: daily machine-written summary reports from large providers will arrive there and clutter it. `ruf` (failure reports) is rarely honoured and also lands there |
| Subdomains (`app`) | No separate mail records; inherits the domain policy (`sp=none`) | Fine; the platform sends no email yet |
| MTA-STS / TLS reporting | Not published | Optional hardening, low priority |
| CAA (which authorities may issue certificates) | Not published | Optional hardening, low priority |
| Public blocklist check (Spamhaus domain list) | The lookup returned a code that means "query refused through a public resolver", so the result is **inconclusive**, not a listing | Check the domain on the blocklist provider's own lookup page, from the CEO's browser |

## 3. What I could not see (and what that limits)
The actual **bounce messages** (the error codes decide the cause), the **message headers** of mail we send (they show whether SPF, DKIM and DMARC pass), the **Google Workspace Admin console** (DKIM signing status, email log, the Partnerships account type), **how and how much** the outreach is sent, and the **sending tools** in use (a sequencing tool or Zoho could be sending in parallel). So the diagnosis below is a short list of likely causes, not a conclusion.

## 4. Likely causes of the failures, and how to tell them apart
| Bounce code or text | Usual meaning | What it points to |
|---|---|---|
| `550 5.1.1` "user unknown", "address not found" | The recipient address does not exist | **List quality**: outreach to guessed or stale addresses. Most common cause by far |
| `550 5.7.1` with "authentication", "SPF", "DKIM", "DMARC" | The receiver rejected unauthenticated mail | A sender not covered by SPF/DKIM (for example a tool sending as our domain) |
| `550 5.7.1` "reputation", "spam", "rate limited", `421/450 4.7.x` | Too much, too fast, or a new domain | **Volume and warm-up**: reduce, spread out, send only to verified addresses |
| `552 5.2.2` mailbox full; `554 5.4.x` routing | Recipient problems | Not our fault; remove the address |
| Auto-replies, "out of office", delivery delay notices | Not failures | Ignore |
| Many "failure" mails from `mailer-daemon` to Partnerships | If Partnerships is a **Google group or alias**, bounces and auto-replies can route to many members | Check how the account is built |

## 5. Recommended actions, in order (each needs the CEO's written approval; nothing done)
1. **Collect evidence (no change):** forward me **5 to 10 representative bounce messages** with the full technical detail ("show original" in Gmail) and the recipient addresses blanked if he prefers. Also: what sends the outreach (Gmail by hand, a sequencing or marketing tool, Zoho), how many messages per day, and where the addresses come from.
2. **Check signing in Google Workspace (CEO, two minutes):** Admin console, Apps, Google Workspace, Gmail, **Authenticate email**: status should read "Authenticating email". Then send one normal mail to a personal Gmail address, open "Show original" and check **SPF, DKIM and DMARC all say PASS** with the domain `globalconversationoperations.com`.
3. **Clean the SPF** to `v=spf1 include:_spf.google.com ~all` **only after** confirming nothing still sends through Zoho (Zoho's admin shows recent sending). Remove the Zoho DKIM and verification records only when the Zoho account is deleted. This is the DNS change in `16` that was waiting for the migration to be completed.
4. **Fix where DMARC reports go:** point `rua` to a **dedicated mailbox or a free report-reading service** instead of the Founder mailbox, and drop `ruf`. Keep **`p=none` for 2 to 4 weeks**, read the reports to confirm every legitimate sender passes, then move to `p=quarantine` in steps (a percentage first), and later `p=reject`. Moving to enforcement too early would block real mail.
5. **Outreach hygiene, the biggest lever:**
   - verify addresses before sending; stop at once on any address that bounced; never resend to hard bounces;
   - start with **low volume** (a few dozen a day, rising slowly over weeks), personal, relevant messages, with a clear sender identity and an easy way to say "no more";
   - **do not run mass or automated campaigns from the main domain.** Cold outreach is best sent from a **separate domain or subdomain** so that a reputation problem cannot affect the main domain's business and platform mail. (A new domain costs money and needs a warm-up period: the CEO's approval before any purchase.)
   - cold business email is regulated (consent and opt-out rules differ by country, and Italy is strict): **the lawyer should confirm** what is allowed for B2B outreach.
6. **Free monitoring:** register the domain with **Google Postmaster Tools** (free; verification needs one DNS TXT record: a DNS change needing approval). It shows Gmail's view of our reputation and spam rate. Use the Admin console's email log search to trace individual failures.
7. **Sender configuration for people and tools:** every identity (Founder, Partnerships, the platform's alert sender) should be a real Workspace user or an alias on one; any outside tool sending as the domain must be added to SPF and given its own DKIM key; the platform's alert and notification emails go through the **Workspace SMTP relay** (prepared in `47`), which Google authenticates, so they inherit the domain's SPF and DKIM.
8. **Optional later:** MTA-STS and TLS reporting, CAA records.

## 6. What I need from the CEO
(1) The sample bounce messages and the outreach details in step 1; (2) the two-minute DKIM and headers check in step 2, or screenshots of the "Authenticate email" page; (3) whether anything still uses Zoho; (4) how the Partnerships account is built (user, alias or group); (5) written approval for each DNS or settings change when we reach it. **I will not change DNS or send test mail without it.**
