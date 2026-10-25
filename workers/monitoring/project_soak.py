"""New API/RSS acceptance runner in a separate Neon project."""
from pathlib import Path
import modal

root = Path(__file__).parent
APP_NAME = "joey-project-scout-soak-20261024"
app = modal.App(APP_NAME)
image = (modal.Image.debian_slim(python_version="3.12")
         .pip_install("httpx==0.28.1", "psycopg[binary]==3.2.10")
         .add_local_dir(str(root), "/acceptance", copy=True, ignore=["__pycache__"]))
state = modal.Dict.from_name(APP_NAME, create_if_missing=True)
secret = modal.Secret.from_name(APP_NAME)


@app.function(image=image, cpu=0.125, memory=256, timeout=180, max_containers=1,
              secrets=[secret])
def tick():
    import os
    import sys
    from datetime import datetime, timezone
    import httpx
    import psycopg
    from psycopg.rows import dict_row
    sys.path.insert(0, "/acceptance")
    from scout_soak_core import instant, cancel_test_subscription
    from project_soak_core import summarize, validate_run, utc_iso, finish_summary, retain_observed_issues

    run = state.get("run")
    if not run:
        return {"phase": "awaiting_config"}
    previous = state.get("summary", {})
    if previous.get("phase") == "finished":
        return previous
    now = datetime.now(timezone.utc)
    if now < instant(run["startedAt"]):
        return {"phase": "awaiting_start"}
    minute = now.strftime("%Y-%m-%dT%H:%M")
    if not state.put("admission:" + minute, now.isoformat(), skip_if_exists=True):
        return {"phase": "already_admitted"}
    record = {"checkedAt": now.isoformat(), "runId": run["runId"]}
    try:
        validate_run(run, os.environ)
        stop = now >= instant(run["endsAt"]) or run.get("stopRequested", False)
        ids = [s["id"] for s in run["scouts"]]
        with psycopg.connect(os.environ["JOEY_SOAK_DATABASE_URL"], connect_timeout=10, autocommit=True, row_factory=dict_row) as db:
            tenant = db.execute("SELECT dodo_subscription_id, subscription_status FROM tenants WHERE id = %s", (run["tenantId"],)).fetchone()
            if not tenant or tenant["dodo_subscription_id"] != run["subscriptionId"]:
                raise RuntimeError("API acceptance workspace subscription ownership changed")
            if not stop and tenant["subscription_status"] != "active":
                raise RuntimeError("Provider-confirmed TEST access is no longer active")
            owned = db.execute("SELECT id, platform, poll_interval_minutes, target_url, goal_condition FROM scouts WHERE tenant_id = %s AND id = ANY(%s)", (run["tenantId"], ids)).fetchall()
            if len(owned) != 4:
                raise RuntimeError("API acceptance Scout ownership changed")
            expected = {s["id"]: s for s in run["scouts"]}
            for scout in ([] if stop else owned):
                configured = expected[scout["id"]]
                if (scout["platform"] != configured["platform"] or scout["poll_interval_minutes"] != configured["intervalMinutes"] or
                        scout["target_url"] != configured["targetUrl"] or scout["goal_condition"] != configured["goalCondition"]):
                    raise RuntimeError("API acceptance Scout configuration changed")
            if stop:
                db.execute("UPDATE scouts SET is_active = false WHERE tenant_id = %s AND id = ANY(%s)", (run["tenantId"], ids))
        with httpx.Client(follow_redirects=False, timeout=15) as client:
            if stop:
                cancel_test_subscription(client, run, os.environ["JOEY_SOAK_DODO_TEST_KEY"])
                record["providerStatus"] = "cancelled"
            else:
                subscription = client.get("https://test.dodopayments.com/subscriptions/" + run["subscriptionId"], headers={"Authorization": "Bearer " + os.environ["JOEY_SOAK_DODO_TEST_KEY"]})
                if (subscription.status_code != 200 or subscription.json().get("metadata", {}).get("tenantId") != run["tenantId"] or
                        subscription.json().get("status") != "active"):
                    raise RuntimeError("Provider TEST subscription is not active and owned")
                headers = {"Authorization": "Bearer " + os.environ["JOEY_SOAK_CRON_SECRET"], "x-vercel-protection-bypass": os.environ["JOEY_SOAK_BYPASS"]}
                runtime = client.get(os.environ["JOEY_SOAK_ORIGIN"] + "/api/internal/runtime", headers=headers)
                if runtime.status_code not in (200, 503) or runtime.json().get("sourceCommit") != run["sourceCommit"]:
                    raise RuntimeError("API acceptance preview source commit changed")
                record["runtimeReady"] = runtime.json().get("ready")
                response = client.get(os.environ["JOEY_SOAK_ORIGIN"] + "/api/cron", headers=headers, timeout=65)
                record["httpStatus"] = response.status_code
                if response.status_code != 200:
                    raise RuntimeError("API acceptance scheduler HTTP failure")
                body = response.json()
                if body.get("ok") is not True or any(x.get("error") or x.get("status") == "rejected" for x in body.get("summary", [])):
                    raise RuntimeError("API acceptance scheduler reported failed operations")
                record["skipped"] = body.get("skipped")
        with psycopg.connect(os.environ["JOEY_SOAK_DATABASE_URL"], connect_timeout=10, autocommit=True, row_factory=dict_row) as db:
            rows = db.execute("""SELECT id, tenant_id, scout_id, event_key, status, error,
                created_at AT TIME ZONE 'UTC' AS created_at, updated_at AT TIME ZONE 'UTC' AS updated_at,
                coalesce(jsonb_array_length(items), 0) AS item_count,
                (SELECT count(*) FROM jsonb_array_elements(coalesce(items, '[]')) e WHERE e->>'acquisitionProvider' = 'youtube-data-api') AS api_item_count,
                (SELECT count(*) FROM jsonb_array_elements(coalesce(items, '[]')) e WHERE e->>'observedAt' IS NOT NULL) AS observation_count,
                (SELECT min(e->>'observedAt') FROM jsonb_array_elements(coalesce(items, '[]')) e) AS earliest_observed_at,
                (SELECT max(e->>'observedAt') FROM jsonb_array_elements(coalesce(items, '[]')) e) AS latest_observed_at,
                items->0->>'id' AS source_post_id, items->0->>'url' AS sample_url,
                md5((SELECT string_agg(e->>'id', ',' ORDER BY e->>'id') FROM jsonb_array_elements(coalesce(items, '[]')) e)) AS snapshot_hash
                FROM scout_evaluations WHERE tenant_id = %s AND scout_id = ANY(%s) ORDER BY created_at""", (run["tenantId"], ids)).fetchall()
            receipts = [{"id": r["id"], "tenantId": r["tenant_id"], "scoutId": r["scout_id"], "eventKey": r["event_key"], "status": r["status"], "error": r["error"], "createdAt": utc_iso(r["created_at"]), "updatedAt": utc_iso(r["updated_at"]), "itemCount": r["item_count"], "apiItemCount": r["api_item_count"], "observationCount": r["observation_count"], "earliestObservedAt": r["earliest_observed_at"], "latestObservedAt": r["latest_observed_at"], "sourcePostId": r["source_post_id"], "sampleUrl": r["sample_url"], "snapshotHash": r["snapshot_hash"]} for r in rows]
            alerts = db.execute("SELECT count(*) AS n FROM scout_runs WHERE tenant_id = %s AND scout_id = ANY(%s) AND status = 'alert_triggered'", (run["tenantId"], ids)).fetchone()["n"]
            billing = db.execute("SELECT subscription_status FROM tenants WHERE id = %s", (run["tenantId"],)).fetchone()["subscription_status"]
            active = db.execute("SELECT count(*) AS n FROM scouts WHERE tenant_id = %s AND id = ANY(%s) AND is_active", (run["tenantId"], ids)).fetchone()["n"]
        checked = datetime.now(timezone.utc)
        summary = summarize(run, receipts, checked, previous.get("tickErrors", 0))
        summary.update({"tickErrors": previous.get("tickErrors", 0), "tickCount": previous.get("tickCount", 0) + 1, "unexpectedAlerts": alerts, "billingStatus": billing, "lastTick": record, "subscriptionId": run["subscriptionId"], "sourceCommit": run["sourceCommit"], "deploymentId": run["deploymentId"], "scope": "Separate Neon project and provider-confirmed TEST workspace; official YouTube API and RSS collection. No social publication or AI calls."})
        if alerts:
            summary["issues"].append("Unexpected alerts for an unreachable numeric goal")
            summary["observedIssues"].append("Unexpected alerts for an unreachable numeric goal")
        summary = retain_observed_issues(summary, previous)
        if stop:
            summary = finish_summary(summary, billing, active, run.get("stopRequested", False))
        state.put("receipts", receipts)
        state.put("summary", summary)
        state.put("tick:" + minute, {**record, "status": "ok"})
        return summary
    except Exception as error:
        record.update({"status": "failed", "errorClass": type(error).__name__})
        state.put("tick:" + minute, record)
        state.put("summary", {**previous, "phase": "finishing" if now >= instant(run["endsAt"]) else "running", "checkedAt": datetime.now(timezone.utc).isoformat(), "tickErrors": previous.get("tickErrors", 0) + 1, "tickCount": previous.get("tickCount", 0) + 1, "lastTick": record, "issues": sorted(set(previous.get("issues", []) + ["Isolated project acceptance runner failed; inspect the latest failed tick."]))})
        raise RuntimeError("Joey API acceptance tick failed") from None
