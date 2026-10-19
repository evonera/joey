"""Authenticated minute scheduler for websites on Vercel Hobby."""
import os
from urllib.parse import urlsplit

import httpx


def acceptance_target(control, now):
    """A temporary child job can reuse the minute timer without a new schedule."""
    from datetime import datetime, timezone
    import re
    if not isinstance(control, dict) or not control.get("enabled"):
        return None
    app_name = control.get("appName", "")
    if not re.fullmatch(r"joey-scout-soak-[0-9]{8}", app_name):
        return None
    try:
        started = datetime.fromisoformat(control["startedAt"].replace("Z", "+00:00"))
        deadline = datetime.fromisoformat(control["dispatchUntil"].replace("Z", "+00:00"))
        if started.tzinfo is None or deadline.tzinfo is None:
            return None
        if not 0 < (deadline - started).total_seconds() <= 76 * 3600:
            return None
        if not started <= now.astimezone(timezone.utc) < deadline:
            return None
    except (ValueError, KeyError, TypeError):
        return None
    return app_name


def youtube_acceptance_target(control, now):
    """The API replacement has its own independently owned deadline."""
    from datetime import datetime, timezone
    import re
    if not isinstance(control, dict) or not control.get("enabled"):
        return None
    app_name = control.get("appName", "")
    if not re.fullmatch(r"joey-youtube-api-soak-[0-9]{8}", app_name):
        return None
    try:
        started = datetime.fromisoformat(control["startedAt"].replace("Z", "+00:00"))
        deadline = datetime.fromisoformat(control["dispatchUntil"].replace("Z", "+00:00"))
        if started.tzinfo is None or deadline.tzinfo is None:
            return None
        if not 0 < (deadline - started).total_seconds() <= 75 * 3600:
            return None
        if not started <= now.astimezone(timezone.utc) < deadline:
            return None
    except (ValueError, KeyError, TypeError):
        return None
    return app_name


def dispatch_acceptance():
    import modal
    from datetime import datetime, timezone
    controls = modal.Dict.from_name("joey-scout-soak-control", create_if_missing=True)
    failures = 0
    for key, validate in (("active", acceptance_target), ("youtube_api", youtube_acceptance_target)):
        try:
            target = validate(controls.get(key), datetime.now(timezone.utc))
            if target:
                modal.Function.from_name(target, "tick").spawn()
        except Exception:
            # A failing temporary child must not starve the other acceptance run.
            failures += 1
    if failures:
        raise RuntimeError(f"Temporary acceptance dispatch failed for {failures} child job(s)") from None


def run_tick():
    base = os.environ.get("JOEY_URL", "").rstrip("/")
    target = urlsplit(base)
    secret = os.environ.get("CRON_SECRET", "")
    if target.scheme != "https" or not target.hostname or target.path or target.query or target.fragment or target.username or len(secret) < 32:
        raise ValueError("Scheduler requires an HTTPS Joey origin and CRON_SECRET of at least 32 characters")
    with httpx.Client(headers={"Authorization": f"Bearer {secret}"}, follow_redirects=False) as client:
        health = client.get(f"{base}/api/internal/runtime", timeout=15)
        if health.status_code == 404:
            return {"status": "waiting_for_web_deployment"}
        if health.status_code != 200 or health.json().get("ready") is not True:
            raise RuntimeError(f"Joey readiness check failed (HTTP {health.status_code})")
        response = client.get(f"{base}/api/cron", timeout=65)
        if response.status_code != 200:
            raise RuntimeError(f"Joey scheduler request failed (HTTP {response.status_code})")
        result = response.json()
        if result.get("ok") is not True:
            raise RuntimeError("Joey scheduler reported an unsuccessful tick")
        return {"status": "ok", "skipped": result.get("skipped")}
