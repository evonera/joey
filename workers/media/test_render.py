import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from render import ass_time, download, write_captions, prepare_fonts, probe_media, validate_trim


class RenderContractTests(unittest.TestCase):
    def test_fractional_trim_and_nonfinite_inputs(self):
        validate_trim({"start": 1.2, "duration": 2.4}, 3.6)
        for start, duration, source in [(0, 4, 3.6), (2.8, 1, 3.6), (-1, 2, 4),
                                        (0, 61, 100), (float("nan"), 2, 4), (0, float("inf"), 4), (0, 2, float("nan"))]:
            with self.assertRaises(ValueError):
                validate_trim({"start": start, "duration": duration}, source)

    def test_probe_requires_playable_stream_and_finite_metadata(self):
        video = {"codec_type": "video", "width": 1080, "height": 1920, "duration": "3.6"}
        valid = {"format": {"duration": "4"}, "streams": [video]}
        with patch("render.subprocess.check_output", return_value=json.dumps(valid).encode()):
            self.assertEqual(probe_media(Path("source"), "video"), (3.6, False))
        with patch("render.subprocess.check_output", return_value=json.dumps({**valid, "streams": [video, {**video, "duration": ".1"}]}).encode()):
            self.assertEqual(probe_media(Path("source"), "video"), (3.6, False))
        invalid = [b"not json", b"{}", json.dumps({"format": {"duration": "3"}, "streams": [{"codec_type": "audio"}]}).encode(),
                   json.dumps({"format": {"duration": "nan"}, "streams": [video]}).encode(),
                   json.dumps({"format": {"duration": "4"}, "streams": [{**video, "width": 0}]}).encode(),
                   json.dumps({"format": {"duration": "4"}, "streams": [{**video, "disposition": {"attached_pic": 1}}]}).encode()]
        invalid.append(json.dumps({**valid, "streams": [{**video, "disposition": {"attached_pic": 1}}, video]}).encode())
        for payload in invalid:
            with patch("render.subprocess.check_output", return_value=payload), self.assertRaisesRegex(ValueError, "playable video"):
                probe_media(Path("source"), "video")

    def test_caption_timing_preserves_silence_and_strips_ass_commands(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "captions.ass"
            write_captions([{"text": "hello", "start": .2, "end": .5}, {"text": r"{\pos(0,0)}world", "start": 2, "end": 2.4}], target)
            content = target.read_text()
            self.assertIn("0:00:00.20,0:00:00.50", content)
            self.assertIn("0:00:02.00,0:00:02.40", content)
            self.assertNotIn(r"\pos", content)
            self.assertEqual(content.count("Dialogue:"), 2)

    def test_missing_or_modified_fonts_fail_before_rendering(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "manifest.json").write_text(json.dumps({"sha256": {"Inter.ttf": "invalid"}}))
            with self.assertRaises(FileNotFoundError):
                prepare_fonts(root, root)
            (root / "Inter.ttf").write_bytes(b"not a font")
            with self.assertRaisesRegex(ValueError, "checksum"):
                prepare_fonts(root, root)

    def test_ass_time_carries_centiseconds(self):
        self.assertEqual(ass_time(59.999), "0:01:00.00")

    def test_untrusted_download_targets_never_make_requests(self):
        with patch("httpx.stream") as network:
            for url in ["file:///etc/passwd", "http://127.0.0.1", "https://example.com", "https:///invalid", "https://r2.cloudflarestorage.com.attacker.test/file"]:
                with self.assertRaises(ValueError):
                    download(url, Path("unused"))
            network.assert_not_called()

if __name__ == "__main__":
    unittest.main()
