# Production Launch Hardening Plan

## Purpose

This branch follows the production-readiness release with browser-validated
product fixes. Its pull request will target `codex/production-readiness-audit`
until that release is merged, then be retargeted to `main`.

## Release sequencing

1. Merge and deploy the readiness release only after PR checks and review pass.
2. Verify the production Drizzle journal and schema immediately before
   deployment. As of 12 September 2026, both the `usage_reservations` table
   and `tenants.dodo_checkout_plan` column already exist in production. Do not
   rerun numbered SQL files manually. If the journal/schema check finds drift,
   first validate on an isolated Neon branch, then use the journaled
   `npm run db:migrate` command with a direct connection.
3. Run the deployed acceptance checks in this document. Use an isolated Neon
   branch for automated database tests; never exercise them against production.
4. Ship this hardening branch after its own review, acceptance pass, and
   Greptile loop.

## Workstreams

### 1. End-to-end acceptance

| Surface      | Safe acceptance scenario                                                                                  | Pass condition                                                                                                                 | Status                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Theme Studio | Create a short video package and render it through Modal/R2. Edit captions, then headline/media.          | Exported MP4 attaches to `ScenePreviewPlayer`; caption-only edits preserve the render; pixel changes create a clean re-render. | Deployed re-test required after readiness PR deployment. |
| Compose      | Create, edit, schedule, and unschedule an Instagram-targeted draft.                                       | Account selector, previews, validation, and saved draft state agree.                                                           | Browser validation pending.                              |
| Flows        | Install a template, configure a no-side-effect trigger, and save/reopen its graph.                        | Nodes retain configuration and validation; no external publish occurs.                                                         | Browser validation pending.                              |
| AI chat      | Send a non-sensitive Gemini request in the logged-in workspace, switch models, inspect artifacts/context. | Response streams, usage/cost is recorded, model menu is usable, and trial-limit UX works for platform-key workspaces.          | Browser validation pending.                              |
| Calendar     | Resize the full route matrix to 390px and use month/week/day controls.                                    | No document overflow or layout shift; event editing stays usable.                                                              | Automated desktop/mobile check passed locally.           |

Do not publish the connected Instagram draft. Reaching the final Zernio publish
action requires explicit approval at that moment.

### 2. UX and accessibility fixes

Prioritize evidence from the browser pass rather than speculative redesigns:

1. **Accounts and composer:** restore recognizable platform icons, make each
   connection action visibly enabled/disabled with an explanation, and use a
   compact account/source picker rather than a plain “Post to” control.
2. **AI chat:** remove decorative emoji, keep the helper sentence to one line
   at desktop widths, remove prompt/shuffle cards, improve locked-model and
   three-attempt rate-limit states, and verify Context/Artifacts panels contain
   real session data after a response.
3. **Calendar:** retain the mobile overflow fix; improve compact toolbar labels,
   range controls, and empty-state density after browser review.
4. **Engagement:** replace the oversized filter block and remove internal
   “WebMCP ready” status from the customer-facing inbox.
5. **Flows:** use the existing icon system consistently for node categories,
   improve empty-canvas guidance, and make keyboard focus/contrast predictable.
6. **Responsive/accessibility:** verify 390px and 768px layouts for Compose,
   Flows, Theme Studio, Calendar, Accounts, and Engagement; add targeted
   regression tests for every defect fixed.

### 3. Interactive onboarding

Implement an optional, resumable in-product tour rather than a blocking modal.

1. Start with a lightweight welcome checklist: connect an account, create a
   draft, create a Theme Studio package, and optionally create a Flow.
2. Let each checklist entry open a route-specific spotlight step. Every step
   needs Skip, Back, Next, and a clear completion signal; never block normal
   navigation.
3. Persist per-user completion and dismissal state, scoped to workspace.
4. Provide contextual tours for Compose, Theme Studio, and Flow Builder only
   after the core tour, so a new user is not shown every feature at once.
5. Add an always-available “Take product tour” entry under Help/Settings and
   tests for resume, dismissal, and keyboard escape.

### 4. Commercial and provider validation

1. Verify Dodo test checkout redirect, webhook idempotency, customer portal,
   and plan refresh in the deployed preview. Do not create a real charge.
2. Keep the published test-mode catalog at Creator $29, Pro $79, and Agency
   $199 until a product decision changes it. Pricing changes require matching
   Dodo products, entitlement limits, billing copy, and migration/reconciliation
   coverage.
3. Check Zernio account synchronization and draft delivery only. A live social
   post needs explicit approval.
4. Before live billing: configure production Dodo products/webhooks/tax policy,
   run a live-mode checkout with an authorized payment method, and document
   refund/support ownership.

### 5. Operations, performance, and security

1. Profile cold and warm client transfer size for Dashboard, Compose, Flows,
   Theme Studio, and Calendar; set a budget and flag regressions in CI.
2. Run a 30-minute active-session soak test for unhandled promise rejections,
   listener leaks, and repeated polling.
3. Add production error monitoring, alert routing, and a runbook for Modal,
   R2, Zernio, Dodo, and database failures.
4. Keep CI green: migrations, unit tests, lint, Next build, Eve build,
   integration tests, and Playwright. Use a disposable database for destructive
   integration checks.
5. Run Greptile through the bounded Greploop process only after each PR has a
   current review of its head SHA; fix actionable findings, validate, and
   resolve only addressed threads.

## Decisions required from the product owner

- Choose launch pricing: retain $29 / $79 / $199 or adopt beta pricing.
- Approve any final live Instagram publish test.
- Approve live-mode Dodo checkout/payment testing and tax configuration.
- Choose an error-monitoring provider and support/on-call destination.

## Definition of done

- Every safe end-to-end scenario above is recorded as passing on the deployed
  app, with screenshots or automated coverage where appropriate.
- No customer-facing page shows internal capability status or decorative emoji.
- The onboarding tour is resumable, accessible, and non-blocking.
- Production migration, rollback, and provider runbooks are current.
- All PR checks pass, Greptile has reviewed the current head, and all actionable
  review threads are addressed.
