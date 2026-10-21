# 14 — What I need from the CEO, step by step (GitHub organization + Google Workspace)

Nothing below has been done. No account, DNS record, repository or mailbox has been changed. Each step names **who** does it. Steps by the CEO use the CEO's own logins; I never need passwords — send nothing secret by chat or email.

---
## A. GitHub organization (about 30–45 minutes)

### A1. CEO — create the organization (10 min)
1. Sign in to GitHub with the CEO's **personal** account (create one first with the CEO's own email if none exists; turn on two-factor authentication now: Settings → Password and authentication; save the recovery codes offline).
2. Top right **+** → **New organization** → plan **Free** → name e.g. `gco-ops` (or the company name; renaming later is possible) → contact email = the CEO's email → "My personal account". 
3. The CEO is automatically the **Owner**.

### A2. CEO — protect the organization (10 min)
1. Organization → **People** → invite the CTO (Mohammed's GitHub username `mohammedsohail7790`) as **Member** first (not Owner).
2. **Settings → Authentication security** → require two-factor authentication for all members.
3. **Settings → Member privileges** → base permission **Read**; disallow members creating public repositories; disallow forking private repositories.
4. Add a **second Owner** for recovery (a trusted person of the CEO's choosing, or a second account of the CEO). One Owner is a single point of failure — if the CEO loses access, the code is locked.
5. Create a team `engineering`; grant it **Admin** on the GCO repository after transfer (this gives the CTO the technical-management rights without ownership).

### A3. CTO — transfer the repository (10 min, after A1–A2)
1. Repository `mohammedsohail7790/GCO` → **Settings → General → Danger Zone → Transfer ownership** → new owner = the organization → type the repo name to confirm. GitHub keeps issues, history and redirects from the old URL.
2. After transfer: re-create/verify Actions secrets and variables (secrets are **not** carried reliably — treat them as lost and re-enter), deploy keys, webhooks, branch protection, Dependabot, and update the `origin` URL on every machine (`git remote set-url origin …`). The server's deploy key/pull URL must be updated too (not touched until the CEO approves a production window).
3. Transfer any other GCO repositories the same way (CEO said "all repos" — send me the list if more exist; I only know of this one).

### A4. After transfer — I will prepare (small commit)
`CODEOWNERS`, Dependabot config, a licence/ownership notice, and the branch-protection checklist.

**Cost caution (to verify on the pricing page):** on the Free plan, *private* repositories may not support required reviews/branch protection; that feature is typically in the paid Team plan (a few euro per user per month). Decide: accept the limit for now (two users, the CTO is the only committer) or add the Team plan — add it to the budget only if chosen.

### A5. Ownership agreement (CEO + CTO)
Draft checklist and wording are in `docs/readiness/12-github-organization-transfer-and-ownership-agreement.md`. Because the CTO wrote the code, **a signed written assignment of the software and its IP to the CEO's business is what makes the CEO the owner** — owning the GitHub account alone does not. Have it read by a lawyer at least once if at all possible; Italian law has specific rules on authorship and assignment (the CEO's accountant can refer a one-off review). Flag: the CTO is based outside Italy — which law governs the agreement is part of that review.

---
## B. Google Workspace migration (plan; execute only with the CEO's go-ahead)

Approved by the CEO: migrate **without old email history**; **both mailboxes must send and receive correctly before Zoho is disabled**; the **primary administrator account is under the CEO's control**.

### B1. CEO — buy and own the tenant (20 min)
1. Open the Google Workspace sign-up with the CEO's browser, choose a plan (Starter is enough; read the EUR price shown and tell me), enter business name and **the CEO as the first user/super administrator**. Use a personal recovery email and phone on the admin account; save 2-step-verification backup codes offline.
2. Create the second mailbox for the other person (user, not admin).
3. Create a **second super administrator** for recovery (CEO's second account) — a tenant with one admin is one lost phone from lock-out.

### B2. CEO + CTO — pre-checks (before touching DNS)
- **CTO** (read-only, in the Cloudflare DNS view with the CEO present or screenshots): list existing MX, SPF (TXT), DKIM, DMARC records and any other mail-related records; save them as a rollback list.
- **CEO**: confirm Zoho Free has no IMAP/POP (so history cannot be copied — that matches the "no history" decision). Export anything important from Zoho (**Zoho webmail → export**) if the CEO wants an archive; deletion of Zoho happens only after the final check.
- Lower the MX record TTL to 300 s a day before cut-over.

### B3. Cut-over (in a quiet window; ≈1 hour)
1. In Workspace Admin: **Domains → verify** the domain using the TXT record Google shows → add that TXT in Cloudflare (DNS only, not proxied).
2. Add Google's MX records with higher priority than the old ones only at the moment of switch; remove/replace the Zoho MX; update **SPF** to Google's include (`v=spf1 include:_spf.google.com ~all` — keep one SPF record only), enable **DKIM** (Admin → Apps → Gmail → Authenticate email, publish the TXT), publish **DMARC** at `p=none` first (monitor), tighten later.
3. **Acceptance test — both mailboxes**, written in a table and kept:
   | Test | Mailbox 1 | Mailbox 2 |
   |---|---|---|
   | Receive from an external Gmail account | | |
   | Send to an external Gmail account (lands in inbox, not spam; headers show SPF/DKIM/DMARC pass) | | |
   | Send to the other mailbox and back | | |
   | Reply to a message sent *before* the switch (still works) | | |
   | Mobile app login + 2-step verification | | |
4. **Only after every cell passes, 24–48 h later** (to catch delayed mail), disable Zoho: remove its MX (already replaced), then downgrade/delete the Zoho organisation. If any cell fails: restore the saved MX/SPF rollback list.

### B4. Afterwards
- The platform's outgoing mail (`SMTP_URL`, currently empty/off) can use a Workspace mailbox with an app password; decided later and only with the CEO's approval.
- Update the footer/invoice contact if the invoice mailbox changes.

---
## C. The exact list of what I need from the CEO

1. GitHub: organization created, the CTO invited, a second Owner named, and the answer on Team plan vs Free.
2. Workspace: plan chosen, EUR price, admin accounts created, the CEO's go-ahead for a cut-over window (date/time).
3. Cloudflare: either a time slot together to edit DNS, or an invitation to the Cloudflare account with DNS-edit rights for one day. (Doing DNS myself needs explicit approval at that time.)
4. Legal/billing from the accountant (Fiscozen): registered business address, tax regime (ordinario/forfettario), whether to show the tax code on documents, SDI code/PEC, how VAT on the monthly subscriptions is treated.
5. Domain: registrar name, renewal date and price; the Hetzner and subscription invoices when available to confirm `docs/readiness/05-infrastructure-budget.md`.
6. A decision on a one-off lawyer review for drafts 02, 03, 06 and the ownership agreement (see `docs/legal-drafts/README.md`) — **required before the first real client's personal data enters the system**.
7. A Docker-capable host for staging (can be a short-lived Hetzner server the CEO creates; delete afterwards) and a production database dump when the restore test is approved.
