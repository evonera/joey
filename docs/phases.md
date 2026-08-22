# Social Media Agent Platform: Granular Phase Plan

This document outlines the extremely granular, step-by-step phases for building the social media agent platform. Each phase is designed to be achievable in 1-3 days to maintain momentum and ensure incremental progress.

---

## Phase 1: Core Agent + Dashboard (MVP)

### Phase 1.0: Project Scaffolding (1-2 days)
-[x] Initialize Next.js 16 project with App Router
-[x] Configure TypeScript, Tailwind CSS v4, ESLint, Prettier
-[x] Set up project structure (`src/app`, `src/components`, `src/lib`, `src/hooks`, `src/stores`, `src/types`)
-[x] Initialize Eve agent directory (`agent/agent.ts`, `agent/instructions.md`)
-[x] Create `.env.example` with all required variables
-[x] Set up Git, README, license
**Dependencies**: None
**Reference Repos**: Any standard Next.js starter
**Acceptance Criteria**: Next.js app runs locally on port 3000, `npm run lint` passes, Eve dev environment is initialized.

### Phase 1.1: Database & ORM Setup (1-2 days)
-[x] Set up Neon Postgres database
-[x] Configure Drizzle ORM with Neon serverless driver
-[x] Create initial schema (`users`, `tenants`, `api_keys`, `social_accounts`, `social_entities`, `agent_configs`, `drafts`, `posts`, `threads`, `messages`)
-[x] Write and run initial migrations
-[x] Create seed script for development
**Dependencies**: Phase 1.0
**Reference Repos**: Drizzle documentation, Neon examples
**Acceptance Criteria**: Migrations run successfully against a local or remote Neon DB, seed script populates test data.

### Phase 1.2: Authentication (1-2 days)
-[x] Install and configure BetterAuth
-[x] Set up auth routes (`app/api/auth/[...all]/route.ts`)
-[x] Create auth client (`lib/auth-client.ts`)
-[x] Build login/signup pages
-[x] Add session middleware for protected routes
-[x] Set up OAuth providers (GitHub, Google)
**Dependencies**: Phase 1.1
**Reference Repos**: BetterAuth documentation
**Acceptance Criteria**: User can sign up, log in, log out, and protected routes redirect to login when unauthenticated.

### Phase 1.3: Key Encryption & BYOK Onboarding (1-2 days)
-[x] Implement AES-256-GCM encryption utilities (`lib/crypto.ts`)
-[x] Build API key validation endpoint (`api/validate-key`)
-[x] Create onboarding flow UI: API key input form, validation feedback, secure storage
-[x] Build settings page for managing stored keys
**Dependencies**: Phase 1.2
**Reference Repos**: Next.js encryption examples
**Acceptance Criteria**: Keys are encrypted before saving to DB, correctly decrypted when used, validation API accurately checks key validity.

### Phase 1.4: Social Account Connection (1-2 days)
- [x] Implement Zernio OAuth callback handler
- [x] Build account connection UI (platform picker)
- [x] Fetch and display connected accounts from Zernio
- [x] Implement sub-entity fetching (Pages, Boards, Company Pages)
- [x] Build entity selector component
**Dependencies**: Phase 1.2
**Reference Repos**: Zernio SDK docs
**Acceptance Criteria**: Users can connect multiple social platforms and select specific sub-entities (e.g., a specific Facebook page) to manage.

### Phase 1.5: Agent Persona Configuration (1-2 days)
- [x] Build persona config form (brand voice, posting goals, tone)
- [x] Build posting schedule selector (timezone-aware)
- [x] Build platform selection (which platforms to post to)
- [x] Store agent config in database
**Dependencies**: Phase 1.1, Phase 1.4
**Reference Repos**: None
**Acceptance Criteria**: Config is correctly persisted and linked to the user's tenant/account.

### Phase 1.6: Dashboard Layout & Navigation (1-2 days)
-[x] Build dashboard layout with sidebar navigation
-[x] Implement route group structure
-[x] Create placeholder pages for all dashboard sections
-[x] Build responsive sidebar (collapse on mobile)
-[x] Add breadcrumb navigation
**Dependencies**: Phase 1.0
**Reference Repos**: Shadcn UI examples
**Acceptance Criteria**: Layout is responsive, navigation works smoothly, active states are highlighted.

