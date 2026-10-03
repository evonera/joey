"""Original synthetic effects, no third-party samples. Deterministic 48 kHz WAV.

Generated assets and source are distributed under the repository MIT license.
Regenerate: python3 workers/media/generate_sfx.py
"""
import hashlib
import json
import math
import random
import struct
import wave
from pathlib import Path

directory = Path(__file__).parent / "sfx"
directory.mkdir(exist_ok=True)
manifest = {"provenance": "Original deterministic mathematical synthesis; no third-party recordings", "license": "MIT (repository LICENSE)", "sampleRate": 48000, "assets": {}}
for effect, duration in [("whoosh", .35), ("pop", .12), ("ding", .4)]:
    rng = random.Random(20261004)
    samples = []
    last = 0
    for index in range(round(duration * 48000)):
        t = index / 48000
        edge = min(1, t / .01, (duration - t) / .02)
        if effect == "whoosh":
            last = .85 * last + .15 * rng.uniform(-1, 1)
            value = last * math.sin(math.pi * t / duration) * .8
        elif effect == "pop":
            value = math.sin(2 * math.pi * (700 * t - 1600 * t * t)) * math.exp(-35 * t) * .3
        else:
            value = (math.sin(2 * math.pi * 1300 * t) + .25 * math.sin(2 * math.pi * 2600 * t)) * math.exp(-10 * t) * .2
        samples.append(struct.pack("<h", round(max(-1, min(1, value * edge)) * 32767)))
    path = directory / (effect + ".wav")
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(48000)
        output.writeframes(b"".join(samples))
    manifest["assets"][effect] = {"file": path.name, "duration": duration, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
(directory / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
