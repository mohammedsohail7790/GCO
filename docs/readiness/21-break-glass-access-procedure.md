# 21 — Break-glass access procedure (draft for the CEO's review; not applied)

**Status:** approved in principle on 2026-10-23, **to be reviewed before any production access is changed.** Nothing has been changed. This is not legal advice; the transfer questions it touches need qualified input (`docs/readiness/18`, `docs/legal-drafts/06`).

## 1. The honest limit
Whoever holds root on the server can technically read the data. This procedure **reduces and records** that access; it cannot prove it away. That is why real client data from outside the EU/EEA stays closed until the safeguards are verified.

## 2. Who can do what
| Level | Who | Access | When |
|---|---|---|---|
| Normal | CTO | code, CI, **deploy account** (restricted), staging, fictional data | day to day |
| Break-glass | CTO or an EU administrator, **only with approval** | root shell, database, backups | outage, data corruption, security incident, legal request |
| Approver | CEO (or a named EU delegate if the CEO is unreachable) | decides and records | each use |

## 3. Procedure
1. **Request (written, before access):** reason, ticket or incident reference, systems, exact scope, expected duration (maximum 2 hours, renewable only with a new approval), and whether client personal data could be exposed.
2. **Approval:** the approver says yes in writing (email from a Workspace address). For an emergency, a voice call followed by an email within one hour.
3. **Enable:** the approver (or the person he delegates) enables a **time-limited key or account**; standing root keys are removed from daily use. The break-glass key is stored sealed (offline) and used only here.
4. **Work with a second person watching** where possible (screen share). No downloads of client data, no copies off the server, no queries beyond the scope.
5. **Log:** session recording or command history is kept (server audit logs); the actions go into an access log entry (who, when, what, why).
6. **Close:** disable the key or account; rotate any secret that was exposed; the approver confirms closure.
7. **Review within 24 hours:** what was accessed, was client data viewed, was a breach (then follow `legal-drafts/09`), what should change.

## 4. Emergency recovery if the CEO cannot be reached
| Option | What it is | Risk or cost |
|---|---|---|
| A. Named EU delegate | A trusted EU person holds the sealed break-glass material and approval authority (and the second backup key copy, see `20`) | A person with powerful access; needs a confidentiality agreement; cost unknown if external |
| B. Provider-level recovery | Hetzner console and server backups (existing option) rebuild the server without anyone reading client data | Slower; data since the last backup is lost |
| C. CEO only | The CEO is the single approver and key holder | Single point of failure; acceptable only for the first low-risk client with fictional-to-low-risk data and a tested restore |
**Recommended for the first client:** C plus the second sealed copy of the backup key with a trusted EU custodian, moving to A when volume grows. The CEO decides.

## 5. Records to keep
Access request log, approvals, sessions, the key custody list, and a quarterly check that no standing root access exists and the break-glass material is intact.

## 6. Decisions for the CEO
Who is the EU delegate (if any)? Maximum duration? Is option C enough for the first client? Does he want a monthly access report from the CTO?
