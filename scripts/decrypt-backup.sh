#!/usr/bin/env bash
# Decrypt an age-encrypted backup. Run on a machine YOU control, with the private key file the CEO holds; never on the server.
#
#   AGE_IDENTITY_FILE=/path/to/private-key.txt scripts/decrypt-backup.sh <input.dump.age> <output.dump>
#
# The output is a plain dump containing real data: chmod 600, keep it private, delete it after the restore test.
set -euo pipefail
AGE="${AGE_BIN:-age}"
IN="${1:?usage: decrypt-backup.sh <input.age> <output>}"
OUT="${2:?usage: decrypt-backup.sh <input.age> <output>}"
: "${AGE_IDENTITY_FILE:?set AGE_IDENTITY_FILE to the private key file}"
[ -s "$IN" ] || { echo "[decrypt-backup] input missing or empty"; exit 2; }
[ -s "$AGE_IDENTITY_FILE" ] || { echo "[decrypt-backup] identity file missing or empty"; exit 2; }
[ ! -e "$OUT" ] || { echo "[decrypt-backup] output already exists: $OUT"; exit 2; }
umask 077
if ! "$AGE" -d -i "$AGE_IDENTITY_FILE" -o "$OUT" "$IN"; then rm -f "$OUT"; echo "[decrypt-backup] decryption failed (wrong key or damaged file)"; exit 3; fi
echo "[decrypt-backup] ok: $(wc -c < "$OUT" | tr -d ' ') bytes written to $OUT"
