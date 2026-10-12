# Production deployment plan - language routing and quality review (NOT YET APPROVED)

Status: **prepared and pre-flighted (read-only); NOT executed.** Do not run the deploy steps until the owner approves in writing.
Commit to deploy: `HEAD` of `main` at approval time (currently `26c470f` + this doc commit). Server is at `a546977`.

## What changes
- Migration `20261010062049_operator_languages_qa_reviews` (additive only):
  - new enum `QaOutcome`; new table `QaReview` (+2 indexes, 1 unique index);
  - new column `Operator.languages TEXT[] DEFAULT '{}'` (every existing operator becomes "unrestricted" = unchanged behaviour).
- Code: language-aware assignment (`lib/assignment/*`, `lib/languages.ts`), ingest normalises `Conversation.language`,
  new APIs (`/operators/[id]/languages`, `/operators/language-coverage`, `/qa/*`), manager dashboard panels, operator language badge.
- New permissions `LANGUAGE_MANAGE`, `QA_REVIEW` (CEO_ADMIN, MANAGER, ASSISTANT).
- No change to: Postgres/Redis/Caddy/UFW/SSH/Cloudflare/backups/realtime config, demo accounts, credentials.
- The demo showcase script (`prisma/demo-showcase.ts`) is **not** to be run in production (it refuses in production mode).

