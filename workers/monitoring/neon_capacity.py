"""Capacity observations from Neon's management API; never opens Postgres."""
import math
from datetime import datetime, timezone


def capacity_snapshot(project, now=None):
    now = now or datetime.now(timezone.utc)
    seconds = project.get("compute_time_seconds")
    if not isinstance(seconds, (int, float)) or isinstance(seconds, bool) or not math.isfinite(seconds) or seconds < 0:
        raise ValueError("Neon did not return a valid compute observation")
    plan = project.get("owner", {}).get("subscription_type", "unknown")
    free = plan.startswith("free")
    hours = seconds / 3600
    percent = hours if free else None  # Free includes 100 CU-hours/project/month.
    threshold = next((n for n in (100, 95, 85, 70) if percent is not None and percent >= n), 0)
    return {
        "checkedAt": now.isoformat(), "projectId": project["id"], "plan": plan,
        "periodStart": project.get("consumption_period_start"),
        "periodEnd": project.get("consumption_period_end"),
        "computeCuHours": round(hours, 3), "estimatedFreeAllowancePercent": round(percent, 2) if free else None,
        "threshold": threshold, "severity": "critical" if threshold >= 95 else "warning" if threshold else "ok",
        "basis": "Management API project consumption counter; may lag and retain historical usage after ownership transfer. Not an invoice or a live connection test.",
    }


def alert_key(snapshot):
    return f'{snapshot["projectId"]}:{snapshot["periodStart"]}:{snapshot["threshold"]}'
