"""API-only acceptance evidence. Never changes billing or original run state."""
import re
from datetime import timezone
from urllib.parse import urlsplit

from scout_soak_core import PREVIEW_HOST, instant

PRODUCTION_HOST = "ep-cool-voice-ax9uc23h-pooler.c-4.us-east-2.aws.neon.tech"
ORIGINAL_TENANT = "0197cbe2-c349-447b-adc2-442facc8388f"
ORIGINAL_SUBSCRIPTION = "sub_0Nq1kgQvJTw4wbqeKPFTw"

APP_NAME = "joey-youtube-api-soak-20261019"
GOAL_CONDITION = "views > 1000000000000"
PREVIEW_ORIGIN = "https://joey-git-codex-youtube-data-api-evonera.vercel.app"


def validate_run(run, env):
    if env.get("JOEY_SOAK_ORIGIN") != PREVIEW_ORIGIN or run.get("previewOrigin") != PREVIEW_ORIGIN:
        raise ValueError("API acceptance may only invoke its dedicated preview")
    expected_host = env.get("JOEY_YOUTUBE_SOAK_DATABASE_HOST", "")
    if (not re.fullmatch(r"ep-[a-z0-9-]+-pooler\.c-[0-9]+\.us-east-2\.aws\.neon\.tech", expected_host) or
            expected_host in (PREVIEW_HOST, PRODUCTION_HOST) or
            run.get("databaseHost") != expected_host or
            urlsplit(env.get("JOEY_SOAK_DATABASE_URL", "")).hostname != expected_host):
        raise ValueError("API acceptance requires its separate isolated database branch")
    if len(env.get("JOEY_SOAK_CRON_SECRET", "")) < 32 or not env.get("JOEY_SOAK_BYPASS"):
        raise ValueError("Authenticated preview scheduling is required")
    if run.get("adapter") != "youtube-data-api":
        raise ValueError("API-only acquisition is required")
    if not re.fullmatch(r"[0-9a-f]{40}", run.get("sourceCommit", "")) or not re.fullmatch(r"dpl_[A-Za-z0-9]+", run.get("deploymentId", "")):
        raise ValueError("Acceptance requires a pinned source commit and deployment")
    if (instant(run["endsAt"]) - instant(run["startedAt"])).total_seconds() != 72 * 3600:
        raise ValueError("API acceptance must have a fixed 72-hour deadline")
    if run.get("billingMode") != "test_mode" or not re.fullmatch(r"sub_[A-Za-z0-9_]+", run.get("subscriptionId", "")):
        raise ValueError("Provider-confirmed TEST access is required")
    if run.get("tenantId") == ORIGINAL_TENANT or run.get("subscriptionId") == ORIGINAL_SUBSCRIPTION:
        raise ValueError("API acceptance must never mutate original workspace billing")
    scouts = run.get("scouts", [])
    if len(scouts) != 2 or len({s["id"] for s in scouts}) != 2:
        raise ValueError("Exactly two distinct owned API Scouts are required")
    if sorted(s["intervalMinutes"] for s in scouts) != [15, 1440] or any(s.get("platform") != "youtube" for s in scouts):
        raise ValueError("API acceptance requires fast QA and normal daily YouTube cadences")
    if any(s.get("goalCondition") != GOAL_CONDITION for s in scouts):
        raise ValueError("API acceptance requires an unreachable numeric goal")
    original_ids = set(run.get("originalScoutIds", []))
    if len(original_ids) != 4 or original_ids.intersection(s["id"] for s in scouts):
        raise ValueError("API Scouts must be separate from the four original Scouts")


def utc_iso(value):
    """Postgres AT TIME ZONE produces aware datetimes; never append a second offset."""
    return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).astimezone(timezone.utc).isoformat()


def collection_time(receipt):
    try:
        return instant(receipt["earliestObservedAt"])
    except (KeyError, TypeError, ValueError):
        return instant(receipt["createdAt"])


