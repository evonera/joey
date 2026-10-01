# Agency beta release gates

The five agency PRs are stacked. Merge in dependency order only after review;
keep `AGENCY_AUTOMATION_ENABLED=false` until the staged gates below pass. Never
point automated signup, cleanup, seed or integration scripts at production.

## Before deployment

1. Back up the database. Rehearse migrations 0051–0053 on an isolated Neon
   branch (or local PostgreSQL). Run `check:migrations`, typecheck, lint, unit
   tests, Knip, Next build and Eve build. Inspect the current Greptile review.
2. Run `test:integration:scouts` and `test:integration:agency` with
   `JOEY_INTEGRATION_TEST=true`; cloud runs additionally require the exact
   `JOEY_NEON_TEST_BRANCH_ID`. The guard checks the database's immutable branch
   ID before imports or writes. No provider credentials are needed.
3. Run `test:e2e` against a disposable localhost database with
   `JOEY_INTEGRATION_TEST=true`. Both authenticated suites check the database
   before signup; cloud runs require the immutable test branch ID above. The
   runner never reuses an unknown existing server. The agency tests
   cover original paused creation/editing/search/history at 1440px and 390px.
   They do not approve provider calls, send model prompts or publish.
4. Link the preview to that isolated database. A green preview build alone is
   not evidence its database has migrations. Check `/agents` while authenticated.
   Migration 0053 deliberately pauses old activations; don't reconstruct their
   approvers. Existing unindexed chat sessions require a new conversation.

## Controlled staging acceptance

Use one new test workspace, your own Instagram connection and uploaded,
licensed source media. Set workspace AI budget and provider-side Apify/Exa
spend caps first. Budget units are separate: Joey's AI ledger is not a claim
to reserve Apify or Exa charges. Leave billing in test mode.

1. Configure a paused Instagram Scout, its Theme Page's first active Instagram
   slot/template, and the explicitly chosen active destination accounts. Add
   the owned media needed by that template. Create the agent paused.
2. Enable the operator flag only in staging. As an owner/admin, review the
   exact bindings and explicitly enable daily drafts. Verify a member cannot.
3. In the bound conversation, request `agency_draft`. Verify an actual Eve
   approval card pauses the turn, rejection makes no provider call, and only
   the same still-authorized owner can approve. Change configuration while
   waiting: the old approval must be rejected; start a new conversation.
4. Approve one draft check. Check the captured source, independently sourced
   evidence, original brand angle and human-review queue. Trigger it again:
   same UTC-day receipt/package, no second scrape/research/generation.
5. Test pause/Stop while a provider phase is running. An already submitted
   request may finish and incur its provider charge, but no new phase or draft
   commit may start after the guard observes revocation. Pausing is not a
   remote provider refund. Re-enable only after checking receipt/package state.
6. For video, confirm queued is not failure. Inspect Modal/R2 output and Joey's
   attached playable MP4. Caption-only edits retain pixels; headline/media
   edits reject old completion and require a new render. A late dispatch must
   not revert completed history. Test failed job retry (three worker attempts
   max) without regenerating the story. Real playback is a separate gate from
   the synthetic-provider database attachment tests.
7. Confirm Vercel discovers the generated `agency-drafts` cron at 05:00 UTC.
   Eve dev does not tick cron automatically; its documented local dev schedule
   dispatch route can test discovery. Verify actual staging Workflow execution
   and retained run result. Never use the unauthenticated dev route in production.

## Monitoring, soak and rollback

Retain deployment SHA, migration version, test report and sanitized run/job
IDs. Do not log API keys, cookies, raw provider bodies or session tokens.
Monitor failed/expired agency runs, approval age, queued-media age, provider
errors, AI-budget denials and the dispatcher capacity warning (2500 agents).
Verify frontend/server/Eve/Modal events actually reach the chosen alert
destination; configuration presence alone does not prove alert delivery.
Cross-midnight delayed dispatches log `agency.dispatch_expired` and record a
cancelled, zero-attempt history receipt when the actor still has permission.
These receipts are not executions and consume no daily quota. They never
overwrite a day that already ran. If membership is revoked, the structured
expiry log remains available even when the historical write is denied.

Run the existing authenticated 30-minute soak against this staging workspace;
record browser errors, 5xxs, failed requests and heap/listener growth. Include
agent selection, history, mobile setup and pending approval pause/resume. Do
not generate real AI repeatedly in the soak. Investigate unexplained growth or
failures rather than masking them. A short mobile smoke check is not a soak.

Emergency response: set `AGENCY_AUTOMATION_ENABLED=false`, pause the affected
agents, inspect saved drafts/jobs, then cancel outstanding Eve/Modal work when
appropriate. Turning the switch off stops new guarded phases, not requests
already submitted. Keep migrations forward-compatible when rolling application
code back; do not drop tables or delete drafts as a rollback shortcut. Clear
the incident and repeat staging acceptance before re-enabling.

No automatic run approves, schedules, publishes or replies. A real Instagram
publication still requires the user's approval of the exact post and final
publish action. None of these automated release tests grants that approval.
