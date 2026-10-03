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
  a stopped-before-provider result. This proves runtime dispatch, **not** actual
  specialist delegation or a parked human approval resuming to a saved draft.
- Production was backed up to a restricted local custom-format PostgreSQL 18
  archive. Its journal has 13 entries through 0049 (historical baseline). The
  isolated Neon child `codex-paid-launch-staging-20261003` / `br-hidden-glade-axnz0mxd`
  rehearsed 0050–0054, replayed successfully and has 18 journal entries through
  0054, zero active agents and zero running agent runs. Production migrations
  and encrypted credentials were not changed.
- The remediation preview has its own database, fresh auth/encryption/cron
  secrets, matching public/auth origins and disabled agency automation. Legacy
  unbound fallback is disabled **only in this fresh staging configuration**.
  Existing copied application/provider secrets must not be used with its fresh
  encryption key; create fresh encrypted credentials in a disposable workspace.
- The authenticated 30-minute soak did **not pass**: an attempt stopped at
  23.2 minutes on a navigation/loading assertion during severe local build/test
  contention. Retain its failed report; rerun on the accepted staging SHA with
  builds quiet. Do not relax timeouts or call a shorter run a pass.

No paid AI, scraping, rendering, checkout or live social action was performed
by these checks. Provider acceptance retains the $10 ceiling and separate final
live-payment/publication confirmations.

## Outstanding release gates

1. Final-SHA CI/local gates, fresh Docker startup/restart/persistent runtime
   storage, and exact deployed Eve dispatch/cron discovery.
2. Fresh staging BYOK, Exa, Apify, owned account and scoped media credentials;
   owner/admin/member acceptance of delegation, reconnect/approval/resume,
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
8. Verified existing encrypted credentials before retiring production legacy
   fallback. Only then apply the rehearsed migrations once, deploy the exact
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
