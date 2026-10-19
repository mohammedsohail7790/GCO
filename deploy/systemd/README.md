# systemd units

| Unit | When | What |
|---|---|---|
| `gco-backup-postgres.*` | daily 03:30 UTC | database dump (+ Backblaze B2 copy) - see `docs/disaster-recovery.md` |
| `gco-alerts-dispatch.*` | every 5 minutes | turns each client's alerts into in-app notifications for the configured roles |
| `gco-retention.*` | daily 03:45 UTC | removes personal content past each client's retention window (billing/earnings records stay) |
| `gco-weekly-reports.*` | Mondays 06:00 UTC | creates last week's operator report drafts |

Install on the server (as root), then check the next run times:

```bash
sudo cp /opt/gco/deploy/systemd/gco-*.service /opt/gco/deploy/systemd/gco-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gco-alerts-dispatch.timer gco-retention.timer gco-weekly-reports.timer
systemctl list-timers 'gco-*'
journalctl -u gco-alerts-dispatch -n 20      # after the first run
```

These units have **not been installed on any server yet** (needs the deploy approval). Every job is idempotent and safe to run twice. `prisma/ops/retention.ts --dry-run` previews the retention job without changing data.
