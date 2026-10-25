"""Export the new project's actual receipts; never modifies historical runs."""
import argparse
from datetime import datetime, timezone
from html import escape
import json
from pathlib import Path
import subprocess
import sys
from project_soak_core import APP_NAME, finalizable, instant


def main():
    import modal
    parser = argparse.ArgumentParser()
    parser.add_argument("--finalize", action="store_true")
    args = parser.parse_args()
    state = modal.Dict.from_name(APP_NAME)
    run, summary = state.get("run"), state.get("summary", {})
    if not run:
        raise SystemExit("The new project acceptance run is not started")
    summary = {**summary, "staleMinutes": round((datetime.now(timezone.utc) - instant(summary.get("checkedAt", run["startedAt"]))).total_seconds() / 60, 2)}
    output = Path(__file__).resolve().parents[2] / "output/project-scout-soak-2026-10-24"
    output.mkdir(parents=True, exist_ok=True)
    for name, value in (("run", run), ("status", summary), ("receipts", state.get("receipts", []))):
        path = output / (name + ".json")
        path.with_suffix(".tmp").write_text(json.dumps(value, indent=2))
        path.with_suffix(".tmp").replace(path)
    rows = "".join(f'<tr><td>{escape(s["name"])}</td><td>{s["intervalMinutes"]}</td><td>{s["completed"]}</td><td>{s["failed"]}</td><td>{s["staleCollections"]}</td><td>{s["maxGapSeconds"]}</td></tr>' for s in summary.get("scouts", []))
    issues = "".join(f'<li>{escape(i)}</li>' for i in summary.get("issues", [])) or '<li>No issues observed so far.</li>'
    result = "Pending" if summary.get("passed") is None else "Passed" if summary["passed"] else "Failed"
    (output / "status.html").write_text(f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Joey isolated-project Scout acceptance</title><style>body{{font:16px/1.6 system-ui;max-width:1000px;margin:36px auto;padding:20px}}table{{border-collapse:collapse;width:100%}}td,th{{padding:10px;text-align:left;border-bottom:1px solid #ddd}}</style><h1>Scout acceptance in a separate Neon project</h1><p>Phase: {escape(summary.get("phase", "starting"))}. Acceptance: <strong>{result}</strong>. Observation age: {summary["staleMinutes"]} minutes.</p><p>Starts {escape(run["startedAt"])}; fixed deadline {escape(run["endsAt"])} UTC. Project {escape(run["projectId"])}; source {escape(run["sourceCommit"])}.</p><table><tr><th>Source</th><th>Minutes</th><th>Completed</th><th>Failed</th><th>Stale observations</th><th>Largest gap (seconds)</th></tr>{rows}</table><ul>{issues}</ul><p>At least 250 fast collections per source and three daily collections per source over 72 hours. YouTube requires official API provenance. All sources require fresh observations, no duplicates, empty collections, failures or unexpected alerts. Collection gaps must stay within cadence plus five minutes (fast) or ten minutes (daily). Startup success is not acceptance. Historical failed runs remain failed.</p><p>No social publication or real-money payment. Finalization requires paused owned Scouts, zero pending evaluations, provider TEST cancellation and webhook-confirmed cancellation.</p><a href="run.json">Run configuration</a> · <a href="status.json">Summary</a> · <a href="receipts.json">Collection receipts</a></html>''')
    if args.finalize:
        if not finalizable(summary):
            raise SystemExit("Owned Scouts and provider/webhook TEST cancellation must settle before finalization")
        controls = modal.Dict.from_name("joey-scout-soak-control")
        control = controls.get("isolated_project", {})
        if control.get("appName") != APP_NAME:
            raise SystemExit("Dispatch ownership changed; refusing finalization")
        controls.put("isolated_project", {**control, "enabled": False})
        subprocess.run([sys.executable, "-m", "modal", "app", "stop", APP_NAME], check=True)
        subprocess.run([sys.executable, "-m", "modal", "secret", "delete", APP_NAME, "--allow-missing", "--yes"], check=True)
    print(json.dumps({"phase": summary.get("phase"), "passed": summary.get("passed"), "staleMinutes": summary["staleMinutes"], "completed": [s["completed"] for s in summary.get("scouts", [])], "report": str(output / "status.html")}))


if __name__ == "__main__":
    main()
