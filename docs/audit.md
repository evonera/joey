# Joey Full System & Agent Architecture Audit

**Date:** September 2026  
**Audited Stack:** Next.js 16 (App Router) + Eve Agent Framework (`eve` 0.50) + Zernio SDK + PostgreSQL (Neon pgvector / Drizzle ORM) + Cloudflare R2  
**Scope:** All 32 routes, background cron jobs, Eve agent core runtime, database schemas, WebMCP tools, and cross-pipeline dataflows.

---

## 1. Executive Summary & Architecture Scorecard

Joey is designed as an autonomous social media management studio that pairs autonomous AI capabilities (powered by the Eve framework) with human-in-the-loop (HITL) approval workflows and multi-platform publishing (via Zernio).

Four specialized subagents audited every route, server action, agent tool, and background job. While the application boasts high-caliber engineering in individual subsystems (such as the visual flow builder, multi-model BYOK chat, and cryptographic OAuth handling), the system suffers from **pipeline fragmentation, redundant routing, silent background failure modes, and incomplete Eve agent connectivity**.

### Architecture Scorecard

| Domain                        |   Rating   | Current State & Bottlenecks                                                                                                                                                                                 |
| ----------------------------- | :--------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Eve Agent Connectivity**    |  **45%**   | Only `/dashboard` has real-time conversational chat. 60% of dashboard pages have **zero** Eve agent interaction. Theme Studio bypasses Eve via direct OpenAI `gpt-4o-mini` calls.                           |
| **Page Redundancy**           | **Medium** | `insights/page.tsx` is an orphaned 7-line redirect. `flows/templates/page.tsx` is a fragmented standalone page. Persona/voice editing is duplicated/split between `/settings` and `/brandkit`.              |
| **Content Pipeline Cohesion** |  **Low**   | Three parallel, non-communicating pipelines: `/compose` (manual, pre-approved), `/drafts` (Eve subagent queue), and `/theme-studio` (independent cards/carousels that never register in the `posts` table). |
| **Operational Telemetry**     | **Medium** | Background workers populate an `automationRuns` ledger, but `/operations` displays only 8 basic counters, omitting agent health, token spend, and cron execution logs.                                      |
| **Public & Docs Surface**     |  **95%**   | Landing, MDX blog, API docs, and legal pages are complete, maintained, and SEO-optimized with JSON-LD.                                                                                                      |

---

## 2. Complete Inventory of All 32 Pages

Below is the definitive audit of every route in the Joey codebase:

