#!/usr/bin/env python3
"""GCO watchdog: tells a person by email when the application is unhealthy, when no fresh database backup exists, or when the backup disk is
nearly full. Standard library only. Runs every 5 minutes from a systemd timer (deploy/systemd/gco-watchdog.*) and once more from the backup
service's OnFailure hook (`--notify`).

It sends mail ONLY when the state changes (after FAIL_THRESHOLD consecutive failures, so a one-second blip does not wake anyone), again as a
reminder every REMIND_HOURS while a problem lasts, and once when it clears. Messages hold the check name and a short reason: never data,
credentials or addresses. SMTP settings come from /etc/gco-watchdog.env (root:root 0600, created by the owner); with no SMTP settings the
script still runs and logs, so nothing is silently skipped. A watchdog on the server cannot report that the server itself is down: that
needs an external monitor (see docs/readiness/43).

Environment: ALERT_TO (comma list), SMTP_URL (smtp://user:pass@host:587 for STARTTLS, smtps://... for TLS), SMTP_FROM, HEALTH_URL,
BACKUP_DIR, BACKUP_MAX_AGE_HOURS (default 27), DISK_MIN_FREE_PERCENT (default 15), FAIL_THRESHOLD (default 2), REMIND_HOURS (default 6),
STATE_FILE.
"""
import json
import os
import shutil
import smtplib
import sys
import time
import urllib.parse
import urllib.request
from email.message import EmailMessage
from typing import Callable, Dict, List, Optional, Tuple

HOST = os.uname().nodename


def env(name: str, default: str) -> str:
    return os.environ.get(name, default)


def check_health(url: str, timeout: float = 8.0) -> Tuple[bool, str]:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            body = json.loads(r.read().decode() or "{}")
            if r.status != 200:
                return False, "health answered HTTP %d" % r.status
    except Exception as e:  # noqa: BLE001 - any failure is a failed check; keep the reason short and free of URLs
        return False, "health not reachable (%s)" % type(e).__name__
    data = body.get("data", {})
    if not data.get("healthy"):
        bad = [k for k, v in (data.get("checks") or {}).items() if v.get("status") != "up"]
        return False, "health reports problem: %s" % (", ".join(bad) or "unknown")
    return True, "ok"


def check_backup(directory: str, max_age_hours: float, now: Optional[float] = None) -> Tuple[bool, str]:
    now = now or time.time()
    try:
        files = [os.path.join(directory, f) for f in os.listdir(directory) if f.startswith("gco-postgres-") and (f.endswith(".dump") or f.endswith(".dump.age"))]
    except OSError:
        return False, "backup folder not readable"
    if not files:
        return False, "no backup file found"
    newest = max(os.path.getmtime(f) for f in files)
    age_h = (now - newest) / 3600.0
    if age_h > max_age_hours:
        return False, "newest backup is %.0f hours old (limit %.0f)" % (age_h, max_age_hours)
    return True, "ok"


def check_disk(directory: str, min_free_percent: float) -> Tuple[bool, str]:
    try:
        u = shutil.disk_usage(directory)
    except OSError:
        return False, "disk not readable"
    free = 100.0 * u.free / u.total
    if free < min_free_percent:
        return False, "only %.0f%% disk free (limit %.0f%%)" % (free, min_free_percent)
    return True, "ok"


def decide(prev: Dict[str, dict], results: Dict[str, Tuple[bool, str]], now: float, threshold: int, remind_hours: float) -> Tuple[Dict[str, dict], List[Tuple[str, str]]]:
    """Pure state machine. Returns (new_state, [(kind, text)]) where kind is 'problem', 'reminder' or 'recovered'."""
    state: Dict[str, dict] = {}
    events: List[Tuple[str, str]] = []
    for name, (ok, why) in results.items():
        p = prev.get(name, {"fails": 0, "alerted_at": None})
        if ok:
            if p.get("alerted_at") is not None:
                events.append(("recovered", "%s is back to normal." % name))
            state[name] = {"fails": 0, "alerted_at": None}
            continue
        fails = int(p.get("fails", 0)) + 1
        alerted = p.get("alerted_at")
        if alerted is None and fails >= threshold:
            events.append(("problem", "%s: %s" % (name, why)))
            alerted = now
        elif alerted is not None and now - alerted >= remind_hours * 3600:
            events.append(("reminder", "%s is still failing: %s" % (name, why)))
            alerted = now
        state[name] = {"fails": fails, "alerted_at": alerted}
    return state, events


