"""Deploy separately from vodclips. CPU is default until the benchmark gate passes."""
from pathlib import Path
import modal

root = Path(__file__).parent
app = modal.App("joey-media")
image = (modal.Image.debian_slim(python_version="3.12")
         .apt_install("ffmpeg", "fonts-noto-color-emoji", "fontconfig")
         .pip_install_from_requirements(str(root / "requirements.txt"))
         .run_commands("playwright install --with-deps chromium")
         .add_local_dir(str(root), "/worker", copy=True, ignore=["__pycache__", ".venv", "output", "*.mp4"]))
secret = modal.Secret.from_name("joey-media-secrets")

@app.function(image=image, cpu=2, memory=4096, timeout=600, min_containers=0, max_containers=2, scaledown_window=2, secrets=[secret])
def render_cpu():
    import sys
    sys.path.insert(0, "/worker")
    from render import process_one
    return process_one("libx264")

@app.function(image=image, gpu="T4", cpu=2, memory=4096, timeout=600, min_containers=0, max_containers=2, scaledown_window=2, secrets=[secret])
def render_t4():
    import sys
    sys.path.insert(0, "/worker")
    from render import process_one
    return process_one("h264_nvenc")

@app.function(image=image, schedule=modal.Period(minutes=1), timeout=30, secrets=[secret])
def tick():
    import os
    worker = render_t4 if os.environ.get("MEDIA_ENCODER") == "t4" else render_cpu
    worker.spawn()


@app.function(image=image, cpu=0.125, memory=256, timeout=30, min_containers=0, max_containers=2, scaledown_window=2, secrets=[secret])
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
        if len(signature) != 64 or any(c not in "0123456789abcdef" for c in signature) or not hmac.compare_digest(signature, expected):
            return Response(status_code=401)
        worker = render_t4 if os.environ.get("MEDIA_ENCODER") == "t4" else render_cpu
        worker.spawn()
        return Response(status_code=202)

    return api
