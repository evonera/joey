"""Authenticated minute scheduler for websites on Vercel Hobby."""
import os
from urllib.parse import urlsplit

import httpx


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
