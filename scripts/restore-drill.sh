#!/usr/bin/env bash
# Backup / restore DRILL: dumps a database, restores it into a scratch database, and proves the copy is usable:
# same tables, same row counts, migrations recognised as applied. Never touches the source database.
#
#   SOURCE_URL=postgresql://user@host:port/db  PG_BIN=/path/to/pg/bin  scripts/restore-drill.sh
#
# Needs pg_dump, pg_restore, psql, createdb, dropdb (PG_BIN, or on PATH). Prints a PASS/FAIL line and exits non-zero on failure.
set -euo pipefail
: "${SOURCE_URL:?set SOURCE_URL to the database to back up (a local/staging copy, not production)}"
PG_BIN="${PG_BIN:-}"; p() { if [ -n "$PG_BIN" ]; then echo "$PG_BIN/$1"; else echo "$1"; fi; }
SCRATCH_DB="gco_restore_drill_$(date -u +%s)"
BASE_URL="${SOURCE_URL%/*}"; BASE_URL="${BASE_URL}/postgres"
DUMP="$(mktemp -t gco-drill.XXXXXX.dump)"
RESTORE_URL="${SOURCE_URL%/*}/${SCRATCH_DB}"
SRC_QUERY="${SOURCE_URL%%\?*}"; RESTORE_URL="${RESTORE_URL%%\?*}"
cleanup() { rm -f "$DUMP"; "$(p dropdb)" --if-exists -h "$HOST" -p "$PORT" -U "$DBUSER" "$SCRATCH_DB" >/dev/null 2>&1 || true; }
read -r DBUSER HOST PORT < <(python3 - "$SRC_QUERY" <<'PY'
import sys, urllib.parse as u
r = u.urlparse(sys.argv[1]); print(r.username or "postgres", r.hostname or "localhost", r.port or 5432)
PY
)
trap cleanup EXIT
echo "[drill] dumping $(basename "$SRC_QUERY") ..."
START=$(date +%s)
"$(p pg_dump)" -Fc -h "$HOST" -p "$PORT" -U "$DBUSER" -f "$DUMP" "${SRC_QUERY##*/}"
echo "[drill] dump size: $(du -h "$DUMP" | cut -f1); integrity check ..."
"$(p pg_restore)" --list "$DUMP" >/dev/null
echo "[drill] restoring into scratch database $SCRATCH_DB ..."
"$(p createdb)" -h "$HOST" -p "$PORT" -U "$DBUSER" "$SCRATCH_DB"
"$(p pg_restore)" --no-owner --no-privileges -h "$HOST" -p "$PORT" -U "$DBUSER" -d "$SCRATCH_DB" "$DUMP"
END=$(date +%s)
counts() { "$(p psql)" -At -h "$HOST" -p "$PORT" -U "$DBUSER" -d "$1" -c "SELECT format('%s=%s', relname, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', schemaname, relname), false, true, '')))[1]::text) FROM pg_stat_user_tables ORDER BY relname"; }
A="$(counts "${SRC_QUERY##*/}")"; B="$(counts "$SCRATCH_DB")"
MIG_SRC="$("$(p psql)" -At -h "$HOST" -p "$PORT" -U "$DBUSER" -d "${SRC_QUERY##*/}" -c 'select count(*) from _prisma_migrations where finished_at is not null')"
MIG_DST="$("$(p psql)" -At -h "$HOST" -p "$PORT" -U "$DBUSER" -d "$SCRATCH_DB" -c 'select count(*) from _prisma_migrations where finished_at is not null')"
# Application-level check: the app's own migration tool must recognise the restored schema as up to date.
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PRISMA_STATUS="skipped (npx not available)"
if command -v npx >/dev/null 2>&1 && [ -f "$APP_DIR/prisma/schema.prisma" ]; then
  if (cd "$APP_DIR" && DATABASE_URL="${RESTORE_URL}?schema=public" npx --no-install prisma migrate status >/tmp/gco-drill-prisma.log 2>&1); then PRISMA_STATUS="up to date"; else PRISMA_STATUS="NOT up to date (see /tmp/gco-drill-prisma.log)"; fi
fi
echo "[drill] prisma migrate status against the restored copy: $PRISMA_STATUS"
TABLES="$(echo "$B" | wc -l | tr -d ' ')"
VERIFY="$(dirname "${BASH_SOURCE[0]}")/restore-verify.sql"
echo "[drill] integrity and tenant-boundary checks on the restored copy:"
CHECKS="$("$(p psql)" -At -F ' | ' -h "$HOST" -p "$PORT" -U "$DBUSER" -d "$SCRATCH_DB" -f "$VERIFY")"
echo "$CHECKS" | sed 's/^/[drill]   /'
VIOLATIONS="$(echo "$CHECKS" | awk -F' [|] ' '{s+=$2} END {print s+0}')"
if [ "$A" = "$B" ] && [ "$MIG_SRC" = "$MIG_DST" ] && [ "$VIOLATIONS" = "0" ] && [[ "$PRISMA_STATUS" == "up to date" || "$PRISMA_STATUS" == skipped* ]]; then
  echo "[drill] PASS: $TABLES tables, identical row counts, $MIG_DST migrations applied, 0 integrity violations, dump+restore took $((END-START))s"
else
  echo "[drill] FAIL: row counts, migrations or integrity checks differ (violations=$VIOLATIONS)"; diff <(echo "$A") <(echo "$B") || true; exit 1
fi