## Behaviour to be aware of
- Existing operators have no languages recorded, so routing is unchanged until a manager records languages for them.
- Once an operator has languages recorded, a conversation with a language goes only to operators covering it; if none is
  available it waits (and appears on the manager's Language coverage panel) instead of going to the wrong language.
- Conversations without a language, and unrestricted operators, behave exactly as before.

## Pre-flight (read-only)
1. Local gate green on the exact commit: lint, tsc, unit, integration, build, e2e (see `~/gco-local/full.sh`).
2. `git status` clean on the workstation; commit pushed.
3. On the server: `docker compose ps` all healthy; record `docker images` ids for web and worker.
4. Row counts for the record: `User`, `Operator`, `Conversation`, `Message` (counts only, no content).

## Backup (verified) - before the migration
```bash
ssh <server> 'sudo systemctl start gco-backup-postgres.service && journalctl -u gco-backup-postgres.service -n 5 --no-pager'
```
Proceed only if the log shows the dump written AND "offsite upload to B2 verified" with a byte count and checksum.

## Deploy (same procedure used for Phases E-I and the capacity fix)
1. Tag rollback images: `docker tag gco-web:latest gco-web:pre-langqa && docker tag gco-worker:latest gco-worker:pre-langqa`.
2. rsync workstation -> `/opt/gco` (excluding .git, node_modules, .next, .env*), rsync `.git`.
3. `docker compose build web worker`.
4. Migration (additive): `docker compose run --rm --no-deps -T web npx prisma migrate deploy` - expect exactly one migration applied.
5. `docker compose up -d --no-deps web worker`.
6. Wait for `healthy`; confirm Postgres/Redis/realtime were not restarted (uptime unchanged).

## Post-deployment checks (read-only, no business data created)
- `docker compose ps`: web healthy, worker up, others unchanged; logs since deploy have no errors.
- DB: `\d "Operator"` shows `languages`; `select count(*) from "QaReview"` = 0; `select count(*) from "Operator" where cardinality(languages) > 0` = 0.
- Public site: `/`, `/careers`, `/login` return 200; anonymous `GET /api/v1/qa/queue` and `/api/v1/operators/language-coverage` return 401.
- Existing assignment behaviour unchanged: no operator over capacity (query in the capacity-fix report), active assignments count unchanged.
- Owner then logs in (after the real CEO account exists) and opens the manager dashboard: the two new panels render empty-state.
- Do NOT submit test reviews or messages in production unless the owner explicitly approves a specific test.

## Rollback
- Code only (fastest, safe): `docker tag gco-web:pre-langqa gco-web:latest && docker tag gco-worker:pre-langqa gco-worker:latest && docker compose up -d --no-deps web worker`.
  The old code ignores the new column and table; the migration does not need to be undone.
- Full data rollback (only if the migration itself misbehaves): restore the pre-deploy dump per `docs/recovery-runbook.md`
  (documented but not fully rehearsed as a complete restore) - not expected to be needed for an additive migration.
- Optional cleanup (not required): `DROP TABLE "QaReview"; DROP TYPE "QaOutcome"; ALTER TABLE "Operator" DROP COLUMN "languages";` after code rollback.

## Risks and open items
- Staff must record operator languages for routing to take effect; nothing is enforced until then.
- Language comes from the client's platform (`lang` field). Real clients may not send it; those conversations stay unrestricted.
- The marketing site's "Multilingual operations" and "Supervision & QA" claims match the product only after this deployment AND
  after operator languages are configured; do not state they are live earlier.
- The real CEO account still has to be created before the owner can use the new panels in production.


## Pre-flight record (read-only, 2026-10-12)
- Production: web/worker up (healthy), postgres/redis/realtime healthy (13 days), disk 43% used (83 GB free). Server HEAD `a546977`.
- Database: 12 migrations applied, latest `20261009054744_career_application_review`; `Operator.languages` column and `QaReview` table do **not** exist yet (so the migration is pending and applies cleanly). Counts for the record: 1 operator, 1 conversation, 5 users.
- The migration `20261010062049_operator_languages_qa_reviews` contains only CREATE TYPE / CREATE TABLE / ADD COLUMN / CREATE INDEX statements (6 additive); it has no DROP, DELETE, TRUNCATE or UPDATE.
- `rsync --dry-run` lists exactly the 24 expected paths (app routes/pages, components, lib, migration, schema, tests, docs) and nothing else; `.env*`, `node_modules`, `.next`, `.git` and `deliverables/` (80 MB of demo video) are excluded. **Always keep `--exclude deliverables` in the rsync command.**
- Local gate on the exact commit: see the final line of this document (filled in when the run completes).

## Exact commands (run only after approval)
```bash
# 0. verified backup (stop if the log does not say "offsite upload to B2 verified")
ssh gco@<server> 'sudo systemctl start gco-backup-postgres.service && journalctl -u gco-backup-postgres.service -n 6 --no-pager'
# 1. sync code (note --exclude deliverables)
rsync -az --delete --exclude .git --exclude node_modules --exclude .next --exclude .tools --exclude .env --exclude .env.local --exclude test-results --exclude deliverables -e "ssh -i ~/.ssh/id_ed25519_gco_prod" ./ gco@<server>:/opt/gco/
rsync -az --delete -e "ssh -i ~/.ssh/id_ed25519_gco_prod" .git/ gco@<server>:/opt/gco/.git/
# 2. rollback tags, build, migrate, switch
ssh gco@<server> 'cd /opt/gco && docker tag gco-web:latest gco-web:pre-langqa && docker tag gco-worker:latest gco-worker:pre-langqa && docker compose build web worker && docker compose run --rm --no-deps -T web npx prisma migrate deploy && docker compose up -d --no-deps web worker'
# 3. verify (read-only) as listed above
```

## Deployment record (executed 2026-10-12, owner-approved)
- Local gate on the deployed code: lint, tsc clean; unit 418/418; integration 134/134; build clean; e2e 245/245.
- Backup: `gco-postgres-20261012T052301Z.dump` (894,154 bytes), B2 upload verified (sha1 600fa7ef...).
- Server HEAD after rsync: `2cef1df`. Rollback tags: `gco-web:pre-langqa`, `gco-worker:pre-langqa`.
- Migration `20261010062049_operator_languages_qa_reviews` applied (13 migrations total). Only web and worker were recreated; postgres/redis/realtime were not restarted.
- Post-deploy (read-only): web healthy, worker up, no errors in logs; `QaReview` has 0 rows; 0 of 1 operators has languages set (routing unchanged until a manager configures them); no operator over capacity; `/`, `/careers`, `/login`, `/pilot` return 200; anonymous GET/PATCH/POST on the new QA and language endpoints return 401. No test data was created in production.
