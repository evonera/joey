# Restrained sound design

V2 timeline jobs now use `joey-media-3`; the worker still understands existing v1 (`joey-media-1`) and plain v2 (`joey-media-2`) jobs. Deploy the coordinated worker before enabling timeline admission. `MEDIA_SFX_ENABLED=true` permits cues, default off. An owner can test in disposable staging after listening to the actual export; no automatic keyword/number/emoji sounds or paid audio synthesis.

Three original deterministic synthetic WAV effects are bundled by `workers/media/generate_sfx.py`, distributed under the repository MIT license. `sfx/manifest.json` records provenance, duration and SHA-256 checksums. No third-party recording is imported or described as CC0 without evidence. Modal's existing `/worker` directory copy includes the files; effects are addressed only by fixed names and checksums, not arbitrary paths.

Manual cues or an editable sparse intro preset; six cues maximum, one second apart, bounded gain, short fades. Missing source audio becomes silence. Music is normalized to stereo/48 kHz and ducked under the assembled source track and cues, with peak limiting. Listen before approval: a synthetic mixer test is not proof that every speech recording is intelligible.

Automatic captions transcribe the assembled source-only track before adding music/SFX. Only actual source-audio streams trigger transcription. Independent cache identity includes source assets, trims, durations, source-audio flags and transition overlaps, excluding typography, branding, music and cue changes. Existing workspace OpenAI key, budget reservation, monthly cap and ambiguous-paid-request safeguards remain; no retry of an ambiguous transcription is introduced.

Tests cover cue bounds, checksums during render, silent/speech/music combinations, real FFmpeg output duration, non-clipping samples and speech-cache identity. Subjective listening, caption provider timing and deployed mixed-scene playback remain acceptance gates; local tests do not authorize production rollout.
