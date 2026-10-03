"""Local synthetic compositor acceptance; no providers, storage or credentials."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from render import render, probe_media


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg/ffprobe required")
class LocalRenderTests(unittest.TestCase):
    def test_fractional_trim_exports_silent_and_audio_sources(self):
        with tempfile.TemporaryDirectory() as folder:
            fixtures = Path(folder)
            overlay = fixtures / "overlay.png"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
                            "color=black@0:s=1080x1920,format=rgba", "-frames:v", "1", str(overlay)],
                           check=True, capture_output=True, timeout=30)
            for audio in (False, True):
                with self.subTest(audio=audio):
                    source = fixtures / f"source-{audio}.mp4"
                    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=red:s=320x240:r=24"]
                    if audio:
                        cmd += ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-c:a", "aac"]
                    cmd += ["-t", "3.6", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(source)]
                    subprocess.run(cmd, check=True, capture_output=True, timeout=30)
                    root = fixtures / f"render-{audio}"
                    root.mkdir()
                    job = {"rendererVersion": "joey-media-1", "fontVersion": "joey-fonts-1",
                           "spec": {"format": "mp4", "media": {"id": "source"},
                                    "crop": {"mode": "contain", "x": .5, "y": .5},
                                    "video": {"start": 1.1, "duration": 1.2, "sourceAudio": True,
                                              "zoom": 1, "captions": False, "words": []}},
                           "inputs": [{"id": "source", "url": "fixture"}],
                           "videoRect": {"x": 60, "y": 460, "width": 960, "height": 1000}}
                    with patch("render.download", side_effect=lambda url, target: shutil.copy(source, target)), \
                         patch("render.capture", side_effect=lambda job, root: shutil.copy(overlay, root / "overlay.png")):
                        output = render(job, root)
                    duration, has_audio = probe_media(output, "video")
                    self.assertAlmostEqual(duration, 1.2, delta=.05)
                    self.assertEqual(has_audio, audio)
                    probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(output)]))
                    video = next(stream for stream in probe["streams"] if stream["codec_type"] == "video")
                    self.assertEqual((video["codec_name"], video["width"], video["height"], video["pix_fmt"]),
                                     ("h264", 1080, 1920, "yuv420p"))


if __name__ == "__main__":
    unittest.main()
