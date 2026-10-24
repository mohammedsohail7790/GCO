# 18 — Review of the CTO's access from India (data protection)

**Status:** internal technical review, 2026-10-23, for the CEO's decision. **Not legal advice.** It builds on `docs/legal-drafts/06-remote-access-and-international-transfers-DRAFT.md` (the rule and the conditions), which it checks against the actual code and scripts. Items marked **[confirm]** are facts only the CTO or the server can confirm; I did not log in to any server for this review.

## 1. What data exists today
No real client is live. The database holds simulated data only, plus the CEO's own staff and applicant records. **Today there is no real customer personal data in production, so today's risk is low.** The review is about what must be true before the first real client.

## 2. What the code and scripts actually expose (checked this session)
| Finding | Evidence | Consequence |
|---|---|---|
| Customer message text is stored **in plain text** in PostgreSQL | `prisma/schema.prisma`: `Message.content String @db.Text`; field-level encryption exists only for integration secrets (`lib/auth/secretBox.ts`) | Anyone who can read the database or a backup can read customer conversations |
| Database backups are **not encrypted by GCO** before upload | `scripts/backup-postgres.sh`: plain `pg_dump -Fc`, then upload to Backblaze B2; protection is the B2 bucket's own encryption plus the key privileges (finding B-1) | A holder of a B2 key or the server file can read the dump |
| Application logs: no message content found on the request path | `docs/technical-security-pack/06`; logger and observability code reviewed for content fields | Reading logs is low risk, but a stack trace could contain content: **[confirm]** by sampling production logs once real data exists |
| Postgres and Redis are not published to the network (containers only) | `docker-compose.yml` | Access is via the server, which means via SSH |
| In the application, message content is limited by role | route guards and tenant isolation (E2E `05`, `06`, `39`–`51`) | The application itself does not need the CTO to read content |

**Key conclusion:** whoever has root SSH to the Hetzner server, or a Backblaze key, can technically read every customer conversation, whatever the application's role rules say. That is true for any self-hosted system. It means the CTO's server access, not application access, is the access that matters for the transfer question.

## 3. Access inventory: needed or not
Columns marked **[confirm]** are to be filled by the CTO.

| Access | Held by | Needed for the first client? | Exposes customer conversations? | Recommendation |
|---|---|---|---|---|
| Source code and CI (GitHub) | CTO | Yes | No (fictional data only in tests) | Keep; move to the organization |
| Deploys and migrations (SSH, `docker compose`) | CTO **[confirm]** | Yes | Indirectly (migrations touch tables) | Keep, but through a written deploy procedure; no ad-hoc queries |
| Server shell (root) | CTO **[confirm]** | Rarely | **Yes** | Restrict (see section 4) |
| Direct database queries on production | CTO **[confirm]** | No | **Yes** | **Stop.** Use synthetic data to reproduce problems; a break-glass approval from the CEO for anything else |
| Backup files on the server and in B2 | CTO (key), CEO (account) | Yes (existence) | **Yes** | Encrypt before upload; the decryption key held by the CEO in the EU |
| Restore drills | CTO | Yes | Yes, if done on a real dump | Do the real-dump drill with the CEO present, or on a redacted copy, or by an EU-based person |
| Application admin screens | CEO, CTO | CEO yes; CTO limited | Limited by role; operator and manager screens show conversations | CTO uses a role without conversation content; use the QA/operator tools only on fictional data |
| Monitoring and error tracking | CTO | Yes | Possibly via error payloads | Scrub message text from error reports before enabling |
| Customer conversations in the operator workspace | Operators | Yes | Yes | EU/EEA operators only for the first client (CEO decision) |

## 4. Recommended safeguards, all at no extra cost
1. **Rule in force now:** no real client personal data is accessed from India. Development, testing, staging and demos use fictional data only. (Already in the draft rule; this review confirms nothing contradicts it today.)
2. **Encrypt backups before upload** with a free tool (age or GPG). The public key sits on the server; the private key stays offline with the CEO, in the EU. The CTO could then run backups but not read them. This closes the plain-dump gap.
3. **Production shell access becomes break-glass:** the CTO uses a limited deploy account; root and database access need a written, time-boxed approval from the CEO, logged. Where this cannot be enforced technically, state that plainly in the client's data processing agreement.
4. **Remove unneeded standing access:** no personal copies of dumps, no real data on the CTO's laptop, disk encryption and screen lock on the device, two-factor on every account, SSH keys listed and reviewed.
5. **Error reports and logs:** configure monitoring to strip message bodies before it goes live.
6. **Verify the claim "no content in logs":** with the CEO present, sample production logs after the first real conversation exists.
7. **Record it:** an entry in the record of processing and the client's DPA for any access that does happen, with location and purpose.

## 5. What cannot be settled without qualified legal input
- If the CTO keeps even occasional root or database access from India, that is a transfer outside the EU to a country with no adequacy decision. The standard contractual clauses and a transfer impact assessment would then be required, and whether the safeguards above are enough is a legal judgement. Until that review exists, the safe position is to treat that access as **closed for real client data**.
- Practical alternative at no cost: an EU-based person holds production break-glass access (the CEO, or a trusted EU technician under a confidentiality agreement), and the CTO works only on code, staging and synthetic data.

## 6. Decisions for the CEO
1. Confirm that **no real client personal data is accessed from India** until the transfer review exists.
2. Approve **break-glass** for production shell and database access, with the CEO (or an EU delegate) as approver.
3. Approve **encrypted backups** (a software change to the backup script; staging first, no production change until approved).
4. Decide whether an **EU-based administrator** will exist for production.
