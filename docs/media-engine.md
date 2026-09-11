# Media engine migration

Status: implementation in progress, feature disabled by default. This is not a production acceptance sign-off.

## Implemented

- Versioned RenderSpec, tenant-owned source references, version-aware input hashes and deduplicated jobs.
- Shared server render API used by Theme Studio and the Flow “Render finished media” node.
- Durable queued/rendering/succeeded/failed/cancelled lifecycle. Claims use PostgreSQL SKIP LOCKED, attempt tokens, a ten-minute lease and at most three lease/preparation attempts. Failed execution is terminal; identical failed/cancelled submissions currently return that terminal job.
- Scoped 15-minute R2 input GET/output PUT URLs. Workers have no database or Zernio credentials. Authenticated claim and completion use timestamped HMAC-SHA256. Request bodies are bounded before buffering.
- Immutable attempt-specific output keys, object metadata verification, delayed orphan cleanup, cancellation and stale-result fencing.
- Trusted React templates: photo headline, photo inset, branded clip, minimal meme. Chromium captures PNGs and transparent overlays; FFmpeg composites finished MP4s. No arbitrary generated HTML execution.
- Bundled OFL Inter/Anton fonts, measured headline fitting and overflow rejection. Emoji currently uses the container's Noto Color Emoji font; explicit pinned emoji assets remain a rollout gap.
- One video up to 60 seconds, 1080×1920, contain/cover crop, simple zoom, source audio, optional music ducking and supplied timed ASS captions. MP4 H.264/AAC when audio exists, yuv420p and fast-start.
- Theme Studio source selection, export preview, status polling and cancellation. Publishing checks completed output and current revision. Caption-only edits retain new-engine pixels and invalidate approval; legacy caption edits still invalidate their image.
- Legacy image templates remain. Raw-video and mixed-carousel fallback publication is blocked.

## Local setup

Apply migrations through 0045 with `npm run db:migrate`. Configure the existing R2 environment and a public asset origin reachable by publishing providers. On the backend set:

```
MEDIA_ENGINE_ENABLED=true
MEDIA_STATIC_TEMPLATES_ENABLED=false
MEDIA_MONTHLY_JOB_LIMIT=1000
MEDIA_MONTHLY_TRANSCRIPT_LIMIT=1000
MEDIA_TRANSCRIPTION_USD_PER_MINUTE=<your verified provider rate>
MEDIA_WORKER_SECRET=<at least 32 random characters>
```

The static flag opts automated image assembly into the new templates; manual exports use the render dialog. The monthly limit counts submitted jobs, including failures, rather than asserting a dollar budget.

Deploy `workers/media/modal_app.py` as a dedicated Modal app after internal acceptance. Its `joey-media-secrets` secret needs `JOEY_URL`, `MEDIA_WORKER_SECRET` and optionally `MEDIA_ENCODER=t4`; CPU is default. Never give the worker publishing credentials. Both render configurations allocate two CPU cores and 4 GiB, allow two containers, have zero minimum containers and a two-second scale-down window.

The current dispatch mechanism is an authenticated pull once per minute. Idle polls incur some allocation and queue delay; include both in measurements. This is not an immediate push dispatch. The Eve flows tick also settles terminal Theme Studio results if a completion attachment was interrupted.

Chromium is supplied by Playwright 1.55.0. FFmpeg must include libass; the minimal Homebrew FFmpeg installation on this development machine did not. `/opt/homebrew/opt/ffmpeg-full/bin` does. Verify NVENC availability in the T4 image before selecting it.

## Validation

- `npm test`: 410 tests passed at the current checkpoint.
- `npm run test:integration:media` with `JOEY_INTEGRATION_TEST=true` against disposable localhost PostgreSQL: duplicate submission, tenant isolation, competing claims, cancellation, lease recovery, stale completion and immutable output registration passed. This suite is included in CI.
- `python -m unittest discover -s workers/media -p 'test_*.py'`: three tests cover ASS timing gaps, control-sequence stripping and rejection of non-R2 download URLs.
- Fresh migration replay: all 46 migrations passed. Production Next build and full lint passed at the preceding checkpoint; final caption-path builds are being checked.
- Four local template captures and 15-second finished exports were inspected. These use synthetic footage and do not establish acceptance against real editorial photos and difficult crops.

Generate repeatable compositions:

