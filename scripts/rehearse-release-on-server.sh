#!/usr/bin/env bash
# ISOLATED release rehearsal, run ON the server by the CTO after the CEO's written approval (CEO email of 10 Nov 2026).
# Proves, on a COPY of last night's production dump: all migrations apply (expect 16 -> 33, 0 failed), integrity checks pass, the new web
# image starts healthy with AI disabled, the OLD production web image runs on the migrated schema (code rollback), and the database rollback
# (drop schema + plain pg_restore) restores the original state.  Optionally proves an ENCRYPTED backup round trip with throw-away keys.
#
#   scripts/rehearse-release-on-server.sh /path/to/release.tar.gz
#   (release.tar.gz = `git archive --format=tar.gz -o release.tar.gz <approved tag>`, copied to the server by the CTO)
#
# What it creates (all removed at the end, also on failure): ONE directory under $HOME, ONE docker network, a throw-away postgres, a
# throw-away redis, ONE image (gco-rehearsal-web). What it NEVER does: touch /opt/gco, any production container, volume, network, .env file,
# systemd unit, port or the production database; read any secret; print a password; publish a port; send anything off the server.
# The dump copy is mode 0600 inside the rehearsal directory and is deleted at the end. It holds real staff/applicant personal data: it
# must not leave this server and no one may open it.
set -euo pipefail
umask 077
TARBALL="${1:?usage: rehearse-release-on-server.sh /path/to/release.tar.gz}"
[ -s "$TARBALL" ] || { echo "release tarball missing or empty"; exit 2; }
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REH="$HOME/gco-rehearsal-$STAMP"
NET="gcorehearsal-$STAMP"
PG="gcorehearsal-pg-$STAMP"
RD="gcorehearsal-redis-$STAMP"
NEWIMG="gco-rehearsal-web:$STAMP"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/gco-postgres}"
PROD_DIR="${PROD_DIR:-/opt/gco}"
REPORT="$HOME/gco-rehearsal-report-$STAMP.txt"
PGPASS="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)"       # random, throw-away, never printed
AUTHSECRET="$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 48)"
say() { printf '%s\n' "$*" | tee -a "$REPORT"; }
PASS=1
check() { if [ "$2" = "$3" ]; then say "PASS  $1 ($2)"; else say "FAIL  $1 (got '$2', expected '$3')"; PASS=0; fi; }

BEFORE="$(cd "$PROD_DIR" && docker compose ps --format '{{.Service}} {{.Status}}' </dev/null 2>/dev/null | sed 's/ [0-9]* *\(seconds\|minutes\|hours\|days\|weeks\)*.*//' | sort | tr '\n' ';')"

cleanup() {
  set +e
  docker rm -f "$PG" "$RD" gcorehearsal-oldweb-$STAMP gcorehearsal-newweb-$STAMP gcorehearsal-oldworker-$STAMP >/dev/null 2>&1
  docker network rm "$NET" >/dev/null 2>&1
  docker rmi "$NEWIMG" >/dev/null 2>&1
  rm -rf "$REH"
  AFTER="$(cd "$PROD_DIR" && docker compose ps --format '{{.Service}} {{.Status}}' </dev/null 2>/dev/null | sed 's/ [0-9]* *\(seconds\|minutes\|hours\|days\|weeks\)*.*//' | sort | tr '\n' ';')"
  say "cleanup: rehearsal containers left: $(docker ps -a --format '{{.Names}}' | grep -c "gcorehearsal-.*$STAMP" || true); networks left: $(docker network ls --format '{{.Name}}' | grep -c "$NET" || true); images left: $(docker images --format '{{.Repository}}:{{.Tag}}' | grep -c "gco-rehearsal-web:$STAMP" || true); directory left: $([ -e "$REH" ] && echo yes || echo no)"
  [ "$BEFORE" = "$AFTER" ] && say "production services unchanged: $AFTER" || say "WARNING: production service status differs. before=[$BEFORE] after=[$AFTER]"
  say "OVERALL: $([ "$PASS" = 1 ] && echo PASS || echo FAIL)   report: $REPORT"
}
trap cleanup EXIT

