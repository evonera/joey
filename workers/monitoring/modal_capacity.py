"""Independent capacity checks and deduplicated Sentry alerts, without SQL polling."""
from pathlib import Path
import modal

app = modal.App("joey-capacity-monitor")
image = (modal.Image.debian_slim(python_version="3.12")
         .pip_install("httpx==0.28.1", "sentry-sdk==2.69.1")
         .add_local_file(str(Path(__file__).with_name("neon_capacity.py")), "/worker/neon_capacity.py"))
state = modal.Dict.from_name("joey-capacity-monitor", create_if_missing=True)


@app.function(image=image, cpu=0.125, memory=256, timeout=60, max_containers=1,
              secrets=[modal.Secret.from_name("joey-capacity-monitor")])
def check():
    import json
    import os
    import sys
    import httpx
    import sentry_sdk
    from datetime import datetime, timezone
    sys.path.insert(0, "/worker")
    from neon_capacity import capacity_snapshot, alert_key
    sentry_sdk.init(dsn=os.environ.get("SENTRY_DSN"), environment="production", send_default_pii=False, include_local_variables=False)
    reports = []
    for target in json.loads(os.environ["NEON_PROJECTS_JSON"]):
        try:
            with httpx.Client(follow_redirects=False, timeout=15) as client:
                response = client.get("https://console.neon.tech/api/v2/projects/" + target["id"], headers={"Authorization": "Bearer " + target["key"]})
            if response.status_code != 200:
                raise RuntimeError("Neon management request failed")
            project = response.json()["project"]
            if project["id"] != target["id"] or project["org_id"] != target["orgId"]:
                raise RuntimeError("Neon capacity project ownership changed")
            report = capacity_snapshot(project)
            if report["threshold"] and state.put("alert:" + alert_key(report), report["checkedAt"], skip_if_exists=True):
                with sentry_sdk.push_scope() as scope:
                    scope.set_tag("service", "neon-capacity")
                    scope.set_tag("project_id", report["projectId"])
                    scope.set_context("capacity", report)
                    scope.fingerprint = ["neon-capacity", alert_key(report)]
                    sentry_sdk.capture_message("Neon project capacity threshold reached", level="error" if report["severity"] == "critical" else "warning")
            reports.append(report)
        except Exception:
            report = {"projectId": target["id"], "severity": "unknown", "checkedAt": datetime.now(timezone.utc).isoformat(), "error": "Capacity observation failed; usage is unknown"}
            reports.append(report)
            sentry_sdk.capture_message("Neon capacity observation failed", level="error")
    result = {"checkedAt": datetime.now(timezone.utc).isoformat(), "projects": reports}
    state.put("summary", result)
    sentry_sdk.flush(timeout=5)
    return result
