# Integrated agency acceptance

Updated 2026-10-01. This branch integrates the agency stack with QA #128 and the production auth fix #134. It is a staging candidate, not evidence that live Workflow acceptance is complete.

## Implemented corrections

- Preserve persona isolation and cancellation/error handling when integrating template loading.
- Do not consume shared creation seeds inside agent-specific conversations.
- Collapse the agent roster after mobile selection; provide accessible controls to reopen it.
- Explain unavailable daily automation and distinguish run-history loading from an empty history.
- Wrap long dynamic content and errors in configuration and activation dialogs.
- Track pending Eve request IDs durably so parked approvals remain `needs_input`; preserve failures/cancellation until a new turn starts.
- Declare specialist disabled shell/file/fetch tools and deny-all sandbox explicitly. Declared Eve children do not inherit these root slots.
- Reserve usage against the actual fallback model. The per-step output-token setting is an admission estimate, not a public Eve per-call hard cap.

## Dependency policy

All 114 direct dependencies/development dependencies are exact-pinned to reviewed lockfile resolutions. Targeted compatibility changes: AI SDK 7.0.82 for Eve 0.50.0, Jose 6.2.4 for Better Auth 1.7.6, and microsandbox 0.5.5 matching Eve's peer requirement. Next packages remain aligned at 16.3.8; Node remains 24.x LTS.

`npm ci` is the frozen installation path. `npm run check:dependencies` rejects unpinned direct dependencies, stale lock entries, and known core peer/version incompatibilities; CI runs this gate. `legacy-peer-deps` remains enabled for historical optional integrations. Full-tree optional-peer cleanup is not yet complete and is not equivalent to a proven active-flow failure.

References: [Eve Next integration](https://eve.dev/docs/guides/frontend/nextjs), [Better Auth Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [Neon serverless driver](https://github.com/neondatabase/serverless), [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/).

## Completed checks

- 787 tests across 130 suites passed.
- Next production build and Eve build passed.
- Lint with zero warnings passed.
- 54 ordered PostgreSQL migrations validated.
- Dependency compatibility gate passed; npm audit reported zero vulnerabilities.
- Compiled Eve output includes explicit disabled specialist shell/file/fetch slots and authored sandbox slots.
- Isolated Neon agency integration passed before this UI/dependency update: tenant account bindings, role boundaries, eight-way quota fencing, replay, configuration revocation, and private threads. This directly invokes services/hooks; it does not execute the deployed Workflow engine.

## Staging isolation

The Vercel `codex/agency-ui-acceptance` preview branch points to the disposable `codex-agency-staging-20261001` Neon branch, not production. Auth and application encryption secrets are scoped to the preview branch. Existing copied production credentials are not a valid acceptance fixture under these new keys; create a new disposable workspace and its own fixtures. Production credentials/secrets and schema are unchanged by this staging setup. Preview protection remains enabled.

## Live staging pass (2026-10-01)

- Signed in through the existing Ego Lite profile and reached the protected staging preview; Vercel preview protection remains enabled.
- Created a disposable staging signup/workspace, a paused custom agent, and a staging-only Theme Page. No production user or production database was used.
- Confirmed a real Gemini reply from the custom agent.
- Captured an empty roster at desktop width and the creation wizard and populated chat at 390px. The mobile wizard fits the viewport; the mobile chat keeps its composer visible. Screenshots were saved under `/tmp/joey-agency-*-ego17.png` for review.
- The next attempted delegation was blocked by the new workspace's three-generation free trial limit. No specialist delegation event or approval was produced; further model-backed checks need a workspace API key or an approved staging budget.
- The staging account screen reports `No API key configured for this tenant`; this disposable workspace has no connected social accounts. Therefore account-targeted approval/draft acceptance is not yet demonstrated.
- The staging Scout screen has no Scout configured and requires an Apify key before manual or scheduled checks. Retry, cancellation, and failure recovery have not been exercised against a live scheduled Scout.
- Added branch-scoped Preview settings for R2 and the Modal worker dispatch, and limited this branch to five render jobs per workspace/month. These settings are not active in the existing deployment until the next branch deployment. They reuse the configured `joey-assets` bucket and `joey-media` worker; generated staging objects must remain tenant-namespaced and be cleaned up after acceptance.
- A real Modal render and attached MP4 are still pending the deployment with those settings. No external post was published.

## Still required

1. Deploy and verify the current integrated head so the branch-scoped R2/Modal environment settings are active.
2. Capture a real pending approval at 1440px and 390px, then execute approval → resume → account-targeted draft on disposable connected-account fixtures.
3. Run the delegated LinkedIn/Twitter specialist after adding the staging workspace's own model key or explicitly allocating its staging model budget.
4. Add staging Apify credentials, configure a paused Scout, and test one bounded scheduled execution with retries, cancellation, and failure recovery.
5. Upload a synthetic short MP4, run the real Modal → R2 → browser playback path, and verify the video attaches to its disposable draft.
6. Verify reconnect and pause/resume through the actual Eve runtime. Keep live publishing disabled.
7. Run authenticated product Playwright and retain its report. Existing agency UI cases deliberately do not call models or activate providers.
8. Complete alert and soak acceptance separately. Never publish a real social post without approval of its exact content and final action.

Do not replace these remaining checks with a green unit-test count or screenshots of the old production UI.
