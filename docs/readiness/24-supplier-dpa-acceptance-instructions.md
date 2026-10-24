# 24 — Supplier data processing agreements: what to accept and how (for the CEO's review)

**Status:** instructions only. **I have not accepted, signed or changed anything in any supplier account.** Findings come from the suppliers' own public pages, read on 2026-10-23; where a page did not say, I say so. Acceptance is an account-owner action (CEO). Record each one (date, who accepted, a screenshot or the downloaded PDF) in the sub-processor register that Annex III of the DPA lists. This is not legal advice.

| Supplier | Role for GCO | How the DPA is concluded (verified from the supplier) | What the CEO does | Notes |
|---|---|---|---|---|
| **Hetzner Online GmbH** (hosting, Germany) | processor: hosts all client data | **Not automatic.** Concluded in the customer account with a checkbox, at `accounts.hetzner.com/account/dpa`. You first choose the data types and the groups of data subjects, which become Annex 1. No individual contract is offered. Standard text: `https://www.hetzner.com/AV/DPA_en.pdf`. Hetzner's terms say that without it Hetzner assumes you process no third-party personal data. | Log in to the Hetzner account that holds the server, open the DPA page, select the data types (names, contact data, message content, user identifiers) and data subjects (client customers, our staff, applicants), accept. Download the PDF and the audit protocol that unlocks afterwards. | **This one is open and matters most**: the server holds the data. Not verified in the live account. |
| **Cloudflare, Inc.** (DNS and proxy; app traffic passes through it) | processor: sees traffic in transit | Customer DPA, version 6.4, effective 3 April 2026. The page says it forms part of the main agreement (which includes the Self-Serve Subscription Agreement) and takes effect from the date the customer signed or the parties otherwise agreed. **The page does not describe a click-to-accept step.** SCCs are in clause 6.2 and Annexes 1 and 2. Sub-processor list: `https://www.cloudflare.com/gdpr/subprocessors/`. | Download the DPA from `https://www.cloudflare.com/cloudflare-customer-dpa/`. In the dashboard check whether a DPA signing option exists; if not, ask Cloudflare support to confirm in writing that the DPA applies to the account. Keep the confirmation. | Acceptance method for a free-plan account is **unverified**. |
| **Google Ireland Ltd / Google Workspace** (staff email) | processor for staff mail | Cloud Data Processing Addendum (previously "Data Processing Amendment"). Super admin: **Menu → Account → Account settings → Legal and compliance → Security and Privacy Additional Terms → "Cloud Data Processing Addendum to Google Workspace or Cloud Identity Agreement" → Review and Accept → I Accept.** | CEO (super admin) does the steps above after someone reviews the clauses. | Verified from Google's Workspace admin help. |
| **Backblaze, Inc.** (offsite backups) | processor for backup copies | Data Processing Agreement Addendum for EEA and EU residents (last updated 20 September 2022); it supplements the Backblaze Terms of Service. **The page describes no separate signing or acceptance step.** Backblaze, Inc. is the data importer, and the page says data can be transferred outside the EEA. | Download the addendum, keep it with the terms version in force, and confirm in writing with Backblaze that it applies to the account. | An EU bucket region does not by itself remove the transfer question; the SCCs inside the addendum matter. Another reason to encrypt backups before upload (doc 20). |

## Other suppliers to register
| Supplier | Why | Action |
|---|---|---|
| Zoho (EU) | still holds old mail and is the rollback | Keep its DPA acceptance on file until the account is closed |
| Calendly | holds names and emails of people who book calls | Review its DPA; the CEO's account |
| UptimeRobot (planned) | monitors only; no personal data expected | Review before creating |
| GitHub | code only, no client data | Terms review; no DPA needed unless personal data is committed |
| Accountant (Fiscozen) | processes invoice data | Appointment letter / DPA from the accountant |

## What I can do for you
Prepare a one-page record template for the sub-processor register, and update Annex III of the DPA with the final list and locations once each is confirmed.
