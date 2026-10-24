# 23 — GitHub organization: exact setup steps and recommended permissions

**Goal:** the CEO has secure company control of the code. **The IP ownership agreement is a separate step** (`docs/legal-drafts/08`); transferring the repository gives administrative control, not the rights. Nothing here has been done. Items marked **[verify]** are things I could not confirm on GitHub's pages and that may involve cost; **do not enable any paid feature without the CEO's approval.**

## A. Before you start (CEO)
1. Sign in to GitHub with a personal account used only for company business (use a company address, such as founder@ on the new Google Workspace). Turn on two-factor authentication now (authenticator app) and save the recovery codes offline.
2. Decide the name. Suggested: `gco-ops` [check availability].

## B. Create the organization (CEO)
1. GitHub → profile menu → **Your organizations → New organization → Create a free organization.**
2. Name, contact email (founder@), "My personal account". Complete setup.
3. **Settings → Authentication security → Require two-factor authentication for everyone in the organization.**
4. **Settings → Member privileges:** base permission **No permission** (or Read at most); disable members creating public repositories; disable repository forking for private repositories.
5. **People → Invite member:** the CTO with role **Owner** (second owner, so neither person is a single point of failure). Keep exactly two owners.

## C. Prepare the transfer (CTO)
1. Record the repository inventory: collaborators, open pull requests, deploy keys, webhooks, Actions secrets (names only), branch rules. Keep it in `docs/readiness/07`.
2. Make a full mirror backup: `git clone --mirror <repo-url>` and store it offline.
3. Check the server's working copy has full history; the server's `origin` will change after the transfer.

## D. Transfer (CTO starts, CEO accepts)
1. Repository → **Settings → Danger Zone → Transfer ownership** → new owner `gco-ops`. Type the repository name to confirm.
2. The CEO accepts. Do not rely on GitHub's old-URL redirect; update every remote.
3. Update `origin` on the CTO's machine and on the production server (`git remote set-url origin ...`); run `git fetch` to test.

## E. After the transfer: recommended settings
| Setting | Recommended | Note |
|---|---|---|
| Repository access | Teams, not individuals: **Owners** (CEO, CTO), **Maintainers** (CTO write), later **Contributors** with write only on their own branches | least privilege |
| Branch protection (or ruleset) on `main` | require a pull request, require the CI checks (type check, lint, unit, integration, build), block force-push and deletion | **[verify] on a free organization, branch protection for private repositories may need the paid Team plan.** If so, ask the CEO before upgrading |
| CODEOWNERS | both owners | reviews for auth, RBAC, tenant isolation and backup code |
| Dependabot alerts and updates | on | free for private repositories **[verify]** |
| Secret scanning and push protection | on if the plan allows | **[verify]** may be a paid add-on for private repositories |
| Actions secrets | none for production; CI uses dummy test values only | production secrets never live in GitHub |
| Deploy key for the server | read-only SSH deploy key; remove old personal tokens and SSH keys | |
| Audit log | review monthly | |

## F. Verify (both)
Record the final members list, 2FA status and settings as screenshots in `docs/readiness/07`. Only then write "the CEO has full administrative control of GitHub" anywhere.

## G. Keep for a week
The mirror backup and the server's working copy, as the rollback.

## Costs
Free organization: €0. Possible paid items [verify before approval]: the Team plan for private-repository branch protection, and secret scanning for private repositories.
