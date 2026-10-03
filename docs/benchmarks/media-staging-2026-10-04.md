# Single-clip staging acceptance — 2026-10-04

Result: **PASS**. Opens the implementation gate for the version-2 multi-scene timeline, not a production-launch or PR-merge approval.

## Isolation and transport

- Application SHA: `f3ea4f5`; preview deployment `dpl_12MCcn29qMrMWj48QBqU7VXdockN` in the separate `evonera/joey-media-staging` Vercel project.
- Staging origin: `https://joey-media-staging-evonera.vercel.app`.
- Schema-only Neon branch `br-spring-water-axpikghl`: fresh owner account, fresh auth/encryption/worker secrets, no copied customer data or encrypted production credentials. Existing versioned migrations applied in isolation.
- Modal app: `joey-media-staging`; image `im-kpn59qBvxRzMR3lXzwEDC9`. Manual CPU invocation only, one container maximum, no timer, no GPU, no provider generation.
- Before queueing: unsigned claim returned Vercel HTTP 302; signed claim with the header-only bypass returned HTTP 200 and an empty queue.
- Temporary bypass revoked after playback. The old bypass subsequently returned HTTP 302. Staging database compute suspended and verified `idle`; branch expires 2026-10-06T00:00:00Z.
- No production deployment, database writes, worker redeployment, bucket policy/CORS changes, payment, or social publication.

## Fixture and measured outcome

The source was generated locally with FFmpeg: 640×360, 30 fps, moving test pattern, 3.6 seconds, synthetic tone. Source upload and fixture rows were seeded server-side in the disposable tenant; this does **not** establish browser-upload acceptance.

The browser render dialog detected `(source: 3.6s)`. Through the actual UI, selected start `0.6` seconds and duration `3.0` seconds; no music or transcription. Submitted one export.

| Evidence                          | Observed                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| Job                               | `00081ed8-c3f0-417b-acad-9b7f66869702`                                                  |
| Job result                        | `succeeded`, attempt 1, no error                                                        |
| Claimed render processing elapsed | 10.69503158 seconds                                                                     |
| Encoder                           | CPU `libx264`                                                                           |
| Output                            | H.264, 1080×1920, 30 fps, AAC audio                                                     |
| Probed output duration            | 3.000000 seconds for video and audio                                                    |
| R2 output bytes                   | 772,814                                                                                 |
| Package                           | `b0bf23b3-c8a5-4d85-83f5-d2d1ac4a7abc`, pending review, one attached asset              |
| Native browser player             | duration 3; 1080×1920; readyState 4; currentTime 0.461897; paused false; no media error |

The native finished-MP4 player in ThemePackageQueue is authoritative; the storyboard is not the audiovisual export. Playback was muted for browser automation; AAC presence was verified with ffprobe, but subjective audio quality was not assessed.

## Problems encountered and resolved

- Archive deployment included a script test while excluding its imported test helper; that isolated build failed. Normal filtered upload built successfully. No product TypeScript configuration was loosened.
- Initial Modal entrypoint import failed before claiming a job (`modal_app` was not on the container import path). Invocation stopped; staging entrypoint now resolves `/worker` inside the container and its sibling directory locally. No render retry or duplicate job was needed.
- The successful Modal invocation: `https://modal.com/apps/shak/main/ap-akLweGEZJOMHtjScY5yHjb`. Both ephemeral invocations stopped; deployed staging app has zero active tasks and no scheduler.

## Spend and retained evidence

No paid AI/transcription/collection calls. One actual render. At published Modal CPU/memory rates, the recorded render-processing interval represents approximately $0.000375 of requested-resource compute. This excludes initialization, the stopped import-failure allocation, image building, database, Vercel, and R2 charges; it is **not** a final invoice or exact total. Resource use was limited to one short export, two bounded invocations, and a 0.25-CU disposable database; no continuing worker allocation is active. Estimated acceptance spend is comfortably below the approved $10 ceiling; consolidated billed spend was not independently reconciled.

Private local evidence directory: `/Users/shakthi/.codex/acceptance/joey-media-2026-10-04/` contains `render-dialog.png`, `attached-playback.png`, `job-evidence.json`, `playback.json`, and downloaded `export.mp4`. Secret-bearing provisioning artifacts in that directory must never be committed.

Validation after staging import fix: 8 Python tests passed, including synthetic FFmpeg integration. The application SHA had passing GitHub Application quality, Playwright E2E, Tauri, and Vercel checks. The final staging-only import fix must pass its fresh PR checks before merging.

## Next gate

Proceed with PR 2: versioned one-to-six-scene timeline, tenant-owned video/image/card assets, central frame arithmetic, cut/fade only, and revision-fenced attachment. Preserve this single-source baseline. Multi-scene, SFX, scheduling, mobile playback, cancellation, and invalidation are separate acceptance cases and are not claimed by this test.
