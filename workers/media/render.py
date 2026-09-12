"""Bounded rendering worker. Only a signed Joey claim supplies templates/assets."""
import hashlib
import hmac
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

import httpx
import sentry_sdk
from playwright.sync_api import sync_playwright

MAX_BYTES = 150 * 1024 * 1024

sentry_sdk.init(
    dsn=os.environ.get("SENTRY_DSN"),
    environment=os.environ.get("SENTRY_ENVIRONMENT", "production"),
    release=os.environ.get("SENTRY_RELEASE"),
    send_default_pii=False,
    include_local_variables=False,
    traces_sample_rate=0.1,
)
sentry_sdk.set_tag("service", "media-worker")
sentry_sdk.set_tag("runtime", "modal-python")


def api(path, payload):
    body = json.dumps(payload, separators=(",", ":"))
    timestamp = str(int(time.time() * 1000))
    signature = hmac.new(os.environ["MEDIA_WORKER_SECRET"].encode(), f"{timestamp}.{body}".encode(), hashlib.sha256).hexdigest()
    response = httpx.post(os.environ["JOEY_URL"].rstrip("/") + path, content=body,
                          headers={"content-type": "application/json", "x-render-timestamp": timestamp, "x-render-signature": signature}, timeout=180 if path.endswith("/transcribe") else 45)
    response.raise_for_status()
    return response.json()


def download(url, target):
    # Presigned R2 URLs only; no redirects and no arbitrary external media URLs.
    from urllib.parse import urlparse
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".r2.cloudflarestorage.com"):
        raise ValueError("Expected a presigned R2 URL")
    total = 0
    with httpx.stream("GET", url, timeout=60, follow_redirects=False) as response:
        response.raise_for_status()
        with target.open("wb") as output:
            for chunk in response.iter_bytes():
                total += len(chunk)
                if total > MAX_BYTES:
                    raise ValueError("Source asset exceeds worker limit")
                output.write(chunk)


def ass_time(seconds):
    cs = round(seconds * 100)
    return f"{cs // 360000}:{cs // 6000 % 60:02}:{cs // 100 % 60:02}.{cs % 100:02}"


def write_captions(words, path):
    header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Inter,58,&H0000FFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,1,2,80,80,360,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = []
    for i in range(0, len(words), 4):
        group = words[i:i + 4]
        # Strip ASS syntax rather than allowing user text to inject drawing commands.
        for active, word in enumerate(group):
            parts = []
            for index, item in enumerate(group):
                clean = item["text"].replace("\\", "").replace("{", "").replace("}", "").replace("\n", " ")
                color = "&H0000FFFF&" if index == active else "&H00FFFFFF&"
                parts.append("{\\c" + color + "}" + clean)
            lines.append(f"Dialogue: 0,{ass_time(word['start'])},{ass_time(word['end'])},Default,,0,0,0,,{' '.join(parts)}")
    path.write_text(header + "\n".join(lines))


