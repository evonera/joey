"""Export API-only receipts; finalization never touches the original acceptance run."""
import argparse
from datetime import datetime, timezone
from html import escape
import json
from pathlib import Path
import subprocess
import sys

from youtube_api_soak_core import APP_NAME, finalizable, instant


def export_status(run, summary, receipts, output, now):
    summary = {**summary, "staleMinutes": round((now - instant(summary.get("checkedAt", run["startedAt"]))).total_seconds() / 60, 2)}
    if summary["staleMinutes"] > 5 and summary.get("phase") != "finished":
        summary["issues"] = [*summary.get("issues", []), "Cloud observation is older than five minutes"]
    output.mkdir(parents=True, exist_ok=True)
    for name, value in [("run.json", run), ("status.json", summary), ("receipts.json", receipts)]:
        target = output / name
        temporary = target.with_suffix(".tmp")
        temporary.write_text(json.dumps(value, indent=2))
        temporary.replace(target)
    rows = "".join(f'<tr><td>{escape(s["name"])}</td><td>{s["intervalMinutes"]} min</td><td>{s["completed"]}</td><td>{s["failed"]}</td><td>{s["stalled"]}</td><td>{s["nonApiCollections"]}</td><td>{s["staleCollections"]}</td><td>{s["maxGapSeconds"]} sec</td></tr>' for s in summary.get("scouts", []))
    issues = "".join(f"<li>{escape(x)}</li>" for x in summary.get("issues", [])) or "<li>No problems observed so far.</li>"
    passed = "Pending" if summary.get("passed") is None else "Passed" if summary["passed"] else "Failed"
    html = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Joey YouTube Data API verification</title><style>body{{font:16px/1.6 system-ui;max-width:1100px;margin:auto;padding:32px 20px;background:#f6f4ef;color:#242922}}table{{border-collapse:collapse;width:100%;font-size:14px}}th,td{{padding:10px;text-align:left;border-bottom:1px solid #d9ddd3}}.table{{overflow:auto}}a{{color:#295f3e}}code{{word-break:break-all}}</style><main><h1>Joey YouTube Data API verification</h1><p>Status: <strong>{escape(summary.get("phase", "starting"))}</strong> · Final acceptance: <strong>{passed}</strong></p><p>Starts: {escape(run["startedAt"])} · Ends: {escape(run["endsAt"])} (UTC). Latest observation: {escape(summary.get("checkedAt", "pending"))}.</p><p>A separate 72-hour test with its own database and provider-confirmed TEST subscription. It preserves the original 72-hour feed test and its failure evidence. Its fixed deadline is independent of the original run.</p><div class="table"><table><thead><tr><th>Source</th><th>Cadence</th><th>Completed</th><th>Failed</th><th>Stalled</th><th>Non-API</th><th>Stale evidence</th><th>Maximum gap</th></tr></thead><tbody>{rows}</tbody></table></div><h2>Observed issues</h2><ul>{issues}</ul><h2>Acceptance rules</h2><p>At least 250 completed fast collections and three daily collections, all items server-tagged youtube-data-api with fresh observation times. No failed/uncertain evaluations, stalled work, duplicate events, empty collections, unexpected alerts or runner errors. Maximum collection gaps: 20 minutes fast, 24 hours 10 minutes daily. At the deadline only these two Scouts are paused and only this new TEST subscription is cancelled; finalization requires its webhook confirmation.</p><p>Numeric goals are unreachable; this checks against spurious alerts and does not verify positive alert delivery, live X/TikTok, social publication, or real-money billing.</p><p>Source commit: <code>{escape(run["sourceCommit"])}</code> · Deployment: <code>{escape(run["deploymentId"])}</code></p><p><a href="run.json">Run configuration</a> · <a href="status.json">Current summary</a> · <a href="receipts.json">Saved collection receipts</a></p></main></html>'''
    (output / "status.html").write_text(html)
    return summary


def main():
    import modal
    parser = argparse.ArgumentParser()
    parser.add_argument("--finalize", action="store_true", help="Disable only finished API acceptance dispatch and stop its child app")
    args = parser.parse_args()
    state = modal.Dict.from_name(APP_NAME)
    run, summary = state.get("run"), state.get("summary", {})
    if not run:
        raise SystemExit("API acceptance run has not been configured")
    receipts = state.get("receipts", [])
    output = Path(__file__).resolve().parents[2] / "output" / "youtube-api-soak-2026-10-19"
    summary = export_status(run, summary, receipts, output, datetime.now(timezone.utc))
    if args.finalize:
        if not finalizable(summary):
            raise SystemExit("Finalization requires paused API Scouts and this new TEST provider/webhook cancellation")
        controls = modal.Dict.from_name("joey-scout-soak-control")
        control = controls.get("youtube_api", {})
        if control.get("appName") == APP_NAME:
            controls.put("youtube_api", {**control, "enabled": False})
        subprocess.run([sys.executable, "-m", "modal", "app", "stop", APP_NAME], check=True)
        subprocess.run([sys.executable, "-m", "modal", "secret", "delete", APP_NAME, "--allow-missing", "--yes"], check=True)
    print(json.dumps({"phase": summary.get("phase", "starting"), "passed": summary.get("passed"), "endsAt": run["endsAt"], "checkedAt": summary.get("checkedAt"), "staleMinutes": summary["staleMinutes"], "issues": summary.get("issues", []), "completed": [s["completed"] for s in summary.get("scouts", [])], "report": str(output / "status.html")}))


if __name__ == "__main__":
    main()
