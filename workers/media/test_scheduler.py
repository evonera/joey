import os
import unittest
from unittest.mock import patch

import httpx
from scheduler import run_tick


class SchedulerTests(unittest.TestCase):
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
