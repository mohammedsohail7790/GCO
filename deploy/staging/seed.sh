#!/usr/bin/env bash
# Run by a person on the server:  ssh -t gco@<server> 'bash /opt/gco-staging/deploy/staging/seed.sh [--reset]'
# Seeds (or with --reset, clears and reseeds) the three FICTIONAL staging clients. You choose the shared password of the fictional
# persona accounts here, at a hidden prompt; it is not stored anywhere in the repository and is not printed.
set -euo pipefail
cd /opt/gco-staging
[ -t 0 ] || { echo "Run this in an interactive terminal (ssh -t)." >&2; exit 1; }
read -rs -p "Password for the fictional staging accounts (12+ chars, hidden): " STAGING_PERSONA_PASSWORD; echo
export STAGING_PERSONA_PASSWORD
docker compose -f docker-compose.staging.yml --env-file .env.staging exec -T \
  -e STAGING_PERSONA_PASSWORD -e GCO_ALLOW_DEMO_SEED=yes-this-is-staging-not-production \
  worker npx tsx prisma/staging-seed.ts "$@"
