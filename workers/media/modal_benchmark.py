"""Ephemeral synthetic canary. No Joey/R2/provider secrets, schedules or publication.
Run after fixtures.ts and benchmark.py prepared /tmp/joey-media-benchmark.
"""
from pathlib import Path
import json
import time
import modal

fixtures = Path("/tmp/joey-media-benchmark")
if modal.is_local():
    from modal_app import image
    benchmark_image = image.add_local_file(str(fixtures / "source.mp4"), "/fixtures/source.mp4", copy=True)
else:
    # Image construction is a client-side concern; remote functions use the
    # already-built image, with no dependency on the caller's /tmp directory.
    benchmark_image = modal.Image.debian_slim(python_version="3.12")
app = modal.App("joey-media-benchmark")


def execute(job, encoder):
    import os
    import shutil
    import subprocess
    import sys
    import tempfile
    sys.path.insert(0, "/worker")
    import render
    render.download = lambda url, target: shutil.copyfile("/fixtures/source.mp4", target)
    started = time.monotonic()
    with tempfile.TemporaryDirectory() as folder:
        try:
            output = render.render(job, Path(folder), encoder)
        except subprocess.CalledProcessError as error:
            return {"error": error.stderr.decode(errors="replace")[-2000:], "encoder": encoder}
        probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(output)]))
        video = next(s for s in probe["streams"] if s["codec_type"] == "video")
        assert (video["codec_name"], video["width"], video["height"], video["pix_fmt"]) == ("h264", 1080, 1920, "yuv420p")
        assert abs(float(probe["format"]["duration"]) - job["spec"]["video"]["duration"]) < .1
        peak = Path("/sys/fs/cgroup/memory.peak")
        return {"renderSeconds": time.monotonic() - started, "encoder": encoder, "bytes": output.stat().st_size, "containerId": os.environ.get("MODAL_TASK_ID"), "memoryPeakBytes": int(peak.read_text()) if peak.exists() else None, "cpuCores": 2, "memoryMiB": 4096}


@app.function(image=benchmark_image, cpu=2, memory=4096, timeout=180, min_containers=0, max_containers=1, scaledown_window=2)
def cpu(job):
    return execute(job, "libx264")


@app.function(image=benchmark_image, gpu="T4", cpu=2, memory=4096, timeout=180, min_containers=0, max_containers=1, scaledown_window=2)
def t4(job):
    return execute(job, "h264_nvenc")


@app.local_entrypoint()
def main():
    results = []
    for name, worker in [("cpu", cpu), ("t4", t4)]:
        for duration in [15, 30, 60]:
            time.sleep(5)
            job = json.loads((fixtures / f"{duration}.json").read_text())
            for phase in ["after-scale-down", "immediate-repeat"]:
                started = time.monotonic()
                result = worker.remote(job)
                result.update({"requestedPhase": phase, "durationSeconds": duration, "roundTripSeconds": time.monotonic() - started, "configuration": name, "scope": "Modal dispatch and render; synthetic local inputs; excludes build, R2, transcription and production queue"})
                results.append(result)
                print(json.dumps(result), flush=True)
                (fixtures / "modal-results.json").write_text(json.dumps(results, indent=2))
                if result.get("error"):
                    raise RuntimeError("Canary failed; stopped to avoid repeated allocation. See recorded diagnostics.")
