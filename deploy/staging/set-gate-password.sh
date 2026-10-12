#!/usr/bin/env bash
# Run by a person on the server, in a terminal:  ssh -t gco@<server> 'bash /opt/gco-staging/deploy/staging/set-gate-password.sh'
# Sets the username and password of the access gate (HTTP basic auth) in front of staging. The password is typed at a hidden
# prompt, hashed by Caddy itself, and only the HASH is written to /etc/caddy/staging-auth (readable by root and caddy). It is never
# shown, logged or passed as an argument. Re-run it to change the password.
set -euo pipefail
[ -t 0 ] || { echo "Run this in an interactive terminal (ssh -t)." >&2; exit 1; }
read -r -p "Gate username (e.g. cristian): " U
[[ "$U" =~ ^[A-Za-z0-9._-]{2,40}$ ]] || { echo "Use letters, digits . _ - only." >&2; exit 1; }
echo "Choose the gate password (hidden). Use something long; it is separate from every other password."
HASH="$(caddy hash-password)"
[ -n "$HASH" ] || { echo "No hash produced; nothing written." >&2; exit 1; }
printf '%s %s\n' "$U" "$HASH" | sudo install -m 640 -o root -g caddy /dev/stdin /etc/caddy/staging-auth
echo "Gate credentials saved for user '$U'. (Only a hash is stored.)"
