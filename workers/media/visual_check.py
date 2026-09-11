"""Explicit local visual acceptance, using generated footage and supplied fixture JSON."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import render as engine

root = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/joey-media-visual-cases")
source = Path("/tmp/joey-media-benchmark/source.mp4")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(source), "-frames:v", "1", str(root / "source.png")], check=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(source), "-t", "15", "-an", "-c:v", "copy", str(root / "silent.mp4")], check=True)
for name in ["emoji", "overflow", "inset", "silent"]:
    job = json.loads((root / f"{name}.json").read_text())
    media = root / ("silent.mp4" if name == "silent" else "source.png")
    engine.download = lambda url, target: shutil.copyfile(media, target)
    folder = root / name
    folder.mkdir(exist_ok=True)
    try:
        output = engine.render(job, folder)
    except Exception as error:
        if not job["expectOverflow"] or "Headline is too long" not in str(error):
            raise
        print("PASS: headline overflow rejects export", flush=True)
        continue
    assert not job["expectOverflow"], "Overflow unexpectedly produced a publishable image"
    if name == "silent":
        probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(output)]))
        assert not any(stream["codec_type"] == "audio" for stream in probe["streams"])
    print(f"PASS: {name} exported to {output}", flush=True)
