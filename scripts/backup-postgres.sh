#!/usr/bin/env bash
# GCO production PostgreSQL backup.
#
# Runs pg_dump INSIDE the postgres container over its local Unix socket,
# which authenticates via the image's default local-trust rule - no
# credential is read, embedded, or handled by this script at all. Output is
# a custom-format (-Fc) archive: smaller than plain SQL, and restorable with
# pg_restore (including --list for a cheap integrity check without a full
# restore).
#
# Intended to run as a systemd timer (see deploy/systemd/gco-backup-postgres.*)
# as the `gco` user, which already has passwordless `docker` group access.
set -euo pipefail

COMPOSE_DIR="/opt/gco"
BACKUP_DIR="/var/backups/gco-postgres"
RETENTION_DAYS=14
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${BACKUP_DIR}/gco-postgres-${TIMESTAMP}.dump"
LOG_TAG="gco-backup-postgres"

log() { logger -t "$LOG_TAG" "$1"; echo "[$LOG_TAG] $1"; }
fail() { log "FAILED: $1"; exit 1; }

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

cd "$COMPOSE_DIR" || fail "cannot cd to $COMPOSE_DIR"

log "starting backup -> $DEST"

if ! docker compose exec -T postgres pg_dump -U gco -d gco -Fc -f /tmp/gco-backup.dump; then
  fail "pg_dump failed inside container"
fi

if ! docker compose cp postgres:/tmp/gco-backup.dump "$DEST"; then
  fail "failed to copy dump out of container"
fi
docker compose exec -T postgres rm -f /tmp/gco-backup.dump

if [ ! -s "$DEST" ]; then
  fail "backup file is empty: $DEST"
fi

# Integrity check: pg_restore --list reads the archive's table of contents
# without touching any database - a truncated/corrupt dump fails this
# immediately, which a bare `[ -s "$DEST" ]` size check would miss. Run via a
# throwaway container from the same postgres image (never the running
# production one) so this never touches the live database.
if ! docker run --rm -i --entrypoint pg_restore postgres:16-alpine --list < "$DEST" > /dev/null 2>&1; then
  fail "integrity check failed: pg_restore --list could not read $DEST"
fi

chmod 600 "$DEST"
log "backup succeeded: $DEST ($(du -h "$DEST" | cut -f1))"

# Retention: delete backups older than RETENTION_DAYS. Never touches
# anything outside $BACKUP_DIR, never touches non-matching filenames.
find "$BACKUP_DIR" -maxdepth 1 -name 'gco-postgres-*.dump' -mtime "+${RETENTION_DAYS}" -print -delete | while read -r removed; do
  log "removed old backup (older than ${RETENTION_DAYS}d): $removed"
done

log "done"