def capture(job, root):
    spec = job["spec"]
    height = 1920 if spec["format"] == "mp4" else 1350
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            page = browser.new_page(viewport={"width": 1080, "height": height}, device_scale_factor=1)
            # No internet or filesystem browser access. Only fixed local resources.
            allowed = {"Inter.ttf": root / "Inter.ttf", "Anton.ttf": root / "Anton.ttf", "Emoji.ttf": root / "Emoji.ttf", "media": root / "media", "inset": root / "inset"}
            def route(request):
                from urllib.parse import urlparse
                parsed = urlparse(request.request.url)
                name = parsed.path.lstrip("/")
                if parsed.netloc == "render.local" and name == "index.html":
                    request.fulfill(body=job["html"], content_type="text/html")
                elif parsed.netloc == "render.local" and name in allowed and allowed[name].exists():
                    request.fulfill(path=str(allowed[name]))
                else:
                    request.abort()
            page.route("**/*", route)
            page.goto("http://render.local/index.html")
            page.evaluate("async () => { await Promise.all([document.fonts.load('24px Inter'), document.fonts.load('24px Anton'), document.fonts.load('24px JoeyEmoji', '☕')]); await document.fonts.ready; }")
            page.evaluate("""async () => {
              if (!document.fonts.check('24px Inter') || !document.fonts.check('24px Anton') || !document.fonts.check('24px JoeyEmoji', '☕')) throw Error('Required font missing');
              await Promise.all([...document.images].map(i => i.decode()));
              const box = document.getElementById('headline-box'), title = document.getElementById('headline');
              let size = parseFloat(getComputedStyle(title).fontSize);
              while ((title.scrollHeight > box.clientHeight || title.scrollWidth > box.clientWidth) && size > 38) title.style.fontSize = --size + 'px';
              if (title.scrollHeight > box.clientHeight || title.scrollWidth > box.clientWidth) throw Error('Headline is too long for this template');
              for (const id of ['brand-header', 'brand-strip', 'brand-footer']) {
                const element = document.getElementById(id);
                if (element && (element.scrollWidth > element.clientWidth || (id === 'brand-header' && element.scrollHeight > 150))) throw Error('Account branding is too long for this template');
              }
            }""")
            page.screenshot(path=str(root / "overlay.png"), omit_background=True)
        finally:
            browser.close()


def prepare_fonts(root, font_directory=None):
    font_directory = font_directory or Path(__file__).parent / "fonts"
    manifest = json.loads((font_directory / "manifest.json").read_text())
    for name in ("Inter.ttf", "Anton.ttf", "Emoji.ttf"):
        if hashlib.sha256((font_directory / name).read_bytes()).hexdigest() != manifest["sha256"][name]:
            raise ValueError("Bundled font checksum mismatch")
        shutil.copy(font_directory / name, root / name)


