# 07 — GitHub administration and access

**Verification limit:** the GitHub command-line tool is not installed and no GitHub credentials or organization access were used, so **organization settings, roles, branch protection, secrets and alerts could not be inspected.** Everything below that is not from the local repository is **NOT VERIFIED**. No permission, ownership or setting was changed. **The CEO's full administrative control is not claimed and has not been verified.**

## 1. What the local repository shows (verified)

| Item | Finding |
|---|---|
| Remote | `git@github.com:mohammedsohail7790/GCO.git` — a **personal user account** (`mohammedsohail7790`), not an organization. (`docs/disaster-recovery.md` §7 also records "personal account of Mohammed … single GitHub owner" as a risk; the working copy on the production server holds the full history as a secondary source.) |
| Visibility | not determinable locally (`package.json` has `"private": true`, which only stops npm publishing) — NOT VERIFIED |
| Commit authorship | all 96 commits are authored by one generic identity (`GCO Engineering`); individual contributors cannot be identified from history |
| CI | one workflow `.github/workflows/ci.yml` (typecheck, lint, unit/integration tests with Postgres and Redis service containers, build). **No evidence of any run** is available locally |
| Branch protection / required checks / rulesets | cannot be seen locally — NOT VERIFIED. The repository has **no `CODEOWNERS`** and **no Dependabot configuration** |
| Licence file | **none** (no `LICENSE`): the code is proprietary by default (all rights reserved by its owner), which is only meaningful once ownership is settled (`08`) |
| Secrets in the repository | none found (`02` §5); CI uses only dummy test secrets defined in the workflow file |
| Deployment permissions | deployment is manual on the server (`/opt/gco`, docker compose); no GitHub deploy key or deployment workflow exists in the repository |

## 2. What must be checked in GitHub (needs the CEO and the repository owner together)

| # | Check | Why |
|---|---|---|
| 1 | Who owns the repository today (user vs organization)? Is the CEO an **owner**/admin? | control and continuity |
| 2 | Is there a GitHub **organization** for GCO? Plan and billing owner? | recommended structure below |
| 3 | List of members, collaborators, deploy keys, personal access tokens, GitHub Apps, SSH keys with access | access review |
| 4 | Branch protection / rulesets on `main`: required reviews, required status checks, no force-push, no deletion | integrity |
| 5 | Actions: enabled? secrets/variables stored? run history? third-party actions pinned? | CI/CD security |
| 6 | Dependabot alerts / secret scanning / code scanning availability | continuous monitoring |
| 7 | Repository visibility and whether any fork exists | exposure |
| 8 | Two-factor authentication enforced for all owners; recovery codes held by the CEO | account takeover |
| 9 | Backup/export: a periodic mirror clone stored under the CEO's control | recoverability |

## 3. Recommended target (proposal — requires approval; **not executed**)

1. Create (or confirm) a **GitHub organization owned by the CEO** (CEO = owner; the CTO = owner or admin; at least **two owners** so neither person is a single point of failure).
2. Transfer the repository into the organization **only after** CEO, CTO and the legal adviser agree (this also touches the IP agreement — `08`). GitHub redirects the old URL; the server's `origin` and any CI references are then updated.
3. Enable branch protection on `main`: pull request required, the CI checks required (typecheck, lint, unit, integration, build), no force-push, linear history optional.
4. Add `CODEOWNERS` (CEO/CTO), `dependabot.yml` (weekly, security updates), secret scanning and push protection where the plan allows.
5. Enforce 2FA for the organization; remove stale tokens and keys.
6. Keep a read-only mirror (`git clone --mirror`) in storage the CEO controls.

## 4. Prioritised actions that need the CEO

| Priority | Action | Needs |
|---|---|---|
| 1 | Confirm in GitHub who owns the repository and whether the CEO has admin rights; screenshot or export the member and token list | CEO + current repository owner |
| 2 | Agree the target structure (organization, two owners) | CEO, CTO |
| 3 | Review the IP agreement before any transfer (`08`) | CEO, CTO, legal adviser |
| 4 | Create the organization and add the CEO as owner (account/billing decision) | CEO |
| 5 | Transfer the repository and update server remotes | CTO after approvals |
| 6 | Turn on branch protection, 2FA enforcement, Dependabot, secret scanning | CTO/CEO |

**Do not** revoke access, change roles or transfer the repository until the people involved have coordinated and approved.
