#!/usr/bin/env bash
# Run by the owner (or engineering) on the server:  ssh -t gco@<server> 'bash /opt/gco-staging/deploy/staging/create-owner.sh'
# Creates the owner's CEO account on STAGING only, with a hidden password prompt (use a staging-only password, not the production one).
set -euo pipefail
cd /opt/gco-staging
exec docker compose -f docker-compose.staging.yml --env-file .env.staging exec \
  worker npx tsx prisma/ops/staff-account.ts --role CEO_ADMIN "$@"
