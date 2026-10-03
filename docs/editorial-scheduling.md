# Assisted editorial scheduling

Apply migration 0055 before deploying this code, including deployments with
`EDITORIAL_SCHEDULING_ENABLED=false`: ordinary Compose/review scheduling also
checks stored cadence preferences. Enable assisted UI separately after acceptance.
Owners/admins save explicit per-account IANA timezones and weekly windows in
Calendar. Suggestions return up to three UTC/local instants within fourteen
days; they are preferences, not claimed engagement predictions. Six-hour
spacing is editable. Funnel quotas and automatic agent scheduling are absent.

Only a reviewed approved/scheduled draft can be confirmed. Confirmation locks
the account and draft, rechecks current membership, account activity, content
revision and generated-media readiness, then rechecks conflicts. Compose and
Calendar interactive schedule writers share this account lock. Saved cadence
preferences apply to them; accounts without saved preferences retain existing
manual scheduling apart from exact-minute collisions. Theme packages and
published history are included conservatively in occupied times.

## Publication cadence

`/api/cron/publication` requires `CRON_SECRET` and defaults disabled. It uses the
existing atomic publisher, ten drafts per batch, and reports failed operations
as HTTP 503. It does not run expensive Scout/maintenance tasks.

Do not set `PUBLICATION_TICK_ENABLED=true` until the deployment hosting plan
supports minute-capable cron and the cron entry has been verified. No paid plan
upgrade is performed here. On a verified plan, add a cron entry for
`/api/cron/publication` with `* * * * *`, retaining the daily `/api/cron` entry.
Then enable the flag; maintenance delegates draft publication to the separate
tick. While disabled, the existing daily draft publisher remains active.

The separate tick covers Compose drafts; existing Theme publication remains in
its existing scheduler. Check both paths and provider reconciliation before
advertising minute-level delivery for every content type. HTTP 200 alone is
not evidence: inspect published/failed counts, actual provider receipts and
scheduled-versus-delivered lag. Overlapping ticks retain existing atomic claims.
