import os
import unittest
from unittest.mock import patch

import httpx
from scheduler import run_tick, acceptance_target
from datetime import datetime, timedelta, timezone


class SchedulerTests(unittest.TestCase):
    def test_acceptance_dispatch_is_named_bounded_and_independent(self):
        now = datetime.now(timezone.utc)
        control = {"enabled": True, "appName": "joey-scout-soak-20261019", "startedAt": now.isoformat(), "dispatchUntil": (now + timedelta(hours=73)).isoformat()}
        self.assertEqual(acceptance_target(control, now), control["appName"])
        for overrides in ({"appName": "another-production-app"}, {"enabled": False}, {"dispatchUntil": (now + timedelta(hours=77)).isoformat()}, {"dispatchUntil": "invalid"}, {"startedAt": now.replace(tzinfo=None).isoformat()}):
            self.assertIsNone(acceptance_target({**control, **overrides}, now))
        self.assertIsNone(acceptance_target(control, now + timedelta(hours=74)))

    def execute(self, responses):
        seen = []

        def handle(request):
            seen.append(request)
            self.assertEqual(request.headers["authorization"], "Bearer " + "x" * 64)
            return responses.pop(0)

        client = httpx.Client(transport=httpx.MockTransport(handle), headers={"Authorization": "Bearer " + "x" * 64})
        with patch.dict(os.environ, {"JOEY_URL": "https://joey.example", "CRON_SECRET": "x" * 64}), patch("scheduler.httpx.Client", return_value=client):
            result = run_tick()
        return result, seen

    def test_waits_for_the_new_website_without_running_old_cron(self):
        result, seen = self.execute([httpx.Response(404)])
        self.assertEqual(result["status"], "waiting_for_web_deployment")
        self.assertEqual(len(seen), 1)

    def test_checks_readiness_before_running_authenticated_cron(self):
        result, seen = self.execute([httpx.Response(200, json={"ready": True}), httpx.Response(200, json={"ok": True})])
        self.assertEqual(result["status"], "ok")
        self.assertEqual([request.url.path for request in seen], ["/api/internal/runtime", "/api/cron"])

    def test_does_not_run_cron_on_failed_readiness(self):
        with self.assertRaisesRegex(RuntimeError, "readiness"):
            self.execute([httpx.Response(503, json={"ready": False})])

    def test_does_not_accept_partial_cron_failure(self):
        with self.assertRaisesRegex(RuntimeError, "unsuccessful"):
            self.execute([httpx.Response(200, json={"ready": True}), httpx.Response(200, json={"ok": False})])


if __name__ == "__main__":
    unittest.main()
