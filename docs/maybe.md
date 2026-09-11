# Potential Liveblocks Surfaces & Future Enhancements

Reference: [liveblocks.io/SKILL.md](https://liveblocks.io/SKILL.md)

Following the core Liveblocks integration for draft co-review, live comments, broadcast actions, and team notifications, the following surfaces in Joey can be expanded with Liveblocks in future iterations:

---

## 1. Multiplayer Flows Canvas (`@liveblocks/react-flow`)

- **Location**: `/flows/[id]` (Joey Flow Builder)
- **Concept**: Enable live multiplayer cursor presence and real-time node drag-and-drop synchronization for teammates editing automation workflows concurrently.
- **Capabilities**:
  - Live cursor tracking with user name tags and custom brand colors.
  - Multi-user node addition, edge connection, and deletion without state collisions.
  - Presence indicators showing who is currently viewing or modifying specific workflow steps.
- **Package**: `@liveblocks/react-flow` alongside `@xyflow/react`.

---

## 2. Collaborative Post Drafting in Compose (`/compose`)

- **Location**: `/compose` (Joey Post & Thread Composer)
- **Concept**: Add real-time co-authoring with typing presence when multiple teammates collaborate on a scheduled post or multi-tweet thread.
- **Capabilities**:
  - Live presence indicators ("Sarah is currently editing this draft...").
  - Shared draft editing state using Liveblocks Storage or `@liveblocks/react-tiptap` / `@liveblocks/yjs`.
  - Conflict-free character count and platform preview synchronization across collaborators.

---

## 3. AI Collaborator in Draft Threads (`ai-as-a-collaborator`)

- **Location**: `/drafts` (Draft Comments & Review Drawer)
- **Concept**: Register Joey (the cat mascot) as a live AI teammate in comment threads who responds to feedback, critiques hooks, or proposes alternative copy.
- **Capabilities**:
  - Automatically triggers whenever a teammate tags `@joey` or `@ai` in a thread comment.
  - Analyzes the draft copy against brand voice guidelines and persona configurations.
  - Returns suggested revisions, hook variations, or tone adjustments as threaded replies in real-time.
  - Mascot persona: Joey is a witty, discerning cat who knows how to make content purr.
