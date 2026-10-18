"""Export cloud acceptance receipts without pulling database or billing credentials."""
import argparse
from datetime import datetime, timezone
from html import escape
import json
from pathlib import Path
import subprocess
import sys

import modal

APP_NAME = "joey-scout-soak-20261019"
parser = argparse.ArgumentParser()
parser.add_argument("--finalize", action="store_true", help="Disable the finished acceptance dispatch and stop its child app")
args = parser.parse_args()
state = modal.Dict.from_name(APP_NAME)
run, summary = state.get("run"), state.get("summary", {})
if not run:
    raise SystemExit("Acceptance run has not been configured")
receipts = state.get("receipts", [])
now = datetime.now(timezone.utc)
checked = datetime.fromisoformat(summary.get("checkedAt", run["startedAt"]).replace("Z", "+00:00"))
summary["staleMinutes"] = round((now - checked).total_seconds() / 60, 2)
output = Path(__file__).resolve().parents[2] / "output" / "scout-soak-2026-10-19"
output.mkdir(parents=True, exist_ok=True)
for name, value in [("run.json", run), ("status.json", summary), ("receipts.json", receipts)]:
    target = output / name
    temp = target.with_suffix(".tmp")
    temp.write_text(json.dumps(value, indent=2))
    temp.replace(target)
rows = "".join(f'<tr><td>{escape(s["name"])}</td><td>{s["intervalMinutes"]} min</td><td>{s["completed"]}</td><td>{s["failed"]}</td><td>{s["stalled"]}</td><td>{s["maxGapSeconds"]} sec</td></tr>' for s in summary.get("scouts", []))
issues = "".join(f"<li>{escape(x)}</li>" for x in summary.get("issues", [])) or "<li>No problems observed so far.</li>"
html = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Joey 72-hour Scout verification</title><style>body{{font:16px/1.6 system-ui;max-width:1050px;margin:auto;padding:32px 20px;background:#f6f4ef;color:#242922}}table{{border-collapse:collapse;width:100%;font-size:14px}}th,td{{padding:10px;text-align:left;border-bottom:1px solid #d9ddd3}}.table{{overflow:auto}}a{{color:#295f3e}}code{{word-break:break-all}}</style><main><h1>Joey 72-hour Scout verification</h1><p>Status: <strong>{escape(summary.get("phase", "starting"))}</strong> · Final acceptance: <strong>{escape(str(summary.get("passed")))}</strong></p><p>Starts: {escape(run["startedAt"])} · Ends: {escape(run["endsAt"])} (UTC). Latest observation: {escape(summary.get("checkedAt", "pending"))}.</p><p>Isolated preview with provider-confirmed TEST billing. Two YouTube/RSS sources are exercised at the normal daily cadence and at a QA-only 15-minute cadence. No publication or AI generation is requested. A running test is not a passed multi-day test.</p><div class="table"><table><thead><tr><th>Source</th><th>Cadence</th><th>Completed</th><th>Failed</th><th>Stalled</th><th>Maximum gap</th></tr></thead><tbody>{rows}</tbody></table></div><h2>Observed issues</h2><ul>{issues}</ul><h2>Acceptance rules</h2><p>At least 250 completed collections per fast Scout and three per daily Scout, no failed/uncertain evaluations, duplicate events or empty collections, no collection gaps over 20 minutes for fast Scouts or 24 hours 10 minutes for daily Scouts, and no scheduler HTTP failures. At the deadline the test Scouts are paused and the TEST subscription is cancelled, with webhook confirmation required.</p><p>Numeric goals are deliberately unreachable; zero alerts checks for spurious alerts. This run does not prove positive notification delivery, arbitrary social-profile scraping, live X/TikTok, or a real-money payment.</p><p><a href="run.json">Run configuration</a> · <a href="status.json">Current summary</a> · <a href="receipts.json">Saved collection receipts</a></p></main></html>'''
(output / "status.html").write_text(html)
if args.finalize:
    if summary.get("phase") != "finished" or summary.get("providerStatus") != "cancelled" or not summary.get("webhookCancellationConfirmed") or not summary.get("scoutsPaused"):
        raise SystemExit("Finalization requires paused Scouts and provider/webhook cancellation confirmation")
    control = modal.Dict.from_name("joey-scout-soak-control")
    active = control.get("active", {})
    if active.get("appName") == APP_NAME:
        control.put("active", {**active, "enabled": False})
    subprocess.run([sys.executable, "-m", "modal", "app", "stop", APP_NAME], check=True)
    subprocess.run([sys.executable, "-m", "modal", "secret", "delete", APP_NAME, "--allow-missing", "--yes"], check=True)
print(json.dumps({"phase": summary.get("phase", "starting"), "passed": summary.get("passed"), "endsAt": run["endsAt"], "checkedAt": summary.get("checkedAt"), "staleMinutes": summary["staleMinutes"], "issues": summary.get("issues", []), "completed": [s["completed"] for s in summary.get("scouts", [])], "report": str(output / "status.html")}))
