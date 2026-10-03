# Paid-launch remediation acceptance — 2026-10-03

This is an evidence ledger, not a declaration that paid launch is ready. Public
Joey is based on integrated PR #136 (`553e7e6`). Cloud remains a separate private
collection service; its PRs #1–#3 were ancestry-merged independently with green
Cloud checks. No hosted Cloud database or collection deployment was provisioned.

## Implemented boundaries

- Composio checks current workspace/session membership on request and on human
  response. Research remains available to members; external actions and account
  authorization require owner/admin permission. Unknown tools are denied and
  previously approved tools do not become permanent permission grants.
- Scout evidence is persisted before paid phases with stable operation IDs,
  event aliases, atomic leases, transactional completion and configuration
  fences. Agency runs reference immutable receipts. Draft identity includes the
  consuming agent/configuration, rather than consuming a shared mutable alert.
- Standalone collection dispatch uses durable Workflow steps, batches at most
  25, concurrency two and a 110-second evaluation deadline. Dispatch failures
  have capped backoff; ambiguous paid collection is not automatically repeated.
- Cancellation propagates through collection, existing semantic judgment,
  research and subsequent persistence. It is not a remote-actor refund or stop
  guarantee. Instagram actor input uses `username: [...]`.
- Joey's optional Cloud transport pins the exact HTTPS endpoint, retains the
  workspace bearer and adds a separate server-only Modal pair. It sends a stable
  opaque idempotency key, rejects redirects and fails closed without provider
  fallback. Cloud collection remains off in the staging adapter.
- Production auth requires a valid configured origin. Docker takes public
  browser Sentry settings at build time, never a source-map auth token. Local
  production startup supervises both Next and Eve, loads production dotenv
  precedence, and handles readiness and process termination.
- Tutorial checkpoints await persistence, expose save failures and remain
  keyboard usable, including missing-target fallback and focus restoration.

## Evidence obtained

- Typecheck, zero-warning lint, Knip, dependency validation and 55-file migration
  ordering validation passed. Next and Eve builds passed. The settled unit
  suite passed **136 suites / 891 tests**, using two workers to avoid local
  resource contention. Recheck gates on the final accepted PR SHA before merge.
- The authenticated local product Playwright suite passed 24/24 on desktop and
  390px fixtures, including draft edit/reopen and tutorial pause/reload/resume.
  This does not establish real-mobile keyboard behavior or paid-provider E2E.
- The final canonical Docker image passed the unchanged authenticated product
  suite 24/24, including public WebMCP build-time markup. Fresh migration startup,
  replay and restart persistence were verified. Actual durable Workflow records
  survived a container restart, and Next/Eve run under UID 1001 with writable,
  persistent Eve storage. This proves local/container behavior, not hosted
  provider acceptance.
- Real disposable PostgreSQL checks covered receipt races, event aliases,
  crash recovery, stale configuration, global two-run capacity, dispatch retry
  accounting and two agents consuming the same completed evidence.
- Seven cross-repository tests execute the actual Joey adapter against Cloud's
  actual HTTP server and PostgreSQL. Only DNS/network routing, the outer Modal
  gate and collector data are controlled fixtures. See
  [the exact substitutions](./cloud-contract-acceptance.md).
- Actual local Eve HTTP dispatch rejected unauthenticated requests (401) and
  invalid authenticated envelopes (400), accepted a bounded nonexistent-source
  fixture (202), and completed its durable Workflow/step with one attempt and
  a stopped-before-provider result. This proves runtime dispatch, **not** a
  parked human approval resuming to a saved draft.
- Production was backed up to a restricted local custom-format PostgreSQL 18
  archive. A single-transaction restore to an isolated, network-disabled,
  tmpfs PostgreSQL 18 instance passed, with 13 migration-journal entries.
  Earlier restore attempts reached the temporary initialization server; waiting
  for the final TCP listener resolved the readiness race. The verification
  container was stopped. The prior temporary archive is no longer available
  after host recovery; a fresh durable backup and verified restore are mandatory
  before production rollout. The restored snapshot's journal had
  13 entries through 0049 (historical baseline). The
  isolated Neon child `codex-paid-launch-staging-20261003` / `br-hidden-glade-axnz0mxd`
  rehearsed 0050–0054, replayed successfully and has 18 journal entries through
  0054, zero active agents and zero running agent runs. Production migrations
  and encrypted credentials were not changed.
- The remediation preview has its own database, fresh auth/encryption/cron
  secrets, matching public/auth origins and disabled agency automation. Legacy
  unbound fallback is disabled **only in this fresh staging configuration**.
  Existing copied application/provider secrets must not be used with its fresh
  encryption key; create fresh encrypted credentials in a disposable workspace.
- Deployed preview signup created a disposable workspace successfully. The
  browser verified tour step 2 surviving pause/reload/resume, desktop and 390px
  tour layout, and creation of a paused, destination-free research agent.
  Its UI explicitly requires a destination before saving posts. Unauthenticated
  `/scout-dispatch` returned 401 on the actual Vercel deployment.
  Manual Compose create/save/reopen/edit also passed in that disposable
  workspace, with no account, media, scheduling or publishing provider involved.
