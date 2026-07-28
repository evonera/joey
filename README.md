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

## Tech Stack
- **Framework**: Next.js 16 (App Router)
- **Database**: PostgreSQL (Neon) with Drizzle ORM
- **Authentication**: Better Auth
- **Agent Framework**: Eve
- **Social API**: Zernio SDK
- **Styling**: Tailwind CSS v4, Shadcn UI
- **Deployment**: Vercel Ready

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