|  #  | Route                | File Path                                    | Purpose                        |     Eve Agent Status      | Redundancy & Verdict                                                                                                        |
| :-: | -------------------- | -------------------------------------------- | ------------------------------ | :-----------------------: | --------------------------------------------------------------------------------------------------------------------------- |
|  1  | `/`                  | `app/page.tsx`                               | Marketing landing page         |       None (Public)       | **Keep**. High quality, interactive preview shells, pricing, and CTAs.                                                      |
|  2  | `/about`             | `app/about/page.tsx`                         | Mission, team, MIT license     |       None (Public)       | **Keep**. Maintained. _Fix: Add link to landing footer._                                                                    |
|  3  | `/blog`              | `app/blog/page.tsx`                          | MDX blog archive               |       None (Public)       | **Keep**. 3 full technical articles with Schema.org JSON-LD.                                                                |
|  4  | `/blog/[slug]`       | `app/blog/[slug]/page.tsx`                   | Individual blog post reader    |       None (Public)       | **Keep**. Complete MDX reading experience with syntax highlighting.                                                         |
|  5  | `/docs`              | `app/docs/page.tsx`                          | Public REST API docs           |       None (Public)       | **Keep**. Documents `/api/v1/*`, authentication, and scopes.                                                                |
|  6  | `/privacy`           | `app/(legal)/privacy/page.tsx`               | Privacy Policy                 |       None (Legal)        | **Keep**. Thorough GDPR/CCPA coverage of OAuth tokens.                                                                      |
|  7  | `/terms`             | `app/(legal)/terms/page.tsx`                 | Terms of Service               |       None (Legal)        | **Keep**. Covers human approval boundaries and AI disclaimers.                                                              |
|  8  | `/login`             | `app/(auth)/login/page.tsx`                  | User authentication            |        None (Auth)        | **Keep**. Better Auth client with OAuth and credentials.                                                                    |
|  9  | `/signup`            | `app/(auth)/signup/page.tsx`                 | Account registration           |        None (Auth)        | **Keep**. Auto-provisions default workspace. _Fix: Remove unused `workspaceName` state._                                    |
| 10  | `/forgot-password`   | `app/(auth)/forgot-password/page.tsx`        | Password reset request         |        None (Auth)        | **Keep**. Wired to Resend with local dev fallback.                                                                          |
| 11  | `/reset-password`    | `app/(auth)/reset-password/page.tsx`         | Password reset execution       |        None (Auth)        | **Keep**. Validates reset token and sets new password.                                                                      |
| 12  | `/dashboard`         | `app/(dashboard)/dashboard/page.tsx`         | Primary AI Workspace           |     **100% (Direct)**     | **Keep**. Pure `<AgentChat />` powered by `useEveAgent` from `eve/react`.                                                   |
| 13  | `/compose`           | `app/(dashboard)/compose/page.tsx`           | Manual post composer           |       **0% (Zero)**       | **Refactor**. Cannot save as draft; forces immediate publish or approval. Zero AI features.                                 |
| 14  | `/drafts`            | `app/(dashboard)/drafts/page.tsx`            | Approval queue for AI drafts   |   **Partial (One-way)**   | **Keep & Enhance**. Receives Eve drafts, but user rejection feedback is never sent back to Eve.                             |
| 15  | `/calendar`          | `app/(dashboard)/calendar/page.tsx`          | Chronological content calendar |      **0% (Blind)**       | **Keep & Fix**. Only shows drafts with `scheduledFor != null`. Eve drafts have `null` schedule, so they are invisible here. |
| 16  | `/engagement`        | `app/(dashboard)/engagement/page.tsx`        | Unified social inbox           | **Asynchronous / WebMCP** | **Keep & Enhance**. Cron dispatches comments to Eve, but UI lacks an inline "Draft with Joey" button.                       |
| 17  | `/theme-studio`      | `app/(dashboard)/theme-studio/page.tsx`      | Theme Pages catalog            |     **0% (Bypassed)**     | **Keep**. Manages niche news-curation pages.                                                                                |
| 18  | `/theme-studio/new`  | `app/(dashboard)/theme-studio/new/page.tsx`  | 4-step wizard for theme pages  |     **0% (Bypassed)**     | **Keep**. Configures niche, RSS/Reddit feeds, mix, and visual card styling.                                                 |
| 19  | `/theme-studio/[id]` | `app/(dashboard)/theme-studio/[id]/page.tsx` | Theme Page detail & queue      |     **0% (Bypassed)**     | **Keep**. Has browser WebMCP tools, but editorial pipeline uses raw OpenAI `runLlm()`, bypassing Eve.                       |
| 20  | `/flows`             | `app/(dashboard)/flows/page.tsx`             | Automated visual pipelines     |         **High**          | **Keep**. Eve has `create_flow`, `list_flows`, and `trigger_flow` tools.                                                    |
| 21  | `/flows/[id]`        | `app/(dashboard)/flows/[id]/page.tsx`        | xyflow canvas DAG editor       |      **WebMCP Only**      | **Keep**. Browser WebMCP tools can stage nodes, but Eve agent running server-side cannot edit nodes.                        |
| 22  | `/flows/templates`   | `app/(dashboard)/flows/templates/page.tsx`   | Template gallery               |           None            | **REMOVE / MERGE**. Thin 5-card page. Redundant route; fold into `/flows` tab/modal.                                        |
| 23  | `/assets`            | `app/(dashboard)/assets/page.tsx`            | Cloudflare R2 media library    |    **Passive Search**     | **Keep & Namespace**. Polluted by hundreds of intermediate Theme Studio slide PNGs.                                         |
| 24  | `/brandkit`          | `app/(dashboard)/brandkit/page.tsx`          | Brand voice & memory viewer    |      **Passive RAG**      | **RESTRUCTURE**. 100% read-only. Voice editing is trapped in `/settings`. Should be the editing home.                       |
| 25  | `/analytics`         | `app/(dashboard)/analytics/page.tsx`         | Performance charts & memos     |     **Schedule Only**     | **Keep & Fix**. Weekly Eve memo works, but `get_analytics.ts` tool queries unpopulated `posts.metrics`.                     |
| 26  | `/insights`          | `app/(dashboard)/insights/page.tsx`          | Redirect stub                  |       **0% (Dead)**       | **DELETE**. 7-line file doing `redirect("/analytics?tab=insights")`. Handle in `next.config.ts`.                            |
| 27  | `/operations`        | `app/(dashboard)/operations/page.tsx`        | Operational anomaly counters   |     **0% (Omitted)**      | **Keep & Upgrade**. Shows 8 counters. Ignores persistent `automationRuns` table, token spend, and agent state.              |
| 28  | `/accounts`          | `app/(dashboard)/accounts/page.tsx`          | Social accounts connection     |       **0% (Zero)**       | **Keep**. Manages Zernio OAuth. Fails with generic alert if Zernio API key is missing.                                      |
| 29  | `/callback`          | `app/(dashboard)/callback/page.tsx`          | Zernio OAuth callback          |      None (Utility)       | **Keep**. Handles OAuth code exchange and sub-entity resolution (Facebook pages, etc.).                                     |
| 30  | `/onboarding`        | `app/(dashboard)/onboarding/page.tsx`        | 5-step tenant setup wizard     |       None (Setup)        | **Keep & Fix**. Stores `preferredModel` only in `localStorage`, breaking headless cron jobs.                                |
| 31  | `/settings`          | `app/(dashboard)/settings/page.tsx`          | Workspace & API configuration  |    **Config Provider**    | **Keep & Fix**. Missing Zernio API key input; layout banner tells users to fix key here, but no field exists.               |
| 32  | `/notifications`     | `app/(dashboard)/notifications/page.tsx`     | System notifications inbox     |     **Producer Only**     | **Keep**. Eve creates notifications via `draft_post` and `reply_to_comment`.                                                |