: > "$REPORT"
say "GCO release rehearsal $STAMP on $(hostname)"
# 0. Preconditions
AVAIL_MB="$(awk '/MemAvailable/ {printf "%d", $2/1024}' /proc/meminfo)"; FREE_GB="$(df -P "$HOME" | awk 'NR==2 {printf "%d", $4/1024/1024}')"
say "memory available: ${AVAIL_MB} MB (need >= 1800), disk free: ${FREE_GB} GB (need >= 10)"
[ "$AVAIL_MB" -ge 1800 ] && [ "$FREE_GB" -ge 10 ] || { say "ABORT: not enough headroom; nothing was created"; PASS=0; exit 3; }
(cd "$PROD_DIR" && docker compose ps --format '{{.Service}} {{.Status}}' </dev/null | grep -q -i unhealthy) && { say "ABORT: a production service is unhealthy; nothing was created"; PASS=0; exit 3; }
DUMP="$(ls -1t "$BACKUP_DIR"/gco-postgres-*.dump 2>/dev/null | head -1 || true)"
[ -n "$DUMP" ] && [ -s "$DUMP" ] || { say "ABORT: no backup dump found; nothing was created"; PASS=0; exit 3; }
OLDWEB="$(cd "$PROD_DIR" && docker compose images -q web </dev/null | head -1)"; OLDWORKER="$(cd "$PROD_DIR" && docker compose images -q worker </dev/null | head -1)"
[ -n "$OLDWEB" ] || { say "ABORT: cannot identify the running production web image (read-only)"; PASS=0; exit 3; }
say "dump to copy (read only): $(basename "$DUMP") $(wc -c < "$DUMP") bytes"

# 1. Isolated workspace, code, throw-away services
mkdir -p "$REH/src"; chmod 700 "$REH"; cp "$DUMP" "$REH/prod.dump"; chmod 600 "$REH/prod.dump"
tar -xzf "$TARBALL" -C "$REH/src"
NEWMIG="$(ls "$REH/src/prisma/migrations" | grep -c '^[0-9]')"; say "migrations in the release: $NEWMIG"
docker network create "$NET" >/dev/null
docker run -d --name "$PG" --network "$NET" -e POSTGRES_PASSWORD="$PGPASS" -e POSTGRES_USER=gco -e POSTGRES_DB=gco postgres:16-alpine >/dev/null
docker run -d --name "$RD" --network "$NET" redis:7-alpine >/dev/null
for i in $(seq 1 30); do docker exec "$PG" pg_isready -U gco -d gco >/dev/null 2>&1 && break; sleep 2; done
PSQL() { docker exec -i "$PG" psql -U gco -d gco -At "$@"; }
say "building the release image (this takes a few minutes; production keeps running) ..."
docker build -q -t "$NEWIMG" --build-arg NEXT_PUBLIC_SITE_URL=http://localhost:3000 --build-arg NEXT_PUBLIC_REALTIME_URL=ws://localhost:3001 "$REH/src" >/dev/null
say "image built"

# 2. Restore the copy and record the BEFORE state
docker cp "$REH/prod.dump" "$PG:/tmp/prod.dump"
docker exec "$PG" pg_restore -U gco -d gco --no-owner /tmp/prod.dump >/dev/null 2>"$REH/restore.err" || true
say "restore warnings: $(grep -c . "$REH/restore.err" || true)"
COUNT() { PSQL -c "select (select count(*) from \"Tenant\"),(select count(*) from \"User\"),(select count(*) from \"Conversation\"),(select count(*) from \"Message\"),(select count(*) from _prisma_migrations where finished_at is not null)"; }
BEFORE_COUNTS="$(COUNT)"; say "before (tenants|users|conversations|messages|migrations): $BEFORE_COUNTS"
MIG_BEFORE="${BEFORE_COUNTS##*|}"

# 3. Migrate forward with the NEW image
DBURL="postgresql://gco:$PGPASS@$PG:5432/gco?schema=public"
docker run --rm --network "$NET" -e DATABASE_URL="$DBURL" "$NEWIMG" sh -c 'cd /app 2>/dev/null || true; ./node_modules/.bin/prisma migrate deploy' >"$REH/migrate.log" 2>&1 </dev/null || { say "FAIL migrate deploy"; tail -5 "$REH/migrate.log" | sed 's/postgresql:[^ ]*/<db-url>/' | tee -a "$REPORT"; PASS=0; }
AFTER_COUNTS="$(COUNT)"; say "after  (tenants|users|conversations|messages|migrations): $AFTER_COUNTS"
check "migrations applied" "${AFTER_COUNTS##*|}" "$NEWMIG"
check "rows unchanged (tenants|users|conversations|messages)" "${AFTER_COUNTS%|*}" "${BEFORE_COUNTS%|*}"
check "failed or rolled-back migrations" "$(PSQL -c 'select count(*) from _prisma_migrations where finished_at is null or rolled_back_at is not null')" "0"
VIOL="$(docker exec -i "$PG" psql -U gco -d gco -At -F' | ' < "$REH/src/scripts/restore-verify.sql" | awk -F' \\| ' '$2!=0' | wc -l | tr -d ' ')"
check "integrity checks with violations" "$VIOL" "0"

