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


def project_acceptance_target(control, now):
    if not isinstance(control, dict) or control.get("appName") != "joey-project-scout-soak-20261024" or control.get("projectId") != "autumn-dawn-08510576":
        return None
    # Reuse the bounded API-run clock validation without broadening its allowlist.
    renamed = {**control, "appName": "joey-youtube-api-soak-20261024"}
    return control["appName"] if youtube_acceptance_target(renamed, now) else None


def dispatch_acceptance():
    import modal
    from datetime import datetime, timezone
    controls = modal.Dict.from_name("joey-scout-soak-control", create_if_missing=True)
    failures = 0
    for key, validate in (("active", acceptance_target), ("youtube_api", youtube_acceptance_target), ("isolated_project", project_acceptance_target)):
        try:
            target = validate(controls.get(key), datetime.now(timezone.utc))
            if target:
                modal.Function.from_name(target, "tick").spawn()
        except Exception:
            # A failing temporary child must not starve the other acceptance run.
            failures += 1
    if failures:
        raise RuntimeError(f"Temporary acceptance dispatch failed for {failures} child job(s)") from None


def dispatch_capacity():
    """Reuse the existing timer even if production SQL is unavailable."""
    import modal
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    state = modal.Dict.from_name("joey-capacity-monitor", create_if_missing=True)
    slot = now.strftime("%Y-%m-%dT%H:") + str(now.minute // 15)
    if state.put("dispatch:" + slot, now.isoformat(), skip_if_exists=True):
        modal.Function.from_name("joey-capacity-monitor", "check").spawn()


def run_tick(readiness_cache=None, now=None):
    import time
    now = time.time() if now is None else now
    base = os.environ.get("JOEY_URL", "").rstrip("/")
    target = urlsplit(base)
    secret = os.environ.get("CRON_SECRET", "")
    if target.scheme != "https" or not target.hostname or target.path or target.query or target.fragment or target.username or len(secret) < 32:
        raise ValueError("Scheduler requires an HTTPS Joey origin and CRON_SECRET of at least 32 characters")
    with httpx.Client(headers={"Authorization": f"Bearer {secret}"}, follow_redirects=False) as client:
        cached = readiness_cache.get("ready", {}) if readiness_cache is not None else {}
        age = now - cached.get("checkedAt", 0)
        if cached.get("origin") != base or not 0 <= age < 300:
            health = client.get(f"{base}/api/internal/runtime", timeout=15)
            if health.status_code == 404:
                return {"status": "waiting_for_web_deployment"}
            if health.status_code != 200 or health.json().get("ready") is not True:
                if readiness_cache is not None:
                    readiness_cache["ready"] = {}
                raise RuntimeError(f"Joey readiness check failed (HTTP {health.status_code})")
            if readiness_cache is not None:
                readiness_cache["ready"] = {"origin": base, "checkedAt": now}
        response = client.get(f"{base}/api/cron", timeout=65)
        if response.status_code != 200:
            if readiness_cache is not None:
                readiness_cache["ready"] = {}
            raise RuntimeError(f"Joey scheduler request failed (HTTP {response.status_code})")
        result = response.json()
        if result.get("ok") is not True:
            if readiness_cache is not None:
                readiness_cache["ready"] = {}
            raise RuntimeError("Joey scheduler reported an unsuccessful tick")
        return {"status": "ok", "skipped": result.get("skipped")}
