# 39 — Security page: final proposed wording for the CEO's review (31 Oct 2026)

**Status:** for review only. **Nothing is published or changed on the website.** Publication means changing `lib/content/security.ts` and deploying the website, which needs the CEO's separate written approval (a content-only change still ships through a release). Every sentence below is checked against evidence in `35-security-page-claim-verification-2026-10-31.md`; the right-hand column says how. Anything marked **[confirm]** must be checked before publication.

## Page header (replaces the lead line)
> How GCO controls access, separates client data, records activity and protects the platform that conversation operations run on. These are controls GCO has verified through its own testing. This page is not a certification or an independent audit.

## Sections

| Section | Proposed text | Evidence / state |
|---|---|---|
| **Access control** | GCO uses role-based access controls. What a person can see and do depends on their role, and permissions are enforced on the server, not only hidden in the interface. Passwords are stored hashed, never in plain text. Signed-in sessions use short-lived signed tokens in secure, HTTP-only cookies and can be revoked on sign-out. Staff accounts can use authenticator-app two-step sign-in. | Code and tests (`rbac`, E2E `06`, `07`, `35`). Two-step endpoints exist on the live site (checked 31 Oct). *Do not write "required" until enforcement is switched on.* |
| **Client separation** | Each client operation is kept separate from the others. Client users are pinned to their own account on the server regardless of what a request asks for, and see only client-facing information. This separation is enforced by the platform's access checks and is covered by automated tests. | E2E `05`; limitation (no database-level separation) stated plainly, see "What we do not claim". |
| **Transport security** | The website and the platform are served over HTTPS, and plain HTTP requests are redirected to HTTPS. Certificates are issued automatically. Cookies for signed-in sessions are marked secure. Traffic is delivered through the Cloudflare network. | HTTP→HTTPS `308` observed live 31 Oct; Let's Encrypt certificate observed; Cloudflare observed. *Renewal wording omitted until the first renewal is seen (about late November).* |
| **Auditability** | Sensitive actions on the platform are recorded with who did them and when, so operations can be reviewed. Sign-ins and failed sign-ins, assignments, escalations and administrative changes are logged. Audit entries are designed not to contain secrets or the text of internal notes. Escalations keep a full timeline. | Code and tests; "designed not to" is deliberate. |
| **Webhook security** | Messages arriving from a client's system are verified before they are accepted. Inbound webhooks are verified with HMAC-SHA256 signatures using a separate secret per integration; invalid signatures are rejected and nothing is stored; duplicate deliveries are detected so a message is not processed twice. | Contract doc, unit and E2E tests (verified against a simulator; no real client connected). |
| **Rate limiting** | Rate limits protect the platform and public forms against abuse and brute-force attempts. Sign-in attempts, the public contact and application forms, and write actions by signed-in users are rate limited. | Login, `public/contact`, `public/careers/apply`, writes (coverage is partial: not "all requests"). |
| **Backups** | The production database is backed up every night, and each backup is checked for readability. A copy is stored offsite with a separate provider and the upload is verified. Restoring a backup was tested in an isolated environment in October 2026. Backup failures are written to the system log; automatic alerts are being added. | Timer and log, `pg_restore --list` check, nightly "upload verified" log lines, two isolated restore and rollback rehearsals (29 Oct). *Update after the alert exists; never add "encrypted" before the keys are installed and a decrypt-and-restore test passes.* |
| **Monitoring** | The platform exposes health checks covering the application, the database and the queue service, keeps structured application logs, and retains background jobs that repeatedly fail for review. | Health route, queue settings. *Add "uptime alerts" only after monitoring is verified.* |
| **Operational data handling** | Server-side secrets are kept in server configuration and are not exposed to the browser. AI-assisted drafting is disabled: no conversation data is sent to any AI service, and enabling it would require written approval and notice to clients. | Master switch, tests; pinned in deployment files with the release. |
| **Hosting** *(new)* | The platform runs on servers in Germany. A small number of service providers help us operate it (hosting, network delivery, backups, email); the current list is available on request, and clients are told in advance of changes. | Hetzner Nuremberg (server name, docs, account). **[confirm]** the backup bucket's region before saying anything about where *backups* are held: the sentence deliberately does not say "all data stays in the EU". |
| **What we do not claim** *(new)* | GCO does not hold any security certification, and the platform has not yet been independently assessed; an independent security test is planned. Client separation is enforced by the application rather than by separate databases per client. Two-step sign-in is available but not yet required for all privileged accounts. | Honest status, doc `36`. Remove the third sentence only after enforcement is live; revise the second only after an independent test report exists. |

## Closing line (unchanged except one word)
> Additional security and data-handling requirements can be reviewed during onboarding.

## Wording rules for the CEO's approval
1. No "compliant", "certified", "penetration tested", "encrypted backups", "end-to-end encryption", uptime or response-time figures, or "24/7 monitoring".
2. Each future change to this page gets a one-line evidence note in `35` before publication.
3. The page and the partner pack (`technical-security-pack/`) must say the same thing; if one changes, the other is updated.

## Before publication (checklist)
- [ ] CEO approves the text in writing and approves the deployment route (content-only change or the planned release).
- [ ] **[confirm]** the Backblaze bucket region and whether bucket encryption is on (needed for the DPA annex, not for this page).
- [ ] Re-run the live checks (HTTPS redirect, certificate, two-step endpoints) on the day.
- [ ] After publication, compare the live page text with the repository (done on 31 Oct for the current version).
