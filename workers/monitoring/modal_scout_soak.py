"""Deploy a separate, bounded acceptance runner; production scheduler is untouched."""
from pathlib import Path
import modal

root = Path(__file__).parent
app = modal.App("joey-scout-soak-20261019")
image = (modal.Image.debian_slim(python_version="3.12")
         .pip_install("httpx==0.28.1", "psycopg[binary]==3.2.10")
         .add_local_dir(str(root), "/acceptance", copy=True, ignore=["__pycache__"]))
state = modal.Dict.from_name("joey-scout-soak-20261019", create_if_missing=True)
secret = modal.Secret.from_name("joey-scout-soak-20261019")


@app.function(image=image, cpu=0.125, memory=256, timeout=120, max_containers=1,
              secrets=[secret])
def tick():
    import os
    import sys
    from datetime import datetime, timezone
    import httpx
    import psycopg
    from psycopg.rows import dict_row
    sys.path.insert(0, "/acceptance")
    from scout_soak_core import instant, summarize, validate_run, cancel_test_subscription

    run = state.get("run")
    if not run:
        return {"phase": "awaiting_config"}
    previous = state.get("summary", {})
    if previous.get("phase") == "finished":
        return previous
    now = datetime.now(timezone.utc)
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
                raise RuntimeError("Acceptance workspace subscription ownership changed")
            if not stop and tenant["subscription_status"] != "active":
                raise RuntimeError("Provider-confirmed TEST access is no longer active")
            if stop:
                db.execute("UPDATE scouts SET is_active = false WHERE tenant_id = %s AND id = ANY(%s)", (run["tenantId"], ids))
            else:
                owned = db.execute("SELECT count(*) AS n FROM scouts WHERE tenant_id = %s AND id = ANY(%s)", (run["tenantId"], ids)).fetchone()
                if owned["n"] != 4:
                    raise RuntimeError("Acceptance Scout ownership changed")
        with httpx.Client(follow_redirects=False, timeout=15) as client:
            if stop:
                cancel_test_subscription(client, run, os.environ["JOEY_SOAK_DODO_TEST_KEY"])
                record["providerStatus"] = "cancelled"
            else:
                response = client.get(os.environ["JOEY_SOAK_ORIGIN"] + "/api/cron", headers={"Authorization": "Bearer " + os.environ["JOEY_SOAK_CRON_SECRET"], "x-vercel-protection-bypass": os.environ["JOEY_SOAK_BYPASS"]}, timeout=65)
                record["httpStatus"] = response.status_code
                if response.status_code != 200:
                    raise RuntimeError("Preview scheduler HTTP failure")
                body = response.json()
                if body.get("ok") is not True or any(x.get("error") or x.get("status") == "rejected" for x in body.get("summary", [])):
                    raise RuntimeError("Preview scheduler reported failed operations")
                record["skipped"] = body.get("skipped")
        with psycopg.connect(os.environ["JOEY_SOAK_DATABASE_URL"], connect_timeout=10, autocommit=True, row_factory=dict_row) as db:
            rows = db.execute("""SELECT id, tenant_id, scout_id, event_key, status, error,
                created_at AT TIME ZONE 'UTC' AS created_at, updated_at AT TIME ZONE 'UTC' AS updated_at,
                coalesce(jsonb_array_length(items), 0) AS item_count,
                items->0->>'id' AS source_post_id, items->0->>'url' AS sample_url,
                items->0->>'observedAt' AS observed_at,
                md5((SELECT string_agg(e->>'id', ',' ORDER BY e->>'id') FROM jsonb_array_elements(coalesce(items, '[]')) e)) AS snapshot_hash
                FROM scout_evaluations WHERE tenant_id = %s AND scout_id = ANY(%s) ORDER BY created_at""", (run["tenantId"], ids)).fetchall()
            receipts = [{"id": r["id"], "tenantId": r["tenant_id"], "scoutId": r["scout_id"], "eventKey": r["event_key"], "status": r["status"], "error": r["error"], "createdAt": r["created_at"].isoformat(), "updatedAt": r["updated_at"].isoformat(), "itemCount": r["item_count"], "sourcePostId": r["source_post_id"], "sampleUrl": r["sample_url"], "observedAt": r["observed_at"], "snapshotHash": r["snapshot_hash"]} for r in rows]
            alerts = db.execute("SELECT count(*) AS n FROM scout_runs WHERE tenant_id = %s AND scout_id = ANY(%s) AND status = 'alert_triggered'", (run["tenantId"], ids)).fetchone()["n"]
            billing = db.execute("SELECT subscription_status FROM tenants WHERE id = %s", (run["tenantId"],)).fetchone()["subscription_status"]
        checked = datetime.now(timezone.utc)
        summary = summarize(run, receipts, checked, previous.get("tickErrors", 0))
        summary.update({"tickErrors": previous.get("tickErrors", 0), "tickCount": previous.get("tickCount", 0) + 1, "unexpectedAlerts": alerts, "billingStatus": billing, "lastTick": record, "subscriptionId": run["subscriptionId"], "scope": "Isolated preview TEST workspace; YouTube/RSS acquisition. No social publication or AI model calls."})
        if alerts:
            summary["issues"].append("Unexpected alerts for an unreachable numeric goal")
        if stop:
            summary["phase"] = "finished"
            summary["providerStatus"] = "cancelled"
            summary["webhookCancellationConfirmed"] = billing == "cancelled"
            summary["scoutsPaused"] = True
            if billing != "cancelled":
                summary["phase"] = "finishing"
            summary["passed"] = not summary["issues"] and not run.get("stopRequested", False) and billing == "cancelled"
        state.put("receipts", receipts)
        state.put("summary", summary)
        state.put("tick:" + minute, {**record, "status": "ok"})
        return summary
    except Exception as error:
        # Exception text can contain a credential-bearing connection URL. Keep
        # only the class; platform logs get a fixed message without secrets.
        record.update({"status": "failed", "errorClass": type(error).__name__})
        state.put("tick:" + minute, record)
        state.put("summary", {**previous, "phase": "running", "checkedAt": datetime.now(timezone.utc).isoformat(), "tickErrors": previous.get("tickErrors", 0) + 1, "tickCount": previous.get("tickCount", 0) + 1, "lastTick": record, "issues": sorted(set(previous.get("issues", []) + ["Acceptance runner failed; inspect the latest failed tick."]))})
        raise RuntimeError("Joey isolated acceptance tick failed") from None
