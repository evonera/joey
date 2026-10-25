import unittest
from neon_capacity import capacity_snapshot, alert_key


class CapacityTests(unittest.TestCase):
    def project(self, hours=0, plan="free_v3"):
        return {"id": "qa-project", "compute_time_seconds": hours * 3600, "owner": {"subscription_type": plan}, "consumption_period_start": "2026-10-01T00:00:00Z"}

    def test_warns_before_free_quota_and_deduplicates_by_period_and_threshold(self):
        for hours, threshold in ((69.9, 0), (70, 70), (85, 85), (95, 95), (110, 100)):
            result = capacity_snapshot(self.project(hours))
            self.assertEqual(result["threshold"], threshold)
        self.assertNotEqual(alert_key(capacity_snapshot(self.project(85))), alert_key(capacity_snapshot(self.project(95))))
        changed = {**self.project(85), "consumption_period_start": "2026-11-01T00:00:00Z"}
        self.assertNotEqual(alert_key(capacity_snapshot(self.project(85))), alert_key(capacity_snapshot(changed)))

    def test_paid_or_unknown_plans_do_not_inherit_free_limits(self):
        for plan in ("launch", "scale", "unknown"):
            result = capacity_snapshot(self.project(1000, plan))
            self.assertIsNone(result["estimatedFreeAllowancePercent"])
            self.assertEqual(result["threshold"], 0)

    def test_missing_or_invalid_usage_is_never_reported_as_zero(self):
        for value in (None, -1, float("nan"), float("inf"), True, "0"):
            with self.assertRaises(ValueError):
                capacity_snapshot({**self.project(), "compute_time_seconds": value})
