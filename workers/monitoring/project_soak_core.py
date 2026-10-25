"""Fresh acceptance run in a different Neon project, preserving retired runs."""
import re
from urllib.parse import urlsplit
from scout_soak_core import instant
from youtube_api_soak_core import summarize as api_summary, retain_observed_issues, finish_summary, utc_iso, finalizable

APP_NAME = "joey-project-scout-soak-20261024"
PRODUCTION_PROJECT = "bitter-dawn-07566160"
QA_PROJECT = "autumn-dawn-08510576"
QA_HOST = "ep-autumn-breeze-b5h33fdm-pooler.c-7.us-east-2.aws.neon.tech"
QA_BRANCH = "br-young-snow-b5uzf3mv"
PREVIEW_ORIGIN = "https://joey-git-codex-isolated-scout-qa-evonera.vercel.app"
GOAL_CONDITION = "views > 1000000000000"


def validate_run(run, env):
    if run.get("projectId") != QA_PROJECT or env.get("JOEY_SOAK_PROJECT_ID") != QA_PROJECT or run.get("branchId") != QA_BRANCH:
        raise ValueError("Acceptance must use the separate QA project and owned branch")
    if run.get("databaseHost") != QA_HOST or urlsplit(env.get("JOEY_SOAK_DATABASE_URL", "")).hostname != QA_HOST:
        raise ValueError("Acceptance database must belong to the separate QA project")
    if run.get("previewOrigin") != PREVIEW_ORIGIN or env.get("JOEY_SOAK_ORIGIN") != PREVIEW_ORIGIN:
        raise ValueError("Acceptance may only invoke its new preview")
    if run.get("runId") != APP_NAME or run.get("billingMode") != "test_mode" or not re.fullmatch(r"sub_[A-Za-z0-9_]+", run.get("subscriptionId", "")):
        raise ValueError("Owned new run and provider-confirmed TEST subscription required")
    if not re.fullmatch(r"[0-9a-f]{40}", run.get("sourceCommit", "")) or not re.fullmatch(r"dpl_[A-Za-z0-9]+", run.get("deploymentId", "")):
        raise ValueError("Pin source and deployment before starting")
    if (instant(run["endsAt"]) - instant(run["startedAt"])).total_seconds() != 72 * 3600:
        raise ValueError("A fixed 72-hour acceptance window is required")
    if len(env.get("JOEY_SOAK_CRON_SECRET", "")) < 32 or not env.get("JOEY_SOAK_BYPASS"):
        raise ValueError("Authenticated preview scheduling is required")
    scouts = run.get("scouts", [])
    if len(scouts) != 4 or len({s["id"] for s in scouts}) != 4:
        raise ValueError("Exactly four distinct new Scouts required")
    if sorted((s["platform"], s["intervalMinutes"]) for s in scouts) != [("rss", 15), ("rss", 1440), ("youtube", 15), ("youtube", 1440)]:
        raise ValueError("Exercise fast and daily cadences for official YouTube API and RSS")
    if any(s.get("goalCondition") != GOAL_CONDITION for s in scouts):
        raise ValueError("Unreachable numeric goals avoid unintended alerts")


def summarize(run, receipts, now, tick_errors=0):
    results = []
    for platform in ("youtube", "rss"):
        scoped = {**run, "scouts": [s for s in run["scouts"] if s["platform"] == platform]}
        result = api_summary(scoped, receipts, now, tick_errors if platform == "youtube" else 0, require_api=platform == "youtube")
        for source in result["scouts"]:
            source["requiredAdapter"] = "youtube-data-api" if platform == "youtube" else "rss"
            if platform == "rss":
                source.pop("nonApiCollections", None)
        results.append(result)
    api, feed = results
    issues = sorted(set(api["issues"] + feed["issues"]))
    pending = sum(r["status"] in ("pending", "running") for r in receipts if r["tenantId"] == run["tenantId"] and r["scoutId"] in {s["id"] for s in run["scouts"]})
    finished = now >= instant(run["endsAt"]) and not pending
    return {**api, "phase": "finished" if finished else "finishing" if now >= instant(run["endsAt"]) else "running", "passed": not issues if finished else None,
            "issues": issues, "observedIssues": sorted(set(api.get("observedIssues", []) + [i for i in feed["issues"] if "collection gap" not in i])),
            "scouts": api["scouts"] + feed["scouts"], "pendingEvaluations": pending}
