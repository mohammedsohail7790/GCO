#!/usr/bin/env bash
# Interactive, owner-run setup of the B2 credential file. Run on the server:
#   sudo /opt/gco/scripts/setup-b2-credentials.sh
#
# The key is read with `read -s` (no echo, not saved to shell history, never
# passed as an argument) and written to /etc/gco-backup-b2.env as root:root 0600.
# Afterwards it authorizes against B2 and prints ONLY the bucket name and the
# key's capability names, so the owner can confirm the key scope without any
# secret appearing on screen.
set -euo pipefail

TARGET="/etc/gco-backup-b2.env"
HELPER="/opt/gco/scripts/b2-upload.py"

[ "$(id -u)" -eq 0 ] || { echo "run with sudo" >&2; exit 1; }

if [ -e "$TARGET" ]; then
  read -rp "$TARGET already exists. Overwrite? [y/N] " yn
  [ "$yn" = "y" ] || { echo "aborted, nothing changed"; exit 0; }
fi

read -rp "B2 bucket name: " bucket
read -rp "B2 application key ID: " keyid
read -rsp "B2 application key (input hidden): " appkey; echo

bucket="$(printf %s "$bucket" | tr -d '[:space:]')"
keyid="$(printf %s "$keyid" | tr -d '[:space:]')"
appkey="$(printf %s "$appkey" | tr -d '[:space:]')"
[ -n "$bucket" ] && [ -n "$keyid" ] && [ -n "$appkey" ] || { echo "all three values are required" >&2; exit 1; }

# Self-check (lengths only, never values): a B2 key ID is 25 characters and an
# application key is 31. A short paste (truncated copy, wrong field) is the
# commonest cause of a 401 here, so catch it before writing anything.
echo "received: bucket name ${#bucket} chars, key ID ${#keyid} chars, application key ${#appkey} chars"
if [ "${#appkey}" -ne 31 ] || [ "${#keyid}" -ne 25 ]; then
  echo "expected key ID = 25 chars and application key = 31 chars." >&2
  echo "The application key is shown by Backblaze only once, at creation - re-copy it in full (or create a new key)." >&2
  exit 1
fi

umask 077
tmp="$(mktemp /etc/.gco-backup-b2.XXXXXX)"
printf 'B2_BUCKET_NAME=%s\nB2_KEY_ID=%s\nB2_APPLICATION_KEY=%s\n' "$bucket" "$keyid" "$appkey" > "$tmp"
chown root:root "$tmp"; chmod 600 "$tmp"
mv "$tmp" "$TARGET"
unset appkey keyid bucket

echo "written: $(ls -l "$TARGET" | awk '{print $1, $3, $4, $5" bytes"}')"
echo "checking credential against B2 (prints no secrets)..."
set -a; . "$TARGET"; set +a
python3 "$HELPER" --check
