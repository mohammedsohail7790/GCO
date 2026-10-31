# 38 — Backup keys: step-by-step for the CEO (31 Oct 2026)

Two separate jobs, both done **by the CEO on his own computer** so no secret travels through ordinary email or chat. Part A (Backblaze key) comes first; Part B (backup encryption keys) can be done the same day. Nothing is installed on any server until the CEO approves each step in writing. Menu names in the Backblaze website may differ slightly from the commands below; the commands are what matter.

## Rules that apply to both parts
- **Secret** items (never email, chat, repository): the Backblaze key and its key ID, and the private `age` key files.
- **Safe to share** items: the two public `age1...` lines. Even so, confirm them by a second channel (read the first and last 8 characters by voice) so nobody can swap them in transit.
- Use your encrypted password manager. To hand me a secret, use its secure-sharing feature; never paste it in a message.

## Part A — Restricted Backblaze key (upload only; cannot read or delete)
**Why on the command line:** the Backblaze website's "Write Only" option still allows deleting files, so the key must be created with Backblaze's B2 tool.

1. **Install the B2 tool.** Go to Backblaze's official B2 command-line page and install it for your computer (or `pipx install b2`). Check: `b2 version` prints a version.
2. **Sign in with your own account.** In the Backblaze website open **App Keys**. Use your master application key (or generate one and store it in your password manager). In the terminal run `b2 account authorize` and paste the key ID and key when asked.
3. **Create the upload-only key**, limited to our backup bucket (replace `BUCKET_NAME` with ours):
   ```
   b2 key create --bucket BUCKET_NAME gco-backup-writer writeFiles,listFiles
   ```
   It prints a **key ID** (25 characters) and an **application key** (31 characters). Backblaze shows the application key **only once**: copy both into your password manager at once.
4. **Check what you created:** run `b2 key list`. The line for `gco-backup-writer` must show **only** `writeFiles` and `listFiles` and our bucket. If you see `deleteFiles`, `readFiles`, `writeBucketRetentions`, `writeBucketEncryption` or `writeKeys`, delete that key (`b2 key delete KEY_ID`) and repeat step 3.
5. **Hand it over securely:** share the key ID, the key and the bucket name with me through your password manager's secure sharing. I type them into a hidden prompt on the server (they are never shown or stored in history); the script then prints only the key's permission names so you can confirm them.
6. **Wait for one nightly upload** (about 03:30 UTC) and ask me for the result. Only then continue.
7. **Retention (30 days, your approval in principle):**
   ```
   b2 bucket update --lifecycle-rule '{"fileNamePrefix":"","daysFromUploadingToHiding":30,"daysFromHidingToDeleting":1}' BUCKET_NAME
   ```
   Check with `b2 bucket get BUCKET_NAME`. This lets Backblaze remove old files by itself, so the server key never needs delete permission.
8. **Create a separate "read" key for restore tests** and keep it **off the server** (password manager only):
   ```
   b2 key create --bucket BUCKET_NAME gco-restore-reader listFiles,readFiles
   ```
9. **Retire the old key last**, only after the new upload works, the lifecycle rule is checked and one offsite restore has succeeded (Part C). In the Backblaze website open **App Keys** and delete the old key.

## Part B — Two backup encryption keys (age)
**What it does:** after this, each backup is locked on the server before it leaves, so someone with server or storage access can add backups but cannot read them. **Only you can open them**, so the private files must be kept safe. If both private keys are lost the encrypted backups cannot be recovered.

1. **Get `age`.** Download it from the author's official release page (`github.com/FiloSottile/age/releases`, version 1.3.2 or newer) for your computer. Check the file's SHA-256 against the value on that page (`shasum -a 256 <file>`). Unpack it: you get `age` and `age-keygen`.
2. **Work in a private folder** that is **not** synced to a cloud drive (for example a new folder `gco-keys`).
3. **Create the two keys:**
   ```
   age-keygen -o gco-backup-primary.txt
   age-keygen -o gco-backup-recovery.txt
   ```
   Each prints a line `Public key: age1...`. The long `age1...` text is the **public key** (safe to share); the file is the **private key** (secret).
4. **Test them** (made-up text):
   ```
   echo "test message" > test.txt
   age -r PASTE_PRIMARY_PUBLIC_KEY -r PASTE_RECOVERY_PUBLIC_KEY -o test.txt.age test.txt
   age -d -i gco-backup-primary.txt test.txt.age
   age -d -i gco-backup-recovery.txt test.txt.age
   ```
   Both last commands must print `test message`. Then delete `test.txt` and `test.txt.age`.
5. **Store the private files in different places**, never in email, chat, a shared drive or the repository:
   - **Primary:** your encrypted password manager (as a file or note) plus one offline copy (an encrypted USB drive in a safe place).
   - **Recovery:** somewhere **different** (a sealed envelope or encrypted drive held by a trusted person in the EU, with a written note of what it is). That person must not be able to read backups without also being given the instructions.
6. **Send me only the two public keys** (the two `age1...` lines) and confirm them by voice as described above.
7. **What I do next (staging first, then production only with your approval):**
   - On the test environment: install `age`, create `/etc/gco-backup-age-recipients.txt` with your two lines, run a backup against **fictional data**, and send you the encrypted file name.
   - **Important:** the recipients file must only be created **after** `age` is installed on the server. If the file exists but `age` is missing, the backup script keeps a plain copy locally and **uploads nothing**.
   - You then decrypt a test backup on your own computer with `scripts/decrypt-backup.sh` (set `AGE_IDENTITY_FILE` to your private key file) and we restore it into a test database and compare the counts.
   - Only after that passes and you approve in writing does the production backup job change. Rollback: restore the previous script and take one plain backup straight away.

## Part C — Proving the offsite restore (after Parts A and B)
1. With the read key, download the newest backup from the bucket to your computer.
2. If it ends in `.age`, decrypt it with your private key (Part B step 7).
3. Tell me the file name and size; I restore it into a throwaway database and report the migrations and row counts. For real client data later, the restore is repeated every quarter.

## What stays with whom
| Item | Holder |
|---|---|
| Backblaze master key and read key | CEO (password manager) |
| Backblaze upload key | server only (root-readable file) |
| age private keys | CEO and the recovery custodian; **never** the server or the CTO |
| age public keys | server recipients file; anyone |
