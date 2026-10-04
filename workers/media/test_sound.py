import shutil
import struct
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from sound import validate_cues, finish_sound
from render import probe_media


class SoundTests(unittest.TestCase):
    def test_cue_validation(self):
        cue = {"effect": "pop", "frame": 0, "gain": .2}
        for cues in ([cue] * 7, [{**cue, "effect": "file:///secret"}], [{**cue, "gain": float("nan")}], [cue, {**cue, "frame": 29}], [{**cue, "frame": 60}]):
            with self.assertRaises(ValueError):
                validate_cues(cues, 60)

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg required")
    def test_real_silence_speech_music_and_cues(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            music = root / "background.wav"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000", "-t", "2", str(music)], check=True, capture_output=True, timeout=30)
            for speech, background in [(False, False), (False, True), (True, True), (True, False)]:
                with self.subTest(speech=speech, music=background):
                    assembled = root / "assembled.mp4"
                    audio = "sine=frequency=440:sample_rate=48000" if speech else "anullsrc=r=48000:cl=stereo"
                    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=black:s=128x128:r=30", "-f", "lavfi", "-i", audio, "-t", "2", "-c:v", "libx264", "-c:a", "aac", str(assembled)], check=True, capture_output=True, timeout=30)
                    spec = {"video": {"duration": 2, "words": [], "captions": False}, "timeline": [], "soundCues": [{"effect": "whoosh", "frame": 0, "gain": .2}, {"effect": "ding", "frame": 30, "gain": .2}]}
                    if background:
                        spec["music"] = {"id": "music"}
                    job = {"spec": spec, "inputs": [{"id": "music", "url": "fixture"}]}
                    with patch("render.download", side_effect=lambda url, target: shutil.copy(music, target)):
                        output = finish_sound(job, root, assembled)
                    duration, audio_present = probe_media(output, "video")
                    self.assertAlmostEqual(duration, 2, delta=.04)
                    self.assertTrue(audio_present)
                    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(output), "-vn", "-f", "f32le", "-ac", "1", "-"])
                    samples = struct.unpack("<" + "f" * (len(raw) // 4), raw)
                    self.assertLess(max(abs(v) for v in samples), .99)
                    self.assertGreater(sum(v * v for v in samples), .001)
