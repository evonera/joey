# Project Structure

This document outlines the directory structure and architectural organization for the Joey project—a Next.js 16 application integrated with the Eve agent framework. The structure is designed for scalability, clear separation of concerns, and seamless integration with the Eve agent paradigm.

---

## Directory Layout

```text
jJoey/
├── docs/                          # Project documentation
│   ├── prd.md
│   ├── trd.md
│   ├── dependencies.md
│   ├── projectstructure.md
│   ├── changelog.md
│   └── phases.md
├── repos/                         # Cloned reference repositories
│   ├── adam/
│   ├── awesome-eve-agents/
│   ├── eve-agents/
│   ├── latewiz/
│   ├── zernflow/
│   ├── zernio-claude-plugin/
│   └── zernio-node/
├── src/                           # Application source code
│   ├── app/                       # Next.js App Router
│   │   ├── layout.tsx            # Root layout
│   │   ├── page.tsx              # Landing page
│   │   ├── (auth)/               # Auth route group
│   │   │   ├── login/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   └── callback/page.tsx
│   │   ├── (dashboard)/          # Dashboard route group (protected)
│   │   │   ├── layout.tsx        # Dashboard layout with sidebar
│   │   │   ├── page.tsx          # Dashboard overview
│   │   │   ├── compose/page.tsx  # Post composer
│   │   │   ├── calendar/page.tsx # Content calendar
│   │   │   ├── drafts/page.tsx   # Pending drafts for approval
│   │   │   ├── posts/page.tsx    # Published posts
│   │   │   ├── analytics/page.tsx# Analytics dashboard
│   │   │   ├── accounts/page.tsx # Connected social accounts
│   │   │   ├── agent/page.tsx    # Agent chat interface
│   │   │   └── settings/page.tsx # Settings (API keys, persona, schedule)
│   │   └── api/                  # API routes
│   │       ├── auth/[...all]/route.ts    # BetterAuth handler
│   │       ├── validate-key/route.ts     # Zernio key validation
│   │       ├── webhooks/
│   │       │   └── zernio/route.ts       # Zernio webhook handler
│   │       └── cron/
│   │           └── tenant-poll/route.ts  # Fixed-interval tenant scheduler
│   ├── components/               # React components
│   │   ├── ui/                   # shadcn/ui components
│   │   ├── dashboard/            # Dashboard-specific components
│   │   ├── agent/                # Agent chat components
│   │   └── onboarding/           # Onboarding flow components
│   ├── hooks/                    # Custom React hooks
│   ├── stores/                   # Zustand stores
│   ├── lib/                      # Shared utilities
│   │   ├── auth.ts               # BetterAuth server config
│   │   ├── auth-client.ts        # BetterAuth client config
│   │   ├── db/                   # Database (Drizzle) configurations
│   │   ├── crypto.ts             # Key encryption utilities
│   │   ├── zernio.ts             # Zernio SDK server-side factory
│   │   ├── scheduler.ts          # Tenant polling scheduler logic
│   │   └── errors.ts             # Error types and handlers
│   └── types/                    # TypeScript type definitions
├── agent/                         # Eve agent definition (lives at project root)
│   ├── agent.ts                  # defineAgent config
│   ├── instructions.md           # Agent system prompt
│   ├── instructions/             # Additional instruction fragments
│   ├── tools/                    # Agent tools
│   ├── skills/                   # Agent skills (on-demand procedures)
│   ├── schedules/                # Eve schedules
│   └── channels/                 # Eve channels configurations
├── evals/                         # Eve evaluation tests
├── public/                        # Static assets
└── [Configuration files...]       # package.json, tsconfig.json, etc.
```

---

## Major Directories and Files Breakdown

### `docs/`
- **What it contains:** All project documentation (PRD, TRD, architecture decisions, changelogs).
- **Why it's organized this way:** Keeps architectural and planning documents separate from code, ensuring they are easily accessible to both technical and non-technical stakeholders without cluttering the source tree.
- **Key patterns:** Uses standard markdown. Follows a unified documentation lifecycle model.

### `repos/`
- **What it contains:** Cloned reference repositories such as `latewiz`, `eve-agents`, `zernflow`, and `awesome-eve-agents`.
- **Why it's organized this way:** Provides immediate, offline access to reference architectures and code patterns specific to the Eve framework and Zernio ecosystem.
- **Key patterns:** Treated as read-only reference materials.

