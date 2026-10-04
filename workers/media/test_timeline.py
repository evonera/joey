import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from timeline import boundaries
from render import render, probe_media


class TimelineTests(unittest.TestCase):
    def test_rejects_unvalidated_gpu_encoder_before_work(self):
        from timeline import render_timeline
        with self.assertRaisesRegex(ValueError, "CPU libx264 only"):
            render_timeline({}, Path("/unused"), "h264_nvenc")
    def test_frame_arithmetic_and_bounds(self):
        card = {"kind": "card", "durationFrames": 90, "transition": "cut"}
        self.assertEqual(boundaries([{**card, "transition": "fade"}, card, card]), ([(0, 90, 12), (78, 168, 0), (168, 258, 0)], 258))
        for scenes in ([], [card] * 7, [{**card, "transition": "fade"}], [{**card, "durationFrames": 29}], [{**card, "durationFrames": float("nan")}], [{**card, "transition": "evil"}], [{**card, "durationFrames": 1800}, card]):
            with self.assertRaises(ValueError):
                boundaries(scenes)

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg required")
    def test_real_clip_card_clip_cut_and_fade(self):
        with tempfile.TemporaryDirectory() as folder:
            fixture = Path(folder)
            source = fixture / "source.mp4"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=red:s=320x240:r=24", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(source)], check=True, capture_output=True, timeout=30)
            overlay = fixture / "overlay.png"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=black@0:s=1080x1920,format=rgba", "-frames:v", "1", str(overlay)], check=True, capture_output=True, timeout=30)
            crop = {"mode": "contain", "x": .5, "y": .5}
            clip = {"kind": "video", "asset": {"id": "fixture"}, "trimStartFrame": 6, "durationFrames": 36, "transition": "cut", "sourceAudio": True, "crop": crop}
            scenes = [{**clip, "transition": "fade"}, {"kind": "card", "durationFrames": 30, "transition": "cut"}, {**clip, "sourceAudio": False}]
            root = fixture / "render"
            root.mkdir()
            job = {"rendererVersion": "joey-media-2", "fontVersion": "joey-fonts-1", "spec": {"version": 2, "format": "mp4", "timeline": scenes, "video": {"duration": 3}}, "inputs": [{"id": "fixture", "url": "fixture"}], "sceneLayouts": [{"html": "trusted", "videoRect": {"x": 60, "y": 650, "width": 960, "height": 1000}}] * 3}
            with patch("render.download", side_effect=lambda url, target: shutil.copy(source, target)) as download, patch("render.capture", side_effect=lambda job, root: shutil.copy(overlay, root / "overlay.png")):
                output = render(job, root)
            self.assertEqual(download.call_count, 1)
            duration, has_audio = probe_media(output, "video")
            self.assertAlmostEqual(duration, 3, delta=.04)
            self.assertTrue(has_audio)
            probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(output)]))
            video = next(s for s in probe["streams"] if s["codec_type"] == "video")
            self.assertEqual((video["width"], video["height"], video["r_frame_rate"]), (1080, 1920, "30/1"))
