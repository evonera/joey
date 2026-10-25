import os
import unittest
from unittest.mock import Mock, patch

import httpx
from scheduler import run_tick, acceptance_target, youtube_acceptance_target, project_acceptance_target, dispatch_acceptance, dispatch_capacity
from datetime import datetime, timedelta, timezone


class SchedulerTests(unittest.TestCase):
    def test_acceptance_dispatch_is_named_bounded_and_independent(self):
        now = datetime.now(timezone.utc)
        control = {"enabled": True, "appName": "joey-scout-soak-20261019", "startedAt": now.isoformat(), "dispatchUntil": (now + timedelta(hours=73)).isoformat()}
        self.assertEqual(acceptance_target(control, now), control["appName"])
        for overrides in ({"appName": "another-production-app"}, {"enabled": False}, {"dispatchUntil": (now + timedelta(hours=77)).isoformat()}, {"dispatchUntil": "invalid"}, {"startedAt": now.replace(tzinfo=None).isoformat()}):
            self.assertIsNone(acceptance_target({**control, **overrides}, now))
        self.assertIsNone(acceptance_target(control, now + timedelta(hours=74)))

    def test_api_child_dispatch_is_separately_named_and_bounded(self):
        now = datetime.now(timezone.utc)
        control = {"enabled": True, "appName": "joey-youtube-api-soak-20261019", "startedAt": now.isoformat(), "dispatchUntil": (now + timedelta(hours=75)).isoformat()}
        self.assertEqual(youtube_acceptance_target(control, now), control["appName"])
        for overrides in ({"appName": "joey-scout-soak-20261019"}, {"enabled": False}, {"dispatchUntil": (now + timedelta(hours=76)).isoformat()}, {"dispatchUntil": "invalid"}, {"startedAt": now.replace(tzinfo=None).isoformat()}):
            self.assertIsNone(youtube_acceptance_target({**control, **overrides}, now))
        self.assertIsNone(youtube_acceptance_target(control, now + timedelta(hours=76)))
        self.assertIsNone(acceptance_target(control, now))

    def test_each_child_dispatches_even_if_the_other_fails(self):
        now = datetime.now(timezone.utc)
        controls = {
            "isolated_project": None,
            "active": {"enabled": True, "appName": "joey-scout-soak-20261019", "startedAt": (now - timedelta(minutes=1)).isoformat(), "dispatchUntil": (now + timedelta(hours=72)).isoformat()},
            "youtube_api": {"enabled": True, "appName": "joey-youtube-api-soak-20261019", "startedAt": (now - timedelta(minutes=1)).isoformat(), "dispatchUntil": (now + timedelta(hours=26)).isoformat()},
        }
        for failed in ("active", "youtube_api"):
            fake_modal = Mock()
            fake_modal.Dict.from_name.return_value.get.side_effect = lambda key: controls[key]
            attempted = []
            def function(app, name):
                attempted.append(app)
                if app == controls[failed]["appName"]:
                    raise RuntimeError("fixture failure")
                return Mock()
            fake_modal.Function.from_name.side_effect = function
            with patch.dict("sys.modules", {"modal": fake_modal}):
                with self.assertRaisesRegex(RuntimeError, "1 child"):
                    dispatch_acceptance()
            self.assertEqual(attempted, [controls["active"]["appName"], controls["youtube_api"]["appName"]])
            fake_modal.Dict.from_name.return_value.put.assert_not_called()

    def test_new_acceptance_requires_the_separate_project_and_original_clock_bounds(self):
        now = datetime.now(timezone.utc)
        control = {"enabled": True, "appName": "joey-project-scout-soak-20261024", "projectId": "autumn-dawn-08510576", "startedAt": now.isoformat(), "dispatchUntil": (now + timedelta(hours=75)).isoformat()}
        self.assertEqual(project_acceptance_target(control, now), control["appName"])
        for change in ({"projectId": "bitter-dawn-07566160"}, {"dispatchUntil": (now + timedelta(hours=76)).isoformat()}, {"enabled": False}, {"appName": "joey-youtube-api-soak-20261019"}):
            self.assertIsNone(project_acceptance_target({**control, **change}, now))

    def test_capacity_reuses_timer_once_per_slot_without_database_or_http_probe(self):
        fake_modal = Mock()
        fake_modal.Dict.from_name.return_value.put.side_effect = [True, False]
        with patch.dict("sys.modules", {"modal": fake_modal}), patch("scheduler.httpx.Client") as http:
            dispatch_capacity()
            dispatch_capacity()
        fake_modal.Function.from_name.assert_called_once_with("joey-capacity-monitor", "check")
        fake_modal.Function.from_name.return_value.spawn.assert_called_once()
        http.assert_not_called()

    def execute(self, responses, cache=None, now=None):
        seen = []

        def handle(request):
            seen.append(request)
            self.assertEqual(request.headers["authorization"], "Bearer " + "x" * 64)
            return responses.pop(0)

        client = httpx.Client(transport=httpx.MockTransport(handle), headers={"Authorization": "Bearer " + "x" * 64})
        with patch.dict(os.environ, {"JOEY_URL": "https://joey.example", "CRON_SECRET": "x" * 64}), patch("scheduler.httpx.Client", return_value=client):
            result = run_tick(readiness_cache=cache, now=now)
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

    def test_recent_readiness_skips_only_the_duplicate_probe_not_cron(self):
        cache = {"ready": {"origin": "https://joey.example", "checkedAt": 1000}}
        result, seen = self.execute([httpx.Response(200, json={"ok": True})], cache, 1299)
        self.assertEqual(result["status"], "ok")
        self.assertEqual([r.url.path for r in seen], ["/api/cron"])

    def test_cache_expires_and_never_applies_to_another_origin_or_future_clock(self):
        for cached in ({"origin": "https://another.example", "checkedAt": 1000}, {"origin": "https://joey.example", "checkedAt": 999}, {"origin": "https://joey.example", "checkedAt": 1301}):
            cache = {"ready": cached}
            _, seen = self.execute([httpx.Response(200, json={"ready": True}), httpx.Response(200, json={"ok": True})], cache, 1300)
            self.assertEqual([r.url.path for r in seen], ["/api/internal/runtime", "/api/cron"])
            self.assertEqual(cache["ready"]["checkedAt"], 1300)

    def test_cron_error_invalidates_cached_readiness(self):
        for response in (httpx.Response(503), httpx.Response(200, json={"ok": False})):
            cache = {"ready": {"origin": "https://joey.example", "checkedAt": 1000}}
            with self.assertRaises(RuntimeError):
                self.execute([response], cache, 1001)
            self.assertEqual(cache["ready"], {})


if __name__ == "__main__":
    unittest.main()
