import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from render import ass_time, download, write_captions, prepare_fonts


class RenderContractTests(unittest.TestCase):
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
