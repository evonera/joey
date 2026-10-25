"""Isolated QA rendering: signed dispatch, no schedules and no production secret."""
import sys
from pathlib import Path
import modal

sys.path.insert(0, "/worker" if Path("/worker/modal_app.py").is_file() else str(Path(__file__).parent))
from modal_app import image

app = modal.App("joey-media-qa-20261024")
secret = modal.Secret.from_name("joey-media-qa-20261024")


@app.function(image=image, cpu=2, memory=4096, timeout=600, max_containers=1,
              min_containers=0, scaledown_window=2, secrets=[secret])
def render_one():
    import os
    if os.environ.get("MEDIA_WORKER_ENVIRONMENT") != "staging":
        raise ValueError("Isolated staging worker required")
    sys.path.insert(0, "/worker")
    from render import process_one
    return process_one("libx264")


@app.function(image=image, cpu=0.125, memory=256, timeout=30, max_containers=1,
              min_containers=0, scaledown_window=2, secrets=[secret])
@modal.asgi_app()
def dispatch():
    import hashlib
    import hmac
    import os
    import time
    from fastapi import FastAPI, Request, Response
    api = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    @api.post("/")
    async def wake(request: Request):
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 1024:
                return Response(status_code=413)
        timestamp = request.headers.get("x-render-timestamp", "")
        signature = request.headers.get("x-render-signature", "")
        key = os.environ.get("MEDIA_WORKER_SECRET", "")
        if len(key) < 32 or len(timestamp) != 13 or not timestamp.isdecimal() or abs(time.time() * 1000 - int(timestamp)) > 300000:
            return Response(status_code=401)
        expected = hmac.new(key.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return Response(status_code=401)
        render_one.spawn()
        return Response(status_code=202)

    return api
