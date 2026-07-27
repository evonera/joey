# Social Media Agent Platform: Granular Phase Plan

This document outlines the extremely granular, step-by-step phases for building the social media agent platform. Each phase is designed to be achievable in 1-3 days to maintain momentum and ensure incremental progress.

---

## Phase 1: Core Agent + Dashboard (MVP)

### Phase 1.0: Project Scaffolding (1-2 days)
- [ ] Initialize Next.js 16 project with App Router
- [ ] Configure TypeScript, Tailwind CSS v4, ESLint, Prettier
- [ ] Set up project structure (`src/app`, `src/components`, `src/lib`, `src/hooks`, `src/stores`, `src/types`)
- [ ] Initialize Eve agent directory (`agent/agent.ts`, `agent/instructions.md`)
- [ ] Create `.env.example` with all required variables
- [ ] Set up Git, README, license
**Dependencies**: None
**Reference Repos**: Any standard Next.js starter
**Acceptance Criteria**: Next.js app runs locally on port 3000, `npm run lint` passes, Eve dev environment is initialized.

### Phase 1.1: Database & ORM Setup (1-2 days)
- [ ] Set up Neon Postgres database
- [ ] Configure Drizzle ORM with Neon serverless driver
- [ ] Create initial schema (`users`, `tenants`, `api_keys`, `social_accounts`, `social_entities`, `agent_configs`, `drafts`, `posts`, `threads`, `messages`)
- [ ] Write and run initial migrations
- [ ] Create seed script for development
**Dependencies**: Phase 1.0
**Reference Repos**: Drizzle documentation, Neon examples
**Acceptance Criteria**: Migrations run successfully against a local or remote Neon DB, seed script populates test data.

### Phase 1.2: Authentication (1-2 days)
- [ ] Install and configure BetterAuth
- [ ] Set up auth routes (`app/api/auth/[...all]/route.ts`)
- [ ] Create auth client (`lib/auth-client.ts`)
- [ ] Build login/signup pages
- [ ] Add session middleware for protected routes
- [ ] Set up OAuth providers (GitHub, Google)
**Dependencies**: Phase 1.1
**Reference Repos**: BetterAuth documentation
**Acceptance Criteria**: User can sign up, log in, log out, and protected routes redirect to login when unauthenticated.

### Phase 1.3: Key Encryption & BYOK Onboarding (1-2 days)
- [ ] Implement AES-256-GCM encryption utilities (`lib/crypto.ts`)
- [ ] Build API key validation endpoint (`api/validate-key`)
- [ ] Create onboarding flow UI: API key input form, validation feedback, secure storage
- [ ] Build settings page for managing stored keys
**Dependencies**: Phase 1.2
**Reference Repos**: Next.js encryption examples
**Acceptance Criteria**: Keys are encrypted before saving to DB, correctly decrypted when used, validation API accurately checks key validity.

### Phase 1.4: Social Account Connection (1-2 days)
- [ ] Implement Zernio OAuth callback handler
- [ ] Build account connection UI (platform picker)
- [ ] Fetch and display connected accounts from Zernio
- [ ] Implement sub-entity fetching (Pages, Boards, Company Pages)
- [ ] Build entity selector component
**Dependencies**: Phase 1.2
**Reference Repos**: Zernio SDK docs
**Acceptance Criteria**: Users can connect multiple social platforms and select specific sub-entities (e.g., a specific Facebook page) to manage.

### Phase 1.5: Agent Persona Configuration (1-2 days)
- [ ] Build persona config form (brand voice, posting goals, tone)
- [ ] Build posting schedule selector (timezone-aware)
- [ ] Build platform selection (which platforms to post to)
- [ ] Store agent config in database
**Dependencies**: Phase 1.1, Phase 1.4
**Reference Repos**: None
**Acceptance Criteria**: Config is correctly persisted and linked to the user's tenant/account.

