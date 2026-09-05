# Joey - Autonomous Social Media Agent Platform

Joey is a multi-tenant, autonomous social media management platform built on Next.js 16, powered by the Eve Agent Framework and the Zernio SDK. It allows users to define a brand persona, set a posting schedule, and let an AI agent draft, evaluate, and (upon human approval) publish content across platforms like Twitter, LinkedIn, and Facebook.

## Features

- **Multi-Tenant Architecture**: Supports multiple users with their own agent configurations, schedules, and social accounts.
- **Better Auth Integration**: Secure, robust authentication with support for database sessions and OAuth providers.
- **Zernio Integration**: Connect multiple social platforms and seamlessly publish content via a unified API.
- **Eve Agent**: Core intelligence powered by `eve`, generating contextual drafts based on specific platform constraints and brand guidelines.
- **Human-in-the-Loop (HITL)**: Approval dashboard and visual content calendar for reviewing, editing, and scheduling drafts.
- **Real-Time Engagement**: Ingests social comments and mentions via Zernio webhooks to auto-draft intelligent replies.
- **RAG Memory System**: Automatically ingests past successful posts and engagement history into pgvector for context-aware content generation.
- **Notification System**: Robust in-app and email notifications (via Resend) for draft approvals, API failures, and engagement alerts.
- **LLM Token Tracking**: Granular tracking and visualization of input/output token usage per tenant.
- **Evaluations**: Built-in Eve Evals for CI/CD regression testing on agent draft quality and approval gate logic.

## Product documentation

- [WebMCP tools](docs/webmcp.md): page-scoped tools agents can use and their human-approval boundaries.
- [Theme Studio implementation guide](docs/theme-studio.md): the current static-card editorial pipeline, its Eve/Zernio boundaries, safeguards, and remaining roadmap.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: PostgreSQL (Neon) with Drizzle ORM
- **Authentication**: Better Auth
- **Agent Framework**: Eve
- **Social API**: Zernio SDK
- **Styling**: Tailwind CSS v4, Shadcn UI
- **Deployment**: Vercel Ready

## Deployment

### Docker (Self-Host) — Includes database

```bash
git clone https://github.com/evonera/joey.git
cd joey
cp .env.example .env
# Edit .env — set BETTER_AUTH_SECRET, ENCRYPTION_KEY
docker compose up -d
```

Joey uses PostgreSQL with pgvector. The Docker setup includes a database automatically.

### Vercel (Hosted) — Requires external database

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/evonera/joey)

1. Click the deploy button above
2. Create a free [Neon](https://neon.tech) database
3. Set env vars in the Vercel dashboard:
   - `DATABASE_URL` — Neon connection string
   - `DATABASE_PROVIDER=neon`
   - `BETTER_AUTH_SECRET` — random string
   - `ENCRYPTION_KEY` — `openssl rand -base64 32`
   - `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
   - `CRON_SECRET` — random string (secures background analytics sync)

### Netlify (Hosted) — Requires external database

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/evonera/joey)

Same env vars as Vercel above.

> **Note on Background Tasks & Crons:** On Vercel Hobby accounts, scheduled cron jobs (`vercel.json`) run at most once per day. For sub-daily post publishing (e.g. 5-minute or hourly polling), use an external cron pinger (such as [cron-job.org](https://cron-job.org) or Upstash QStash) to invoke `GET /api/cron` with `Authorization: Bearer <CRON_SECRET>` at your desired interval, or deploy on Vercel Pro. Netlify also requires an external cron pinger.

### Required Environment Variables

| Variable                | Required       | Description                                         |
| ----------------------- | -------------- | --------------------------------------------------- |
| `DATABASE_URL`          | Yes            | PostgreSQL connection string (included with Docker) |
| `DATABASE_PROVIDER`     | For Neon       | Set to `neon` when using Neon serverless            |
| `BETTER_AUTH_SECRET`    | Yes            | Random string for session signing                   |
| `ENCRYPTION_KEY`        | Yes            | 32-byte base64 string for API key encryption        |
| `NEXT_PUBLIC_APP_URL`   | Yes            | Your app's public URL                               |
| `CLOUDFLARE_ACCOUNT_ID` | Yes            | For asset storage (R2)                              |
| `R2_ACCESS_KEY_ID`      | Yes            | R2 access key                                       |
| `R2_SECRET_ACCESS_KEY`  | Yes            | R2 secret key                                       |
| `R2_BUCKET_NAME`        | Yes            | R2 bucket name                                      |
| `CRON_SECRET`           | Vercel/Netlify | Secures `/api/cron` background tasks                |

## Getting Started

### Prerequisites

- Node.js 24.x or higher
- A Neon PostgreSQL Database
- Zernio API Key
- Anthropic/OpenAI API Keys

### Installation

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your variables:

```bash
cp .env.example .env
```

3. Run database migrations:

```bash
npx drizzle-kit push
```

4. Start the development server:

```bash
npm run dev
```

5. Run Agent Evals:

```bash
npm run eval
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
