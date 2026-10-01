# Focused UI provenance review

Reviewed for the Scout-provider boundary on 2026-10-01. This is a limited
engineering check, **not a finding of infringement or a legal clearance**.

## Evidence preserved

Joey's MIT license remains unchanged. Scira's `LICENSE` and README at inspected
revision [`e1692f5bdec7ec3f6482a24e0c6cf9b483d810f9`](https://github.com/zaidmukaddam/scira/tree/e1692f5bdec7ec3f6482a24e0c6cf9b483d810f9)
identify AGPL-3.0. GitHub's latest-commit query and the query bounded to
2026-09-18 returned that same revision; it is not evidence of a separate
historical license. The license applicable to any actual source copied at a
different time still requires revision-specific review.

The local history contains explicit inspiration references:

- `779776223e307834d65f62dc90f6494f672e0a37`: introduced Social Scouts,
  `chat-composer-popover.tsx`, and `chat-execution-trace.tsx`; commit title
  explicitly mentions Scira 2 trace UI.
- `9ca0b5e4b46b233a5ec68168ba4ad22a04266c0d`: introduced chat library and
  social-platform picker; commit title explicitly mentions Scira library view.
- `cfce8d1`: introduced the context inspector and artifacts side panel.

The composer, trace, and Scout client contain comments naming Scira-inspired
layouts. Those references are retained. Deleting inspiration comments would
not resolve copied-source obligations or demonstrate independent authorship.
No third-party license notice was removed by this change.

## Finite comparison performed

Compared the current integrated Joey versions of:

- `src/components/chat/chat-composer-popover.tsx`
- `src/components/chat/chat-execution-trace.tsx`
- `src/components/chat/chat-context-inspector.tsx`
- `src/app/(dashboard)/scouts/scouts-client.tsx`

against these seven Scira files at the pinned revision above:

- `components/ui/form-component.tsx`
- `components/chat-interface.tsx`
- `components/message.tsx`
- `components/reasoning-part.tsx`
- `components/tool-invocation-list-view.tsx`
- `app/lookout/page.tsx`
- `app/lookout/components/lookout-details-sidebar.tsx`

No identical whole file or exact five-line window was detected in that set.
The window comparison trims whitespace, keeps lines of at least 20 characters,
and excludes import lines and line-comment prefixes. This deliberately does
not count common short JSX/React boilerplate as useful provenance evidence.
It does not detect renamed, edited, moved, or shorter copied code, nor examine
every upstream revision or all Joey components.

Manual inspection shows Joey-specific workspace source lists, Eve message
parts, and server action bindings. These adaptations alone do **not** prove
independent authorship. In particular, the library view/platform selector and
all transitive UI primitives have not received a complete source comparison.

## Before proprietary extraction or an IP-clearance claim

1. Ask the authors of the named commits which exact source revisions, snippets,
   templates, or generated inputs they used; preserve that record.
2. Compare any identified original source, including its license at that time.
   Inspect library/platform UI and shared primitives if source was reused.
3. For actual third-party code, retain required notices and obtain a compatible
   license or legal review; do not call copied code original merely because
   variable names or comments changed.
4. Build new private service code independently. Keep public adapters and core
   features useful. Do not move these unresolved UI components into a private
   repository as a supposed license workaround.

AGPL can impose source-availability obligations for modified software used over
a network. Their applicability depends on the actual code and licensing facts;
see the [license text](https://opensource.org/license/agpl-3-0), not a string
search or an agent's assurance.
