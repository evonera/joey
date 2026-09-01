# Theme Studio product contract

Theme Studio turns Joey's lower-level automation primitives into a first-class system for operating niche social pages. A creator defines a reusable content recipe; Joey discovers source material, selects a daily content mix, creates branded media, pauses for review, publishes through connected accounts, and learns from performance.

Theme Studio is not implemented yet. Joey already supplies the flow executor, schedules, data and AI nodes, approvals, drafts, brand kit, asset storage, calendar, publishing, engagement inbox, and analytics that it will reuse.

## Product model

A theme page owns:

1. A niche, audience, voice, connected publishing accounts, and brand kit.
2. Trusted sources, freshness windows, geography/language filters, and rights rules.
3. A daily content mix expressed as slots, such as two news cards, one carousel, and one short video.
4. Visual templates for cards, carousels, covers, captions, and vertical video scenes.
5. Fact-checking, citation, attribution, semantic-similarity, and approval policies.
6. A timezone-aware schedule and per-platform publication settings.
7. Performance goals and feedback rules that can adjust ranking and experiments, but cannot silently weaken safety or approval policy.

For a basketball page, the execution is:

`trusted sources -> normalize -> cluster stories -> verify facts -> rank angles -> fill daily slots -> generate copy and media -> rights/provenance gate -> human approval -> schedule/publish -> ingest performance`

## Full-multimodal launch contract

The first public release supports static cards, multi-slide carousels, and vertical short videos for Instagram and TikTok. Full multimodal describes the supported output surface, not permission to publish without review: human approval remains the default for every generated package.

- **Cards:** deterministic layout from a versioned visual template, structured facts, approved asset references, and platform-specific caption.
- **Carousels:** ordered slides with a cover, story progression, source footer where appropriate, and a final call to action.
- **Short videos:** a scene plan, narration/captions, licensed or generated visuals, audio-rights metadata, a rendered preview, and an editable platform caption.
- **Platform variants:** one content package may produce separate Instagram and TikTok variants without losing their shared provenance.

## Architecture

The theme recipe is the product-level source of truth. It must not be stored only as an opaque flow graph. A versioned compiler turns a recipe and its content slots into an executable Joey flow, while the existing executor retains responsibility for leases, checkpoints, abort propagation, approvals, retries, and restart-from-failed behavior.

Core records:

- `theme_pages`: tenant-owned page identity, niche, audience, timezone, status, brand-kit reference, and recipe revision.
- `theme_sources`: source type and location, trust score, freshness and language rules, and default rights policy.
- `theme_slots`: ordered daily quotas for card, carousel, or short-video packages and their platform targets.
- `theme_visual_templates`: versioned layout and scene specifications with safe editable fields.
- `source_items`: normalized source snapshots, canonical URL, publication time, content hash, and retrieval metadata.
- `story_clusters`: semantically equivalent source items and the chosen primary angle.
- `content_packages`: the editorial unit joining claims, caption variants, media variants, approval state, schedule, and publishing state.
- `content_provenance`: claim/asset-level source, author, license, attribution, transformation, and verification state.

All records are tenant-scoped. Recipe revisions and renderer versions are captured on each package so a retry or audit reproduces the same inputs rather than silently adopting current settings.

## Safety and rights

“Remix” means learning from topics, structures, formats, and hooks. It does not mean downloading and reposting somebody else's media.

- Every factual claim retains its source URL and verification result.
- Every media input has a rights category: `owned`, `generated`, `public_domain`, `cc_by`, `cc_by_sa`, or `commercial_license`.
- Unknown rights, non-commercial licenses, and no-derivatives licenses are blocked from commercial remix by default.
- Required attribution is rendered into package metadata and, when the license or format requires it, the visible creative or caption.
- Near-duplicate text and perceptual-media similarity checks prevent accidental copying and repeated posts.
- Generated packages always have an editable preview. Platform disclosures, commercial-content settings, consent, and publication status are recorded with the platform variant.

## Human and agent boundaries

Agents may inspect a theme page, propose source or recipe changes, stage content-slot edits, generate previews, explain provenance, and prepare approval batches. Creating or rotating credentials, activating a recipe, weakening rights or fact-check rules, approving a package, and publishing remain authenticated human actions.

Future WebMCP tools follow the existing staged pattern:

- Read-only: list theme pages, inspect a recipe, inspect a content package, explain provenance, and validate a recipe.
- Reversible staging: stage recipe edits, source changes, content-slot changes, and copy/media regeneration requests.
- Not exposed as page tools: activate, approve, publish, rotate credentials, or bypass a policy.

## Delivery sequence

1. **Domain foundation:** schema, tenant-scoped CRUD, recipe revisions, provenance and rights policies, and recipe validation/compiler contracts.
2. **Studio experience:** guided page setup, source manager, daily-mix builder, platform/account selection, approval policy, and recipe preview.
3. **Editorial pipeline:** normalized ingestion, canonical URL and semantic clustering, multi-source verification, angle ranking, slot filling, and checkpointed package creation.
4. **Media renderers:** deterministic card/carousel layouts and a scene-based vertical-video renderer with previews, captions, and durable asset registration.
5. **Publishing compliance:** Instagram and TikTok variants, explicit consent and commercial-content controls, idempotent submission, status reconciliation, and failure recovery.
6. **Learning loop and WebMCP:** package-level analytics, controlled experiments, explainable ranking feedback, staged agent tools, evals, and end-to-end browser tests.

Each step ships as a separate PR. A later step may depend on earlier contracts, but it must not relax tenant fencing, approval, provenance, idempotency, or replay guarantees to do so.

## Acceptance scenario

A user can create an “NBA Daily” page, select trusted league/team/news sources, choose a daily mix of two cards, one carousel, and one short video, apply a brand kit, connect Instagram and TikTok, and set a review deadline. On schedule Joey groups duplicate reports, verifies material claims from the configured sources, proposes four distinct packages with complete provenance, renders editable previews, and places them in one approval queue. Only approved variants publish; Joey records remote status and later uses their performance as an explainable ranking signal for future candidates.