def render(job, root, encoder="libx264"):
    spec = job["spec"]
    if job["rendererVersion"] != "joey-media-1" or job["fontVersion"] != "joey-fonts-1":
        raise ValueError("Worker and template version mismatch")
    prepare_fonts(root)
    for name in ("media", "inset", "music"):
        if spec.get(name):
            item = next(item for item in job["inputs"] if item["id"] == spec[name]["id"])
            download(item["url"], root / name)
    cached = False
    if job.get("captureCache"):
        try:
            download(job["captureCache"]["getUrl"], root / "overlay.png")
            cached = True
        except httpx.HTTPStatusError as error:
            if error.response.status_code != 404:
                raise
    if not cached:
        capture(job, root)
        if job.get("captureCache"):
            with (root / "overlay.png").open("rb") as image:
                response = httpx.put(job["captureCache"]["putUrl"], content=image, headers={"content-type": "image/png"}, timeout=30)
                response.raise_for_status()
    if spec["format"] == "png":
        return root / "overlay.png"
    timing = spec["video"]
    if not 1 <= timing["duration"] <= 60:
        raise ValueError("Invalid video duration")
    probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(root / "media")], timeout=20))
    if float(probe["format"]["duration"]) + .05 < timing["start"] + timing["duration"]:
        raise ValueError("Trim exceeds source duration")
    has_audio = timing["sourceAudio"] and any(s["codec_type"] == "audio" for s in probe["streams"])
    if timing.get("captions") and has_audio:
        # Only the selected <=60-second audio is sent for independently cached
        # transcription. Publishing and provider credentials stay on Joey.
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-nostdin", "-ss", str(timing["start"]), "-t", str(timing["duration"]), "-i", str(root / "media"), "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", str(root / "transcription.mp3")], check=True, capture_output=True, timeout=45)
        with (root / "transcription.mp3").open("rb") as audio:
            response = httpx.put(job["audioUploadUrl"], content=audio, headers={"content-type": "audio/mpeg"}, timeout=30)
            response.raise_for_status()
        timing = {**timing, "words": api("/api/media-worker/transcribe", {"jobId": job["jobId"], "attemptToken": job["attemptToken"]})["words"]}
    rect = job["videoRect"]
    w, h = rect["width"], rect["height"]
    crop = spec["crop"]
    fit = f"scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:black" if crop["mode"] == "contain" else f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}:(iw-ow)*{crop['x']}:(ih-oh)*{crop['y']}"
    if timing["zoom"] > 1:
        fit += f",zoompan=z='1+({timing['zoom']}-1)*on/{max(1, round(timing['duration'] * 30)-1)}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s={w}x{h}:fps=30"
    filters = [f"[0:v]fps=30,{fit},setsar=1[v]", f"color=c=black:s=1080x1920:r=30:d={timing['duration']}[bg]", f"[bg][v]overlay={rect['x']}:{rect['y']}:shortest=1[base]", "[base][1:v]overlay=0:0:shortest=1[branded]"]
    output_label = "branded"
    if timing["words"]:
        write_captions(timing["words"], root / "captions.ass")
        filters.append("[branded]subtitles=captions.ass:fontsdir=.[captioned]")
        output_label = "captioned"
    cmd = ["ffmpeg", "-y", "-nostdin", "-threads", "2", "-ss", str(timing["start"]), "-t", str(timing["duration"]), "-i", "media", "-loop", "1", "-i", "overlay.png"]
    if spec.get("music"):
        cmd += ["-stream_loop", "-1", "-i", "music"]
        if has_audio:
            filters += ["[0:a]asplit=2[voice][side]", "[2:a]volume=0.2[music]", "[music][side]sidechaincompress=threshold=0.03:ratio=8[ducked]", "[voice][ducked]amix=inputs=2:duration=first,loudnorm=I=-14:TP=-2:LRA=11[a]"]
        else:
            filters.append("[2:a]volume=0.2,loudnorm=I=-14:TP=-2:LRA=11[a]")
    elif has_audio:
        filters.append("[0:a]loudnorm=I=-14:TP=-2:LRA=11[a]")
    cmd += ["-filter_complex_threads", "2", "-filter_complex", ";".join(filters), "-map", f"[{output_label}]"]
    if has_audio or spec.get("music"):
        cmd += ["-map", "[a]", "-c:a", "aac", "-b:a", "160k"]
    cmd += ["-t", str(timing["duration"]), "-c:v", encoder]
    cmd += ["-preset", "p4", "-rc", "vbr", "-cq", "20"] if encoder == "h264_nvenc" else ["-preset", "fast", "-crf", "20"]
    cmd += ["-pix_fmt", "yuv420p", "-movflags", "+faststart", "output.mp4"]
    subprocess.run(cmd, cwd=root, check=True, capture_output=True, timeout=480)
    output = root / "output.mp4"
    if output.stat().st_size > MAX_BYTES:
        raise ValueError("Output exceeds size limit")
    return output


def process_one(encoder="libx264"):
    job = api("/api/media-worker/claim", {})["job"]
    if not job:
        return False
    started = time.monotonic()
    result = {"jobId": job["jobId"], "attemptToken": job["attemptToken"], "success": False}
    try:
        with tempfile.TemporaryDirectory() as folder:
            output = render(job, Path(folder), encoder)
            with output.open("rb") as data:
                response = httpx.put(job["uploadUrl"], content=data, headers={"content-type": job["mimeType"]}, timeout=90)
                response.raise_for_status()
        result["success"] = True
    except Exception as error:
        # Do not send presigned URLs or subprocess arguments back to logs/UI.
        with sentry_sdk.new_scope() as scope:
            scope.clear_breadcrumbs()
            scope.set_tag("encoder", encoder)
            scope.set_tag("render_job_id", job["jobId"])
            scope.set_tag("error_type", type(error).__name__)
            safe_error = RuntimeError(f"Media render failed ({type(error).__name__})")
            sentry_sdk.capture_exception(safe_error.with_traceback(error.__traceback__))
        result["error"] = f"Render failed ({type(error).__name__}). Check worker diagnostics."
    result["usage"] = {"elapsedSeconds": min(600, time.monotonic() - started), "encoder": encoder, "outputSeconds": job["spec"].get("video", {}).get("duration", 0)}
    for attempt in range(3):
        try:
            api("/api/media-worker/complete", result)
            return True
        except httpx.HTTPError:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)
