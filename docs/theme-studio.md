# Theme Studio

Theme Studio is Joey's product-level workspace for operating niche social pages. A Theme Page combines trusted sources, a daily content mix, brand settings, provenance rules, human review, and connected social accounts.

This document describes the implementation in this repository. It deliberately distinguishes shipped behavior from preview-only and future work.

## Runtime architecture

Theme Studio does not run a second scheduler or bypass Joey's safety model.

1. Activating a Theme Page compiles a two-node Joey flow: `trigger.schedule -> action.theme_studio_run`.
2. Joey's existing flow scheduler and executor own admission, run leases, heartbeats, abort propagation, checkpoints, stale-run recovery, and restart behavior.
3. The Theme Studio node runs tenant-scoped ingestion, deduplication, clustering, rights/provenance checks, editorial synthesis, package allocation, and media rendering.
4. Generated packages enter a human review queue. Approval and publishing are separate authenticated actions.
5. Publishing uses the tenant's existing `@zernio/node` client and selected Joey social-account record. Zernio owns platform APIs, scheduling, platform status, and webhook delivery.
6. Zernio post webhooks reconcile the package's remote status and platform-native post ID. Comment webhooks enter Joey's engagement inbox and may invoke an enabled Theme Studio keyword private-reply rule.

Eve remains Joey's agent/session runtime. Theme Studio's recurring production work belongs in the app-managed flow engine because it already provides the database fences and deterministic recovery this workflow needs. Do not add a parallel Eve schedule for the same Theme Page.

## Implemented now

- Tenant-owned Theme Pages, sources, content formats, slots, visual templates, source items, story clusters, content packages, and DM rules.
- Guided page creation, source management, daily-mix editing, a constrained visual-template editor, account selection, and a clearly labeled mock day preview.
- RSS, public JSON HTTP, and Reddit ingestion through Joey's bounded, redirect-safe, DNS-pinned outbound request helper.
- Canonical URL/content hashing, freshness filtering, and keyword-overlap story clustering.
- Strict/moderate/permissive rights gates. Rights values are user declarations, not licenses inferred by Joey.
- Source-backed structured copy generation through Joey's tenant-scoped OpenAI integration, budget checks, structured output, and abort signal.
- Deterministic branded cards and carousels rendered to real PNG assets. Uploads use run-owned durable R2 cleanup reservations and asset-library registration.
- A page-scoped human package queue. Agents cannot approve or publish through WebMCP.
- Idempotent Zernio publishing, stale-attempt recovery, selected-account fencing, and post-webhook reconciliation.
<<<<<<< HEAD
- Instagram/Facebook keyword-triggered private replies through Zernio after an idempotently ingested comment is associated with a published Theme Studio package. Per-comment delivery claims, attempt fencing, bounded retry backoff, stable request IDs, and the existing one-minute worker provide autonomous recovery without relying on webhook redelivery.
=======
- Instagram/Facebook keyword-triggered private replies through Zernio after an idempotently ingested comment is associated with a published Theme Studio package.
>>>>>>> da798bf (fix(theme-studio): connect durable editorial and publishing lifecycle)
- Two page-scoped, read-only WebMCP tools: inspect the visible Theme Page and check configuration readiness.

## Safety contract

“Remix” means deriving a new angle, structure, hook, and presentation from sourced facts. It does not mean copying another creator's media or distinctive expression.

- Unknown rights are blocked by strict and moderate policies.
- Required source URLs are appended outside the model output and retained in package provenance.
- Feed text is treated as untrusted data in LLM and WebMCP boundaries.
- The preview-day screen uses mock content only and does not claim factual or license verification.
- A package needs rendered HTTPS media before approval.
- Publishing requires a selected active account and an approved package.
- Stable package IDs are sent as Zernio idempotency keys. Zernio duplicate responses are reconciled rather than treated as new posts.
- WebMCP may inspect readiness, but cannot activate a page, weaken a policy, approve a package, publish, or send a DM.

## Current limitations

These items are not production-complete and must not be represented as shipped:

- **Vertical video:** the scene/timing preview works, but there is no MP4 render worker. New executable video slots are rejected and existing video recipes fail activation. There is no Remotion dependency or render service in this repository.
- **Advanced visual editing:** the editor is a constrained form, not Fabric.js. Rendering applies safe template tokens, colors, type sizes, font family, and watermark; it is not a freeform canvas.
- **Independent fact checking:** Joey retains source claims and provenance, but does not independently verify every claim against authoritative sources. Human review remains mandatory.
- **Semantic clustering:** vector columns exist, but current clustering uses deterministic term overlap. Embedding generation and pgvector nearest-neighbor clustering are future work.
- **Learning loop:** the quality scorer and optimizer exist, but package analytics ingestion and scheduled, explainable optimization are not connected yet. Empty metrics never change priorities.
- **Scheduling depth:** the compiled recipe runs daily. Per-slot times, timezone rules, and sub-daily source polling are not implemented.
- **TikTok production compliance:** editable MP4 previews, consent/disclosure controls, audit-mode restrictions, and status UX must be finished before enabling TikTok publishing.
- **Asset-rights depth:** generated card backgrounds contain no third-party media. Licensed image/video ingestion, per-asset license records, perceptual similarity, and visible attribution rules remain future work.

## Next delivery order

1. Build a real MP4 render worker and store immutable renderer/version inputs on each package.
2. Add package-level Zernio analytics synchronization, minimum sample thresholds, and human-reviewed optimizer recommendations.
3. Add per-claim verification state and corroboration requirements using authoritative sources.
4. Add timezone-aware daily batches and per-slot scheduling without creating a second scheduler.
5. Add TikTok consent, disclosure, preview, audit-status, and publish-status UX.
6. Add browser end-to-end tests covering create -> activate -> stage -> approve -> Zernio sandbox -> webhook reconcile.

## Acceptance boundary

The current release is suitable for source-backed static cards and carousels that are reviewed by a person and published through an existing Zernio account. It is not yet a full-multimodal, autonomous theme-page operator. The limitations above are release blockers for making that broader claim.
