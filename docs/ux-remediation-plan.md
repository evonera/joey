# Joey creation experience plan

## Product decision

Keep AI Chat (`/dashboard`) as Joey's main workspace. A person should be able to
start a post or video from Chat, see and edit the result beside the conversation,
and save work before connecting a social account. Theme Pages and Flows remain
available for recurring work, after the first useful result. The global sidebar
should surface recent Theme Studio posts and templates without forcing a trip
through the full automation setup.

This plan uses three stacked pull requests so each change can be reviewed and
merged in order. The existing uncommitted work in the original checkout is not
part of these branches.

## PR 1 — Trust and recoverability

- Save account-independent manual and Chat drafts. Preserve unfinished Compose
  work through navigation and account connection. Require a destination only to
  schedule or publish.
- Repair Theme Studio setup: no unrelated seeded source, explicit rights
  declaration, editable source rights, and a readiness message when rights or
  accounts prevent activation. Never infer ownership or weaken the rights gate.
- Connect wizard-created templates to matching slots and expose template choice
  in Daily Mix; verify generated packages use the selected template.
- Carry Scout findings into creation; distinguish scan errors from an empty
  result. Report actual bulk review outcomes in Drafts.
- Correct broken account/key links and mobile menu dismissal.

**Acceptance:** a new account can save a post without a social connection;
leaving and returning does not erase it. A Theme Page with a declared compliant
source and a matching account generates content using its selected template;
one without those prerequisites shows the specific blocker. A failed Scout scan
and a partially successful bulk action never claim success.

## PR 2 — Chat-first creation and Theme Studio shelf

- Put clear Post, Video, and Use an idea starting actions in the empty Chat.
- Make the Chat side panel a creation workspace: saved drafts, recent Theme
  Studio posts, and templates with previews and contextual actions. Keep the
  conversation visible while people inspect and choose an item.
- Simplify primary navigation around Create, Content, Ideas, Automate, and
  Learn. Keep Assets, Accounts, Brand Kit, Settings, and Operations reachable in
  context or from a compact setup section.
- Show a publication receipt with per-destination status and direct links.
  Present an honest approximate preview until platform-specific framing exists.

**Acceptance:** from an empty Chat, a person can start and save a post without
visiting another page. A recent Theme post or template is discoverable and
previewable beside Chat; selecting it carries context into creation. The
mobile sidebar closes after navigation.

## PR 3 — Video and workflow finish

- Expose a direct video creation path from Chat using the existing media
  engine, with an explicit capability check, source asset, preview, render
  progress, and finished MP4 before approval or publication. Do not advertise
  a finished video when the worker is unavailable.
- Make Scouts setup and findings more actionable: validate prerequisites,
  show source evidence and history, allow editing, deduplicate old findings,
  and align cadence choices with the deployed scheduler.
- Connect Assets and Calendar back to creation, improve review action
  eligibility and outcome messaging, remove overlapping first-run tours, and
  address labeled controls, keyboard use, and narrow-screen overflow.

**Acceptance:** a supported user can start a video from Chat and reach a
reviewable MP4; an unsupported workspace sees the precise missing capability.
At 320px and 390px, creation controls remain reachable without horizontal page
overflow. Scout findings identify their source and age, and all completion
messages reflect the persisted result.

## Measurement

Track time to first saved draft, first render, and first publish; account
connection abandonment; Scout finding to draft conversion; Theme Page
activation blockers; render failures; and repeat visits to creation from Chat.
The key measure is whether a new user can create a reviewable result before
configuring automation.

## Delivery and rollout

- PR 1: [#125](https://github.com/evonera/joey/pull/125) — draft recovery,
  Theme Studio readiness and template wiring, Scout handoff, honest outcomes.
- PR 2: [#126](https://github.com/evonera/joey/pull/126) — Chat creation panel,
  Theme Studio post/template shelf, compact navigation, publication receipt.
- PR 3: [#127](https://github.com/evonera/joey/pull/127) — video rendering from Chat drafts, daily Scout monitoring fixes,
  creation links from Assets and Calendar, and a creation-first welcome.

The video flow uses the existing media worker. It becomes available only when
`MEDIA_ENGINE_ENABLED`, R2 storage, and a media worker secret are configured.
The worker is still verified by a real render, and captions additionally need
an active OpenAI key and a valid transcription rate. Keep the feature gate off
until the deployed worker and R2 path have passed an MP4 end-to-end check.