### `src/`
- **What it contains:** The core application source code, excluding the Eve agent configuration.
- **Why it's organized this way:** Standard Next.js convention. Grouping by features (app, components, lib, hooks) allows for a predictable module resolution and separation of client/server logic.
- **Key patterns & conventions:**
  - **`lib/db`:** Encapsulates all Drizzle ORM logic, schemas, and migrations.
  - **`components/ui`:** Strictly for dumb, reusable shadcn/ui components.
  - **`components/[feature]`:** Smart/dumb components grouped by domain (dashboard, agent, onboarding).
  - **Mapping to reference repos:** Follows Next.js best practices seen in modern boilerplate repositories and Zernio full-stack examples.

### `agent/`
- **What it contains:** The complete definition, instructions, tools, skills, schedules, and channel configurations for the Eve agent.
- **Why it's organized this way:** The `agent/` directory lives at the root of the project to cleanly separate the **Agent Execution Environment** from the **Web Application Environment**. While `src/` is built and served by Next.js, the `agent/` code interfaces directly with the Eve runtime.
- **Key patterns & conventions:**
  - **Modularity:** Instructions are split into fragments (`instructions/`) to allow dynamic loading of tenant-specific configurations (like `02-brand-voice.ts`). Tools and skills are compartmentalized.
  - **Mapping to reference repos:** This structure heavily mirrors the architectural patterns found in `awesome-eve-agents` and `eve-agents`, promoting strict separation of tools (pure functions), skills (contextual procedures), and instructions (system prompts).

### `evals/`
- **What it contains:** Evaluation scripts for testing the Eve agent's performance and output quality (e.g., draft quality, approval gate enforcement).
- **Why it's organized this way:** Agentic workflows are non-deterministic. Placing evaluations in a dedicated root directory ensures they can be run independently of the web application test suite, using specific LLM evaluation frameworks.

---

## Architectural Patterns & Deep Dives

### Eve Agent Directory Structure
**Why `agent/` lives at the project root, not inside `src/`:**
The Eve agent is effectively a parallel service to the Next.js frontend/backend. Placing it outside of `src/` prevents Next.js's build system from attempting to bundle server-only agent code into client-side chunks, and avoids circular dependencies. It treats the Agent as a distinct architectural module that is orchestrated by the Eve framework, not Next.js. Tools defined here may import from `src/lib/db`, but `src/app` should not import from `agent/`.

### Next.js App Router & Route Groups
The `src/app/` directory utilizes Next.js 16 App Router paradigms, heavily leaning on **Route Groups** (folders wrapped in parentheses, like `(auth)` and `(dashboard)`).
- **How they work:** Route groups allow logical categorization of routes without affecting the URL path. For example, `src/app/(dashboard)/settings/page.tsx` resolves to `/settings`, not `/dashboard/settings`.
- **Why use them:** They enable shared layouts for specific sections of the app. All routes under `(dashboard)` automatically inherit `(dashboard)/layout.tsx` (which includes the authenticated sidebar and context providers), while `(auth)` routes can have a minimal, centered layout suitable for login screens.

### Cron Scheduling Architecture
There is a specific relationship between `src/app/api/cron/tenant-poll/route.ts` and `agent/schedules/tenant-poll.ts`.
- **`agent/schedules/tenant-poll.ts`:** Defines the Eve-native schedule configuration. It acts as the conceptual trigger within the agent framework.
- **`src/app/api/cron/tenant-poll/route.ts`:** Acts as the actual execution endpoint. Vercel Cron or an external scheduler pings this API route, which in turn queries the database (`src/lib/scheduler.ts`) to determine which tenants require agentic action, and dispatches events to the Eve runtime. This guarantees a single, predictable polling interval (e.g., 5 minutes) that multiplexes across all tenants, rather than spawning individual cron jobs per user.

### BetterAuth Integration
Authentication is handled via BetterAuth.
- **`src/lib/auth.ts` (Server):** Configures the BetterAuth instance, connecting it to the Drizzle database adapters and defining server-side session management.
- **`src/lib/auth-client.ts` (Client):** Provides the React hooks and client-side utilities for checking session state.
- **`src/app/api/auth/[...all]/route.ts`:** The Next.js catch-all API route that BetterAuth uses to automatically handle login, logout, OAuth callbacks, and session validation.
- **Integration Pattern:** We use a centralized auth configuration, ensuring that both Next.js Server Actions/API routes and Client Components have a unified source of truth for user identity, which is subsequently passed into the Eve agent context during invocation.
