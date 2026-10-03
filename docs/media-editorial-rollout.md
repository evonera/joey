# Media/editorial acceptance and rollout

Timeline and sparse effects default off (`MEDIA_TIMELINE_ENABLED`,
`MEDIA_SFX_ENABLED`). Assisted scheduling defaults off
(`EDITORIAL_SCHEDULING_ENABLED`). Publication cadence defaults off
(`PUBLICATION_TICK_ENABLED`); activating it additionally needs verified hosting
and a deployed cron entry. Never enable unattended agent publication.

## Reproducible local gates

Use Node 24 (the pinned project runtime), Python worker requirements, FFmpeg and
a disposable PostgreSQL database. Do not use production credentials/database.

```sh
npm run check:migrations
npm run typecheck
npm run lint:ci
npm test -- --maxWorkers=2
npm run knip
npm run build
npm run build:eve
python3 -m unittest discover -s workers/media -p 'test_*.py'
JOEY_INTEGRATION_TEST=true npm run test:integration:editorial
EDITORIAL_SCHEDULING_ENABLED=true JOEY_INTEGRATION_TEST=true npm run test:e2e
```

The PostgreSQL suite verifies same-account schedule races, independent accounts,
revoked membership, foreign users, disconnected accounts and stale content.
Playwright verifies real saved preferences and explicit schedule confirmation at
1440px/390px without invoking providers or publishing. Worker fixtures verify
normalized cut/fade joins and silent/speech/music/effect output.

## Staging gates (not established by mocked/local fixtures)

- Real clip → image/card → clip export through Modal → R2, with attached native
  MP4 playback on desktop/mobile. Include failed/stale completion and retry.
- Listen to the complete export, verify intelligible speech, sparse effects,
  caption synchronization and measured clipping/ducking. Captions must transcribe
  assembled speech, not the finished music/effect mix. Verify transcription cache
  reuse after visual-only edits and no retry of ambiguous paid requests.
- Record queue, capture, transcription, rendering, upload and attachment time
  separately. Compare identical CPU/T4 fixtures before changing CPU default.
- Recheck media/caption revision fences and default-off legacy compatibility.
- Verify deployed cron discovery, overlapping atomic claims, receipts and actual
  delivery lag on a minute-capable hosting plan. HTTP success is insufficient.

Keep paid acceptance within the previously approved $10 total; no live social
publication without exact-post approval. Existing single-clip staging evidence
is in `docs/benchmarks/media-staging-2026-10-04.md`; it does not establish the
new multi-scene/SFX gates. Retain private cookies/provider credentials outside
tracked reports. Enable each feature only in a disposable workspace after its
corresponding hosted acceptance passes, then review production rollout separately.
