"""Synthetic render-only benchmark. Not a provider/end-to-end latency measurement.

Generate compositions: node --import tsx workers/media/fixtures.ts /tmp/joey-media-benchmark
Run: python workers/media/benchmark.py /tmp/joey-media-benchmark
Run in a Modal CPU/T4 container with the same directory to compare allocated resources.
"""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import time
import render as engine


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("--encoder", choices=["libx264", "h264_nvenc"], default="libx264")
    args = parser.parse_args()
    source = args.directory / "source.mp4"
    if not source.exists():
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "60", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "25", "-c:a", "aac", str(source)], check=True)
    # The production downloader still allows only presigned R2 URLs.
    engine.download = lambda url, target: shutil.copyfile(source, target)
    results = []
    for repetition in range(2):
        for duration in [15, 30, 60]:
            job = json.loads((args.directory / f"{duration}.json").read_text())
            folder = args.directory / f"{args.encoder}-{duration}-{repetition}"
            folder.mkdir(exist_ok=True)
            start = time.monotonic()
            output = engine.render(job, folder, args.encoder)
            elapsed = time.monotonic() - start
            probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(output)]))
            video = next(s for s in probe["streams"] if s["codec_type"] == "video")
            assert (video["codec_name"], video["width"], video["height"], video["pix_fmt"]) == ("h264", 1080, 1920, "yuv420p")
            assert abs(float(probe["format"]["duration"]) - duration) < .1
            result = {"durationSeconds": duration, "renderSeconds": elapsed, "repetition": repetition, "encoder": args.encoder, "bytes": output.stat().st_size, "scope": "render-only; browser starts every render; excludes Modal allocation, network, queue, transcription"}
            results.append(result)
            print(json.dumps(result), flush=True)
            (args.directory / "results.json").write_text(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()
