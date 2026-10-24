#!/usr/bin/env bash
# READ-ONLY server resource assessment for the staging decision (docs/readiness/20, step 0).
# Run on the production host, e.g.:   ssh <host> 'bash -s' < scripts/server-readonly-assessment.sh > assessment.txt
#
# What it does: reads memory, CPU, disk, Docker, listening ports and timers. It WRITES NOTHING (no files, no config, no restarts,
# no installs), reads NO secrets (it never prints .env files, container environment variables, keys or database contents),
# and starts nothing. Output is plain text for the CEO; send it as it is. Safe to run during business hours.
# Commands that are missing or need more privilege simply print "n/a".
set -u
LC_ALL=C
hr() { printf '\n== %s ==\n' "$1"; }
run() { printf '$ %s\n' "$*"; "$@" 2>&1 | head -${MAXLINES:-40} || true; }
have() { command -v "$1" >/dev/null 2>&1; }
echo "GCO read-only server assessment - $(date -u +%Y-%m-%dT%H:%M:%SZ) - host: $(hostname 2>/dev/null || echo n/a)"

hr "System"
run uname -sr
[ -r /etc/os-release ] && grep -E '^(PRETTY_NAME)=' /etc/os-release
have nproc && echo "cpus: $(nproc)"
have uptime && uptime

hr "Memory (MiB)"
if have free; then run free -m; else echo "free: n/a"; fi
MEM_AVAIL_MB=""
if [ -r /proc/meminfo ]; then
  MEM_AVAIL_MB=$(awk '/MemAvailable/ {printf "%d", $2/1024}' /proc/meminfo)
  SWAP_USED_MB=$(awk '/SwapTotal/ {t=$2} /SwapFree/ {f=$2} END {printf "%d", (t-f)/1024}' /proc/meminfo)
  echo "MemAvailable_MB=$MEM_AVAIL_MB  SwapUsed_MB=$SWAP_USED_MB"
fi

hr "Disk"
run df -h /
[ -d /var/lib/docker ] && have du && echo "docker dir size: $(du -sh /var/lib/docker 2>/dev/null | cut -f1)"
[ -d /var/backups/gco-postgres ] && { echo "backup dir: $(du -sh /var/backups/gco-postgres 2>/dev/null | cut -f1), files: $(ls /var/backups/gco-postgres 2>/dev/null | wc -l | tr -d ' ')"; ls -lt /var/backups/gco-postgres 2>/dev/null | head -4; }
DISK_FREE_GB=$(df -P / 2>/dev/null | awk 'NR==2 {printf "%d", $4/1024/1024}')
echo "Disk free on /: ${DISK_FREE_GB:-n/a} GB"

hr "Docker"
if have docker; then
  run docker --version
  run docker compose version
  echo "$ docker stats --no-stream (name, cpu, memory)"
  docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}' 2>&1 | head -20
  echo "$ docker ps (name, status, image)"
  docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' 2>&1 | head -20
  run docker compose ls
else
  echo "docker: NOT FOUND (staging in containers needs it; installing it is a server change that needs approval)"
fi

hr "Listening ports (confirm Postgres 5432 and Redis 6379 are NOT on a public address)"
if have ss; then ss -tln 2>&1 | head -30; else echo "ss: n/a"; fi

hr "Scheduled jobs"
have systemctl && systemctl list-timers --all 2>/dev/null | grep -i -E 'gco|NEXT' | head -8

hr "Caddy and tools (presence only)"
have caddy && { echo "caddy: $(caddy version 2>/dev/null | head -1)"; } || echo "caddy: not in PATH for this user"
[ -e /etc/caddy/staging-auth ] && echo "/etc/caddy/staging-auth: present (contents not read)" || echo "/etc/caddy/staging-auth: absent"
have age && echo "age: $(age --version 2>/dev/null)" || echo "age: not installed"
have gpg && echo "gpg: present" || echo "gpg: not installed"

hr "Decision hint for the staging plan (docs/readiness/20, section 1)"
echo "Rule: proceed only if MemAvailable >= 1536 MB (staging ceiling about 1.1 GB plus margin) AND disk free >= 10 GB, measured at a normal load."
if [ -n "${MEM_AVAIL_MB:-}" ] && [ -n "${DISK_FREE_GB:-}" ]; then
  if [ "$MEM_AVAIL_MB" -ge 1536 ] && [ "${DISK_FREE_GB:-0}" -ge 10 ]; then echo "RESULT: headroom looks sufficient right now (MemAvailable ${MEM_AVAIL_MB} MB, disk ${DISK_FREE_GB} GB). Repeat at peak before deciding."
  else echo "RESULT: headroom is NOT sufficient (MemAvailable ${MEM_AVAIL_MB} MB, disk ${DISK_FREE_GB} GB). Do not deploy staging on this host without a decision."; fi
else echo "RESULT: could not measure (n/a above)."; fi
echo; echo "End of read-only assessment. Nothing was changed."