### Phase 1.6: Dashboard Layout & Navigation (1-2 days)
- [ ] Build dashboard layout with sidebar navigation
- [ ] Implement route group structure
- [ ] Create placeholder pages for all dashboard sections
- [ ] Build responsive sidebar (collapse on mobile)
- [ ] Add breadcrumb navigation
**Dependencies**: Phase 1.0
**Reference Repos**: Shadcn UI examples
**Acceptance Criteria**: Layout is responsive, navigation works smoothly, active states are highlighted.

### Phase 1.7: Eve Agent - Basic Setup (1-2 days)
- [ ] Configure `defineAgent` with model selection
- [ ] Write base `instructions.md` (identity, tone, guardrails)
- [ ] Create dynamic instructions for tenant-specific brand voice
- [ ] Build first tool: `list_accounts` (reads from Zernio)
- [ ] Test locally with `eve dev`
**Dependencies**: Phase 1.4, Phase 1.5
**Reference Repos**: Eve framework documentation
**Acceptance Criteria**: Agent successfully boots locally, understands instructions, and can call the `list_accounts` tool.

### Phase 1.8: Eve Agent - Drafting Tool (2-3 days)
- [ ] Create `draft_post` tool (generates content based on persona + platform)
- [ ] Implement platform-specific content formatting
- [ ] Store drafts in database with status `pending_review`
- [ ] Create `get_analytics` tool (reads engagement data from Zernio)
- [ ] Write content-strategy skill (`SKILL.md`)
**Dependencies**: Phase 1.7
**Reference Repos**: None
**Acceptance Criteria**: Agent generates realistic drafts tailored to the persona and saves them correctly in the DB.

