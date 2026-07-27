# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added
- Initial project documentation suite
  - `prd.md` — Product Requirements Document
  - `trd.md` — Technical Requirements Document
  - `dependencies.md` — Comprehensive dependency list with risk matrix
  - `projectstructure.md` — File/directory structure guide
  - `phases.md` — Granular phase plan (30+ micro-phases)
  - `changelog.md` — This changelog

### Decided
- **Tech Stack**: Next.js 16 + Eve framework + Zernio SDK + Neon Postgres + BetterAuth + shadcn/ui
- **Architecture**: Centralized multi-tenant deployment on Vercel
- **Auth**: BetterAuth (TypeScript-first, own DB, no vendor lock-in)
- **Scheduling**: Single 5-min app-level cron polling Postgres for due tenants (NOT per-tenant Vercel cron)
- **BYOK**: Server-side AES-256-GCM encrypted key storage (NOT localStorage)
- **Agent Framework**: Eve (vercel/eve) directly — not Adam's Convex fork
- **Deployment Model**: Centralized for v1, self-host option in Phase 3

### Analyzed
- Deep analysis of 7 reference repositories:
  - `zernio-claude-plugin` — MCP plugin pattern for Zernio integration
  - `zernio-node` — Unified social media SDK (14+ platforms)
  - `zernflow` — Visual flow builder with webhook/retry patterns
  - `latewiz` — Social media dashboard UI patterns (compose/calendar/queue/entity-selector)
  - `awesome-eve-agents` — 21 agent templates with prompt engineering patterns
  - `eve-agents` — Full-stack Eve agent + builder (scheduling, memory, HITL)
  - `adam` — Durable agent runtime on Convex (evaluated and dropped for v1)

### Resolved
- 5 architectural gaps identified in v2 review:
  1. App-level polling scheduler instead of per-tenant Vercel cron
  2. Social account sub-entities (Pages, Boards, Company Pages)
  3. Failure/retry strategy with user notifications
  4. Platform automation policy compliance
  5. Per-tenant LLM spend caps
