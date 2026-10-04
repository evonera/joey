# Joey agency implementation

Work starts from merged PR #124 in the isolated `joey-multi-agent` worktree.
The five PRs are intentionally stacked, reviewed separately, and not merged
until their current heads and deployment/migration acceptance are approved.

1. Pipeline correctness: evidence-grounded editorial synthesis, durable source
   receipts, atomic draft/cluster creation, lease fencing, queued render states.
2. Agent foundation: tenant-owned paused agent configurations, versioned account
   and template bindings, per-run quotas, run receipts and Eve session linkage.
3. Original agency interface: responsive roster, accessible creation wizard,
   status/progress, and real Eve input-request approval cards.
4. Draft-only automation: explicitly activated Instagram Scout → research →
   original draft workflow, reviewed outputs and asynchronous media receipts.
5. Acceptance/hardening: disposable-database concurrency/isolation checks,
   browser/mobile acceptance, cancellation/retries/budget tests and recovery docs.

## UI reference policy

- [Rakazo](https://github.com/elie222/rakazo): progressive-disclosure settings,
  semantic tokens, compact roster and clear pending/answered approval states.
- [OpenMausBot](https://github.com/milind-soni/OpenMausBot): retained composer
  drafts, jump-to-latest behavior, concise run-step/status summaries.
- User-provided screenshots: reference only for roster/composer proportions
  and identity customization. Do not copy BoardUI Pro source or distinctive
  avatar artwork. Build original geometry with Joey's existing primitives.
- [BoardUI license](https://www.boardui.com/license): Pro source redistribution
  is not permitted in Joey's public repository. Free source is separately MIT.

No replacement runtime, remote computers, avatar-based always-on model loops,
emoji UI, or global bypass-all switch. Keep existing Flows/Theme Studio routes
until the simpler interface covers their important functionality.

## Governance

All agents start paused. Members may draft/configure inactive agents;
owners/admins activate and manage execution. Every linked Scout, Theme Page,
format/template and account is checked against the current tenant on the
server. Config changes invalidate old execution permissions. Automation is
draft-only: no routine automatically reviews, schedules or publishes content.

Migration 0052 adds application-owned Eve session ownership for all new browser
chats, including specialist children. Only the server lifecycle hook can register
the actual session ID. Browser continuations/streams reject unknown or foreign
sessions even when the persona header is removed. A bounded, rate-limited startup
wait accounts for Workflow's asynchronous 202 response. Old unindexed sessions
remain readable from their local cache, but cannot safely continue: start a new
conversation after this deployment. OIDC/operator access remains a deliberately
privileged infrastructure path, not a browser-user authorization mechanism.

Evidence is untrusted data. Source titles are not verified facts. Excerpts and
exact quotations support source comparison; corroboration is not a guarantee
of truth. Conflicts block generation and uncertain claims require human review.
Research images are references, not licenses or automatic publishable media.
Uncertain Scout facts are excluded from carousel takeaways. Approval requires
an explicit human evidence-review acknowledgement of the current package
revision, and direct publishing rejects outstanding fact review. Render-phase
leases resume interrupted drafts without repeating research or generation.

Use one budget-metered editorial/source-comparison call per new event. Replayed
events reuse the saved package instead of spending tokens again. Keep Jev out of
this path; existing cheap Scout gates remain separate.

## Agency interface (PR 3)

`/agents` is a separate, original roster and chat surface. Its three-step Base
UI dialog reviews identity, bound destinations, and paused creation. Geometric
identities use semantic tokens, not copied mascot artwork. On narrow screens,
the roster scrolls above the conversation; dialog content scrolls independently
of its actions. Existing Joey chat remains available.

Conversation history is loaded from server-owned, user-private Eve entries.
Resuming uses `useEveAgent` with the durable session ID; approval cards use the
existing real Eve `inputResponses` path. Agent settings cannot fabricate an
approval, bind a foreign account, or enable publishing. Switching conversations
does not cancel a durable run: use the chat Stop control first when cancellation
is intended. The daily ceiling applies to automation attempts; manual chat
continues to use workspace AI budget and trial reservations.

## Draft-only automation (PR 4)

`AGENCY_AUTOMATION_ENABLED=false` is the default operator kill switch. Enabling
it is a separate deployment decision after acceptance. An owner/admin must
approve the current configuration in `/agents`; migration 0053 pauses older
activations that did not record an approver. Membership and activation are
rechecked before paid phases and inside the fenced draft transaction. Changing
an assigned Scout requires pausing its agent; source edits invalidate old
conversations/configuration approval. The standalone Scout schedule cannot be
enabled while it is assigned to a non-archived agent.

Eve's daily `agency-drafts` schedule (05:00 UTC) starts a deterministic Workflow
dispatcher, not an extra LLM routing turn. It uses 25-row keyset pages and a
2500-agent safety ceiling; a capacity log requires operator attention rather
than silently promising unlimited fan-out. Paid work is one non-retrying step
with a 285-second deadline and a five-minute DB lease. Manual `agency_draft`
uses the same receipt and a fresh real Eve owner/admin approval. The vendored
`workflow/api` import is deliberately exempted from Knip's dependency listing;
Eve provides it, and its docs say not to install a second Workflow SDK.

One daily event is shared by manual and automatic checks. Retries count against
the daily attempt ceiling, are limited to three per event, and retain captured
evidence. Saved packages are attached atomically to run receipts, so a crash
cannot lose the review link. A failed render is repaired through Theme Studio,
not by regenerating the story. Queued media is not a failed draft; worker
completion settles queued run history, with package locking preventing a late
queued update from undoing completion. Rejected/published drafts remain fenced.

The Scout judge now uses `runLlm`, the workspace AI reservation ledger and the
current registered model, with validated bounded JSON. The existing opt-in Jev
pre-gate is unchanged. Apify uses bearer auth, a client deadline, at most 15
items and a 2 MiB response cap. Apify/Exa costs use those providers' separate
budgets; they are not falsely represented as Gemini token spend. Configure
provider-side spend caps as well as Joey's AI budget.

Package provenance records immutable agent version and destination IDs.
Human publishing may use only their intersection with currently linked active
accounts, including retries. This is an upper bound, never a publish grant.
There is no autonomous review, schedule or publish call in this workflow.

## Release acceptance

PR 5 adds authenticated desktop/390px Playwright creation, saved edits, search
and history checks without model calls or activation. Approval regressions
cover spoofed responders, removed roles, stale versions and operator shutdown.
Disposable PostgreSQL acceptance exercises atomic run-to-draft linkage,
pause-before-commit rollback and queued MP4 attachment/late-dispatch fencing.
Scheduled work carries its dispatch day and rejects cross-midnight delayed
jobs before claiming a quota or calling providers. Activation preflight checks
the first active Theme Page slot's Instagram format before resolving providers.

Run migrations against a disposable database only. Use the integration guard
to verify its immutable Neon branch ID. Never replace a user's production env
file or run seed/test cleanup against production. UI approval buttons must
submit Eve `inputResponses` for the actual pending request, not fabricate a
local approval state. Publishing retains first-party server authorization and
the exact-post final Instagram approval requirement.
