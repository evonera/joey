import unittest
from datetime import datetime, timedelta, timezone
from project_soak_core import APP_NAME, QA_PROJECT, QA_BRANCH, QA_HOST, PREVIEW_ORIGIN, GOAL_CONDITION, summarize, validate_run


class ProjectSoakTests(unittest.TestCase):
    def setUp(self):
        self.start = datetime(2026, 10, 24, tzinfo=timezone.utc)
        self.run = {"runId": APP_NAME, "projectId": QA_PROJECT, "branchId": QA_BRANCH, "databaseHost": QA_HOST, "previewOrigin": PREVIEW_ORIGIN, "billingMode": "test_mode", "tenantId": "new-tenant", "subscriptionId": "sub_new", "sourceCommit": "a" * 40, "deploymentId": "dpl_new", "startedAt": self.start.isoformat(), "endsAt": (self.start + timedelta(hours=72)).isoformat(), "scouts": [{"id": f"{platform}-{cadence}", "name": f"{platform} {cadence}", "platform": platform, "intervalMinutes": cadence, "goalCondition": GOAL_CONDITION} for platform in ("youtube", "rss") for cadence in (15, 1440)]}
        self.env = {"JOEY_SOAK_PROJECT_ID": QA_PROJECT, "JOEY_SOAK_DATABASE_URL": f"postgres://user:pass@{QA_HOST}/neondb", "JOEY_SOAK_ORIGIN": PREVIEW_ORIGIN, "JOEY_SOAK_CRON_SECRET": "x" * 64, "JOEY_SOAK_BYPASS": "test"}

    def rows(self):
        receipts = []
        for source in self.run["scouts"]:
            for i in range(288 if source["intervalMinutes"] == 15 else 3):
                t = self.start + timedelta(minutes=source["intervalMinutes"] * i, seconds=5)
                receipts.append({"tenantId": "new-tenant", "scoutId": source["id"], "eventKey": f'{source["id"]}:{i}', "status": "completed", "createdAt": t.isoformat(), "updatedAt": (t + timedelta(seconds=3)).isoformat(), "earliestObservedAt": (t + timedelta(seconds=1)).isoformat(), "latestObservedAt": (t + timedelta(seconds=2)).isoformat(), "itemCount": 2, "apiItemCount": 2 if source["platform"] == "youtube" else 0, "observationCount": 2})
        return receipts

    def test_cannot_reuse_production_or_old_branch_run_or_live_billing(self):
        validate_run(self.run, self.env)
        for change in ({"projectId": "bitter-dawn-07566160"}, {"branchId": "old-branch"}, {"runId": "joey-youtube-api-soak-20261019"}, {"billingMode": "live_mode"}, {"databaseHost": "production-host"}, {"sourceCommit": "unknown"}):
            with self.assertRaises(ValueError):
                validate_run({**self.run, **change}, self.env)
        with self.assertRaises(ValueError):
            validate_run(self.run, {**self.env, "JOEY_SOAK_DATABASE_URL": "postgres://u:p@production/neondb"})

    def test_both_sources_need_real_fast_and_daily_observations(self):
        receipts = self.rows()
        result = summarize(self.run, receipts, self.start + timedelta(hours=72))
        self.assertTrue(result["passed"], result["issues"])
        self.assertEqual([s["completed"] for s in result["scouts"]], [288, 3, 288, 3])
        self.assertFalse(summarize(self.run, receipts[:-1], self.start + timedelta(hours=72))["passed"])

    def test_rss_freshness_and_youtube_provenance_are_independently_required(self):
        receipts = self.rows()
        receipts[0]["apiItemCount"] = 0
        rss = next(r for r in receipts if r["scoutId"].startswith("rss"))
        rss["earliestObservedAt"] = (self.start - timedelta(hours=1)).isoformat()
        result = summarize(self.run, receipts, self.start + timedelta(hours=72))
        self.assertFalse(result["passed"])
        self.assertEqual(result["scouts"][0]["nonApiCollections"], 1)
        self.assertEqual(result["scouts"][2]["staleCollections"], 1)
        self.assertNotIn("nonApiCollections", result["scouts"][2])

    def test_pending_or_late_evidence_cannot_complete_acceptance(self):
        receipts = self.rows()
        receipts[-1]["status"] = "running"
        result = summarize(self.run, receipts, self.start + timedelta(hours=72))
        self.assertEqual(result["phase"], "finishing")
        self.assertIsNone(result["passed"])
        receipts[-1]["status"] = "completed"
        receipts[-1]["earliestObservedAt"] = (self.start + timedelta(hours=73)).isoformat()
        self.assertFalse(summarize(self.run, receipts, self.start + timedelta(hours=73))["passed"])