- Authorized raw Gemini and Exa credentials were configured server-side only
  for the isolated preview; copied encrypted application credentials were not
  reused. One real Gemini request delegated to `eve:subagent:twitter`, completed
  and returned a short fictional-product post in chat. Desktop and 390px
  screenshots captured the completed tool card and result. Recorded usage cost
  was **$0.01314450**, with zero reserved cost under a stricter $3 staging budget.
  The workspace still had one content package (the manual Compose fixture).
  This does not prove account-targeted draft creation or approval resumption.
  Usage evidence comprises two parent Eve calls and one specialist call,
  exhausting 3/3 free model generations. A subsequent harmless request showed
  the deployed "Limit reached" recovery UI with plan/BYOK links and restored
  Submit. Cost and event count remained unchanged with zero reservations.
  No quota bypass was introduced. These are model-call credits, not three
  guaranteed user-message turns; communicate this distinction clearly.
- The real conversation exposed a clipped context control beside a long title
  at 390px. The chat header now lets its title shrink while retaining controls,
  and the context inspector has an accessible name. Its character-based token
  and cost estimates were misleadingly labelled as totals; they are now
  explicitly transcript estimates, excluding hidden prompts/repeated calls/
  specialists, with cache usage marked unavailable rather than falsely zero.
  A focused rendering regression passes. The deployed `03d32f0` visual recheck
  reopened the saved completed specialist conversation without another prompt:
  at 390px the context button's right edge was 361px, document width was 390px,
  and the inspector's disclosure and cache-unavailable state were visible.
  Screenshots were inspected during that check; their temporary files are now
  unavailable after host recovery. Recorded usage remained $0.01314450,
  three events and zero reservations; these estimates do not replace provider
  accounting.
- Three read-only Dodo **test-mode** catalog requests confirmed the configured
  Creator/Pro/Agency products are USD monthly subscriptions at $19/$59/$149,
  matching the code catalog. Billing/auth focused regressions passed 27/27.
  No checkout, subscription or catalog mutation occurred. The authorized local
  env file lacks a webhook signing secret, so real signed delivery and payment
  lifecycle acceptance remain blocked; live catalog/compliance remain unverified.
- The existing Joey Sentry error monitor now has a persisted email alert to
  Shakthi, throttled to five minutes. One test notification was requested;
  recipient receipt and controlled frontend/server/Eve/media alert delivery
  remain unverified. The successful `03d32f0` preview build explicitly logged
  source-map upload success. This proves upload, not delivered alerts or a
  deobfuscated acceptance event.
- Fresh GitHub CI exposed a browser-fixture setup defect: it built Next but not
  Eve before the supervised launcher. Both Playwright launch configurations now
  build Eve first. Corrected SHA `4456a43` passed Application quality,
  Playwright E2E (24/24), Tauri quality and Vercel deployment checks. Recheck any
  later accepted SHA before merge. Follow-up `4b4512b` passed GitHub checks but
  its Vercel build failed because a script unit test imported the intentionally
  excluded browser-test folder. `03d32f0` excludes only script tests and private
  test results from deployment uploads, retaining runtime helpers and CI
  coverage; Application quality (139 suites / 909 tests), Playwright E2E
  (24/24), Tauri quality and Vercel deployment then passed. Any later accepted
  SHA still needs its gates. The test/config-only follow-up `4e44605` also
  passed Application quality (140 suites / 911 tests), Playwright (24/24),
  Tauri quality and Vercel deployment.
