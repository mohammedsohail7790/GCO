#!/usr/bin/env bash
# Restore test for a DOWNLOADED production dump (e.g. gco-postgres-<timestamp>.dump from the server or Backblaze B2), in ISOLATION.
#
#   DUMP_FILE=/path/gco-postgres-20261020T033000Z.dump \
#   TARGET_ADMIN_URL=postgresql://postgres@127.0.0.1:5432 \
#   PG_BIN=/path/to/postgres/bin  scripts/restore-production-dump.sh
#
# SAFETY: restores into a NEW, randomly named scratch database on TARGET_ADMIN_URL, never uses --clean, never connects to production,
# and refuses a non-local target unless ALLOW_REMOTE_TARGET=yes is set (use a throwaway Postgres: a local install, or
# `docker run --rm -e POSTGRES_HOST_AUTH_METHOD=trust -p 55440:5432 postgres:16-alpine`). The dump contains real data and integration
# secrets: do this on a machine you control, keep the file private (chmod 600) and delete it afterwards.
#
# Writes a report to ./restore-report-<UTC>.md (ids and counts only, no data) and exits non-zero on any failed check.
set -euo pipefail
: "${DUMP_FILE:?set DUMP_FILE to the downloaded dump}"
: "${TARGET_ADMIN_URL:?set TARGET_ADMIN_URL to a throwaway PostgreSQL server (no database name)}"
[ -s "$DUMP_FILE" ] || { echo "dump file missing or empty"; exit 1; }
# An age-encrypted dump (gco-postgres-<timestamp>.dump.age) is decrypted to a private temp file first; needs AGE_IDENTITY_FILE (the CEO's private key).
DECRYPTED_TMP=""
case "$DUMP_FILE" in *.age)
  : "${AGE_IDENTITY_FILE:?set AGE_IDENTITY_FILE to the private key file to restore an encrypted dump}"
  DECRYPTED_TMP="$(mktemp -t gco-decrypted-XXXXXX.dump)"; rm -f "$DECRYPTED_TMP"
  "$(dirname "${BASH_SOURCE[0]}")/decrypt-backup.sh" "$DUMP_FILE" "$DECRYPTED_TMP"
  ORIGINAL_NAME="$(basename "$DUMP_FILE")"; DUMP_FILE="$DECRYPTED_TMP" ;;
esac
PG_BIN="${PG_BIN:-}"; p() { if [ -n "$PG_BIN" ]; then echo "$PG_BIN/$1"; else echo "$1"; fi; }
read -r U H PORT < <(python3 - "$TARGET_ADMIN_URL" <<'PY'
import sys, urllib.parse as u
r = u.urlparse(sys.argv[1]); print(r.username or "postgres", r.hostname or "localhost", r.port or 5432)
PY
)
case "$H" in localhost|127.*|::1) ;; *) [ "${ALLOW_REMOTE_TARGET:-}" = "yes" ] || { echo "refusing non-local target $H (set ALLOW_REMOTE_TARGET=yes only for a throwaway server)"; exit 1; } ;; esac
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="gco_prodrestore_$(date -u +%s)"
REPORT="restore-report-$(date -u +%Y%m%dT%H%M%SZ).md"
STAMP="$(basename "${ORIGINAL_NAME:-$DUMP_FILE}" | sed -nE 's/.*-([0-9]{8}T[0-9]{6}Z)\.dump(\.age)?$/\1/p')"
cleanup() { "$(p dropdb)" --if-exists -h "$H" -p "$PORT" -U "$U" "$DB" >/dev/null 2>&1 || true; [ -z "${DECRYPTED_TMP:-}" ] || rm -f "$DECRYPTED_TMP"; }
trap cleanup EXIT
q() { "$(p psql)" -At -h "$H" -p "$PORT" -U "$U" -d "$DB" -c "$1"; }

echo "[restore] checking archive ..."
"$(p pg_restore)" --list "$DUMP_FILE" >/dev/null
T0=$(date +%s)
"$(p createdb)" -h "$H" -p "$PORT" -U "$U" "$DB"
echo "[restore] restoring into scratch database $DB ..."
"$(p pg_restore)" --no-owner --no-privileges -h "$H" -p "$PORT" -U "$U" -d "$DB" "$DUMP_FILE"
T1=$(date +%s)

TABLES="$(q "select count(*) from pg_stat_user_tables")"
MIG_DB="$(q "select count(*) from _prisma_migrations where finished_at is not null")"
MIG_REPO="$(ls "$APP_DIR/prisma/migrations" | grep -c '^[0-9]')"
echo "[restore] tables=$TABLES migrations_in_dump=$MIG_DB migrations_in_repo=$MIG_REPO"
COUNTS="$(for t in Tenant User Operator Conversation Message UsageRecord Invoice AuditLog; do printf '%s=%s ' "$t" "$(q "select count(*) from \"$t\"" 2>/dev/null || echo n/a)"; done)"
echo "[restore] counts: $COUNTS"
CHECKS="$("$(p psql)" -At -F ' | ' -h "$H" -p "$PORT" -U "$U" -d "$DB" -f "$APP_DIR/scripts/restore-verify.sql" 2>&1)" || true
echo "$CHECKS" | sed 's/^/[restore]   /'
VIOL="$(echo "$CHECKS" | awk -F' [|] ' '$2 ~ /^[0-9]+$/ {s+=$2} END {print s+0}')"
BEHIND=""; [ "$MIG_DB" -lt "$MIG_REPO" ] && BEHIND="The dump is $((MIG_REPO-MIG_DB)) migration(s) behind the repository: run 'prisma migrate deploy' on the restored copy before pointing an application at it (expected for an older dump)."
AGE=""; if [ -n "$STAMP" ]; then AGE="$(python3 - "$STAMP" <<'PY'
import sys, datetime as d
t = d.datetime.strptime(sys.argv[1], "%Y%m%dT%H%M%SZ").replace(tzinfo=d.timezone.utc)
print(f"{(d.datetime.now(d.timezone.utc)-t).total_seconds()/3600:.1f} hours old at restore time")
PY
)"; fi
{
  echo "# Restore test report"; echo
  echo "- Date (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "- Dump: $(basename "$DUMP_FILE") ($(du -h "$DUMP_FILE" | cut -f1)); ${AGE:-age unknown (name has no timestamp)}"
  echo "- Target: throwaway PostgreSQL at $H:$PORT, scratch database (dropped afterwards)"
  echo "- Restore time (database step): $((T1-T0)) s"
  echo "- Tables: $TABLES; migrations applied in dump: $MIG_DB of $MIG_REPO in repository"
  echo "- Row counts: $COUNTS"
  echo "- Integrity and tenant-boundary violations: $VIOL"
  [ -n "$BEHIND" ] && echo "- Note: $BEHIND"
  echo; echo "Result: $([ "$VIOL" = "0" ] && echo PASS || echo FAIL)"
  echo; echo "This proves the DATABASE restores and is internally consistent. It does not prove a full server rebuild or the application against it."
} > "$REPORT"
echo "[restore] report written to $REPORT"
[ "$VIOL" = "0" ] && echo "[restore] PASS (restore $((T1-T0))s, violations 0)" || { echo "[restore] FAIL ($VIOL violations)"; exit 1; }
