# Version-2 media timeline

`MEDIA_TIMELINE_ENABLED=true` enables the experimental Theme Studio editor and server admission. Default is off. Requires a worker supporting `joey-media-2`; do not enable before coordinated staging acceptance. Version-1 jobs and PNG templates retain `joey-media-1` and their existing identity.

One to six scenes: tenant-owned uploaded video (frame-based trim, source audio on/off), still image, or trusted branded title/CTA card. Cut is default; fade overlaps 12 frames (0.4 seconds at 30 fps). The final scene must use cut. Finished duration is bounded to 1800 frames/60 seconds. Scene bounds are shared TypeScript contract arithmetic and independently checked in Python. Caption/music support is deferred to the sound-design PR; this release rejects unsupported effects rather than silently ignoring them.

Asset versions are resolved server-side; every referenced scene is checked for tenant ownership and matching MIME type by admission. Workers get only signed owned input URLs and React-escaped, first-party template markup, never arbitrary external URLs, HTML, or FFmpeg filters. Images, audio, and video are normalized to the same geometry, frame rate, timebase and stereo audio; silent scenes receive silence. Source dimensions and trim metadata fail closed. Rendering uses CPU libx264 pending benchmarks.

Source settings, scene order, text, trim, crop and transitions are included in render identity and Theme attachment revisions. Existing stale-completion, retry, cancellation and quota fences remain in place. Export playback—not the approximate storyboard—is authoritative.

Local synthetic clip → card → clip with fade and cut tests verifies actual FFmpeg output geometry, frame rate and duration. It does not establish deployed Modal/R2, browser playback or subjective audio quality; retain separate acceptance evidence before enabling the flag.
