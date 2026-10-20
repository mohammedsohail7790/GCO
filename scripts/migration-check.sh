#!/usr/bin/env bash
# Migration consistency check: applies ALL migrations to an empty scratch database and proves the result matches prisma/schema.prisma
# exactly (no drift between the migration history and the schema the application was built against). Never touches the source database.
#   ADMIN_URL=postgresql://user@host:port  PG_BIN=/path/to/pg/bin  scripts/migration-check.sh
set -euo pipefail
: "${ADMIN_URL:?set ADMIN_URL to a PostgreSQL server URL without a database name, e.g. postgresql://user@127.0.0.1:5432}"
PG_BIN="${PG_BIN:-}"; p() { if [ -n "$PG_BIN" ]; then echo "$PG_BIN/$1"; else echo "$1"; fi; }
DB="gco_migcheck_$(date -u +%s)"
read -r U H P < <(python3 - "$ADMIN_URL" <<'PY'
import sys, urllib.parse as u
r = u.urlparse(sys.argv[1]); print(r.username or "postgres", r.hostname or "localhost", r.port or 5432)
PY
)
cleanup() { "$(p dropdb)" --if-exists -h "$H" -p "$P" -U "$U" "$DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT
"$(p createdb)" -h "$H" -p "$P" -U "$U" "$DB"
URL="${ADMIN_URL%/}/$DB?schema=public"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"
echo "[migcheck] applying all migrations to an empty database ..."
DATABASE_URL="$URL" npx --no-install prisma migrate deploy >/tmp/gco-migcheck.log 2>&1 || { echo "[migcheck] FAIL: a migration did not apply"; tail -15 /tmp/gco-migcheck.log; exit 1; }
APPLIED="$(ls prisma/migrations | grep -c '^[0-9]' || true)"
echo "[migcheck] all ${APPLIED} migrations applied without error; comparing the resulting database with prisma/schema.prisma ..."
if DATABASE_URL="$URL" npx --no-install prisma migrate diff --from-url "$URL" --to-schema-datamodel prisma/schema.prisma --exit-code >/tmp/gco-migcheck-diff.log 2>&1; then
  echo "[migcheck] PASS: migrations reproduce the schema exactly (no drift)"
else
  echo "[migcheck] FAIL: schema drift between migrations and schema.prisma"; cat /tmp/gco-migcheck-diff.log; exit 1
fi
