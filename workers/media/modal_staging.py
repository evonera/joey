"""Explicit one-shot staging acceptance. No cron, GPU, or production secrets.

Deploy: modal deploy workers/media/modal_staging.py
Execute exactly one queued staging job: modal run workers/media/modal_staging.py
"""
import modal
import sys
from pathlib import Path

# Modal imports this entrypoint from /root, while the shared worker files are
# baked into /worker. Locally, resolve the sibling module instead.
sys.path.insert(0, "/worker" if Path("/worker/modal_app.py").is_file() else str(Path(__file__).parent))
from modal_app import image

app = modal.App("joey-media-staging")
secret = modal.Secret.from_name("joey-media-staging-secrets")


@app.function(image=image, cpu=2, memory=4096, timeout=180,
              min_containers=0, max_containers=1, scaledown_window=2, secrets=[secret])
def render_one():
    import os
    import sys
    if os.environ.get("MEDIA_WORKER_ENVIRONMENT") != "staging":
        raise ValueError("Staging worker configuration required")
    sys.path.insert(0, "/worker")
    from render import process_one
    return process_one("libx264")


@app.local_entrypoint()
def main():
    print({"claimedAndCompleted": render_one.remote(), "maximumJobs": 1})