# 4. New web image healthy, AI disabled
docker run -d --name "gcorehearsal-newweb-$STAMP" --network "$NET" -e DATABASE_URL="$DBURL" -e REDIS_URL="redis://$RD:6379" -e AUTH_SECRET="$AUTHSECRET" -e AI_MASTER_SWITCH=disabled -e NODE_ENV=production "$NEWIMG" >/dev/null
HEALTH_NEW=""; for i in $(seq 1 30); do HEALTH_NEW="$(docker exec "gcorehearsal-newweb-$STAMP" node -e "require('http').get('http://localhost:3000/api/v1/health',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log(d))}).on('error',()=>{})" 2>/dev/null || true)"; echo "$HEALTH_NEW" | grep -q '"healthy":true' && break; sleep 2; done
check "new web healthy" "$(echo "$HEALTH_NEW" | grep -c '"healthy":true')" "1"
check "new web reports AI disabled" "$(echo "$HEALTH_NEW" | grep -c '"enabled":false')" "1"

# 5. CODE ROLLBACK proof: the OLD production web image on the MIGRATED schema (same image id, read-only use; no production container is touched)
docker run -d --name "gcorehearsal-oldweb-$STAMP" --network "$NET" -e DATABASE_URL="$DBURL" -e REDIS_URL="redis://$RD:6379" -e AUTH_SECRET="$AUTHSECRET" -e NODE_ENV=production "$OLDWEB" >/dev/null
HEALTH_OLD=""; for i in $(seq 1 30); do HEALTH_OLD="$(docker exec "gcorehearsal-oldweb-$STAMP" node -e "require('http').get('http://localhost:3000/api/v1/health',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log(d))}).on('error',()=>{})" 2>/dev/null || true)"; echo "$HEALTH_OLD" | grep -q '"healthy":true' && break; sleep 2; done
check "OLD web image healthy on the new schema (code rollback)" "$(echo "$HEALTH_OLD" | grep -c '"healthy":true')" "1"
if [ -n "$OLDWORKER" ]; then
  docker run -d --name "gcorehearsal-oldworker-$STAMP" --network "$NET" -e DATABASE_URL="$DBURL" -e REDIS_URL="redis://$RD:6379" -e AUTH_SECRET="$AUTHSECRET" -e NODE_ENV=production "$OLDWORKER" npx tsx workers/index.ts >/dev/null 2>&1 || true
  sleep 20
  check "OLD worker error lines after 20 s on the new schema" "$(docker logs "gcorehearsal-oldworker-$STAMP" 2>&1 | grep -c -i -E 'error|fatal' || true)" "0"
fi

# 6. DATABASE ROLLBACK: drop schema, plain pg_restore of the pre-release dump (never --clean)
docker rm -f "gcorehearsal-newweb-$STAMP" "gcorehearsal-oldweb-$STAMP" "gcorehearsal-oldworker-$STAMP" >/dev/null 2>&1 || true
PSQL -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' >/dev/null 2>&1
docker exec "$PG" pg_restore -U gco -d gco --no-owner /tmp/prod.dump >/dev/null 2>"$REH/rollback.err" || true
ROLLED="$(COUNT)"; say "after rollback (tenants|users|conversations|messages|migrations): $ROLLED"
check "rollback restores the original state" "$ROLLED" "$BEFORE_COUNTS"
check "new-schema tables left after rollback" "$(PSQL -c "select count(*) from information_schema.tables where table_schema='public' and table_name in ('Shift','Invoice','ExternalTicketCount','IntegrationCheck')")" "0"
[ "$MIG_BEFORE" = "16" ] || say "NOTE: the production dump had $MIG_BEFORE migrations, not 16: the expectation above uses the actual number"

# 7. Optional: encrypted backup round trip with THROW-AWAY keys (only if age is installed on the server)
if command -v age >/dev/null 2>&1 && command -v age-keygen >/dev/null 2>&1; then
  age-keygen -o "$REH/k1.txt" >/dev/null 2>&1; age-keygen -o "$REH/k2.txt" >/dev/null 2>&1
  grep '^# public key:' "$REH/k1.txt" | sed 's/^# public key: //' >  "$REH/recipients.txt"
  grep '^# public key:' "$REH/k2.txt" | sed 's/^# public key: //' >> "$REH/recipients.txt"
  "$REH/src/scripts/encrypt-backup.sh" "$REH/prod.dump" "$REH/prod.dump.age" "$REH/recipients.txt" >/dev/null 2>&1 && ENC=ok || ENC=failed
  AGE_IDENTITY_FILE="$REH/k2.txt" age -d -i "$REH/k2.txt" -o "$REH/dec.dump" "$REH/prod.dump.age" 2>/dev/null && cmp -s "$REH/prod.dump" "$REH/dec.dump" && DEC=identical || DEC=differs
  check "encrypt with 2 throw-away keys, decrypt with the SECOND (recovery) key, identical to the original" "$ENC/$DEC" "ok/identical"
  say "NOTE: this used throw-away keys. The CEO's real keys are tested in the key session; the recipients file for real backups is not created by this script."
else
  say "SKIPPED encrypted round trip: age is not installed on this server"
fi
