"""Bounded acceptance monitoring; never grants billing access or publishes content."""
from datetime import datetime, timezone
from urllib.parse import urlsplit

PREVIEW_ORIGIN = "https://joey-git-codex-theme-studio-rollout-20261010-evonera.vercel.app"
PREVIEW_HOST = "ep-young-bread-axqgw7ml-pooler.c-4.us-east-2.aws.neon.tech"


def instant(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Acceptance timestamps must include a timezone")
    return parsed.astimezone(timezone.utc)


def validate_run(run, env):
    if env.get("JOEY_SOAK_ORIGIN") != PREVIEW_ORIGIN:
        raise ValueError("Acceptance may only invoke the isolated preview")
    if urlsplit(env.get("JOEY_SOAK_DATABASE_URL", "")).hostname != PREVIEW_HOST:
        raise ValueError("Acceptance may only connect to the isolated preview database")
    if len(env.get("JOEY_SOAK_CRON_SECRET", "")) < 32 or not env.get("JOEY_SOAK_BYPASS"):
        raise ValueError("Authenticated preview scheduling is required")
    duration = (instant(run["endsAt"]) - instant(run["startedAt"])).total_seconds()
    if not 0 < duration <= 72 * 3600:
        raise ValueError("Acceptance must have a fixed deadline of at most 72 hours")
    if run.get("billingMode") != "test_mode" or not run.get("subscriptionId", "").startswith("sub_"):
        raise ValueError("Provider-confirmed TEST subscription is required")
    if len(run.get("scouts", [])) != 4 or len({s["id"] for s in run["scouts"]}) != 4:
        raise ValueError("Exactly four distinct acceptance Scouts are required")
    if sorted(s["intervalMinutes"] for s in run["scouts"]) != [15, 15, 1440, 1440]:
        raise ValueError("Acceptance must exercise fast QA and customer daily cadences")


def summarize(run, receipts, now, tick_errors=0):
    started, deadline = instant(run["startedAt"]), instant(run["endsAt"])
    end = min(now, deadline)
    elapsed = max(0, (end - started).total_seconds())
    reports, issues = [], []
    allowed = {s["id"] for s in run["scouts"]}
    scoped = [r for r in receipts if r["scoutId"] in allowed and r["tenantId"] == run["tenantId"]]
    for scout in run["scouts"]:
        rows = [r for r in scoped if r["scoutId"] == scout["id"]]
        completed = sorted([r for r in rows if r["status"] == "completed"], key=lambda r: r["createdAt"])
        times = [started] + [instant(r["createdAt"]) for r in completed] + [end]
        gaps = [max(0, (b - a).total_seconds()) for a, b in zip(times, times[1:])]
        tolerance = (scout["intervalMinutes"] + (5 if scout["intervalMinutes"] == 15 else 10)) * 60
        bad = [r for r in rows if r["status"] in ("failed", "uncertain")]
        stalled = [r for r in rows if r["status"] in ("pending", "running") and (now - instant(r["createdAt"])).total_seconds() > 15 * 60]
        duplicates = len(rows) - len({r["eventKey"] for r in rows})
        empty = sum(r["itemCount"] < 1 for r in completed)
        minimum = 250 if scout["intervalMinutes"] == 15 else 3
        report = {**scout, "completed": len(completed), "failed": len(bad), "stalled": len(stalled), "duplicateEvents": duplicates, "emptyCollections": empty, "maxGapSeconds": round(max(gaps, default=0)), "minimumAtCompletion": minimum, "latest": completed[-1] if completed else None}
        reports.append(report)
        for flag, value in (("failed", len(bad)), ("stalled", len(stalled)), ("duplicateEvents", duplicates), ("emptyCollections", empty)):
            if value:
                issues.append(f'{scout["name"]}: {flag}={value}')
        if max(gaps, default=0) > tolerance:
            issues.append(f'{scout["name"]}: collection gap exceeded {tolerance // 60} minutes')
        if now >= deadline and len(completed) < minimum:
            issues.append(f'{scout["name"]}: insufficient completed collections')
    if tick_errors:
        issues.append(f"Scheduler HTTP failures: {tick_errors}")
    return {"checkedAt": now.isoformat(), "runId": run["runId"], "startedAt": run["startedAt"], "endsAt": run["endsAt"], "elapsedHours": round(elapsed / 3600, 3), "phase": "running" if now < deadline else "finished", "passed": None if now < deadline else not issues, "issues": issues, "scouts": reports}
