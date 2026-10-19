import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from scout_soak_core import PREVIEW_HOST as ORIGINAL_HOST
from youtube_api_soak_core import ORIGINAL_SUBSCRIPTION, ORIGINAL_TENANT, PREVIEW_ORIGIN, PRODUCTION_HOST, GOAL_CONDITION, finalizable, finish_summary, retain_observed_issues, summarize, utc_iso, validate_run
from youtube_api_soak_status import export_status


class YoutubeApiSoakTests(unittest.TestCase):
    def setUp(self):
        self.start = datetime(2026, 10, 19, tzinfo=timezone.utc)
        host = "ep-isolated-api-acceptance-pooler.c-4.us-east-2.aws.neon.tech"
        self.run = {"runId": "api-fixture", "tenantId": "new-api-tenant", "subscriptionId": "sub_new_api", "billingMode": "test_mode", "adapter": "youtube-data-api", "sourceCommit": "a" * 40, "deploymentId": "dpl_fixture", "previewOrigin": PREVIEW_ORIGIN, "databaseHost": host, "startedAt": self.start.isoformat(), "endsAt": (self.start + timedelta(hours=72)).isoformat(), "originalScoutIds": ["old0", "old1", "old2", "old3"], "scouts": [{"id": str(i), "name": "API " + str(i), "platform": "youtube", "goalCondition": GOAL_CONDITION, "intervalMinutes": cadence} for i, cadence in enumerate([15, 1440])]}
        self.env = {"JOEY_SOAK_ORIGIN": PREVIEW_ORIGIN, "JOEY_SOAK_DATABASE_URL": f"postgres://qa:secret@{host}/neondb", "JOEY_YOUTUBE_SOAK_DATABASE_HOST": host, "JOEY_SOAK_CRON_SECRET": "x" * 64, "JOEY_SOAK_BYPASS": "test"}

    def receipt(self, scout, time, **overrides):
        return {"scoutId": str(scout), "tenantId": self.run["tenantId"], "status": "completed", "eventKey": str(time), "createdAt": time.isoformat(), "updatedAt": (time + timedelta(seconds=4)).isoformat(), "itemCount": 15, "apiItemCount": 15, "observationCount": 15, "earliestObservedAt": (time + timedelta(seconds=1)).isoformat(), "latestObservedAt": (time + timedelta(seconds=2)).isoformat(), **overrides}

    def test_boundary_rejects_old_and_production_databases_and_billing(self):
        validate_run(self.run, self.env)
        for host in (ORIGINAL_HOST, PRODUCTION_HOST):
            with self.assertRaises(ValueError):
                validate_run({**self.run, "databaseHost": host}, {**self.env, "JOEY_SOAK_DATABASE_URL": f"postgres://qa:secret@{host}/neondb", "JOEY_YOUTUBE_SOAK_DATABASE_HOST": host})
        for overrides in ({"tenantId": ORIGINAL_TENANT}, {"subscriptionId": ORIGINAL_SUBSCRIPTION}, {"billingMode": "live_mode"}, {"adapter": "youtube-feed"}, {"sourceCommit": "unknown"}, {"previewOrigin": "https://joey-alpha-five.vercel.app"}, {"endsAt": (self.start + timedelta(hours=73)).isoformat()}):
            with self.assertRaises(ValueError):
                validate_run({**self.run, **overrides}, self.env)
        with self.assertRaises(ValueError):
            validate_run(self.run, {**self.env, "JOEY_YOUTUBE_SOAK_DATABASE_HOST": "different-host"})

    def test_distinct_owned_scouts_and_cadences_are_required(self):
        for scouts in ([self.run["scouts"][0]] * 2, [{**s, "id": "old0"} if s["id"] == "0" else s for s in self.run["scouts"]], [{**s, "intervalMinutes": 15} for s in self.run["scouts"]], [{**s, "platform": "web"} for s in self.run["scouts"]]):
            with self.assertRaises(ValueError):
                validate_run({**self.run, "scouts": scouts}, self.env)

    def test_running_evidence_is_not_a_pass(self):
        self.assertIsNone(summarize(self.run, [], self.start + timedelta(minutes=1))["passed"])

    def test_pass_requires_api_provenance_freshness_and_actual_daily_recurrence(self):
        rows = [self.receipt(0, self.start + timedelta(minutes=15 * i, seconds=10)) for i in range(288)]
        rows += [self.receipt(1, self.start + timedelta(hours=24 * i, seconds=10)) for i in range(3)]
        result = summarize(self.run, rows, self.start + timedelta(hours=72))
        self.assertTrue(result["passed"], result["issues"])
        self.assertEqual([s["completed"] for s in result["scouts"]], [288, 3])
        result = summarize(self.run, rows[:-1], self.start + timedelta(hours=72))
        self.assertFalse(result["passed"])
        self.assertIn("API 1: insufficient completed collections", result["issues"])

    def test_replays_foreign_and_old_receipts_cannot_fill_gaps(self):
        rows = [self.receipt(0, self.start - timedelta(minutes=1)), self.receipt(0, self.start, tenantId="foreign"), self.receipt("old0", self.start)]
        result = summarize(self.run, rows, self.start + timedelta(hours=72))
        self.assertFalse(result["passed"])
        self.assertEqual(result["scouts"][0]["completed"], 0)

    def test_reports_failure_replay_empty_stale_and_feed_substitution(self):
        rows = [self.receipt(0, self.start, apiItemCount=0, earliestObservedAt=(self.start - timedelta(hours=1)).isoformat()), self.receipt(0, self.start, status="failed"), self.receipt(1, self.start, itemCount=0, apiItemCount=0), self.receipt(1, self.start, status="running", eventKey="pending")]
        result = summarize(self.run, rows, self.start + timedelta(minutes=16), tick_errors=1)
        self.assertEqual(result["scouts"][0]["nonApiCollections"], 1)
        self.assertEqual(result["scouts"][0]["staleCollections"], 1)
        self.assertEqual(result["scouts"][0]["duplicateEvents"], 1)
        self.assertEqual(result["scouts"][0]["failed"], 1)
        self.assertEqual(result["scouts"][1]["stalled"], 1)
        self.assertEqual(result["scouts"][1]["emptyCollections"], 1)
        self.assertIn("Acceptance runner failures: 1", result["issues"])

    def test_finalizer_requires_only_new_subscription_webhook_and_scout_confirmation(self):
        summary = {"phase": "finished", "scoutsPaused": True, "providerStatus": "cancelled", "webhookCancellationConfirmed": True, "pendingEvaluations": 0}
        self.assertTrue(finalizable(summary))
        for key in ("phase", "scoutsPaused", "providerStatus", "webhookCancellationConfirmed"):
            self.assertFalse(finalizable({**summary, key: False}))
        self.assertFalse(finalizable({**summary, "pendingEvaluations": 1}))

    def test_cancelled_or_unknown_evaluation_is_visible(self):
        result = summarize(self.run, [self.receipt(0, self.start, status="cancelled")], self.start + timedelta(minutes=1))
        self.assertEqual(result["scouts"][0]["unexpectedStatuses"], 1)
        self.assertIn("API 0: unexpectedStatuses=1", result["issues"])

    def test_database_timestamp_serialization_has_one_timezone(self):
        for value in (self.start, self.start.replace(tzinfo=None)):
            self.assertEqual(utc_iso(value), self.start.isoformat())
        self.assertEqual(datetime.fromisoformat(utc_iso(self.start)), self.start)
        local = self.start.astimezone(timezone(timedelta(hours=5, minutes=30)))
        self.assertEqual(utc_iso(local), self.start.isoformat())

    def test_deadline_waits_for_inflight_evaluations_and_webhook_before_finalization(self):
        deadline = self.start + timedelta(hours=72)
        rows = [self.receipt(0, deadline - timedelta(seconds=10), status="running")]
        result = summarize(self.run, rows, deadline)
        self.assertEqual(result["phase"], "finishing")
        self.assertIsNone(result["passed"])
        self.assertEqual(result["pendingEvaluations"], 1)
        pending = finish_summary(result, "cancelled", 0)
        self.assertEqual(pending["phase"], "finishing")
        self.assertIsNone(pending["passed"])
        result = {**result, "pendingEvaluations": 0}
        self.assertEqual(finish_summary(result, "active", 0)["phase"], "finishing")
        self.assertEqual(finish_summary(result, "cancelled", 1)["phase"], "finishing")
        settled = finish_summary(result, "cancelled", 0)
        self.assertTrue(finalizable(settled))
        self.assertFalse(settled["passed"])

    def test_gaps_follow_collection_times_not_scheduler_admissions(self):
        delayed = self.start + timedelta(minutes=40)
        rows = [self.receipt(0, self.start), self.receipt(0, self.start + timedelta(minutes=15), earliestObservedAt=delayed.isoformat(), latestObservedAt=delayed.isoformat(), updatedAt=(delayed + timedelta(seconds=1)).isoformat())]
        result = summarize(self.run, rows, delayed)
        self.assertGreater(result["scouts"][0]["maxGapSeconds"], 20 * 60)
        self.assertIn("API 0: collection gap exceeded 20 minutes", result["issues"])

    def test_post_deadline_collections_cannot_satisfy_acceptance(self):
        deadline = self.start + timedelta(hours=72)
        row = self.receipt(0, deadline - timedelta(seconds=5), earliestObservedAt=(deadline + timedelta(seconds=1)).isoformat(), latestObservedAt=(deadline + timedelta(seconds=2)).isoformat(), updatedAt=(deadline + timedelta(seconds=3)).isoformat())
        result = summarize(self.run, [row], deadline + timedelta(minutes=1))
        self.assertEqual(result["scouts"][0]["completed"], 0)
        self.assertEqual(result["scouts"][0]["outOfWindowCollections"], 1)

    def test_observed_stall_remains_visible_after_recovery(self):
        pending = self.receipt(0, self.start, status="running")
        first = summarize(self.run, [pending], self.start + timedelta(minutes=16))
        recovered = summarize(self.run, [self.receipt(0, self.start)], self.start + timedelta(minutes=17))
        result = retain_observed_issues(recovered, first)
        self.assertIn("API 0: stalled=1", result["issues"])
        self.assertEqual(result["scouts"][0]["stalled"], 0)

    def test_status_exports_escape_markup_and_report_stale_cloud_state(self):
        with tempfile.TemporaryDirectory() as folder:
            summary = summarize(self.run, [], self.start)
            summary["issues"] = ["<script>unsafe</script>"]
            result = export_status(self.run, summary, [], Path(folder), self.start + timedelta(minutes=6))
            self.assertEqual(result["staleMinutes"], 6)
            self.assertIn("Cloud observation is older than five minutes", result["issues"])
            self.assertIn("&lt;script&gt;", (Path(folder) / "status.html").read_text())
            self.assertTrue((Path(folder) / "receipts.json").exists())


if __name__ == "__main__":
    unittest.main()
