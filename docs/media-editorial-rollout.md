# Media and assisted-editorial rollout

## Foundation (first scoped change)

- Preserve fractional browser metadata; bound duration by remaining source and
  the 60-second export ceiling. Invalid/empty ranges cannot be submitted.
- Reset source metadata and trim state on asset changes.
- Independently probe the worker's selected video stream and optional music.
  Reject corrupt inputs, attached-cover first video streams, missing streams and
  nonfinite duration before capture/transcription/compositing.
- Storyboard playback is explicitly approximate and silent. Empty/invalid
  scenes are safe; edits reset playback. Finished native MP4 playback remains
  authoritative.

Local verification: 143 Vitest suites / 920 tests; typecheck; focused ESLint;
Python worker tests, including synthetic silent/audio FFmpeg exports. Local
fixtures stub storage download and overlay capture; they do **not** establish
Modal, R2, attachment, transcription or browser acceptance.

## Required next gates

1. Deploy the coordinated app/worker foundation to disposable staging and retain
   one single-source render → R2 → attachment → playable MP4 result.
2. Introduce the backward-compatible v2 timeline and editor (1–6 tenant-owned
   clips/images/brand cards, ≤60 seconds; cut/fade only).
3. Add rights-vetted manual/sparse-preset SFX, default off; assembled-speech
   transcription and independent cache; no new paid audio/semantic providers.
4. Add account-scoped timezone/window preferences and confirmed recommendations.
   Recheck role, account, content revision and media, then serialize scheduling
   conflicts. Agency agents remain draft-only.
5. Separate bounded publication dispatch from maintenance. Do not activate
   minute cron until the existing hosting plan is verified to support it.
6. Retain desktop/390px playback, invalidation, cancellation, race and benchmark
   evidence before enabling timeline/SFX in staging and rolling out.

Paid acceptance has a $10 ceiling. Live publication requires separate approval
of the exact post. No hosting-plan upgrade is implied by this rollout.
