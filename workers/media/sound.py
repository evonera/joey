"""Speech-first timeline audio. Fixed effects, bounded gains, no paid synthesis."""
import hashlib
import json
import math
import subprocess
from pathlib import Path
import httpx


def validate_cues(cues, total_frames):
    if not isinstance(cues, list) or len(cues) > 6:
        raise ValueError("At most six sound cues are allowed")
    previous = -30
    for cue in cues:
        frame, gain = cue.get("frame"), cue.get("gain")
        if cue.get("effect") not in ("whoosh", "pop", "ding") or type(frame) is not int or not 0 <= frame < total_frames or frame - previous < 30 or type(gain) not in (int, float) or not math.isfinite(gain) or not .01 <= gain <= .35:
            raise ValueError("Invalid cue, gain or spacing")
        previous = frame


def finish_sound(job, root, assembled):
    from render import api, download, probe_media, write_captions
    spec, timing = job["spec"], job["spec"]["video"]
    cues = spec.get("soundCues", [])
    validate_cues(cues, round(timing["duration"] * 30))
    words = timing.get("words", [])
    if timing.get("captions") and job.get("sourceAudioPresent"):
        # The assembly contains only source speech and silence, never music/SFX.
        audio = root / "transcription.mp3"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-nostdin", "-i", str(assembled), "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", str(audio)], check=True, capture_output=True, timeout=45)
        with audio.open("rb") as data:
            response = httpx.put(job["audioUploadUrl"], content=data, headers={"content-type": "audio/mpeg"}, timeout=30)
            response.raise_for_status()
        words = api("/api/media-worker/transcribe", {"jobId": job["jobId"], "attemptToken": job["attemptToken"]})["words"]
    if not cues and not spec.get("music") and not words:
        return assembled
    args = ["ffmpeg", "-v", "error", "-y", "-nostdin", "-threads", "2", "-i", str(assembled)]
    music = spec.get("music")
    if music:
        source = root / "music"
        item = next(item for item in job["inputs"] if item["id"] == music["id"])
        download(item["url"], source)
        probe_media(source, "audio")
        args += ["-stream_loop", "-1", "-i", str(source)]
    manifest_dir = Path(__file__).parent / "sfx"
    manifest = json.loads((manifest_dir / "manifest.json").read_text())
    filters = []
    for index, cue in enumerate(cues):
        record = manifest["assets"][cue["effect"]]
        path = manifest_dir / record["file"]
        if hashlib.sha256(path.read_bytes()).hexdigest() != record["sha256"]:
            raise ValueError("Sound-effect checksum mismatch")
        args += ["-i", str(path)]
        input_index = index + (2 if music else 1)
        filters.append(f"[{input_index}:a]aresample=48000,aformat=channel_layouts=stereo,volume={cue['gain']},afade=t=in:d=0.01,afade=t=out:st={record['duration'] - .02}:d=0.02,adelay={round(cue['frame'] / 30 * 1000)}:all=1[cue{index}]")
    if cues:
        filters.append("".join(f"[cue{i}]" for i in range(len(cues))) + f"amix=inputs={len(cues)}:normalize=0,apad,atrim=duration={timing['duration']}[cues]")
    voice = "[0:a]aresample=48000,aformat=channel_layouts=stereo"
    if music:
        filters.append(voice + ",asplit=2[voice][speechside]")
        if cues:
            filters += ["[cues]asplit=2[cueout][cueside]", "[speechside][cueside]amix=inputs=2:normalize=0[trigger]"]
        else:
            filters.append("[speechside]anull[trigger]")
        filters.append("[1:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.16[music]")
        filters.append("[music][trigger]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=250[ducked]")
        labels = ["voice", "ducked"] + (["cueout"] if cues else [])
    else:
        filters.append(voice + "[voice]")
        labels = ["voice"] + (["cues"] if cues else [])
    filters.append("".join(f"[{label}]" for label in labels) + f"amix=inputs={len(labels)}:normalize=0,apad,atrim=duration={timing['duration']},alimiter=limit=0.89:level=false[a]")
    if words:
        write_captions(words, root / "captions.ass")
        filters.append("[0:v]subtitles=captions.ass:fontsdir=.[v]")
    output = root / "finished.mp4"
    args += ["-filter_complex_threads", "2", "-filter_complex", ";".join(filters), "-map", "[v]" if words else "0:v", "-map", "[a]", "-t", str(timing["duration"])]
    args += ["-c:v", "libx264", "-preset", "fast", "-crf", "20"] if words else ["-c:v", "copy"]
    args += ["-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(output)]
    subprocess.run(args, cwd=root, check=True, capture_output=True, timeout=180)
    return output
