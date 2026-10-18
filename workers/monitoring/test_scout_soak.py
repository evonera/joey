import unittest
from datetime import datetime, timedelta, timezone
from scout_soak_core import PREVIEW_HOST, PREVIEW_ORIGIN, summarize, validate_run


class ScoutSoakTests(unittest.TestCase):
    def setUp(self):
        self.start = datetime(2026, 10, 19, tzinfo=timezone.utc)
        self.run = {"runId": "fixture", "tenantId": "qa-only", "subscriptionId": "sub_test", "billingMode": "test_mode", "startedAt": self.start.isoformat(), "endsAt": (self.start + timedelta(hours=72)).isoformat(), "scouts": [{"id": str(i), "name": str(i), "intervalMinutes": interval} for i, interval in enumerate([15, 15, 1440, 1440])]}
        self.env = {"JOEY_SOAK_ORIGIN": PREVIEW_ORIGIN, "JOEY_SOAK_DATABASE_URL": f"postgres://qa:secret@{PREVIEW_HOST}/neondb", "JOEY_SOAK_CRON_SECRET": "x" * 64, "JOEY_SOAK_BYPASS": "test"}

    def receipt(self, scout, time, **overrides):
        return {"scoutId": str(scout), "tenantId": "qa-only", "status": "completed", "eventKey": str(time), "createdAt": time.isoformat(), "itemCount": 15, **overrides}

    def test_refuses_production_and_unbounded_or_live_runs(self):
        validate_run(self.run, self.env)
        for key, value in [("JOEY_SOAK_ORIGIN", "https://joey-alpha-five.vercel.app"), ("JOEY_SOAK_DATABASE_URL", "postgres://qa:secret@production/neondb")]:
            with self.assertRaises(ValueError):
                validate_run(self.run, {**self.env, key: value})
        for change in [{"billingMode": "live_mode"}, {"endsAt": (self.start + timedelta(hours=73)).isoformat()}]:
            with self.assertRaises(ValueError):
                validate_run({**self.run, **change}, self.env)

    def test_does_not_claim_a_running_soak_passed(self):
        result = summarize(self.run, [], self.start + timedelta(minutes=1))
        self.assertIsNone(result["passed"])
        self.assertEqual(result["phase"], "running")

    def test_checks_actual_completions_and_both_cadences_at_deadline(self):
        rows = []
        for scout in range(4):
            interval = 16 if scout < 2 else 1441
            for minute in range(0, 72 * 60, interval):
                rows.append(self.receipt(scout, self.start + timedelta(minutes=minute)))
        result = summarize(self.run, rows, self.start + timedelta(hours=72))
        self.assertTrue(result["passed"])
        self.assertEqual([s["completed"] for s in result["scouts"]], [270, 270, 3, 3])

    def test_foreign_evidence_cannot_hide_gaps_or_missing_cycles(self):
        rows = [self.receipt(0, self.start, tenantId="foreign")]
        result = summarize(self.run, rows, self.start + timedelta(hours=72))
        self.assertFalse(result["passed"])
        self.assertEqual(result["scouts"][0]["completed"], 0)

    def test_reports_stalls_failures_empty_collections_and_event_replays(self):
        rows = [self.receipt(0, self.start, itemCount=0), self.receipt(0, self.start, status="failed"), self.receipt(1, self.start, status="running")]
        result = summarize(self.run, rows, self.start + timedelta(minutes=16), tick_errors=1)
        self.assertEqual(result["scouts"][0]["duplicateEvents"], 1)
        self.assertEqual(result["scouts"][0]["failed"], 1)
        self.assertEqual(result["scouts"][0]["emptyCollections"], 1)
        self.assertEqual(result["scouts"][1]["stalled"], 1)
        self.assertGreaterEqual(len(result["issues"]), 5)


if __name__ == "__main__":
    unittest.main()