### Phase 1.9: Tenant Polling Scheduler (1-2 days)
- [ ] Create single Eve schedule (`agent/schedules/tenant-poll.ts`) — runs every 5 min
- [ ] Implement tenant polling logic: query Postgres for tenants due to post
- [ ] Handle timezone conversion (tenant's local time vs UTC)
- [ ] Trigger agent drafting for due tenants
- [ ] Add logging and error tracking
**Dependencies**: Phase 1.8
**Reference Repos**: None
**Acceptance Criteria**: Cron job fires every 5 minutes, correctly identifies tenants needing content, and spawns agent drafting tasks.

### Phase 1.10: Approval Dashboard (2-3 days)
- [ ] Build drafts page: list all pending drafts with status filters
- [ ] Build draft card component with approve/edit/reject buttons
- [ ] Implement approval API endpoints
- [ ] Build inline edit mode for drafts
- [ ] Add reject-with-feedback flow
- [ ] Notification: show pending draft count in sidebar
**Dependencies**: Phase 1.8
**Reference Repos**: None
**Acceptance Criteria**: Users can review, edit, approve, or reject drafts. Feedback is routed back to the agent.

### Phase 1.11: Publishing Pipeline (1-2 days)
- [ ] Create `publish_post` tool with `approval: always()` (Eve HITL)
- [ ] Implement Zernio SDK publish call (`posts.create`)
- [ ] Handle platform-specific options (YouTube title, TikTok privacy, etc.)
- [ ] Update post status in database
- [ ] Show published posts in posts page
**Dependencies**: Phase 1.10
**Reference Repos**: Zernio SDK examples
**Acceptance Criteria**: Approved drafts are successfully pushed to social networks via Zernio.

### Phase 1.12: Failure & Retry Handling (1-2 days)
- [ ] Implement exponential backoff for Zernio API failures (3 retries)
- [ ] After 3 failures: mark as 'failed', show in dashboard with retry button
- [ ] Detect revoked/expired Zernio key (401/403) → pause tenant, notify user
- [ ] Add error banner in dashboard for key issues
- [ ] Email notification for critical failures
**Dependencies**: Phase 1.11
**Reference Repos**: None
**Acceptance Criteria**: Transient network errors auto-resolve; persistent API key errors halt automation and alert the user.

### Phase 1.13: Post Composer (2-3 days)
- [ ] Build manual post composer (for direct user posts)
- [ ] Platform-specific form fields (from LateWiz patterns)
- [ ] Media upload via Zernio presigned URLs
- [ ] Preview mode
- [ ] Schedule picker (post now or schedule for later)
**Dependencies**: Phase 1.6, Phase 1.11
**Reference Repos**: LateWiz (conceptually)
**Acceptance Criteria**: User can manually create a cross-platform post with media and schedule it.

### Phase 1.14: Content Calendar (1-2 days)
- [ ] Build calendar view showing scheduled and published posts
- [ ] Day/week/month views
- [ ] Drag to reschedule
- [ ] Color coding by platform
- [ ] Click to view post details
**Dependencies**: Phase 1.13
**Reference Repos**: React Big Calendar examples
**Acceptance Criteria**: Interactive calendar accurately reflects DB state; drag-and-drop updates scheduled time.

### Phase 1.15: Agent Chat Interface (2-3 days)
- [ ] Build chat UI (message bubbles, streaming responses)
- [ ] Connect to Eve's web chat channel
- [ ] Display tool executions inline
- [ ] Show approval requests in chat
- [ ] Allow user to give agent instructions via chat
**Dependencies**: Phase 1.7
**Reference Repos**: Vercel AI Chat template
**Acceptance Criteria**: User can converse with the agent, see its thoughts, and approve actions directly via chat.

### Phase 1.16: Basic Analytics (1-2 days)
- [ ] Fetch analytics from Zernio SDK (views, likes, comments, shares)
- [ ] Build analytics dashboard with charts
- [ ] Per-platform breakdown
- [ ] Per-post performance
- [ ] Trend indicators
**Dependencies**: Phase 1.11
**Reference Repos**: Recharts or Tremor documentation
**Acceptance Criteria**: Clean visualization of top-level metrics synced from social accounts.

### Phase 1.17: LLM Spend Tracking & Caps (1 day)
- [ ] Track token usage per tenant in database
- [ ] Check budget before LLM calls
- [ ] Hard cap: reject over-budget calls, notify user
- [ ] Display usage in settings page
**Dependencies**: Phase 1.7
**Reference Repos**: None
**Acceptance Criteria**: Agent usage drops when budget exceeded; usage correctly surfaces in settings.

### Phase 1.18: Eve Evals & Quality Gate (1-2 days)
- [ ] Write evals for draft quality (`evals/draft-quality.eval.ts`)
- [ ] Write evals for approval gate correctness (`evals/approval-gate.eval.ts`)
- [ ] Run evals against current agent
- [ ] Document baseline scores
- [ ] Set up CI to run evals on PRs
**Dependencies**: Phase 1.8, Phase 1.11
**Reference Repos**: Eve Evals documentation
**Acceptance Criteria**: CI automatically assesses agent regressions on new pull requests.

### Phase 1.19: Polish & MVP Release (2-3 days)
- [ ] Landing page
- [ ] Responsive design audit
- [ ] Error handling audit
- [ ] Loading states everywhere
- [ ] Empty states for new users
- [ ] Onboarding flow polish
- [ ] Write README
- [ ] Deploy to Vercel
**Dependencies**: All previous Phase 1 phases
**Reference Repos**: None
**Acceptance Criteria**: Platform is robust, responsive, deployed, and usable by external beta testers.

---

## Phase 2: Intelligence Layer

### Phase 2.0: Webhook Setup & Real-time Reactions (1-2 days)
- [ ] Expose webhook endpoint for Zernio events (`api/webhooks/zernio`)
- [ ] Verify incoming webhook signatures
- [ ] Parse and store real-time engagement events (new comments, mentions)
- [ ] Trigger small agent tasks to evaluate reactions
**Dependencies**: Phase 1.19
**Reference Repos**: Stripe/Zernio webhook examples
**Acceptance Criteria**: Platform securely receives and logs real-time events.

### Phase 2.1: Long-term Memory Setup (1-2 days)
- [ ] Enable pgvector in Neon database
- [ ] Create memory schema (`memories` table with vector embeddings)
- [ ] Integrate embedding model (e.g., text-embedding-3-small)
- [ ] Write memory insertion and semantic search utilities
**Dependencies**: Phase 1.1
**Reference Repos**: pgvector + Drizzle documentation
**Acceptance Criteria**: Can insert text into vector DB and retrieve via cosine similarity search.

### Phase 2.2: Memory Ingestion Pipeline (2 days)
- [ ] Create job to embed all past published posts
- [ ] Create job to embed tenant persona and key brand guidelines
- [ ] Add `search_memory` tool for the Eve agent
- [ ] Update agent prompt to search memory before drafting
**Dependencies**: Phase 2.1, Phase 1.11
**Reference Repos**: None
**Acceptance Criteria**: Agent automatically references past high-performing posts when drafting new ones.

### Phase 2.3: Analytics-driven Strategy Agent (2-3 days)
- [ ] Create `Strategy Review` weekly cron job
- [ ] Agent analyzes past week's analytics data
- [ ] Agent generates a `strategy_insight` memory item (e.g., "Mondays at 9 AM underperform")
- [ ] Build UI to surface agent insights to the user
**Dependencies**: Phase 1.16, Phase 2.2
**Reference Repos**: None
**Acceptance Criteria**: System proactively informs user of trends and adjusting its own strategy automatically.

### Phase 2.4: Composio Integration & Content Curation (2 days)
- [ ] Integrate Composio MCP server
- [ ] Add News API / Browser search tool via Composio
- [ ] Create `curate_content` agent skill
- [ ] Build automated news digest drafting
**Dependencies**: Phase 1.8
**Reference Repos**: Composio docs
**Acceptance Criteria**: Agent can fetch current events and draft relevant posts commenting on industry news.

### Phase 2.5: Asset Management System (1-2 days)
- [ ] Build asset library UI (gallery view)
- [ ] Implement cloud storage integration (S3 / Cloudflare R2)
- [ ] Add bulk upload and tagging
- [ ] Create `search_assets` tool for agent
**Dependencies**: Phase 1.6
**Reference Repos**: None
**Acceptance Criteria**: Users can upload images; agent can find and attach them to drafts.

### Phase 2.6: Visual Content Generation (2 days)
- [ ] Integrate image generation API (DALL-E 3 / Midjourney via API / Replicate)
- [ ] Create `generate_image` tool for agent
- [ ] Store generated images in Asset Management System
- [ ] Add watermark/attribution logic if required
**Dependencies**: Phase 2.5
**Reference Repos**: Vercel AI SDK image generation
**Acceptance Criteria**: Agent can propose drafts containing newly generated images.

### Phase 2.7: Engagement Automation (2-3 days)
- [ ] Create `reply_to_comment` tool
- [ ] Use webhook events to trigger reply generation
- [ ] Implement approval gate for comment replies (HITL)
- [ ] Build quick-approve UI for comments
**Dependencies**: Phase 2.0
**Reference Repos**: None
**Acceptance Criteria**: Agent drafts replies to mentions/comments, user approves them in 1-click.

### Phase 2.8: Notification System (1-2 days)
- [ ] Build in-app notification center (bell icon dropdown)
- [ ] Implement email notifications (Resend/SendGrid)
- [ ] Notify users on: draft ready, comment needs reply, API failure
- [ ] Add notification preferences settings page
**Dependencies**: Phase 1.6
**Reference Repos**: Novu (conceptually)
**Acceptance Criteria**: Users receive timely alerts based on their preferences.

### Phase 2.9: Multi-Agent Coordination (2-3 days)
- [ ] Refactor single agent into Coordinator + Workers
- [ ] Create specific worker agent for Twitter, another for LinkedIn
- [ ] Coordinator agent delegates drafting and aggregates results
- [ ] Update chat interface to show agent handoffs
**Dependencies**: Phase 1.15
**Reference Repos**: Eve framework multi-agent docs
**Acceptance Criteria**: Complex workflows are routed to specialized sub-agents.

### Phase 2.10: Advanced A/B Testing (2 days)
- [ ] Allow agent to draft A/B variants for a single slot
- [ ] Build UI to display variants side-by-side
- [ ] Implement manual selection of winning variant
- [ ] Track performance of variants in memory
**Dependencies**: Phase 1.10
**Reference Repos**: None
**Acceptance Criteria**: User can view multiple phrasing options and pick the best one before publishing.

### Phase 2.11: Evals for Intelligence Layer (1 day)
- [ ] Write evals for memory retrieval accuracy
- [ ] Write evals for appropriate comment replies
- [ ] Run and document baseline metrics
**Dependencies**: Phase 2.7, Phase 2.2
**Reference Repos**: None
**Acceptance Criteria**: CI catches regressions in memory retrieval or inappropriate reply generation.

---

## Phase 3: Scale & Distribution

### Phase 3.0: Refactoring for Self-Hosting (2 days)
- [ ] Audit dependencies for self-hosting compatibility
- [ ] Replace serverless-only DB calls with standard connection pools (if needed)
- [ ] Ensure local file storage fallback for assets (instead of strictly S3)
- [ ] Update environment variables for generic deployment
**Dependencies**: Phase 2.11
**Reference Repos**: Ghost, Plausible
**Acceptance Criteria**: App can run entirely independently of proprietary cloud services (except external social APIs).

### Phase 3.1: Docker & Containerization (1-2 days)
- [ ] Write comprehensive `Dockerfile`
- [ ] Write `docker-compose.yml` (App, Postgres+pgvector, Redis)
- [ ] Test cold-start of the entire stack locally
- [ ] Document Docker deployment steps
**Dependencies**: Phase 3.0
**Reference Repos**: Standard Next.js + Docker templates
**Acceptance Criteria**: `docker compose up` brings up a fully functional platform.

### Phase 3.2: One-click Deploy Configurations (1-2 days)
- [ ] Create Vercel Deploy button configuration (`vercel.json`)
- [ ] Create Railway / Render templates
- [ ] Write documentation for cloud deployment
**Dependencies**: Phase 3.0
**Reference Repos**: Vercel template gallery
**Acceptance Criteria**: A user can click a button on GitHub to deploy their own instance.

### Phase 3.3: Visual Flow Builder Base (2-3 days)
- [ ] Install React Flow
- [ ] Build canvas layout in dashboard
- [ ] Create custom nodes (Trigger, Agent Action, Condition, Approval, Publish)
- [ ] Implement basic drag-and-drop node connection
**Dependencies**: Phase 1.6
**Reference Repos**: React Flow documentation, n8n (conceptually)
**Acceptance Criteria**: User can visually connect nodes on a canvas.

### Phase 3.4: Flow Builder - Logic Mapping (2-3 days)
- [ ] Map visual graph edges to Eve schedule/task JSON structure
- [ ] Implement flow validation (check for dead ends)
- [ ] Build backend execution engine for custom flows
- [ ] Allow saving and activating flows
**Dependencies**: Phase 3.3
**Reference Repos**: None
**Acceptance Criteria**: Visual graphs actively dictate when and how the agent acts.

### Phase 3.5: Agent Template Marketplace - Schema (1-2 days)
- [ ] Create schema for `templates` (pre-configured flows, prompts, tools)
- [ ] Seed initial official templates (e.g., "The Startup Founder", "The E-commerce Brand")
- [ ] Build API endpoints to fetch/install templates
**Dependencies**: Phase 3.4
**Reference Repos**: None
**Acceptance Criteria**: Templates can be saved to and retrieved from the database.

### Phase 3.6: Agent Template Marketplace - UI (2 days)
- [ ] Build Marketplace discovery page
- [ ] Build Template details page
- [ ] Implement "1-Click Install" to user's tenant
- [ ] Allow users to publish their own templates
**Dependencies**: Phase 3.5
**Reference Repos**: Obsidian community plugins
**Acceptance Criteria**: Users can browse and install community workflows.

### Phase 3.7: Team Workspace Support (2 days)
- [ ] Implement organizations/workspaces in database
- [ ] Build team invite flow (via email)
- [ ] Build workspace switcher UI
- [ ] Update data queries to respect workspace isolation
**Dependencies**: Phase 1.2
**Reference Repos**: BetterAuth organizations docs
**Acceptance Criteria**: Multiple users can operate under the same tenant/workspace.

### Phase 3.8: Role-Based Access Control (RBAC) (2 days)
- [ ] Define roles (Owner, Admin, Editor, Viewer)
- [ ] Implement middleware/policy checks on API routes
- [ ] Build UI to assign roles to team members
- [ ] Hide/disable UI elements based on role (e.g., Viewers can't publish)
**Dependencies**: Phase 3.7
**Reference Repos**: None
**Acceptance Criteria**: Editors can draft but not publish without approval; Viewers can only view analytics.

### Phase 3.9: Collaborative Editing (2-3 days)
- [ ] Add real-time cursor presence on Drafts
- [ ] Implement lock/unlock mechanism or conflict resolution on save
- [ ] Add internal comments on drafts (team discussion)
**Dependencies**: Phase 3.7, Phase 1.10
**Reference Repos**: Yjs or Liveblocks docs
**Acceptance Criteria**: Two users editing the same draft don't overwrite each other blindly.

### Phase 3.10: Audit Logs (1-2 days)
- [ ] Create `audit_logs` table
- [ ] Intercept critical actions (publish, delete, settings change, invite)
- [ ] Build Audit Log UI in settings
- [ ] Add filtering and export capabilities
**Dependencies**: Phase 3.8
**Reference Repos**: Stripe audit logs UI
**Acceptance Criteria**: Org owners can trace who published what and when.

### Phase 3.11: Subscription & Billing (2-3 days)
- [ ] Integrate Stripe checkout for SaaS instances
- [ ] Create pricing tiers (Free, Pro, Enterprise)
- [ ] Implement webhook listener for subscription updates
- [ ] Build billing portal link in settings
**Dependencies**: Phase 1.2
**Reference Repos**: Stripe docs, Next.js subscription starters
**Acceptance Criteria**: SaaS deployment can charge users for premium features.

### Phase 3.12: Feature Gating (1-2 days)
- [ ] Link subscription tiers to usage limits (tenants, posts per month)
- [ ] Gate advanced features (Visual Flow Builder, Team support) behind Pro tiers
- [ ] Add upgrade prompts in UI
**Dependencies**: Phase 3.11
**Reference Repos**: None
**Acceptance Criteria**: Free users hit limits and are prompted to pay.

### Phase 3.13: Public API & Developer Docs (2 days)
- [ ] Expose REST API for core actions (create draft, get analytics)
- [ ] Implement API token generation in settings
- [ ] Write OpenAPI/Swagger documentation
- [ ] Publish developer documentation site
**Dependencies**: Phase 3.10
**Reference Repos**: Mintlify or Docusaurus
**Acceptance Criteria**: External developers can build custom integrations via API tokens.

### Phase 3.14: Final Security & Performance Audit (2 days)
- [ ] Run load testing
- [ ] Security audit (Rate limiting, CSRF, XSS checks)
- [ ] Final bug squashing
- [ ] Release v1.0.0
**Dependencies**: All previous phases
**Reference Repos**: None
**Acceptance Criteria**: Platform is robust, secure, and ready for public launch.
