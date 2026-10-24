#!/usr/bin/env bash
# Encrypt a backup dump with age so that the server (and anyone with root on it) can WRITE backups but not READ them.
# (Finding F3, docs/readiness/19, 20.) Only PUBLIC keys are needed here; the private keys stay offline with the CEO.
#
#   scripts/encrypt-backup.sh <input.dump> <output.dump.age> [recipients-file]
#
# recipients-file: one age public key per line (age1...). Default /etc/gco-backup-age-recipients.txt. Use at least TWO recipients
# (the CEO's primary key and a separately stored recovery key) so one lost key does not lose the backups.
# Exit: 0 ok; 2 not configured or bad input; 3 encryption or verification failed. Never prints key material.
set -euo pipefail
AGE="${AGE_BIN:-age}"
IN="${1:?usage: encrypt-backup.sh <input> <output.age> [recipients-file]}"
OUT="${2:?usage: encrypt-backup.sh <input> <output.age> [recipients-file]}"
RECIPIENTS="${3:-/etc/gco-backup-age-recipients.txt}"

command -v "$AGE" >/dev/null 2>&1 || [ -x "$AGE" ] || { echo "[encrypt-backup] age not found (set AGE_BIN)"; exit 2; }
[ -s "$IN" ] || { echo "[encrypt-backup] input missing or empty"; exit 2; }
[ -s "$RECIPIENTS" ] || { echo "[encrypt-backup] recipients file missing or empty: $RECIPIENTS"; exit 2; }
# Only public keys may be in the recipients file: refuse anything that looks like a private identity.
if grep -q -E '^AGE-SECRET-KEY-' "$RECIPIENTS"; then echo "[encrypt-backup] REFUSING: the recipients file contains a private key"; exit 2; fi
N="$(grep -c -E '^age1[a-z0-9]+' "$RECIPIENTS" || true)"
[ "$N" -ge 2 ] || { echo "[encrypt-backup] REFUSING: need at least 2 recipients (primary + recovery), found $N"; exit 2; }
[ ! -e "$OUT" ] || { echo "[encrypt-backup] output already exists: $OUT"; exit 2; }

umask 077
if ! "$AGE" -R "$RECIPIENTS" -o "$OUT" "$IN"; then rm -f "$OUT"; echo "[encrypt-backup] encryption failed"; exit 3; fi
# Cheap verification without a private key: the output exists, is non-empty and is an age file with the expected header.
[ -s "$OUT" ] && head -c 22 "$OUT" | grep -q 'age-encryption.org/v1' || { rm -f "$OUT"; echo "[encrypt-backup] output is not a valid age file"; exit 3; }
echo "[encrypt-backup] ok: $(basename "$OUT") ($(wc -c < "$OUT" | tr -d ' ') bytes, $N recipients, sha256 $(shasum -a 256 "$OUT" 2>/dev/null | cut -d' ' -f1 || sha256sum "$OUT" | cut -d' ' -f1))"