- The authenticated 30-minute soak did **not pass**: attempts stopped at
  23.2 minutes during build/test contention and at 15.8 minutes with builds
  quiet, on a Drafts loading assertion. The latter report recorded 146
  iterations and no observed console/HTTP/request errors, but the final GC
  and leak checks were never reached. Diagnosis found the harness bypassed
  collapsed navigation links using hard reloads (44 document loads), and took
  its listener baseline before initial loading settled. A corrected real-menu
  navigation harness and strict rerun are required. A Compose document TTFB
  of 22.59 seconds and the failed Drafts RSC response at 5.19 seconds remain
  performance evidence; a later SPA pass does not erase those observations.
  Corrected menu navigation also failed locally at 4.1 minutes on Agents.
  A hosted short comparison then failed during warmup on Settings, before
  measurement began: two required JS chunks took about 4.5 seconds to arrive;
  no full hosted soak was started. This is not proof of a database-query cause.
  The preview also blocked Vercel's injected toolbar script via CSP. Independent
  review found generic `h1`/loading checks could falsely settle some client
  pages. Route-specific checks now run on every warm/active/final navigation;
  six helper unit tests and two actual isolated Chromium regressions pass,
  including rejecting `h1` plus a loading body at the unchanged five-second
  deadline. These are harness regressions, not a completed product soak.
  The strict hosted short run on application SHA `03d32f0` completed 122,249ms
  of measurement and 18 iterations with all route readiness checks passing:
  agent search/selection, local Compose edit, Drafts filter and calendar
  navigation each ran twice; one document navigation, GC heap growth 1,557,816
  bytes, listener growth -1 and no noisy endpoints were recorded. It still
  **failed**, with 12 console errors and six Sentry CORS failures because the
  harness's global `x-vercel-skip-toolbar` header reached cross-origin telemetry.
  There were no page errors or HTTP/server error responses; all completed
  recorded requests were below two seconds. These were observed historical
  results; their temporary report path is no longer available after recovery.
  No 30-minute hosted acceptance passed on this evidence.
  Removing the global header allowed strict two-minute hosted comparisons to
  pass with the actual toolbar, zero observed errors and all read-only controls
  exercised. They are short diagnostics, not 30-minute acceptance. An ensuing
  long attempt crossed the alias change from `03d32f0` to `4e44605`, then
  performed an app-initiated full Dashboard reload and failed its loading
  assertion. The new deployment became ready at 16:41:24.966 UTC, about eleven
  seconds before that navigation; this is consistent with deployment skew,
  not conclusive causal proof. No runtime application files differed.
  A fresh, frozen-`4e44605` long run also **failed**: 20,991ms of measurement,
  two completed iterations, one agent search/selection and local Compose edit,
  then `POST /compose: net::ERR_NETWORK_IO_SUSPENDED`. It recorded one console
  error and one failed request, with no page/HTTP/server errors, and never
  reached final GC/leak checks. The retained Chromium console event is at
  approximately 16:52:11.757 UTC. The host power log records
  `2026-10-03 22:22:24 +0530` (16:52:24 UTC): entering **Low Power Sleep** on
  battery at **1%**, TCP keep-alive inactive. This nearby host event strongly
  supports host suspension as the cause; it does not prove a website defect
  or establish a passing run. Earlier temporary artifact/auth paths disappeared
  after recovery. The recovered failure JSON and trace are now retained outside
  Git under `/Users/shakthi/.codex/acceptance/joey-2026-10-03-4e44605`, directory
  mode 700/files 600. No replacement browser, auth state or soak was created.
- Preview CSP now admits only Vercel's documented toolbar origins in both
  policies for the exact `VERCEL_ENV=preview` environment. Eleven regressions
  prove non-preview production policies are unchanged and eval remains dev-only.
  The erroneous global skip-toolbar header has been removed. Future hosted
  measurements retain the actual toolbar and its overhead, without intercepting
  requests, masking errors or disabling deployment protection.

One paid AI delegation was performed as described above. No scraping, checkout
or live social action was performed. Real media acceptance stopped at Vercel
preview protection before enqueue or paid execution; an appropriately scoped
temporary bypass requires approval. It has not passed. Provider acceptance
retains the $10 total ceiling and separate final
live-payment/publication confirmations.

## Outstanding release gates

1. Final-SHA CI/local gates, fresh Docker startup/restart/persistent runtime
   storage, and exact deployed Eve dispatch/cron discovery.
2. Apify and an owned staging social account; remaining owner/admin/member
   acceptance of reconnect/approval/resume,
   rejection/Stop, stale configuration and permission revocation.
3. Deployed Scout overlap, shared evidence, recovery and replay; Compose
   scheduling/unscheduling and final publication confirmation.
4. Real short synthetic Modal → R2 → attached playable MP4, caption-only
   retention, headline/media invalidation and stale completion recovery.
5. Delivered frontend/server/Eve/media alerts, source maps and redaction. A
   Sentry issue or successful test-notification request alone is not proof that
   Shakthi received the email.
6. Signed Dodo test/live reconciliation, failure/replay/out-of-order/refund/
   cancellation/portal/entitlement checks against the unchanged $19/$59/$149
   catalog. Live checkout and the exact Instagram post need separate approval.
7. Successful 30-minute authenticated staging soak with retained heap/listener,
   failed-request/5xx/console and cold/warm evidence; real mobile browsers with
   keyboards open.
8. A fresh durable production backup with verified restore, and verified
   existing encrypted credentials before retiring production legacy fallback.
   Only then apply the rehearsed migrations once, deploy the exact
   accepted SHA and explicitly activate draft-only automation after its gates.

Do not merge the public stack merely because Cloud or mocked contracts pass.
PR #128 is already an ancestor of #136; it still targets `main` independently.
Retarget and recheck dependent PRs after each ancestry-preserving base merge.

## Development advisory exception

Production-only npm audit is clean. The full audit reports five high findings in
the development-only Next ESLint → fast-glob → micromatch → braces chain.
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
currently lists no patched braces version. Do not use npm's unrelated Next
downgrade suggestion or blanket `audit fix`. Keep lint glob patterns
repository-owned, track the upstream fix and recheck before release. This is an
explicit exception, not a claim that every dependency advisory was removed.
