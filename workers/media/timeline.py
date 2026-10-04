"""Version-2 bounded, frame-based timeline. No user filter expressions or HTML."""
import math
import subprocess
from pathlib import Path

FPS = 30
FADE_FRAMES = 12


def boundaries(scenes):
    if not isinstance(scenes, list) or not 1 <= len(scenes) <= 6:
        raise ValueError("Timeline requires one to six scenes")
    cursor, result = 0, []
    for index, scene in enumerate(scenes):
        frames = scene.get("durationFrames")
        if type(frames) is not int or not 30 <= frames <= 1800 or scene.get("transition") not in ("cut", "fade") or scene.get("kind") not in ("video", "image", "card"):
            raise ValueError("Invalid scene timing or transition")
        overlap = FADE_FRAMES if index < len(scenes) - 1 and scene["transition"] == "fade" else 0
        result.append((cursor, cursor + frames, overlap))
        cursor += frames - overlap
    if scenes[-1]["transition"] != "cut" or cursor > 1800:
        raise ValueError("Invalid final transition or finished duration")
    return result, cursor


def run(cmd, root):
    subprocess.run(cmd, cwd=root, check=True, capture_output=True, timeout=180)


def render_timeline(job, root, encoder="libx264"):
    from render import capture, download, prepare_fonts, probe_media, validate_trim
    if encoder != "libx264":
        raise ValueError("Timeline exports support CPU libx264 only; NVENC is not validated")
    spec = job["spec"]
    if job["rendererVersion"] not in ("joey-media-2", "joey-media-3") or job["fontVersion"] != "joey-fonts-1":
        raise ValueError("Worker and timeline version mismatch")
    scenes = spec["timeline"]
    spans, total = boundaries(scenes)
    if not spec.get("video") or not math.isclose(spec["video"]["duration"] * FPS, total, abs_tol=0.000001):
        raise ValueError("Timeline duration mismatch")
    prepare_fonts(root)
    # Download each owned, signed input once, including repeated scene assets.
    files = {}
    for scene in scenes:
        if scene["kind"] == "card":
            continue
        asset_id = scene["asset"]["id"]
        if asset_id not in files:
            files[asset_id] = root / f"asset-{len(files)}"
            item = next(item for item in job["inputs"] if item["id"] == asset_id)
            download(item["url"], files[asset_id])
    outputs = []
    source_audio_present = False
    for index, scene in enumerate(scenes):
        segment = root / f"scene-{index}"
        segment.mkdir()
        prepare_fonts(segment)
        source = files.get(scene.get("asset", {}).get("id"))
        duration = scene["durationFrames"] / FPS
        has_audio = False
        args = ["ffmpeg", "-v", "error", "-y", "-nostdin", "-threads", "2"]
        if scene["kind"] == "video":
            source_duration, source_audio = probe_media(source, "video")
            start = scene["trimStartFrame"] / FPS
            validate_trim({"start": start, "duration": duration}, source_duration)
            args += ["-ss", str(start), "-t", str(duration), "-i", str(source)]
            has_audio = source_audio and scene["sourceAudio"]
            source_audio_present = source_audio_present or has_audio
        elif scene["kind"] == "image":
            # ffmpeg decodes the image; corrupt input fails closed before output.
            import json
            probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(source)], stderr=subprocess.PIPE, timeout=20))
            stream = next(s for s in probe["streams"] if s.get("codec_type") == "video")
            if not 0 < stream.get("width", 0) <= 16384 or not 0 < stream.get("height", 0) <= 16384 or stream["width"] * stream["height"] > 50_000_000:
                raise ValueError("Image dimensions exceed render limits")
            args += ["-loop", "1", "-framerate", str(FPS), "-i", str(source)]
        else:
            args += ["-f", "lavfi", "-i", f"color=c=black:s=1080x1920:r={FPS}"]
        layout = job["sceneLayouts"][index]
        capture({"spec": spec, "html": layout["html"]}, segment)
        args += ["-loop", "1", "-framerate", str(FPS), "-i", str(segment / "overlay.png")]
        if not has_audio:
            args += ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
        rect = layout["videoRect"]
        if scene["kind"] != "card":
            crop = scene["crop"]
            if crop["mode"] not in ("contain", "cover") or any(not isinstance(crop[k], (int, float)) or not math.isfinite(crop[k]) or not 0 <= crop[k] <= 1 for k in ("x", "y")):
                raise ValueError("Invalid scene crop")
            w, h = rect["width"], rect["height"]
            fit = f"scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:black" if crop["mode"] == "contain" else f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}:(iw-ow)*{crop['x']}:(ih-oh)*{crop['y']}"
            video = f"[0:v]fps={FPS},{fit},setsar=1[v];color=c=black:s=1080x1920:r={FPS}[bg];[bg][v]overlay={rect['x']}:{rect['y']}:shortest=1[base];[base][1:v]overlay=shortest=1,format=yuv420p[out]"
        else:
            video = "[0:v][1:v]overlay=shortest=1,format=yuv420p[out]"
        audio = "[0:a]" if has_audio else "[2:a]"
        graph = video + f";{audio}aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration={duration},asetpts=PTS-STARTPTS[a]"
        output = root / f"segment-{index}.mp4"
        run(args + ["-filter_complex_threads", "2", "-filter_complex", graph, "-map", "[out]", "-map", "[a]", "-t", str(duration), "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-c:a", "aac", "-pix_fmt", "yuv420p", str(output)], root)
        outputs.append(output)
    args = ["ffmpeg", "-v", "error", "-y", "-nostdin", "-threads", "2"]
    for output in outputs:
        args += ["-i", str(output)]
    filters = []
    for index in range(len(outputs)):
        filters += [f"[{index}:v]fps={FPS},settb=AVTB,setpts=PTS-STARTPTS[v{index}]", f"[{index}:a]aresample=48000,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS[a{index}]"]
    v, a = "v0", "a0"
    for index in range(1, len(outputs)):
        nv, na = f"joinedv{index}", f"joineda{index}"
        if scenes[index - 1]["transition"] == "fade":
            filters += [f"[{v}][v{index}]xfade=transition=fade:duration={FADE_FRAMES / FPS}:offset={spans[index][0] / FPS}[{nv}]", f"[{a}][a{index}]acrossfade=d={FADE_FRAMES / FPS}[{na}]"]
        else:
            filters += [f"[{v}][{a}][v{index}][a{index}]concat=n=2:v=1:a=1[{nv}][{na}]"]
        v, a = nv, na
    filters.append(f"[{a}]apad,atrim=duration={total / FPS},loudnorm=I=-14:TP=-2:LRA=11[finala]")
    output = root / "output.mp4"
    # CPU is the validated default. No implied NVENC speed or capability claim.
    run(args + ["-filter_complex_threads", "2", "-filter_complex", ";".join(filters), "-map", f"[{v}]", "-map", "[finala]", "-t", str(total / FPS), "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-c:a", "aac", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output)], root)
    from sound import finish_sound
    return finish_sound({**job, "sourceAudioPresent": source_audio_present}, root, output)
