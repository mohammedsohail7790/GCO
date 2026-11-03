# 43 — Backup failure and outage alerts (P0 #5), built 1 Nov 2026

**Status:** built and tested locally. **Not installed anywhere. Nothing changes on production.** Installing it is a server change (needs the CEO's written approval) and it needs one decision from the CEO: which mailbox sends the alerts (see §3).

## 1. What it does
A small script (`scripts/gco-watchdog.py`, standard library only) runs every 5 minutes on the server (`deploy/systemd/gco-watchdog.*`) and emails the alert contacts when:
| Check | Problem condition |
|---|---|
| Application health | the health page is unreachable or reports the database or queue service down |
| Database backup freshness | no backup file, or the newest one is older than 27 hours (one nightly run plus margin) |
| Backup disk space | less than 15% free where backups are kept |
Also: if the backup service itself fails (including the case where the local copy is fine but the **offsite copy failed**, exit code 2), systemd runs `gco-watchdog-notify@` and an email goes out at once. Until now such failures were only written to the system log.

**Behaviour that avoids noise:** a problem is emailed after 2 failed checks in a row (about 10 minutes), repeated every 6 hours while it lasts, and a "recovered" email is sent once when it clears. If an email cannot be sent, the script remembers it has not told anyone and tries again on the next run. Messages contain the check name, a short reason, the server name and the time: no data, credentials or addresses.

## 2. What it cannot do
- **It cannot report that the server itself is down or off**, because it runs on that server. That needs a monitor outside it: a free-tier uptime service pinging the public health address and emailing the same people. Choosing one is a decision for the CEO (free tier first; paid only if the free one is not enough).
- It does not check that the **offsite copy exists** independently: it learns about an offsite failure from the backup service failing. A check of the Backblaze bucket needs the read-only listing key and is not included.
- It does not check for **restorable** backups (that remains the restore drill) or for encryption.

## 3. What the CEO must decide or provide
1. **The sending mailbox.** The script needs an SMTP account to send through. Cheapest honest option: a dedicated mailbox on the existing Google Workspace (for example `alerts@…`) with an **app password** (needs two-step verification on that account), kept only in `/etc/gco-watchdog.env` on the server. This is a Workspace configuration change: separate approval. No new cost is expected if the mailbox is an existing user; a new Workspace user would add a licence cost (to be confirmed).
2. **Who receives alerts** (suggested: Founder and CTO addresses on the company domain).
3. **An external uptime monitor** (see §2).
Credentials must not be sent by ordinary email: the CEO enters them on the server with the CTO present, or the CTO prepares the file and the CEO types the secret (same approach as `38`).

## 4. Install steps (only after approval, as root on the server)
```bash
sudo cp /opt/gco/deploy/systemd/gco-watchdog*.service /opt/gco/deploy/systemd/gco-watchdog.timer /opt/gco/deploy/systemd/gco-backup-postgres.service /etc/systemd/system/
sudo install -m 600 -o root -g root /dev/null /etc/gco-watchdog.env     # then edit: SMTP_URL, ALERT_TO, SMTP_FROM
sudo systemctl daemon-reload && sudo systemctl enable --now gco-watchdog.timer
sudo systemctl start gco-watchdog.service && journalctl -u gco-watchdog -n 20
```
Test on staging first: stop the app container for 10 minutes and expect one alert and one recovery email; rename the newest backup file's date (`touch -d '2 days ago'`) and expect a backup-freshness alert; run `systemctl start gco-watchdog-notify@gco-backup-postgres.service` and expect one email.

## 5. Evidence (local, 1 Nov 2026)
`tests/ops/test_watchdog.py`, 11 tests, run with `python3 -m unittest tests/ops/test_watchdog.py`: state machine (a single failed check sends nothing; alert once after the threshold; reminder after the interval; one recovery message; checks independent); backup age (no file, fresh, 40 hours old, unrelated files ignored, missing folder); disk; health (healthy, queue service down named, HTTP 500, unreachable); **a real SMTP conversation against a local test mail server** (two recipients, body delivered); send failure does not raise; message names the check and holds no data; end to end with a missing backup and an unreachable app over four runs sends exactly one alert per problem, not four.
**Not verified:** the systemd units were not syntax-checked (no systemd on this machine) or run; behaviour against Google Workspace SMTP (STARTTLS plus login) was not tested; Python 3.9 was used here, the server's version is unknown (the script uses nothing newer than 3.8 features); nothing was run on the server.

## 6. CEO decisions of 3 Nov 2026
Sending mailbox `founder@globalconversationoperations.com` approved "if technically suitable"; the CEO and the CTO receive alerts; a free external uptime monitor may be explored (no client data, no cost). **Technical note:** sending through an app password would put a secret on the server that can also open the founder mailbox; the Workspace SMTP relay (allowed by the server's fixed IP, sending as the founder address) avoids that. Details and the open points are in `44-ceo-decisions-2026-11-03-actions-and-open-items.md` section 2. Still not installed anywhere.
