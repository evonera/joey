# Performance and provider operations runbook

This runbook covers repeatable client-performance acceptance and first-response checks for Joey's production dependencies. It does not authorize live publishing, real payments, data deletion, or production database mutations.

## Ownership and alert routing

Joey uses Sentry for uncaught client, server, edge, and navigation errors. Set
`NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, and `SENTRY_PROJECT` in Vercel. Add a
scoped `SENTRY_AUTH_TOKEN` only when source-map uploads are required; runtime
error capture does not require that token.

The separately deployed Modal worker reports sanitized Python exceptions to
the same project with `service=media-worker` and `runtime=modal-python`. Its
dedicated `joey-media-sentry` secret supplies `SENTRY_DSN` and
`SENTRY_ENVIRONMENT=production`, keeping monitoring configuration separate from
the worker's request-signing secret. Split it into a dedicated Sentry project
only if worker volume or alert ownership requires separate routing.

Before launch, assign a named primary and backup responder and connect the chosen error-monitoring service to the support/on-call destination. Alerts should include the environment, workspace ID where safe, request or job ID, provider, release SHA, and first failing timestamp. Never attach API keys, webhook signatures, post bodies, access tokens, or raw customer prompts.

Create alerts for:

- sustained HTTP 5xx responses or unhandled browser errors;
- stalled or repeatedly retried media jobs;
- R2 upload/download failures and unexpected storage growth;
- Zernio webhook signature failures, recovery exhaustion, and publishing failures;
- Dodo signature/reconciliation failures and plan-state divergence;
- Neon connection exhaustion, transaction failures, and migration drift;
- AI reservation failures, ledger reconciliation failures, and abnormal spend.

## Active-session soak

The soak cycles through the authenticated product without generating AI content, changing connections, approving drafts, publishing posts, or opening checkout. It records page errors, console errors, failed requests, 5xx responses, high-frequency endpoints, garbage-collected heap, DOM nodes, documents, and event listeners.

Default routes include Agents and Drafts. Each measurement cycle exercises
roster search/selection, draft filtering, local Compose edits and calendar date
navigation. The report includes counts for these interactions. Composer text
is restored and never submitted; automation controls remain untouched.

Create an authenticated state file with a disposable test account. Keep it outside the repository and delete it after the run:

```bash
npx playwright codegen --save-storage=/tmp/joey-soak-auth.json https://joey-alpha-five.vercel.app/login
```

After signing in, close the codegen browser and run the 30-minute acceptance:

```bash
JOEY_SOAK_BASE_URL=https://joey-alpha-five.vercel.app \
JOEY_SOAK_STORAGE_STATE=/tmp/joey-soak-auth.json \
npm run test:soak
```

For a short authenticated harness check, set `JOEY_SOAK_DURATION_MS=30000`. The release acceptance remains 30 minutes. `JOEY_SOAK_WARMUP_TIMEOUT_MS` defaults to ten minutes and is accounted for separately from the measurement duration. Optional budgets are `JOEY_SOAK_MAX_HEAP_GROWTH_MB` (default 64), `JOEY_SOAK_MAX_LISTENER_GROWTH` (default 200), and `JOEY_SOAK_MAX_REQUESTS_PER_MINUTE` (default 30 per method/path in any sliding one-minute window). Override a budget only with a documented baseline and reviewer approval.

The authenticated gate requires both a storage-state file and a successful Better Auth session probe. `JOEY_SOAK_ALLOW_PUBLIC=true` is reserved for short harness checks of explicitly public routes; it must not be used as release evidence.

For isolated localhost acceptance, `JOEY_E2E_PORT` selects a free application
port for the product suite (default 3000). Its desktop agency case can export
the new test workspace's session with `JOEY_E2E_STORAGE_STATE_PATH` pointing to
a private path outside the repository. Use that state with the soak's matching
`JOEY_SOAK_BASE_URL`. Retain measurement reports, not the session-cookie file.

For an already-running isolated Docker stack on localhost, use
`JOEY_E2E_MANAGED_LOCAL_SERVER=true` with its `JOEY_E2E_PORT`, explicit
disposable `DATABASE_URL`, and `JOEY_INTEGRATION_TEST=true`. This opt-in disables
the suite's own server launcher; it never points at a remote host. Verify that
the container uses that same disposable database before running mutating cases.
For the unchanged full browser suite, build the disposable fixture with
`NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN=WEBMCP_ORIGIN_TRIAL_DUMMY_TOKEN_FOR_E2E`;
this checks the public meta tag, not real origin-trial eligibility.

The JSON report is attached to the Playwright result under `test-results/`; the HTML report is written to `playwright-report/soak/`. Retain the release report with the deployment record. Passing means no unhandled errors, non-aborted request failures, HTTP error responses, excessive request loops, or budget breaches.

The default active-session loop opens collapsed workspace menus and follows
their real SPA links. Every warm-up, measured and final visit waits for the
route's actual ready controls, client loaders and workspace hydration, with
the unchanged five-second assertion budget. A heading alone is not readiness;
active dashboard conversations are checked through their composer instead.
Final garbage-collected metrics return to the baseline route so different UI
compositions are not mistaken for leaks. The report counts document navigation
and retains warm-up versus measurement request timings with URL queries removed.
A passing SPA soak does not certify cold or hard-reload latency; preserve and
investigate failures from those navigation paths separately.
Vercel preview measurements retain the actual toolbar and include its resource
and listener overhead. Do not set `x-vercel-skip-toolbar` as a global browser
header: it also reaches third-party telemetry and can trigger CORS failures.
The harness does not intercept or mask toolbar/telemetry errors, disable HTTP
cache, or bypass deployment protection. Keep this preview-specific overhead
explicit when comparing results with production.

Hold deployment changes for the whole measured session. An alias changing
builds can trigger a framework full reload even without application source
changes; retain that evidence and do not call it a single-deployment pass.
Use an immutable preview URL only if the configured auth client and trusted
origin genuinely support it. Otherwise freeze the canonical staging alias;
do not rewrite auth origins or weaken security just to run a test.

Run a long browser check on a host connected to AC power, with adequate battery,
the lid open and sleep disabled for the session. On macOS, wrap the command with
`caffeinate -dis npm run test:soak -- --grep 'authenticated active-session soak'`.
The installed `caffeinate(8)` manual defines `-i` for idle system sleep, `-d`
for display sleep and `-s` for system sleep on AC power. Do not rely on it to
protect against critical-battery, lid-close or manually requested sleep.
An `ERR_NETWORK_IO_SUSPENDED` run fails the gate; correlate its trace with the
relevant host power-log interval before attributing it to the website.

Keep auth state, JSON reports and traces in a persistent private location
outside Git, not only `/tmp`, for example
`/Users/shakthi/.codex/acceptance/joey-2026-10-03-4e44605` (directory 700,
files 600). Set Playwright's `--output` to that private location and preserve
the HTML reporter's accompanying data too. Traces may contain session cookies;
never upload them publicly. Recover the actual report after an interruption
before retrying; missing process handles are not proof of success.

## Cold and warm route profiling

Profile Dashboard, Compose, Flows, Theme Studio, Calendar, Analytics, Engagement, Accounts, and Settings against the exact deployment SHA. Use a clean browser profile for cold navigation, then revisit the same routes for warm navigation. Record transferred JavaScript, LCP, CLS, INP, long tasks, and cache status. Compare the result with `docs/benchmarks/client-bundle-2026-09-07.json`; that file is a build-manifest ceiling, not a browser trace.

Run `ANALYZE=true npm run build` when chunk ownership changes. Treat an unexplained route-level JavaScript increase above 10% or 50 KiB gzip, whichever is smaller, as a review blocker until it is understood. Trace-grade Core Web Vitals require browser performance instrumentation; a green build alone is not certification.

## Incident triage

### Modal media worker

1. Correlate the Joey render job ID with Modal logs and the release SHA.
2. Confirm `MEDIA_ENGINE_ENABLED` and the authenticated dispatch endpoint without printing its secret.
3. Distinguish dispatch failure, worker claim failure, render failure, and R2 upload failure.
4. Preserve the source and job row; use the bounded retry path instead of manually changing terminal state.
5. Disable new media dispatch only if failures are sustained. Static content paths can remain available.

### Cloudflare R2

1. Check provider status, bucket reachability, and presigned URL expiry/clock skew.
2. Verify object key tenant scoping and content type; do not make a private bucket public as a workaround.
3. Confirm failed jobs release durable cleanup reservations.
4. Never delete a prefix during triage. Enumerate exact candidate object keys and use recoverable cleanup after approval.

### Zernio

1. Check webhook HTTP status, signature configuration, event ID, and recovery-attempt count.
2. Confirm the event belongs to the expected workspace profile and is not a replay.
3. Reconcile provider state read-only before retrying. Keep final publish behind explicit user approval.
4. Rotate a suspected secret in Zernio and Vercel together, then send a signed test event.

### Dodo Payments

1. Confirm test versus live mode before any action.
2. Correlate checkout, customer, subscription, payment, and webhook event IDs.
3. Compare Dodo's canonical subscription state with Joey's locked workspace billing row.
4. Replay only verified, idempotent webhook events. Do not edit plan rows manually to mask reconciliation failures.
5. Escalate real charges, refunds, disputes, or tax issues to the named billing owner.

### Neon PostgreSQL

1. Check Neon status, compute state, connection saturation, and the active branch ID.
2. Capture the failing query class and transaction/job ID without customer content.
3. Use an isolated Neon branch for destructive reproduction and migration checks.
4. Restore from a reviewed backup or point-in-time branch; never rewrite the production migration journal.

## Release record

For each production release, retain:

- Git SHA and Vercel deployment ID;
- unit, integration, Playwright, Next, Eve, migration, lint, and typecheck results;
- cold/warm trace and active-session soak report;
- provider test-event IDs with secrets removed;
- incidents, accepted budget changes, and the responder who approved them.

The final live Instagram publish and live-mode payment acceptance remain separate, explicitly authorized release gates.
