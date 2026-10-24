# Legal drafts — NOT legally approved

> **Start with [`00-pack-status-and-open-questions.md`](00-pack-status-and-open-questions.md)** for the current status, corrections and the issues that need qualified legal input.

**Every document in this folder is a working draft prepared from the GDPR text (Regulation (EU) 2016/679) and the structure of the European Commission's and EDPB's published guidance. None has been reviewed by a lawyer or a data-protection authority. Do not sign, publish or send them to a client as final.** The CEO has no lawyer budget; these drafts reduce the cost of a later one-time review and let the business operate carefully in the meantime.

| # | Draft | Who it binds | Review need before first real client |
|---|---|---|---|
| 01 | Privacy notice (website visitors, applicants, client contacts) | GCO as controller | **Recommended** (Art. 13 content is checkable by the CEO + accountant, but a lawyer should confirm) |
| 02 | Data Processing Agreement (client = controller, GCO = processor) | GCO and each client | **Required** — this is the contract clients' lawyers will read; Art. 28(3) lists its mandatory content |
| 03 | Client services agreement — term sheet | GCO and each client | **Required** (liability, SLA wording, termination) |
| 04 | Confidentiality agreement for operators and staff | GCO and each person | Recommended (Italian labour/contractor law matters) |
| 05 | Data-retention schedule | internal + referenced in the DPA | Recommended (periods are provisional) |
| 06 | Remote access and international transfers (CTO in India/Dubai) | internal + DPA annex | **Required** before any real personal data is touched from outside the EU/EEA |
| 07 | Record of processing activities (Art. 30) | GCO | Recommended |
| 08 | Software ownership and IP assignment (CEO and CTO) | the two founders | **Required**: qualified legal input (Italian law); both parties need independent advice |
| 09 | Personal data breach procedure | internal + referenced in the DPA | Recommended (short review of thresholds); the procedure itself is mandatory |

## Gate that is already enforced

**Fictional data only** until 02 and 06 are signed/approved and the CEO releases the gate in `docs/readiness/09-go-live-checklist.md`. The platform runs only on simulated data today; production holds no real client personal data from a real client.

## Sources to check the drafts against (official)

- GDPR text: EUR-Lex, Regulation (EU) 2016/679 — Art. 5, 6, 13, 24–32, 28 (processor contract), 30, 32–34, 44–49.
- European Commission: Standard Contractual Clauses (Decision (EU) 2021/914) for international transfers; Standard clauses for controller–processor contracts (Implementing Decision (EU) 2021/915) — **a free, official Art. 28 template that can replace or inform draft 02.**
- EDPB Guidelines 07/2020 on controller and processor; Guidelines 05/2021 on transfers; Recommendations 01/2020 on supplementary measures.
- Italian Garante per la protezione dei dati personali (garanteprivacy.it) — Italian-specific guidance and the register of breach notification.
- EU–India: no adequacy decision. UAE: no adequacy decision. Both are "third countries" (Chapter V).

I could not open these pages in this environment to confirm their current wording; the article numbers cited come from the GDPR text as I know it and **must be checked against EUR-Lex** at review.

## Facts used in the drafts (confirm each)

- Business: **Osarunwense Cristian Idiaghe**, sole proprietor, Italian VAT IT03228830307. Registered address: **to be confirmed with the accountant** — placeholders `[REGISTERED ADDRESS]` appear where it is needed. The home address is deliberately not used.
- Platform: AI disabled; operators are human; data in a Hetzner server in Nuremberg (Germany), Backblaze B2 EU bucket for offsite dumps (provider-side encryption only; not encrypted by GCO before upload — fix planned, see `docs/readiness/19`), Cloudflare (DNS/proxy), email on Google Workspace (after migration). Sub-processors list in 02 Annex III.
