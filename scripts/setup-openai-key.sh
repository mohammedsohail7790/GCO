#!/usr/bin/env bash
# Interactive, owner-run storage of the OpenAI API key for the WORKER only.
# Run on the server as the deploy user:   /opt/gco/scripts/setup-openai-key.sh
#
# The key is read with `read -s` (not echoed, not saved to shell history, never an
# argument) and written to /opt/gco/.env.ai (0600, gco:gco), which docker-compose
# attaches to the worker service only. Only the LENGTH and prefix shape are
# reported. This does NOT enable OpenAI: AI_PROVIDER stays "mock" in .env.
set -euo pipefail
TARGET="/opt/gco/.env.ai"
[ "$(id -un)" = "gco" ] || { echo "run as the gco user (not root)" >&2; exit 1; }
if [ -e "$TARGET" ]; then
  read -rp "$TARGET already exists. Overwrite? [y/N] " yn
  [ "$yn" = "y" ] || { echo "aborted, nothing changed"; exit 0; }
fi
read -rsp "OpenAI API key (input hidden): " key; echo
key="$(printf %s "$key" | tr -d '[:space:]')"
echo "received: ${#key} characters"
case "$key" in
  sk-*) ;;
  *) echo "does not look like an OpenAI key (expected to start with sk-); nothing written" >&2; exit 1 ;;
esac
[ "${#key}" -ge 40 ] || { echo "too short for an OpenAI key; nothing written" >&2; exit 1; }
umask 077
tmp="$(mktemp /opt/gco/.env.ai.XXXXXX)"
printf 'OPENAI_API_KEY=%s\n' "$key" > "$tmp"
chmod 600 "$tmp"
mv "$tmp" "$TARGET"
unset key
echo "written: $(ls -l "$TARGET" | awk '{print $1, $3":"$4, $5" bytes"}')"
echo "AI_PROVIDER in .env is still: $(grep -E '^AI_PROVIDER=' /opt/gco/.env | cut -d= -f2) (unchanged)"