def summarize(run, receipts, now, tick_errors=0):
    started, deadline = instant(run["startedAt"]), instant(run["endsAt"])
    end = min(now.astimezone(timezone.utc), deadline)
    reports, issues, observed_issues = [], [], []
    allowed = {s["id"] for s in run["scouts"]}
    scoped = [r for r in receipts if r["scoutId"] in allowed and r["tenantId"] == run["tenantId"] and instant(r["createdAt"]) >= started]
    for scout in run["scouts"]:
        rows = [r for r in scoped if r["scoutId"] == scout["id"]]
        all_completed = [r for r in rows if r["status"] == "completed"]
        completed = sorted([r for r in all_completed if started <= collection_time(r) <= deadline and instant(r["createdAt"]) <= deadline], key=collection_time)
        times = [started] + [collection_time(r) for r in completed] + [end]
        max_gap = max((max(0, (b - a).total_seconds()) for a, b in zip(times, times[1:])), default=0)
        tolerance = (scout["intervalMinutes"] + (5 if scout["intervalMinutes"] == 15 else 10)) * 60
        pending = sum(r["status"] in ("pending", "running") for r in rows)
        flags = {
            "failed": sum(r["status"] in ("failed", "uncertain") for r in rows),
            "unexpectedStatuses": sum(r["status"] not in ("completed", "failed", "uncertain", "pending", "running") for r in rows),
            "stalled": sum(r["status"] in ("pending", "running") and (now - instant(r["createdAt"])).total_seconds() > 900 for r in rows),
            "duplicateEvents": len(rows) - len({r["eventKey"] for r in rows}),
            "emptyCollections": sum(r["itemCount"] < 1 for r in all_completed),
            "nonApiCollections": sum(r.get("apiItemCount", 0) != r["itemCount"] for r in all_completed),
            "staleCollections": sum(not fresh_observation(r) for r in all_completed),
            "outOfWindowCollections": len(all_completed) - len(completed),
            "lateAdmissions": sum(instant(r["createdAt"]) > deadline for r in rows),
        }
        minimum = 250 if scout["intervalMinutes"] == 15 else 3
        reports.append({**scout, **flags, "pending": pending, "completed": len(completed), "maxGapSeconds": round(max_gap), "minimumAtCompletion": minimum, "latest": completed[-1] if completed else None})
        concrete = [f'{scout["name"]}: {flag}={value}' for flag, value in flags.items() if value]
        issues.extend(concrete)
        observed_issues.extend(concrete)
        if max_gap > tolerance:
            issues.append(f'{scout["name"]}: collection gap exceeded {tolerance // 60} minutes')
        if now >= deadline and not pending and len(completed) < minimum:
            issues.append(f'{scout["name"]}: insufficient completed collections')
    if tick_errors:
        issues.append(f"Acceptance runner failures: {tick_errors}")
        observed_issues.append(f"Acceptance runner failures: {tick_errors}")
    pending = sum(s["pending"] for s in reports)
    phase = "running" if now < deadline else "finishing" if pending else "finished"
    return {"checkedAt": now.isoformat(), "runId": run["runId"], "startedAt": run["startedAt"], "endsAt": run["endsAt"], "elapsedHours": round(max(0, (end - started).total_seconds()) / 3600, 3), "phase": phase, "pendingEvaluations": pending, "passed": None if phase != "finished" else not issues, "issues": issues, "observedIssues": observed_issues, "scouts": reports}


def retain_observed_issues(summary, previous):
    # Transient stalled/failed observations must not vanish after recovery.
    # Rolling end gaps are recomputed from collection times; a not-yet-saved
    # in-flight collection may still provide real evidence for that interval.
    observed = sorted(set(previous.get("observedIssues", []) + summary.get("observedIssues", [])))
    issues = sorted(set(summary["issues"] + observed))
    return {**summary, "observedIssues": observed, "issues": issues, "passed": not issues if summary["phase"] == "finished" else None}


def finish_summary(summary, billing_status, active_scouts, stop_requested=False):
    settled = billing_status == "cancelled" and active_scouts == 0 and summary.get("pendingEvaluations") == 0
    return {**summary, "phase": "finished" if settled else "finishing", "providerStatus": "cancelled", "webhookCancellationConfirmed": billing_status == "cancelled", "scoutsPaused": active_scouts == 0, "passed": (not summary["issues"] and not stop_requested) if settled else None}


def fresh_observation(receipt):
    try:
        earliest = instant(receipt["earliestObservedAt"])
        latest = instant(receipt["latestObservedAt"])
        created = instant(receipt["createdAt"])
        updated = instant(receipt["updatedAt"])
        return (receipt.get("observationCount", 0) == receipt["itemCount"] and
                created.timestamp() - 60 <= earliest.timestamp() <= latest.timestamp() <= updated.timestamp() + 60 and
                (updated - earliest).total_seconds() <= 300)
    except (KeyError, ValueError, TypeError):
        return False


def finalizable(summary):
    return (summary.get("phase") == "finished" and summary.get("scoutsPaused") is True
            and summary.get("providerStatus") == "cancelled" and summary.get("webhookCancellationConfirmed") is True
            and summary.get("pendingEvaluations") == 0)
