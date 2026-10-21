# 16 — Google Workspace: DNS backup and planned changes

Captured 2026-10-22 from **public DNS** (dig), before any change. Cloudflare dashboard values (proxied flag, TTL, comments) were not visible; **export the zone from Cloudflare (DNS → Records → Export) as the authoritative rollback copy before the first edit.**

## 1. Current records (rollback copy)
| Name | Type | Value | Note |
|---|---|---|---|
| `@` | A / AAAA | 104.21.74.233, 172.67.164.82 / 2606:4700:3035::6815:4ae9, 2606:4700:3030::ac43:a452 | Cloudflare proxy addresses (website) — **do not touch** |
| `app` | A | 172.67.164.82, 104.21.74.233 | proxied (platform) — **do not touch** |
| `@` | MX | 10 `mx.zoho.eu`, 20 `mx2.zoho.eu`, 50 `mx3.zoho.eu` | Zoho (to be replaced at cut-over) |
| `@` | TXT | `v=spf1 include:zohomail.eu ~all` | SPF (to be replaced) |
| `@` | TXT | `zoho-verification=zb89553762.zmverify.zoho.eu` | Zoho verification (keep until Zoho is deleted) |
| `zmail._domainkey` | TXT | Zoho DKIM public key (long RSA key, `v=DKIM1; k=rsa; p=MIIBIjANBgkq…`) | keep until Zoho is deleted; copy the full value from Cloudflare |
| `_dmarc` | TXT | `v=DMARC1; p=none; rua=mailto:founder@…; ruf=mailto:founder@…; sp=none; adkim=r; aspf=r` | already exists — we **edit** it, not add a second |
| `_domainconnect` | TXT | `api.cloudflare.com/client/v4/dns/domainconnect` | Cloudflare — leave |
| NS | | annabel.ns.cloudflare.com, armfazh.ns.cloudflare.com | leave |
No CAA, no `www`, no `mail` records seen publicly.

## 2. Step 1 — now (harmless)
Add one record only:
`TXT  @  google-site-verification=GkR0ZG0xdcM6fQEf8hQVF6UvpNbC6zKnFN9XRc6Mmnc` (TTL Auto). Then the CEO clicks **Verify**. Mail keeps flowing to Zoho; nothing else changes. Multiple TXT records at `@` are allowed.

## 3. Step 2 — cut-over (only after the CEO approves this table)
| Action | Record |
|---|---|
| Replace the three Zoho MX with Google's | `@ MX 1 smtp.google.com` (Google's current single-record setup; confirm in Admin → Domains → Set up Gmail, which shows the exact values) — **DNS only (grey cloud)** |
| Replace SPF (one SPF record only) | `@ TXT v=spf1 include:_spf.google.com ~all` |
| DKIM (after the CEO generates it in Admin → Gmail → Authenticate email) | `google._domainkey TXT <value Google shows>` — keep the Zoho `zmail._domainkey` record until Zoho is deleted |
| DMARC — edit existing, keep monitoring | `v=DMARC1; p=none; rua=mailto:founder@globalconversationoperations.com; adkim=r; aspf=r`. Drop `ruf` (forensic reports; often unwanted personal data) and `sp=none` is fine to keep. Tighten to `quarantine` only after 2–4 weeks of clean reports |
| Lower MX TTL beforehand | optional; current MX TTL unknown from here |

**Not changed:** `@` and `app` A/AAAA records, nameservers, SSL settings, Caddy, anything on the server.

## 4. Rollback
Restore the three Zoho MX, the old SPF, and leave the Zoho DKIM and verification records. Cloudflare keeps the rollback in the exported file.

## 5. Observation worth flagging
Because the current DMARC already points reports at `founder@globalconversationoperations.com`, **those reports have been going to Zoho's `founder@` mailbox**, which is being discarded. After cut-over they will arrive in Gmail; expect a lot of XML attachments — a filter or a DMARC reporting service is useful later.