---

## 3. Core Architectural Fractures & Findings

### Finding 1: The Three Disconnected Content Creation Silos

Joey currently maintains three parallel, isolated content creation pipelines:

1. **Manual Pipeline (`/compose`)**:
   - User inputs text, picks accounts, uploads media, and publishes or schedules.
   - **Flaw**: Immediately marks drafts as `status: "approved"` and invokes `publishDraft` or writes `scheduledFor`. It offers **no "Save as Draft"** option to stage posts for editorial review.
   - **Zero AI**: Has no integration with Eve, no brand voice enhancement, and no platform-tailored suggestions.
2. **Proactive AI Pipeline (`/drafts`)**:
   - Autonomous background cron (`tenant-poll.ts`) or user chat prompts trigger Eve subagents (`twitter`, `linkedin`) to generate 3 variants using `draft_post.ts`.
   - Drafts enter `drafts` table with `status: "pending_review"` and appear on `/drafts`.
   - **Broken Feedback Loop**: When a human editor rejects a draft with written critique, `rejectDraft` records the critique in `drafts.errorMessage`. **Eve Agent is never notified of the rejection and cannot learn or produce a revised draft.**
3. **Theme Studio Pipeline (`/theme-studio`)**:
   - Compiles news feeds into daily cards and carousels.
   - **Parallel Data Model**: Stores results in `contentPackages` instead of `drafts`.
   - **Parallel Review UI**: `ThemePackageQueue.tsx` duplicates `DraftCard.tsx`.
   - **LLM Bypass**: Editorial synthesis (`angle-synthesizer.ts`) directly invokes OpenAI `gpt-4o-mini` via `runLlm()` (`src/lib/llm.ts`), completely bypassing Eve Agent instructions, persona rules, and memory RAG.
   - **Ghost Publishing**: When a theme package publishes to Zernio via `publishContentPackage`, it updates `contentPackages` but **never inserts a row into the `posts` table**. Consequently, published Theme Studio posts never appear in Analytics (`/analytics`), the Calendar (`/calendar`), or published memory vectors.

