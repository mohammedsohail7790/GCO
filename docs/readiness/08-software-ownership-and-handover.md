# 08 — Software ownership and handover

**This is a technical inventory, not legal advice.** It records facts from the repository and documents. It does **not** decide who owns the software, does not interpret any agreement, and no agreement was available to read. GCO currently operates under the CEO's personal VAT registration with legal/fiscal arrangements being handled through Fiscozen (CEO's statement); nothing here assumes GCO is incorporated.

## 1. Inventory

| Category | What exists | Where | Holder / owner today | Status |
|---|---|---|---|---|
| Application code | Next.js/TypeScript application, workers, realtime server, Prisma schema (60 models, 29 migrations), ~160 API routes, 47 unit / 34 integration / 52 E2E test files | Git repository `mohammedsohail7790/GCO` (personal account) plus a full working copy and history on the production server | personal GitHub account of the CTO (per `docs/disaster-recovery.md` §7); **legal owner not documented** | **Open — needs agreement and legal review** |
| Internal packages / shared components | none separate; single package `gco` (`"private": true`) | same repository | same | — |
| Third-party libraries | ~160 production packages; licences: MIT (99), Apache-2.0 (29+), ISC, BSD, 0BSD, CC-BY-4.0, MIT-0 and **LGPL-3.0-or-later (≈14 packages incl. combined expressions)** | `package-lock.json` | upstream authors | LGPL components are image-processing native libraries used **server-side, not redistributed**; legal adviser should confirm obligations if GCO ever distributes the software |
| Infrastructure configuration | `Dockerfile`, `docker-compose.yml`, `docker-compose.staging.yml`, `Caddyfile`, `deploy/systemd/*`, `deploy/staging/*` | repository | as code above | — |
| Deployment scripts | `scripts/*.sh`, `prisma/ops/*` | repository | as code above | — |
| Documentation | `docs/**` (this readiness set, operations, disaster recovery, API contracts) | repository | as code above | — |
| Domain and DNS | `globalconversationoperations.com`; DNS on Cloudflare (Free plan); registrar not documented | external accounts | CEO (per docs: account owner), **registrar unknown** | Needs confirmation |
| Server | Hetzner Cloud server, Nuremberg; Hetzner account owned by the CEO ("Cristian") per `docs/disaster-recovery.md` | external | CEO | Needs confirmation; SSH access holders unknown |
| Email | Zoho Mail EU free plan, 2 mailboxes | external | CEO (Super Admin) | see `06` |
| Backups | Backblaze B2 private bucket, nightly dumps | external | CEO ("owner account") | key privileges finding B-1 (`04`) |
| Secrets | `.env` on the server (`AUTH_SECRET`, `POSTGRES_PASSWORD`, optional AI key file), `/etc/gco-backup-b2.env`, per-integration webhook secrets in the database | server / database | CTO operates; **rotation owner and schedule not defined** | Open |
| Data | PostgreSQL database; dumps | server, B2 | GCO as controller for its own staff/applicant data and processor for client end-user data (to be confirmed per contract) | see `06` data-lifecycle |
| External integrations | none active with real clients; Calendly booking link on the website; optional SMTP (off); AI (off) | — | — | — |
| Contributors / contractors | commit history shows one generic identity; real contributors unknown; AI-assisted development tools were used for parts of the code | git history | **unknown** | Needs an inventory of who wrote what and under which agreement |

## 2. Questions the parties and a legal adviser must answer (not answered here)

1. Is there a signed founder/CTO or contractor agreement? Does it assign the software and intellectual property to the CEO or to a company? If it is a draft, who finalises it?
2. Which entity should own the code, the domain and the accounts while GCO is not incorporated, and what happens on incorporation?
3. Does any contributor (including past helpers) retain rights that must be assigned in writing?
4. Are there obligations from third-party licences (LGPL components) or from services' terms that affect ownership or hosting?
5. What is the policy for AI-assisted code (provenance, licence compatibility)?

## 3. Handover and access-control checklist (to execute only after coordination and approval)

| # | Step | Owner | State |
|---|---|---|---|
| 1 | Signed IP assignment / ownership agreement reviewed by the legal adviser | CEO, CTO, adviser | **Not started / unknown** |
| 2 | GitHub organization with CEO as owner and a second owner; repository transferred (`07`) | CEO, CTO | Not done |
| 3 | Infrastructure accounts register (Hetzner, Cloudflare, Backblaze, Zoho/Google, domain registrar, UptimeRobot, Calendly, GitHub): owner email, billing owner, 2FA, recovery method | CEO | Not done |
| 4 | Two people can administer each critical account (no single point of failure) | CEO, CTO | Not done |
| 5 | Server access list: SSH keys, Hetzner console fallback tested (docs say "not verified") | CTO | Not verified |
| 6 | Secrets inventory with owner and rotation plan (`AUTH_SECRET`, DB password, B2 key, integration secrets, optional AI key) — values never written down in the repository | CTO | Not done |
| 7 | Sealed recovery pack (offline, CEO-held): account recovery codes, how to rebuild from `docs/disaster-recovery.md` | CEO, CTO | Not done |
| 8 | Restore drill with a production dump performed by someone other than the CTO | CTO + CEO | Not done |
| 9 | Handover walkthrough: architecture, deploy, backup, incident steps (`technical-security-pack/07`, `09`) | CTO | Documents exist; walkthrough not done |
| 10 | Contributor access review (who can push, deploy, read production) | CEO, CTO | Not done |

Do not transfer, revoke or change anything above until the people involved agree.
