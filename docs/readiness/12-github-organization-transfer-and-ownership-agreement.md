# 12 — GitHub organization, repository transfer and the ownership agreement

**Status:** plan and checklists only. **Nothing has been created, transferred or changed.** The CEO asked for a GitHub organization under his account with all GCO repositories transferred, the CTO continuing to manage the technical side, and software ownership formalised in a written agreement. This document makes that executable and safe. It is not legal advice; the agreement must be drafted or reviewed by a lawyer.

## 1. Roles after the change
| Person | GitHub role | Other control |
|---|---|---|
| CEO (Cristian) | organization **Owner** | owner of the organization's billing and of the infrastructure accounts (Hetzner, Cloudflare, domain registrar, Backblaze, email) |
| CTO (Mohammed) | organization **Owner** (second owner, so neither person is a single point of failure) — or "Admin" if the CEO prefers sole ownership with a documented recovery path | day-to-day technical management: pushes, deployments, server operation, with named, revocable credentials |
| Anyone else | least privilege (read/write per repository), reviewed quarterly | no shared accounts |

## 2. Sequence (each step needs both people; do not skip the agreement step)
1. **Agree the ownership terms first** (§4). Do not transfer before the principle is agreed in writing.
2. **CEO creates the organization** from his own GitHub account (free plan is enough to start): name e.g. `gco-ops` (reserve the name), billing email = a company address, **enforce 2FA** for all members, save recovery codes offline.
3. **CEO invites the CTO as Owner.**
4. **Pre-transfer checks (CTO):** record the repository inventory (this repository and any others), open pull requests, deploy keys, webhooks, Actions secrets and variables (names only), collaborators, branch rules. Export a full mirror: `git clone --mirror git@github.com:mohammedsohail7790/GCO.git gco-mirror.git` and store it in the CEO-controlled backup.
5. **Transfer:** in the repository's *Settings → Danger Zone → Transfer ownership*, the current owner (the CTO's account) transfers to the organization; the CEO accepts. GitHub keeps redirects from the old URL for a while but do not rely on them.
6. **Post-transfer configuration (CTO, CEO reviewing):**
   - Update `origin` on every machine and on the production server (`git remote set-url origin git@github.com:<org>/GCO.git`); test `git fetch`.
   - Re-create Actions secrets/variables in the new location (CI uses only dummy test values; no production secret should live in GitHub).
   - Branch protection on `main`: pull request required, required checks (typecheck, lint, unit, integration, build), no force-push, no deletion.
   - Add `CODEOWNERS` (both owners), enable Dependabot security updates, secret scanning and push protection where the plan allows.
   - Remove old personal tokens, deploy keys and SSH keys that are no longer needed; create a deploy key for the server (read-only) if the server pulls from GitHub.
   - Confirm the first CI run is green and record its URL as the first CI evidence.
7. **Verify and record** in `07-github-administration-and-access.md` with screenshots/exports of the member list and settings. Only then may "the CEO has full administrative control of GitHub" be written anywhere.

## 3. Rollback
Before the transfer nothing changes. After: a transfer back is possible by the organization owner. Keep the mirror clone and the server's working copy (which holds full history) until the new setup has been used successfully for a week.

## 4. Software ownership agreement — checklist for the lawyer (principles, not text)
Parties: the CEO (and any entity he later incorporates) and the CTO. Items to settle in writing:
1. **Assignment of rights:** all code, documentation, designs, configuration, and know-how created for GCO (including work already done) is assigned to the owner entity (the CEO now, the company after incorporation, with an automatic transfer clause).
2. **Contributors:** a list of everyone who contributed (the repository shows one generic identity), with assignments or confirmations for each; treatment of work produced with AI-assisted tools (provenance and licence compatibility).
3. **Pre-existing and third-party components:** open-source licences (including LGPL components) and any code the CTO owned before GCO; a licence grant for anything not assigned.
4. **Moral rights / attribution, confidentiality, non-compete/non-solicit** as appropriate under the applicable law.
5. **Access and administration:** who holds which accounts and credentials; obligation to hand over on request; emergency access; departure procedure; revocation timeline.
6. **Compensation, equity or revenue arrangements** that relate to the software (CEO and CTO to define; outside this document).
7. **Governing law and dispute resolution.**
8. **Incorporation:** what happens to ownership, accounts and the agreement when GCO is incorporated; Fiscozen involvement for the fiscal side is a separate matter.
The existing founder/CTO agreement (if any) must be reviewed first: if it is a draft or unclear, mark the issue for the parties and the adviser — **do not rewrite a signed agreement.**

## 5. Infrastructure account ownership (the CEO's "full control" list)
| Account | Today (documented) | Target | Action |
|---|---|---|---|
| GitHub | personal account of the CTO | organization owned by the CEO (+ CTO owner) | §2 |
| Hetzner Cloud | owned by the CEO (per `docs/disaster-recovery.md`) but the CEO has **no technical access** | CEO owner; CTO invited as a project member with SSH on the server | CEO verifies login; add the CTO's access in the project |
| Cloudflare | account owner unclear | CEO owner, CTO as member | confirm and invite |
| Domain registrar | not documented | CEO owner; auto-renew on; registrar lock | find and confirm |
| Backblaze B2 | CEO ("owner account") | CEO owner; replace the nightly key with a write-only-files key | account owner action |
| Email (Zoho now, Google Workspace planned) | CEO super admin | CEO super admin + CTO second admin | `06` |
| Databases and backups | on the server and in B2 | CEO owns the servers/accounts; CTO operates | covered above |
| Secrets (`.env`, signing secrets, integration secrets) | on the server | inventory with owner and rotation plan; sealed offline copy for the CEO | `08` |
Give the CEO a **read-only technical view first** (read access to the repository and the Hetzner console, a monitoring/health page, and the documentation) so he can verify without operating anything.
