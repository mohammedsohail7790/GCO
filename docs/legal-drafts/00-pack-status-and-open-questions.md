# Privacy, DPA and retention pack — status and open questions (2026-10-23)

**Position:** no external lawyer and no legal budget (CEO, 2026-10-23). The pack is built from the GDPR text and the Commission's published model clauses, and every document stays a **draft**. Nothing here is legal advice, and nothing is "approved". The first client is an EU/EEA customer-support project with low-risk data; **fictional data only** until the gate in `docs/readiness/09-go-live-checklist.md` is released.

## 1. What changed in this pass
| Change | Why |
|---|---|
| Removed the claim of **"encrypted offsite backups"** from drafts 01, 02 and the README | The security pack (`technical-security-pack/05`) and `docs/readiness/18`, `19` show dumps are not encrypted by GCO before upload; only the provider's server-side encryption applies. A client's lawyer would find the gap. |
| DPA draft 02 §4 rewritten | Records the CEO's decision: EU/EEA operators, no access to client personal data from outside the EU/EEA for the first client, India access closed until reviewed |
| New draft 09: personal data breach procedure | Required content (Art. 33) that was missing |
| New draft 08: software ownership and IP assignment | CEO priority; separate from GitHub ownership |
| README index updated | Lists all drafts and their review need |

## 2. Official sources: what I could and could not check
| Source | Result this session |
|---|---|
| EUR-Lex pages for Implementing Decision (EU) 2021/915 (controller–processor clauses) and 2021/914 (transfer clauses) | **Could not be opened**: the fetch returned empty pages. Clause numbering and wording in the drafts is therefore **from memory and unverified**. Someone must open the official text and compare it before use. |
| European Commission SCC page | Opened: confirms the transfer SCCs of 2021 are current and links the Commission's Q&A. It does not mention the controller–processor clauses. |
| GDPR articles cited (5, 6, 13, 28, 30, 32–34, 35, 37, 44–49) | From my knowledge of the Regulation; to be checked against EUR-Lex |
**Recommended use of the official clauses:** adopt the Commission's controller–processor standard clauses (2021/915) **as the contract text**, filling their four annexes (parties; description of processing; technical and organisational measures; sub-processors) from draft 02's annexes, rather than relying on our own wording. This avoids a custom contract and is the cheapest way to meet Art. 28(3).

## 3. Mandatory, recommended, depends
| Item | Class | State |
|---|---|---|
| Art. 28 DPA with each client | Mandatory | Draft 02 (switch to the official clauses) |
| Record of processing (Art. 30) | Mandatory | Draft 07 |
| Privacy notice for website, applicants, client contacts | Mandatory | Draft 01 (needs the registered address and a privacy mailbox) |
| Breach procedure | Mandatory | Draft 09 |
| Supplier data processing terms accepted | Mandatory | Not recorded: see section 4 |
| Retention schedule in force | Mandatory | Draft 05; job not activated; the numbers are provisional |
| Confidentiality for staff and operators | Recommended in law, expected by clients | Draft 04 |
| Impact assessment (DPIA) | Depends (sensitive data, scale) | Not needed for the first low-risk client if its data stays low risk; use a template when a client brings sensitive data |
| Data protection officer | Depends | Probably not required for a first small service; confirm |
| Transfers outside the EU (draft 06) | Mandatory if it happens | Closed by decision |

## 4. Supplier agreements to accept and record (free, done in each account)
| Supplier | Role | What to do | Who |
|---|---|---|---|
| Hetzner | hosting (Germany) | accept the data processing agreement in the customer account; record the date | account owner (CEO) |
| Cloudflare | DNS and proxy; app traffic passes through it | accept its data processing addendum; note it handles traffic content in transit | CEO / CTO |
| Google Workspace | staff email | accept the data processing amendment in Admin | CEO (super admin) |
| Backblaze | offsite backups | accept the DPA; verify bucket region; note it stores data processed for clients | CEO |
Record each acceptance (date, screenshot) in the sub-processor register that Annex III of the DPA lists. I have not accepted anything; these are account actions for the owners.

## 5. Issues that genuinely need qualified legal input
| # | Issue |
|---|---|
| 1 | Whether the pack as a whole meets GDPR and Italian law; the DPA liability, indemnity and governing-law clauses (left as [LAWYER]) |
| 2 | **Transfers outside the EU**: any access from India to client personal data (SCCs plus a transfer impact assessment) |
| 3 | **Software ownership**: validity and form of the assignment under Italian law (draft 08) |
| 4 | Controller or processor status for each data set, especially if a client expects GCO to act as joint controller |
| 5 | Employment or contractor status of operators in each country, and the confidentiality terms |
| 6 | Sensitive-data processing, including any dating-platform pilot (special categories, age checks, a DPIA) |
| 7 | Sole-proprietor liability: GCO currently has no company shield; whether to incorporate before signing client contracts |

## 6. Free review routes to try first
The free startup advisory service the CEO is exploring; the Italian data protection authority's published guidance (Garante); the EDPB guidelines on controllers and processors (07/2020) and on transfers (05/2021); and the free CNIL privacy-impact-assessment tool for a DPIA when needed [verify availability]. Send them the cover page: drafts 02, 08 and 09, the open-questions table above, and `docs/readiness/18`.

## 7. Facts to fill in before use
Registered address and privacy mailbox (CEO and accountant); data processor details per client; retention periods per client contract; whether there is any existing agreement between the CEO and CTO; the names for the breach roles in draft 09.
