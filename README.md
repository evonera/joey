# joey

> Open-source social media agent platform — add your API key, pick your platforms, get an autonomous AI agent.

## What is this?

Joey is an open-source platform where users bring their own [Zernio](https://zernio.com) API key, connect their social media accounts, and get an AI agent that autonomously drafts, schedules, and publishes content — with human approval before anything goes live.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, shadcn/ui, Tailwind CSS v4 |
| Agent | Eve framework (Vercel), Vercel AI SDK |
| Social APIs | Zernio Node SDK (14+ platforms) |
| Database | Neon Serverless Postgres, Drizzle ORM |
| Auth | BetterAuth |
| Hosting | Vercel |

## Documentation

All project documentation lives in [`/docs`](./docs/):

- [`prd.md`](./docs/prd.md) — Product Requirements Document
- [`trd.md`](./docs/trd.md) — Technical Requirements Document
- [`dependencies.md`](./docs/dependencies.md) — Dependency list & risk matrix
- [`projectstructure.md`](./docs/projectstructure.md) — Project structure guide
- [`phases.md`](./docs/phases.md) — Granular build phases (47 micro-phases)
- [`changelog.md`](./docs/changelog.md) — Change log

## Reference Repos

The `repos/` directory contains cloned reference repositories used during architecture research:

- `zernio-node` — Zernio SDK
- `zernflow` — Visual flow builder
- `latewiz` — Social media dashboard
- `eve-agents` — Eve agent + builder
- `adam` — Durable agent runtime
- `awesome-eve-agents` — Agent templates
- `zernio-claude-plugin` — MCP plugin

## Status

🚧 **In Development** — Currently in Phase 1.0 (Project Scaffolding)

## License

MIT