---

### Finding 2: Is the AI Eve Agent Connected to All of This?

**Short Answer: No. Eve Agent is isolated on `/dashboard` and background schedules, while most dashboard surfaces are unaware of its existence.**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       EVE AGENT CONNECTIVITY MAP                        │
├──────────────────────────┬──────────────────────┬───────────────────────┤
│ Fully Connected (100%)   │ Partial / Broken     │ Completely Disconnected│
├──────────────────────────┼──────────────────────┼───────────────────────┤
│ • /dashboard (AgentChat) │ • /drafts (one-way)  │ • /compose (0%)       │
│ • /flows (3 tools: list, │ • /engagement (cron) │ • /theme-studio (0%)  │
│   create, trigger)       │ • /analytics (buggy) │ • /calendar (0%)      │
│ • Background cron jobs   │ • /assets (search)   │ • /operations (0%)    │
│   (tenant-poll, review)  │ • /brandkit (read)   │ • /accounts (0%)      │
└──────────────────────────┴──────────────────────┴───────────────────────┘
```

#### Where Eve is Missing or Disconnected:

1. **`/compose` has 0% Eve integration**: Users must manually write every character without AI assistance or persona alignment.
2. **`/calendar` is blind to Eve drafts**: Eve's `draft_post.ts` tool creates drafts with `scheduledFor = null`. The calendar query strictly filters `WHERE scheduledFor IS NOT NULL`. Thus, **no AI draft created by Eve ever appears on the calendar** until a human manually edits and dates it.
3. **`/theme-studio` completely bypasses Eve**: Built as an independent subsystem with direct API calls.
4. **`/analytics` tool has a critical database bug**:
   - The UI on `/analytics` queries the live Zernio Analytics API.
   - The Eve tool `agent/tools/get_analytics.ts` queries `posts.metrics` in the local PostgreSQL database.
   - **Nothing in the codebase syncs Zernio post metrics into `posts.metrics`**. In production, `posts.metrics` is always `null`. When Eve runs its Sunday automated strategy review or answers chat questions about analytics, it sees zero metrics.
5. **`/engagement` has no interactive UI agent**: While background crons can dispatch comments to Eve via `reply_to_comment`, the unified inbox UI provides no button for a human operator to say "Joey, draft a reply to this thread."
6. **`/flows/[id]` has no server-agent copilot**: WebMCP tools are registered only on browser `document.modelContext`. The server-side Eve agent has no tools to add, configure, or connect individual nodes on a canvas.

---

### Finding 3: The Silent Background Model Crash

- In `onboarding/page.tsx` (lines 85–89) and `agent-chat.tsx` (lines 170–172), the user's selected LLM provider and model ID are saved **strictly to browser `localStorage`** (`joey_preferred_model`).
- The `agentConfigs` table in PostgreSQL **does not have a `preferredModel` column**.
- When headless background cron jobs execute (`agent/schedules/tenant-poll.ts` at 04:00 AM UTC):
  - There is no browser and no `localStorage`.
  - The model resolver falls back to `DEFAULT_MODEL_ID` (`google/gemini-3.6-flash`).
  - If the user configured an OpenAI or Anthropic key during onboarding instead of Google Gemini, **the background drafting job crashes silently** with missing Google API key errors.

---

### Finding 4: The Missing Zernio Setting Trap

- In `src/app/(dashboard)/layout.tsx` (lines 35–40), a persistent red banner appears when the Zernio key is invalid:
  > _"Automation Paused: Your Zernio API key is invalid or revoked. Please update it in Settings to resume drafting and publishing."_
- **The Defect**: `src/app/(dashboard)/settings/page.tsx` and `integrations-panel.tsx` contain **zero input fields for the Zernio API key**.
- The only place a Zernio key is ever collected is Step 4 of the initial `/onboarding` wizard. Once completed, a user with a revoked or missing key has no UI anywhere in the application to update it.

---

### Finding 5: Brand Identity Fragmentation

Brand voice and guidelines are scattered across four conflicting surfaces:

1. **`/settings`**: Contains textareas for `brandVoice` and `postingGoals` (writes to `agentConfigs`).
2. **`/brandkit`**: Displays `brandVoice` and `postingGoals` in a **100% read-only** view. To edit them, users are forced to leave Brand Kit and go to Settings.
3. **`memories` table**: Stores pgvector embeddings of guidelines. Saving in Settings **does not trigger re-indexing**, leaving vector memories out of sync until someone visits Brand Kit and clicks "Re-index Memories".
4. **`themePages` table**: Theme Studio ignores `agentConfigs` and requires setting up a separate brand voice and color scheme per theme page.

---

### Finding 6: Asset Library Contamination

- In `src/lib/theme-studio/renderers/media-assembler.ts`, every generated static card and carousel slide is registered directly into the tenant's primary `assets` table via `uploadAndRegisterFlowAsset()`.
- Automated daily Theme Studio runs dump dozens of intermediate slide PNGs into the user's asset library without tags or category isolation, polluting `/assets` and the `AssetPickerDialog` in `/compose`.

---

## 4. Specific Pages to Remove, Merge, or Refactor

### 1. [DELETE] `src/app/(dashboard)/insights/page.tsx`

- **Reason**: It is an orphaned 7-line file that merely executes `redirect("/analytics?tab=insights")`.
- **Resolution**:
  1. Delete `src/app/(dashboard)/insights/page.tsx`.
  2. Add a redirect rule in `next.config.ts`:
     ```ts
     {
       source: "/insights",
       destination: "/analytics?tab=insights",
       permanent: false,
     }
     ```
  3. Remove the unused `BulbIcon` import in `src/components/app-sidebar.tsx` (line 12) and the route check in `src/proxy.ts` (line 31).

---

### 2. [MERGE] `src/app/(dashboard)/flows/templates/page.tsx` into `/flows`

- **Reason**: `/flows/templates` is a thin page displaying only 5 template cards with an install button. It forces unnecessary context-switching away from `/flows`.
- **Resolution**:
  1. Remove `src/app/(dashboard)/flows/templates/page.tsx`.
  2. Add a `<Tabs>` component to `src/app/(dashboard)/flows/page.tsx`:
     - **Tab 1:** _My Flows_ (custom user workflows).
     - **Tab 2:** _Template Gallery_ (browse and install official templates).
  3. Update the "New Flow" dialog to allow starting from a blank canvas or picking from the template gallery.

---

### 3. [RESTRUCTURE] `/brandkit` vs `/settings`

- **Reason**: Brand Kit is currently read-only, while brand voice editing is buried in Settings.
- **Resolution**:
  1. Move the `brandVoice` and `postingGoals` input forms and voice presets from `/settings` into `src/app/(dashboard)/brandkit/page.tsx`.
  2. In `settings/page.tsx`, replace the "Persona & Voice" section with a navigation link: _"Configure your brand persona and voice in Brand Kit →"_.
  3. In `saveAgentConfig`, automatically trigger `syncTenantBrandGuidelines(tenantId)` in the background so vector memories update immediately without manual re-indexing.

---

### 4. [ENHANCE] `src/app/(dashboard)/compose/page.tsx`

- **Reason**: Currently disconnected from both AI and the drafts review pipeline.
- **Resolution**:
  1. Add a **"Save as Draft"** button alongside "Publish Now" / "Schedule" (inserts into `drafts` with `status: "pending_review"`).
  2. Add an **"Enhance with Joey"** popover/action that passes the user's draft to Eve for brand-aligned hooks, hashtags, and platform variations.

---

### 5. [UPGRADE] `src/app/(dashboard)/operations/page.tsx`

- **Reason**: Displays 8 static error counters and ignores the persistent `automationRuns` table, token metrics, and agent pause status.
- **Resolution**:
  1. Add an **Agent Status Card**: Show whether Eve is Active or Paused, along with `pauseReason` (e.g. invalid API key, budget exceeded).
  2. Add an **LLM Budget & Consumption Card**: Display monthly token counts and estimated spend vs `budgetLimitUsd`.
  3. Add a **Recent Automation Runs Ledger**: Query `automationRuns` to display background agent runs (tenant poll, webhook dispatches, memory consolidation) with status badges and error messages.

---

## 5. Prioritized Remediation Roadmap

### Priority 0: Critical Fixes & Unblocking Traps

- [ ] **Add Zernio API Key Field in Settings**: Add a Zernio API key input card to `settings/integrations-panel.tsx` with validation and status testing, resolving the layout alert deadlock.
- [ ] **Persist `preferredModel` in Database**:
  - Add `preferred_model` column to `agentConfigs` table in `src/lib/db/schema.ts`.
  - Update `agent/schedules/tenant-poll.ts` to read `preferredModel` from `agentConfigs`, preventing 4 AM cron crashes for OpenAI/Anthropic users.
  - Add a Default Model dropdown in `/settings`.
- [ ] **Fix `get_analytics.ts` Eve Tool**: Refactor `agent/tools/get_analytics.ts` to call `getZernioClientForTenant` and fetch live metrics from Zernio, aligning with `src/app/actions/analytics.ts`.
- [ ] **Delete `insights/page.tsx`**: Replace with Next.js redirect in `next.config.ts`.
- [ ] **Connect Calendar to AI Drafts**: Add an optional `scheduledFor` parameter to Eve's `draft_post.ts` tool, and add an "Unscheduled Drafts" drawer to `/calendar` so drafts are visible and draggable.

---

### Priority 1: Unify Pipelines & Data Consistency

- [ ] **Connect Theme Studio Publishing to `posts`**: Update `publishContentPackage` (`src/lib/theme-studio/publishing/publisher.ts`) to insert a row into `posts` table upon successful publish, making theme posts visible in Analytics, Calendar, and memory indexing.
- [ ] **Namespace Theme Studio Assets**: Add a `system` tag or category to `uploadAndRegisterFlowAsset()` and filter `listAssets()` to prevent auto-generated slide PNGs from cluttering `/assets`.
- [ ] **Close Draft Rejection Feedback Loop**: When a draft is rejected with feedback in `/drafts`, trigger an asynchronous Eve agent turn to revise the draft based on the user's critique.
- [ ] **Consolidate Flow Templates**: Merge `/flows/templates` into `/flows` as a tab.
- [ ] **Make Brand Kit the Editing Hub**: Move persona and voice configuration from `/settings` to `/brandkit` with automated background memory re-indexing.

---

### Priority 2: Deep Eve Agent Integration Across Pages

- [ ] **Interactive Copilot in `/compose`**: Embed Eve Agent assistance for instant rewriting and hashtag optimization.
- [ ] **Interactive Copilot in `/flows/[id]`**: Add an in-canvas AI chat panel that exposes flow node editing tools directly to Eve.
- [ ] **"Draft Reply with Joey" in `/engagement`**: Add a one-click button in conversation threads to invoke Eve's `reply_to_comment` tool in real time.
- [ ] **Expand `/operations`**: Render `automationRuns`, token usage, and cron health.