def send_mail(subject: str, text: str, smtp_url: str, to: List[str], sender: str) -> bool:
    u = urllib.parse.urlparse(smtp_url)
    try:
        cls = smtplib.SMTP_SSL if u.scheme == "smtps" else smtplib.SMTP
        port = u.port or (465 if u.scheme == "smtps" else 587)
        with cls(u.hostname, port, timeout=20) as s:
            if u.scheme == "smtp":
                s.ehlo()
                if s.has_extn("starttls"):  # upgrade to TLS whenever the server offers it
                    s.starttls()
                    s.ehlo()
            if u.username:
                s.login(urllib.parse.unquote(u.username), urllib.parse.unquote(u.password or ""))
            m = EmailMessage()
            m["From"], m["To"], m["Subject"] = sender, ", ".join(to), subject[:200]
            m.set_content(text)
            s.send_message(m)
        return True
    except Exception as e:  # noqa: BLE001
        print("watchdog: email failed (%s)" % type(e).__name__, file=sys.stderr)
        return False


def notify(kind: str, text: str, mailer: Callable[[str, str], bool]) -> bool:
    prefix = {"problem": "[GCO ALERT]", "reminder": "[GCO STILL FAILING]", "recovered": "[GCO RECOVERED]"}.get(kind, "[GCO]")
    subject = "%s %s" % (prefix, text.split(":")[0])
    body = "%s\n\nServer: %s\nTime (UTC): %s\n\nNo customer data is included in this message." % (text, HOST, time.strftime("%Y-%m-%d %H:%M", time.gmtime()))
    print("watchdog: %s - %s" % (kind, text))
    return mailer(subject, body)


def make_mailer() -> Callable[[str, str], bool]:
    smtp, to = env("SMTP_URL", ""), [a.strip() for a in env("ALERT_TO", "").split(",") if a.strip()]
    if not smtp or not to:
        return lambda s, b: (print("watchdog: no SMTP_URL/ALERT_TO configured, alert only logged"), False)[1]
    return lambda s, b: send_mail(s, b, smtp, to, env("SMTP_FROM", "GCO alerts <no-reply@globalconversationoperations.com>"))


def main(argv: List[str]) -> int:
    mailer = make_mailer()
    if len(argv) >= 2 and argv[1] == "--notify":  # OnFailure hook of another unit, e.g. the backup service
        return 0 if notify("problem", "%s: the unit failed. Check the server log." % (argv[2] if len(argv) > 2 else "unit"), mailer) else 1
    state_file = env("STATE_FILE", "/var/lib/gco-watchdog/state.json")
    try:
        prev = json.load(open(state_file))
    except (OSError, ValueError):
        prev = {}
    results = {
        "Application health": check_health(env("HEALTH_URL", "http://127.0.0.1:3000/api/v1/health")),
        "Database backup freshness": check_backup(env("BACKUP_DIR", "/var/backups/gco-postgres"), float(env("BACKUP_MAX_AGE_HOURS", "27"))),
        "Backup disk space": check_disk(env("BACKUP_DIR", "/var/backups/gco-postgres"), float(env("DISK_MIN_FREE_PERCENT", "15"))),
    }
    state, events = decide(prev, results, time.time(), int(env("FAIL_THRESHOLD", "2")), float(env("REMIND_HOURS", "6")))
    sent_all = True
    for kind, text in events:
        if not notify(kind, text, mailer):
            sent_all = False
            # the alert did not reach anyone: forget that we alerted so the next run tries again
            if kind != "recovered":
                state[text.split(":")[0].split(" is ")[0]]["alerted_at"] = None
    os.makedirs(os.path.dirname(state_file), exist_ok=True)
    json.dump(state, open(state_file, "w"))
    return 0 if sent_all else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