```
node --import tsx workers/media/fixtures.ts /tmp/joey-media-benchmark
python workers/media/benchmark.py /tmp/joey-media-benchmark
```

The benchmark generates synthetic source footage, runs 15/30/60-second exports twice and verifies H.264, geometry, pixel format and duration. Its JSON explicitly measures render-only time. Run identical inputs on CPU/T4 and record allocated resources, cold/warm end-to-end timing, queue time, network, captures, transcription, retries and idle time separately. Do not infer two-minute p95 or monthly costs from six local samples.

## Remaining acceptance work

1. Real provider acceptance for the new independently cached transcription path. Theme Studio and Flows now support automatic captions using the workspace OpenAI key. The worker extracts only selected audio (up to 60 seconds); Joey requests verbose JSON word timestamps ([official API guide](https://developers.openai.com/api/docs/guides/speech-to-text)). Provider calls run outside transactions. Cache reuse across headline edits, trim identity and cancelled-job access passed database tests. Failed/abandoned paid requests require reconciliation rather than automatic duplicate spending. A configured per-minute rate reserves estimated spend against the workspace budget before calls. Validate the full paid success/failure path with mocked and then configured providers.
2. Theme Studio now exposes MP3 music selection and crop focal points. Add pinned emoji assets and overflow checks for account branding, plus missing-font and silent-input export fixtures.
3. Separate reusable overlay capture caching from finished-output deduplication, explicit bounded retry UX, and complete cost accounting across attempts.
4. Strengthen atomic source/template revision checks during approval/publication races, and test them against real PostgreSQL.
5. Sample Day now imports VideoPreviewComposition and ScenePreviewPlayer. Deprecated compatibility exports preserve existing consumers. Verify visual preview regressions.
6. Run browser regression, fresh migration replay, Eve build, real-reference visual checks and configured R2/Modal acceptance. CPU/T4 choice, p95 target and provider publishing compatibility remain unverified.

Local synthetic CPU render-only timings: 15 seconds of output took 6.1–7.0 seconds; 30 took 11.4–12.4; 60 took 23.2–25.5. Raw results are in `docs/benchmarks/media-local-2026-09-07.json`. These are not Modal p95 or cost measurements.

No live Modal deployment, social publishing, or paid transcription request was performed for this checkpoint.

## Subsequent validation checkpoint

The isolated Modal canary completed all twelve CPU/T4 exports. Results are saved in `docs/benchmarks/media-modal-2026-09-07.json`. CPU remains the default: these compositions rendered faster and produced smaller files with libx264 than the current NVENC settings. Container IDs demonstrate that requested cold/warm phases do not reliably force actual cold/warm allocation; use the recorded IDs and round-trip timings rather than the phase labels as evidence. This canary excluded R2, production queueing and transcription, so it does not establish the production p95 target. The ephemeral app stopped after completion. The final bundled emoji/capture-cache/dispatch changes were made after this canary and need an acceptance rerun.

Additional implementation now includes authenticated immediate Modal dispatch (`MEDIA_WORKER_DISPATCH_URL`, HTTPS `.modal.run` endpoint), with scheduled pull recovery; a tenant-separated 30-day capture cache; bundled OFL emoji font with SHA-256 verification; optional MP3 music and crop focal points; explicit retry capped at three total claims; attempt-level timing history and a tenant media-usage endpoint. Configure inclusive CPU/T4 per-second estimates using `MEDIA_CPU_USD_PER_SECOND` and `MEDIA_T4_USD_PER_SECOND`. Usage explicitly excludes idle/startup/storage/network charges and never presents incomplete estimates as provider invoices.

Page/template/format edits now invalidate dependent packages inside the same transaction. Pixel edits clear media; non-pixel edits clear approval. Previously accepted publication attempts are preserved. Database tests pass for an edit winning against a publication claim, accepted-attempt preservation, retry fencing, real-timing cache reuse, mocked provider success, reserved transcription cost and avoiding duplicate paid requests after ambiguous failure. Four Python contract tests pass, including missing/tampered font rejection. Local visual fixtures pass for emoji, inset, headline overflow rejection and silent clips.

R2 credentials were not present in the checked local environment files. Live R2/worker callback acceptance and actual paid transcription remain unverified. No social publishing occurred. Earlier outstanding-work lists above describe prior checkpoints; the remaining work is final regression/visual acceptance of the latest code, configured full-path provider tests, robust abandoned-transcription reconciliation, and complete allocation/invoice cost reconciliation.