### Phase 1.7: Eve Agent - Basic Setup (1-2 days)
-[x] Configure `defineAgent` with model selection
-[x] Write base `instructions.md` (identity, tone, guardrails)
-[x] Create dynamic instructions for tenant-specific brand voice
-[x] Build first tool: `list_accounts` (reads from Zernio)
-[x] Test locally with `eve dev`
**Dependencies**: Phase 1.4, Phase 1.5
**Reference Repos**: Eve framework documentation
**Acceptance Criteria**: Agent successfully boots locally, understands instructions, and can call the `list_accounts` tool.

### Phase 1.8: Eve Agent - Drafting Tool (2-3 days)
-[x] Create `draft_post` tool (generates content based on persona + platform)
-[x] Implement platform-specific content formatting
-[x] Store drafts in database with status `pending_review`
-[x] Create `get_analytics` tool (reads engagement data from Zernio)
-[x] Write content-strategy skill (`SKILL.md`)
**Dependencies**: Phase 1.7
**Reference Repos**: None
**Acceptance Criteria**: Agent generates realistic drafts tailored to the persona and saves them correctly in the DB.

### Phase 1.9: Tenant Polling Scheduler (1-2 days)
-[x] Create single Eve schedule (`agent/schedules/tenant-poll.ts`) — runs every 5 min
-[x] Implement tenant polling logic: query Postgres for tenants due to post
-[x] Handle timezone conversion (tenant's local time vs UTC)
-[x] Trigger agent drafting for due tenants
-[x] Add logging and error tracking
**Dependencies**: Phase 1.8
**Reference Repos**: None
**Acceptance Criteria**: Cron job fires every 5 minutes, correctly identifies tenants needing content, and spawns agent drafting tasks.

### Phase 1.10: Approval Dashboard (2-3 days)
-[x] Build drafts page: list all pending drafts with status filters
-[x] Build draft card component with approve/edit/reject buttons
-[x] Implement approval API endpoints
-[x] Build inline edit mode for drafts
-[x] Add reject-with-feedback flow
-[x] Notification: show pending draft count in sidebar
**Dependencies**: Phase 1.8
**Reference Repos**: None
**Acceptance Criteria**: Users can review, edit, approve, or reject drafts. Feedback is routed back to the agent.

### Phase 1.11: Publishing Pipeline (1-2 days)
-[x] ~~Create `publish_post` tool with `approval: always()` (Eve HITL)~~
-[x] Create `publishDraft` Next.js Server Action in `src/app/actions/publisher.ts`
-[x] Implement Zernio SDK publish call (`zernio.posts.create`) mapping DB accounts to Zernio `accountId`
-[x] Build "Publish Now" button in `draft-card.tsx`
-[x] Update draft status to `published` and insert into `posts` table
**Dependencies**: Phase 1.10
**Reference Repos**: Zernio SDK examples
**Acceptance Criteria**: Approved drafts are successfully pushed to social networks via Zernio.

### Phase 1.12: Failure & Retry Handling (1-2 days)
-[x] Implement exponential backoff for Zernio API failures (3 retries)
-[x] After 3 failures: mark as 'failed', show in dashboard with retry button
-[x] Detect revoked/expired Zernio key (401/403) → pause tenant, notify user
-[x] Add error banner in dashboard for key issues
-[x] Email notification for critical failures
**Dependencies**: Phase 1.11
**Reference Repos**: None
**Acceptance Criteria**: Transient network errors auto-resolve; persistent API key errors halt automation and alert the user.

### Phase 1.13: Post Composer (2-3 days)
-[x] Build manual post composer (for direct user posts)
-[x] Platform-specific form fields (from LateWiz patterns)
-[x] Media upload via Zernio presigned URLs
-[x] Preview mode
-[x] Schedule picker (post now or schedule for later)
**Dependencies**: Phase 1.6, Phase 1.11
**Reference Repos**: LateWiz (conceptually)
**Acceptance Criteria**: User can manually create a cross-platform post with media and schedule it.

### Phase 1.14: Content Calendar (1-2 days)
-[x] Build calendar view showing scheduled and published posts
-[x] Day/week/month views
-[x] Drag to reschedule
-[x] Color coding by platform
-[x] Click to view post details
**Dependencies**: Phase 1.13
**Reference Repos**: React Big Calendar examples
**Acceptance Criteria**: Interactive calendar accurately reflects DB state; drag-and-drop updates scheduled time.

### Phase 1.15: Agent Chat Interface (2-3 days)
-[x] Build chat UI (message bubbles, streaming responses)
-[x] Connect to Eve's web chat channel
-[x] Display tool executions inline
-[x] Show approval requests in chat
-[x] Allow user to give agent instructions via chat
**Dependencies**: Phase 1.7
**Reference Repos**: Vercel AI Chat template
**Acceptance Criteria**: User can converse with the agent, see its thoughts, and approve actions directly via chat.

### Phase 1.16: Basic Analytics (1-2 days)
-[x] Fetch analytics from Zernio SDK (views, likes, comments, shares)
-[x] Build analytics dashboard with charts
-[x] Per-platform breakdown
-[x] Per-post performance
-[x] Trend indicators
**Dependencies**: Phase 1.11
**Reference Repos**: Recharts or Tremor documentation
**Acceptance Criteria**: Clean visualization of top-level metrics synced from social accounts.

### Phase 1.17: LLM Spend Tracking & Caps (1 day)
-[x] Track token usage per tenant in database
-[x] Check budget before LLM calls
-[x] Hard cap: reject over-budget calls, notify user
-[x] Display usage in settings page
**Dependencies**: Phase 1.7
**Reference Repos**: None
**Acceptance Criteria**: Agent usage drops when budget exceeded; usage correctly surfaces in settings.

### Phase 1.18: Eve Evals & Quality Gate (1-2 days)
-[x] Write evals for draft quality (`evals/draft-quality.eval.ts`)
-[x] Write evals for approval gate correctness (`evals/approval-gate.eval.ts`)
-[x] Run evals against current agent
-[x] Document baseline scores
-[x] Set up CI to run evals on PRs
**Dependencies**: Phase 1.8, Phase 1.11
**Reference Repos**: Eve Evals documentation
**Acceptance Criteria**: CI automatically assesses agent regressions on new pull requests.

### Phase 1.19: Polish & MVP Release (2-3 days)
-[x] Landing page
-[x] Responsive design audit
-[x] Error handling audit
-[x] Loading states everywhere
-[x] Empty states for new users
-[x] Onboarding flow polish
-[x] Write README
-[x] Deploy to Vercel
**Dependencies**: All previous Phase 1 phases
**Reference Repos**: None
**Acceptance Criteria**: Platform is robust, responsive, deployed, and usable by external beta testers.

---

## Phase 2: Intelligence Layer

### Phase 2.0: Webhook Setup & Real-time Reactions (1-2 days)
-[x] Expose webhook endpoint for Zernio events (`api/webhooks/zernio`)
-[x] Verify incoming webhook signatures
-[x] Parse and store real-time engagement events (new comments, mentions)
-[x] Trigger small agent tasks to evaluate reactions
**Dependencies**: Phase 1.19
**Reference Repos**: Stripe/Zernio webhook examples
**Acceptance Criteria**: Platform securely receives and logs real-time events.

### Phase 2.1: Long-term Memory Setup (1-2 days)
-[x] Enable pgvector in Neon database
-[x] Create memory schema (`memories` table with vector embeddings)
-[x] Integrate embedding model (e.g., text-embedding-3-small)
-[x] Write memory insertion and semantic search utilities
**Dependencies**: Phase 1.1
**Reference Repos**: pgvector + Drizzle documentation
**Acceptance Criteria**: Can insert text into vector DB and retrieve via cosine similarity search.

### Phase 2.2: Memory Ingestion Pipeline (2 days)
-[x] Create job to embed all past published posts
-[x] Create job to embed tenant persona and key brand guidelines
-[x] Add `search_memory` tool for the Eve agent
-[x] Update agent prompt to search memory before drafting
**Dependencies**: Phase 2.1, Phase 1.11
**Reference Repos**: None
**Acceptance Criteria**: Agent automatically references past high-performing posts when drafting new ones.

### Phase 2.3: Analytics-driven Strategy Agent (2-3 days)
-[x] Create `Strategy Review` weekly cron job
-[x] Agent analyzes past week's analytics data
-[x] Agent generates a `strategy_insight` memory item (e.g., "Mondays at 9 AM underperform")
-[x] Build UI to surface agent insights to the user
**Dependencies**: Phase 1.16, Phase 2.2
**Reference Repos**: None
**Acceptance Criteria**: System proactively informs user of trends and adjusting its own strategy automatically.

### Phase 2.4: Composio Integration & Content Curation (2 days)
-[x] Integrate Composio MCP server
-[x] Add News API / Browser search tool via Composio
-[x] Create `curate_content` agent skill
-[x] Build automated news digest drafting
**Dependencies**: Phase 1.8
**Reference Repos**: Composio docs
**Acceptance Criteria**: Agent can fetch current events and draft relevant posts commenting on industry news.

### Phase 2.5: Asset Management System (1-2 days)
-[x] Build asset library UI (gallery view)
-[x] Implement cloud storage integration (S3 / Cloudflare R2)
-[x] Add bulk upload and tagging
-[x] Create `search_assets` tool for agent
**Dependencies**: Phase 1.6
**Reference Repos**: None
**Acceptance Criteria**: Users can upload images; agent can find and attach them to drafts.

### Phase 2.6: Visual Content Generation (2 days)
-[x] Integrate image generation API (DALL-E 3 / Midjourney via API / Replicate)
-[x] Create `generate_image` tool for agent
-[x] Store generated images in Asset Management System
-[x] Add watermark/attribution logic if required
**Dependencies**: Phase 2.5
**Reference Repos**: Vercel AI SDK image generation
**Acceptance Criteria**: Agent can propose drafts containing newly generated images.

### Phase 2.7: Engagement Automation (2-3 days)
-[x] Create `reply_to_comment` tool
-[x] Use webhook events to trigger reply generation
-[x] Implement approval gate for comment replies (HITL)
-[x] Build quick-approve UI for comments
**Dependencies**: Phase 2.0
**Reference Repos**: None
**Acceptance Criteria**: Agent drafts replies to mentions/comments, user approves them in 1-click.

### Phase 2.8: Notification System (1-2 days)
-[x] Build in-app notification center (bell icon dropdown)
-[x] Implement email notifications (Resend/SendGrid)
-[x] Notify users on: draft ready, comment needs reply, API failure
-[x] Add notification preferences settings page
**Dependencies**: Phase 1.6
**Reference Repos**: Novu (conceptually)
**Acceptance Criteria**: Users receive timely alerts based on their preferences.

### Phase 2.9: Multi-Agent Coordination (2-3 days)
-[x] Refactor single agent into Coordinator + Workers
-[x] Create specific worker agent for Twitter, another for LinkedIn
-[x] Coordinator agent delegates drafting and aggregates results
-[x] Update chat interface to show agent handoffs
**Dependencies**: Phase 1.15
**Reference Repos**: Eve framework multi-agent docs
**Acceptance Criteria**: Complex workflows are routed to specialized sub-agents.

### Phase 2.10: Advanced A/B Testing (2 days)
-[x] Allow agent to draft A/B variants for a single slot
-[x] Build UI to display variants side-by-side
-[x] Implement manual selection of winning variant
-[x] Track performance of variants in memory
**Dependencies**: Phase 1.10
**Reference Repos**: None
**Acceptance Criteria**: User can view multiple phrasing options and pick the best one before publishing.

### Phase 2.11: Evals for Intelligence Layer (1 day)
-[x] Write evals for memory retrieval accuracy
-[x] Write evals for appropriate comment replies
-[x] Run and document baseline metrics
**Dependencies**: Phase 2.7, Phase 2.2
**Reference Repos**: None
**Acceptance Criteria**: CI catches regressions in memory retrieval or inappropriate reply generation.

---

## Phase 3: Scale & Distribution

### Phase 3.0: Refactoring for Self-Hosting (2 days)
-[x] Audit dependencies for self-hosting compatibility
-[x] Replace serverless-only DB calls with standard connection pools (if needed)
-[x] Ensure local file storage fallback for assets (instead of strictly S3)
-[x] Update environment variables for generic deployment
**Dependencies**: Phase 2.11
**Reference Repos**: Ghost, Plausible
**Acceptance Criteria**: App can run entirely independently of proprietary cloud services (except external social APIs).

### Phase 3.1: Docker & Containerization (1-2 days)
-[x] Write comprehensive `Dockerfile`
-[x] Write `docker-compose.yml` (App, Postgres+pgvector, Redis)
-[x] Test cold-start of the entire stack locally
-[x] Document Docker deployment steps
**Dependencies**: Phase 3.0
**Reference Repos**: Standard Next.js + Docker templates
**Acceptance Criteria**: `docker compose up` brings up a fully functional platform.

### Phase 3.2: One-click Deploy Configurations (1-2 days)
-[x] Create Vercel Deploy button configuration (`vercel.json`)
-[x] Create Railway / Render templates
-[x] Write documentation for cloud deployment
**Dependencies**: Phase 3.0
**Reference Repos**: Vercel template gallery
**Acceptance Criteria**: A user can click a button on GitHub to deploy their own instance.

### Phase 3.3: Visual Flow Builder Base (2-3 days)
-[x] Install React Flow
-[x] Build canvas layout in dashboard
-[x] Create custom nodes (Trigger, Agent Action, Condition, Approval, Publish)
-[x] Implement basic drag-and-drop node connection
**Dependencies**: Phase 1.6
**Reference Repos**: React Flow documentation, n8n (conceptually)
**Acceptance Criteria**: User can visually connect nodes on a canvas.

### Phase 3.4: Flow Builder - Logic Mapping (2-3 days)
-[x] Map visual graph edges to Eve schedule/task JSON structure
-[x] Implement flow validation (check for dead ends)
-[x] Build backend execution engine for custom flows
-[x] Allow saving and activating flows
**Dependencies**: Phase 3.3
**Reference Repos**: None
**Acceptance Criteria**: Visual graphs actively dictate when and how the agent acts.

### Phase 3.5: Agent Template Marketplace - Schema (1-2 days)
-[x] Create schema for `templates` (pre-configured flows, prompts, tools)
-[x] Seed initial official templates (e.g., "The Startup Founder", "The E-commerce Brand")
-[x] Build API endpoints to fetch/install templates
**Dependencies**: Phase 3.4
**Reference Repos**: None
**Acceptance Criteria**: Templates can be saved to and retrieved from the database.

### Phase 3.6: Agent Template Marketplace - UI (2 days)
-[x] Build Marketplace discovery page
-[x] Build Template details page
-[x] Implement "1-Click Install" to user's tenant
-[x] Allow users to publish their own templates
**Dependencies**: Phase 3.5
**Reference Repos**: Obsidian community plugins
**Acceptance Criteria**: Users can browse and install community workflows.

### Phase 3.7: Team Workspace Support (2 days)
-[x] Implement organizations/workspaces in database
-[x] Build team invite flow (via email)
-[x] Build workspace switcher UI
-[x] Update data queries to respect workspace isolation
**Dependencies**: Phase 1.2
**Reference Repos**: BetterAuth organizations docs
**Acceptance Criteria**: Multiple users can operate under the same tenant/workspace.

### Phase 3.8: Role-Based Access Control (RBAC) (2 days)
-[x] Define roles (Owner, Admin, Editor, Viewer)
-[x] Implement middleware/policy checks on API routes
-[x] Build UI to assign roles to team members
-[x] Hide/disable UI elements based on role (e.g., Viewers can't publish)
**Dependencies**: Phase 3.7
**Reference Repos**: None
**Acceptance Criteria**: Editors can draft but not publish without approval; Viewers can only view analytics.

### Phase 3.9: Collaborative Editing (2-3 days)
-[x] Add real-time cursor presence on Drafts
-[x] Implement lock/unlock mechanism or conflict resolution on save
-[x] Add internal comments on drafts (team discussion)
**Dependencies**: Phase 3.7, Phase 1.10
**Reference Repos**: Yjs or Liveblocks docs
**Acceptance Criteria**: Two users editing the same draft don't overwrite each other blindly.

### Phase 3.10: Audit Logs (1-2 days)
-[x] Create `audit_logs` table
-[x] Intercept critical actions (publish, delete, settings change, invite)
-[x] Build Audit Log UI in settings
-[x] Add filtering and export capabilities
**Dependencies**: Phase 3.8
**Reference Repos**: Stripe audit logs UI
**Acceptance Criteria**: Org owners can trace who published what and when.

### Phase 3.11: Subscription & Billing (2-3 days)
-[x] Integrate Stripe checkout for SaaS instances
-[x] Create pricing tiers (Free, Pro, Enterprise)
-[x] Implement webhook listener for subscription updates
-[x] Build billing portal link in settings
**Dependencies**: Phase 1.2
**Reference Repos**: Stripe docs, Next.js subscription starters
**Acceptance Criteria**: SaaS deployment can charge users for premium features.

### Phase 3.12: Feature Gating (1-2 days)
-[x] Link subscription tiers to usage limits (tenants, posts per month)
-[x] Gate advanced features (Visual Flow Builder, Team support) behind Pro tiers
-[x] Add upgrade prompts in UI
**Dependencies**: Phase 3.11
**Reference Repos**: None
**Acceptance Criteria**: Free users hit limits and are prompted to pay.

### Phase 3.13: Public API & Developer Docs (2 days)
-[x] Expose REST API for core actions (create draft, get analytics)
-[x] Implement API token generation in settings
-[x] Write OpenAPI/Swagger documentation
-[x] Publish developer documentation site
**Dependencies**: Phase 3.10
**Reference Repos**: Mintlify or Docusaurus
**Acceptance Criteria**: External developers can build custom integrations via API tokens.

### Phase 3.14: Final Security & Performance Audit (2 days)
- [x] Run load testing
- [x] Security audit (Rate limiting, CSRF, XSS checks)
- [x] Final bug squashing
- [x] Release v1.0.0
**Dependencies**: All previous phases
**Reference Repos**: None
**Acceptance Criteria**: Platform is robust, secure, and ready for public launch.

---

## Phase 4: SEO & AI Search (GEO)

### Phase 4.0: On-Page SEO Pass (1 day)
- [x] Audit metadata: canonical, Open Graph, Twitter Cards, robots, meta description
- [x] Fix heading hierarchy on landing page (H1→H2→H3)
- [x] Add `<nav>` landmark with `aria-label` to header
- [x] Add security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`) in `next.config.ts`
- [x] Clean up sitemap (remove login/signup, set homepage as sole entry)
- [x] Add `noindex` to auth pages via `robots.ts`
- [x] Add `metadataBase` to root layout
**Dependencies**: Phase 1.19
**Reference Repos**: Next.js Metadata API docs, claude-seo technical report
**Acceptance Criteria**: Lighthouse SEO audit passes all basic checks; social share preview renders correctly.

### Phase 4.1: Structured Data (JSON-LD) (1 day)
- [x] Inject combined `Organization` + `WebSite` + `WebApplication` JSON-LD schema into `layout.tsx`
- [x] Set `applicationCategory`, `operatingSystem`, `offers`, `featureList` on WebApplication
- [x] Validate with Google Rich Results Test
**Dependencies**: Phase 4.0
**Reference Repos**: schema.org docs, Google Search Central
**Acceptance Criteria**: All schema types pass Google Rich Results Test with no errors or warnings.

### Phase 4.2: Content Depth & E-E-A-T (2 days)
- [x] Expand meta description from 51 chars to 150–160 chars
- [x] Add "What is Joey?" section (~160 words) after hero
- [x] Add "How it Works" section with 3-step explanation
- [x] Add FAQ section with 5+ common questions
- [x] Expand feature card body text to 50–60 words each (was 15–25)
- [x] Create `/privacy` and `/terms` pages (P0 trust gap)
- [x] Link privacy/terms in footer
**Dependencies**: Phase 4.0
**Reference Repos**: None
**Acceptance Criteria**: Landing page word count > 600 words; FAQ answers address common user objections.

### Phase 4.3: AI Search Readiness (GEO) (1 day)
- [x] Create `public/llms.txt` with brand description, key pages, FAQ, and tech details
- [x] Fix OG image URL (rely on Next.js `opengraph-image.tsx` file convention instead of dead static file)
- [x] Add question-based H2 headings ("What is Joey?", "How does it work?")
- [x] Review and add to sitemap if `llms.txt` should be crawlable
**Dependencies**: Phase 4.2
**Reference Repos**: llmstxt.org protocol
**Acceptance Criteria**: `https://joey.evonera.com/llms.txt` returns valid markdown; AI crawlers can cite structured answers.

### Phase 4.4: Content Security Policy (1 day)
- [ ] Research CSP requirements: which external domains Joey connects to (Zernio, LLM providers, image services)
- [ ] Add `Content-Security-Policy` header to `next.config.ts` with appropriate `script-src`, `style-src`, `connect-src`, `img-src`, `frame-src`
- [ ] Test all dashboard functionality with CSP active
- [ ] Fallback to `Content-Security-Policy-Report-Only` first, iterate on violations
**Dependencies**: Phase 4.0
**Reference Repos**: MDN CSP docs, securityheaders.com
**Acceptance Criteria**: CSP header returned on all responses; no console errors from first-party scripts; no blocked requests during normal app usage.

### Phase 4.5: Social Proof & Entity Signals (1-2 days)
- [x] Add GitHub star badge to nav header (use `shields.io` badge or GitHub API + cache)
- [x] Add "Open Source — MIT License" badge in open-source section
- [x] Add social profile links (GitHub, Twitter) to footer
- [x] Link "Evonera" in footer to evonera.com (or create `/about` page)
- [x] Add `sameAs` URLs to Organization JSON-LD schema
**Dependencies**: Phase 4.1, Phase 4.2
**Reference Repos**: shields.io, GitHub REST API
**Acceptance Criteria**: GitHub star count displays in nav; footer has verified social links; Schema.org `sameAs` is populated.

### Phase 4.6: Visual Media for Experience Signals (1-2 days)
- [ ] Capture product screenshots: dashboard, approval flow, calendar view, composer *(branded UI-preview SVGs shipped as placeholders — replace with real captures)*
- [ ] Create product demo video (30-60 sec) or animated GIF of the approve→publish flow
- [x] Add screenshots to landing page feature cards with descriptive alt text
- [x] Update `opengraph-image.tsx` to include product screenshot instead of abstract logo
- [ ] Consider adding video schema markup (`VideoObject`)
**Dependencies**: Phase 4.2
**Reference Repos**: None
**Acceptance Criteria**: Landing page includes at least 3 product screenshots; OG image shows real product UI; alt text is descriptive.

### Phase 4.7: Blog & Content Engine (2-3 days)
- [x] Create blog route group (`/blog/[slug]`) with proper metadata and breadcrumb schema
- [x] Implement blog with MDX or CMS integration
- [x] Publish 3-5 pillar articles targeting informational keywords:
  - "How to automate social media with AI in 2026"
  - "Open-source social media management: Joey vs Buffer vs Hootsuite"
  - "What is BYOK AI? Bring your own key explained"
- [x] Add internal links from landing page to relevant blog posts
- [x] Add blog posts to sitemap
**Dependencies**: Phase 4.2
**Reference Repos**: Next.js MDX blog examples, Contentlayer
**Acceptance Criteria**: Blog section is live with 3+ articles; articles rank for targeted long-tail keywords within 30 days.

### Phase 4.8: About / Team Page (1 day)
- [x] Create `/about` page with team member bios, photos, and relevant experience *(team roster is a placeholder array — replace with real bios/headshots)*
- [x] Add Person schema for each team member (with `sameAs` to LinkedIn/GitHub)
- [x] Link "Evonera" in footer to `/about`
- [x] Add about page to sitemap
**Dependencies**: Phase 4.1
**Reference Repos**: None
**Acceptance Criteria**: About page displays team credentials; Person schema validates in Rich Results Test.

### Phase 4.9: Performance Budget & Core Web Vitals (1-2 days)
- [ ] Run Lighthouse CI on landing page and dashboard *(requires deployed URL / browser env)*
- [x] Implement `next/dynamic` for heavy dashboard components (charts, calendar, dnd-kit)
- [x] Lazy-load recharts and react-big-calendar off critical path
- [x] Audit bundle size with `@next/bundle-analyzer` *(analyzer wired (`ANALYZE=true`); it is webpack-only so under Turbopack the audit was done via chunk-graph inspection: recharts isolated to its own chunk, rbc excluded from server HTML)*
- [x] Add image optimization for any new screenshots *(screenshot slots are ~1-2KB SVG vectors)*
**Dependencies**: Phase 4.6, Phase 4.7
**Reference Repos**: Next.js bundle analyzer, Lighthouse CI docs
**Acceptance Criteria**: Landing page Lighthouse Performance score ≥ 95; dashboard pages ≥ 70 on mobile.

### Phase 4.10: GEO Monitoring & Iteration (ongoing)
- [ ] Set up monthly GEO citability re-scoring with claude-seo
- [ ] Monitor AI search appearances (Perplexity page search, ChatGPT Browse output)
- [ ] Expand FAQ schema with new questions from user support tickets
- [ ] Keep `llms.txt` in sync with new features and pages
- [ ] Track organic traffic growth and keyword rankings
**Dependencies**: All Phase 4 phases
**Reference Repos**: Google Search Console, Perplexity
**Acceptance Criteria**: GEO citability score ≥ 75/100; organic traffic shows upward trend quarter-over-quarter.
