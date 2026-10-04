# Media/editorial review — 2026-10-04

Reviewed implementation: `3d6e2c7`, PRs #138–#142 and their dependency stack.
Three independent read-only reviewers covered media, editorial scheduling and
focused dependency-stack authorization/Scout behavior. This was not an
exhaustive security certification.

## Findings resolved

- Proposed schedule approvals now share account locks and conflict checks with
  explicit schedule confirmation; conditional updates fence content, account
  targets and proposed time.
- Occupancy includes legacy `accountIds` as well as singular `accountId`.
- Approved unscheduled drafts expose posting suggestions in Drafts.
- Calendar details scroll within the viewport.
- Disabled saved sound effects can be removed without reenabling the feature.
- V2 rendering rejects unsupported NVENC requests instead of reporting a CPU
  render as GPU encoding.
- SQL NULL variants are no longer compared with JSON null during draft review.

The media and editorial reviewers rechecked the fixes and found no remaining
concrete merge blocker within their reviewed scope.

## Recorded verification

- Node 24 Vitest: 148 suites, 935 tests passed.
- Application, Playwright and desktop CI passed at `3d6e2c7`.
- Typecheck, zero-warning lint, dependency validation, migration validation,
  Knip, Next build and Eve build passed. Knip retained configuration hints.
- Python/FFmpeg worker suite: 13 tests passed, including cut/fade assembly,
  audio combinations, cue validation and unsupported encoder rejection.
- Disposable PostgreSQL: fresh replay of 56 migrations and idempotent restart
  passed; editorial concurrency, approval-versus-confirmation, stale revision,
  disconnected account, legacy account arrays and authorization checks passed.
- Authenticated Playwright at 1440px and 390px passed preference persistence
  and scheduling an initially unscheduled approved draft without publication.

## Database rollout preparation

The inspected production-named Neon branch has 13 historical journal entries
through 0049. Entries 0038–0049 match checked-in migration hashes; the earlier
entry is a historical baseline. Do not replay pre-baseline SQL.

A pre-rollout Neon backup branch without compute and a private PostgreSQL 18
custom-format archive were created. The archive restored transactionally in a
network-isolated PostgreSQL 18 container with all 13 journal entries. An expiring
child branch rehearsed 0050–0055 and an idempotent replay successfully.

Existing local keys decrypted both API credentials and one encrypted OAuth
value. On the rehearsal copy, the secret migration converted two API credentials
and five plaintext OAuth values; no Telegram credential required conversion.
These checks do not establish live provider operation after rollout.

Production schema and credentials were not changed during this review. Vercel
does not disclose sensitive production variables: confirm the local database
and auth/encryption key mapping before applying changes and merging the stack.
Keep legacy fallback until the migration and credential verification finish.

## Activation gates remain

Keep timeline, sound effects, assisted scheduling, publication cadence and
agency automation disabled until their documented hosted gates pass. Real
single-clip export evidence exists separately; it does not prove multi-scene
exports, caption cache reuse, subjective audio quality or minute-level delivery.
The authenticated 30-minute soak, delivered monitoring alerts, billing/live
acceptance and explicit approval-resume acceptance remain separate launch gates.
