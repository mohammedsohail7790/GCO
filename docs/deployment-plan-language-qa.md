# Production deployment plan - language routing and quality review (NOT YET APPROVED)

Status: **prepared, not executed.** Do not run any step below until the owner approves in writing.
Commit to deploy: `c502fba` plus the follow-up commit that contains the QA panel rating fix (see `git log`).

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
