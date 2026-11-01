"""Run: python3 -m unittest tests/ops/test_watchdog.py   (standard library only)"""
import asyncore, importlib.util, json, os, smtpd, tempfile, threading, time, unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

spec = importlib.util.spec_from_file_location("wd", os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "gco-watchdog.py"))
wd = importlib.util.module_from_spec(spec); spec.loader.exec_module(wd)


class Decide(unittest.TestCase):
    def run_seq(self, oks, threshold=2, remind=6, step=300):
        state, out, t = {}, [], 1000.0
        for ok in oks:
            state, ev = wd.decide(state, {"X": (ok, "why")}, t, threshold, remind)
            out.append([k for k, _ in ev]); t += step
        return out

    def test_one_blip_sends_nothing(self):
        self.assertEqual(self.run_seq([False, True, True]), [[], [], []])

    def test_alert_after_threshold_once_then_recovery_once(self):
        self.assertEqual(self.run_seq([False, False, False, False, True, True]), [[], ["problem"], [], [], ["recovered"], []])

    def test_reminder_after_interval(self):
        out = self.run_seq([False] * 6, remind=0.5, step=600)  # 10-minute steps, 30-minute reminder
        self.assertEqual(out[1], ["problem"]); self.assertEqual(out[4], ["reminder"])

    def test_checks_are_independent(self):
        _, ev = wd.decide({"A": {"fails": 5, "alerted_at": 1.0}}, {"A": (True, ""), "B": (False, "x")}, 2.0, 1, 6)
        self.assertEqual(sorted(k for k, _ in ev), ["problem", "recovered"])


class Checks(unittest.TestCase):
    def test_backup_age(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(wd.check_backup(d, 27), (False, "no backup file found"))
            f = os.path.join(d, "gco-postgres-20261101T033000Z.dump.age"); open(f, "w").write("x")
            self.assertTrue(wd.check_backup(d, 27)[0])
            old = time.time() - 40 * 3600; os.utime(f, (old, old))
            ok, why = wd.check_backup(d, 27); self.assertFalse(ok); self.assertIn("40 hours", why)
            open(os.path.join(d, "unrelated.txt"), "w").write("x")  # other files never count as a backup
            self.assertFalse(wd.check_backup(d, 27)[0])
        self.assertFalse(wd.check_backup("/nonexistent-dir", 27)[0])

    def test_disk(self):
        self.assertTrue(wd.check_disk("/", 0.0001)[0]); self.assertFalse(wd.check_disk("/", 100.1)[0])

    def test_health(self):
        answers = {"/ok": (200, {"ok": True, "data": {"healthy": True}}), "/down": (200, {"ok": True, "data": {"healthy": False, "checks": {"redis": {"status": "down"}, "database": {"status": "up"}}}}), "/err": (500, {})}
        class H(BaseHTTPRequestHandler):
            def do_GET(self):
                code, body = answers[self.path]; self.send_response(code); self.end_headers(); self.wfile.write(json.dumps(body).encode())
            def log_message(self, *a): pass
        srv = HTTPServer(("127.0.0.1", 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
        base = "http://127.0.0.1:%d" % srv.server_port
        self.assertEqual(wd.check_health(base + "/ok"), (True, "ok"))
        ok, why = wd.check_health(base + "/down"); self.assertFalse(ok); self.assertEqual(why, "health reports problem: redis")
        self.assertFalse(wd.check_health(base + "/err")[0])
        srv.shutdown(); self.assertFalse(wd.check_health(base + "/ok", timeout=1)[0])


class Sink(smtpd.SMTPServer):
    got = []
    def process_message(self, peer, mailfrom, rcpttos, data, **kw): Sink.got.append((mailfrom, rcpttos, data.decode()))


class Mail(unittest.TestCase):
    def test_real_smtp_delivery_and_message_content(self):
        Sink.got.clear(); sink = Sink(("127.0.0.1", 0), None); port = sink.socket.getsockname()[1]
        stop = threading.Event()
        def loop():
            while not stop.is_set(): asyncore.loop(timeout=0.1, count=1)
        t = threading.Thread(target=loop, daemon=True); t.start()
        ok = wd.send_mail("[GCO ALERT] Backup", "body text", "smtp://127.0.0.1:%d" % port, ["ceo@example.test", "cto@example.test"], "alerts@example.test")
        stop.set(); t.join(2)
        self.assertTrue(ok); self.assertEqual(len(Sink.got), 1)
        self.assertEqual(Sink.got[0][1], ["ceo@example.test", "cto@example.test"]); self.assertIn("body text", Sink.got[0][2])

    def test_send_failure_returns_false_without_raising(self):
        self.assertFalse(wd.send_mail("s", "b", "smtp://127.0.0.1:1", ["a@b.test"], "f@b.test"))

    def test_message_has_no_data_and_names_the_check(self):
        sent = []
        wd.notify("problem", "Application health: health not reachable (URLError)", lambda s, b: sent.append((s, b)) or True)
        self.assertTrue(sent[0][0].startswith("[GCO ALERT] Application health")); self.assertIn("No customer data", sent[0][1])


class EndToEnd(unittest.TestCase):
    def test_main_alerts_once_when_backup_missing_and_stays_quiet_on_repeat(self):
        with tempfile.TemporaryDirectory() as d:
            state = os.path.join(d, "state.json"); sent = []
            env = {"STATE_FILE": state, "BACKUP_DIR": d, "HEALTH_URL": "http://127.0.0.1:1/x", "FAIL_THRESHOLD": "2", "SMTP_URL": "", "ALERT_TO": ""}
            old = {k: os.environ.get(k) for k in env}; os.environ.update(env)
            wd.make_mailer = lambda: (lambda s, b: sent.append(s) or True)
            try:
                for _ in range(4): wd.main(["x"])
            finally:
                for k, v in old.items(): (os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v))
            subjects = sorted(sent)
            self.assertEqual(subjects, ["[GCO ALERT] Application health", "[GCO ALERT] Database backup freshness"])  # one each, not four


if __name__ == "__main__":
    unittest.main()
