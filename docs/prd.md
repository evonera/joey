# Product Requirements Document (PRD)
## Social Media Agent Platform (Open-Source)

### 1. Executive Summary
The Social Media Agent Platform (Name TBD) is an open-source, multi-tenant SaaS application that empowers users to automate their social media presence using an autonomous AI agent. By leveraging the Eve framework and the Zernio Node SDK, users can "Bring Your Own Key" (BYOK) for Zernio and optionally an LLM provider, connect their social accounts, configure a brand persona, and let the agent draft, schedule, and optimize content. The platform incorporates a human-in-the-loop approval system, ensuring brand safety while minimizing the time spent on social media management.

### 2. Problem Statement
Maintaining an active and engaging social media presence across multiple platforms is time-consuming and context-heavy for content creators, small businesses, and marketing teams. Hiring dedicated social media managers is expensive, while existing scheduling tools still require significant human effort to ideate, write, and analyze content. There is a lack of accessible, autonomous solutions that integrate deeply with multiple platforms while maintaining strict brand voice alignment and human oversight.

### 3. Target Audience
- **Content Creators:** Need to maintain consistent engagement without burning out.
- **Small Businesses:** Lack the budget for full-time social media staff but need a professional online presence.
- **Marketing Teams:** Looking to scale their output and iterate on content strategies efficiently.
- **Developers:** Interested in self-hosting or extending an open-source social media automation tool.

### 4. User Stories
- As a user, I want to sign up securely so that my data and API keys are protected.
- As a user, I want to input my Zernio and LLM API keys securely so the platform can act on my behalf without requiring me to purchase a premium subscription for API costs.
- As a user, I want to connect my social media accounts (X, LinkedIn, Facebook Pages, etc.) easily via OAuth.
- As a user, I want to define my brand's persona, tone, and posting schedule so the agent's output aligns with my identity.
- As a user, I want to review, edit, approve, or reject AI-generated drafts before they are published to ensure quality and safety.
- As a user, I want a unified calendar view to visualize my upcoming posts across all connected platforms.
- As a user, I want to see basic analytics on post performance so I know what content resonates with my audience.

### 5. Feature Requirements

#### P0 (MVP Core Features)
- **Authentication & Onboarding:** Secure signup/login using BetterAuth (Email/Password + OAuth).
- **BYOK Management:** Secure server-side storage of Zernio API key (AES-256-GCM encrypted in Postgres) and optional LLM API keys (OpenAI/Anthropic/OpenRouter).
- **Social Account Connection:** OAuth flow via Zernio to connect accounts and select sub-entities (Pages, Boards, Company Pages).
- **Agent Persona Configuration:** UI to define brand voice, posting goals, and schedules.
- **Automated Content Drafting:** Centralized, app-level polling scheduler (not per-tenant cron) that triggers the Eve framework agent to draft posts.
- **Human Approval Gate:** Dashboard to review, approve, edit, or reject (with feedback) generated drafts.
- **Publishing Engine:** Execute approved posts via Zernio SDK.
- **Error Handling:** Robust failure/retry mechanisms with user notifications for failed posts.

#### P1 (Important Enhancements)
- **Content Calendar View:** Visual calendar interface for managing scheduled and drafted posts.
- **Post Composer:** Manual post creation tool with platform-specific options (e.g., character limits, image attachments).
- **Basic Analytics Dashboard:** Display key engagement metrics fetched via Zernio.
- **Agent Chat Interface:** Conversational UI to interact with the agent for brainstorming or on-the-fly content generation.
- **Spend Management:** Per-tenant LLM spend caps and usage tracking.

#### P2 (Future / Post-MVP)
- **Long-Term Memory:** Agent learns from past successful posts and user feedback to refine brand voice.
- **Webhook-Reactive Engagement:** Agent auto-drafts replies to mentions and DMs in real-time.
- **Visual Flow Builder:** Integration with Zernflow patterns for custom agent behaviors.
- **1-Click Self-Host Deployment:** Simplified deployment scripts/templates for users wanting to run their own instance.
- **Agent Template Marketplace:** Community-driven repository of specialized agent personas and workflows.
- **Team Collaboration:** Role-Based Access Control (RBAC) for teams (admins, editors, approvers).

### 6. Non-Functional Requirements
- **Security:** API keys MUST be encrypted at rest using AES-256-GCM. Keys must reside server-side; `localStorage` is strictly prohibited for API keys as background tasks require them.
- **Multi-Tenant Data Isolation:** Ensure strict separation of tenant data in the Neon Serverless Postgres database.
- **Compliance:** Adhere strictly to platform automation policies (e.g., clear AI disclosure requirements on platforms like X, Meta, and LinkedIn).
- **Rate Limiting & Abuse Prevention:** Implement strict API rate limiting to prevent platform abuse and runaway LLM costs.
- **Performance:** App-level scheduler must be highly available and capable of scaling horizontally to handle thousands of tenants.
- **Tech Stack Constraints:** Must utilize Next.js 16, Eve framework, Zernio Node SDK, Neon, BetterAuth, and shadcn/ui.

### 7. Success Metrics
- **Activation Rate:** Percentage of users who successfully connect at least one social account and generate their first draft.
- **Approval Rate:** Percentage of AI-generated drafts that are approved without major edits.
- **Retention:** Monthly active users (MAU) and churn rate.
- **Time-to-Publish:** Reduction in the average time a user spends creating a post compared to manual drafting.

### 8. Out of Scope (For Now)
- Direct video/image generation within the platform (relies on user-provided assets or external links for MVP).
- Complex multi-agent orchestrations beyond the core social media manager persona.
- Mobile application (responsive web only for MVP).
- Built-in billing/subscriptions (assuming BYOK model is sufficient for early adoption/open-source).

### 9. Risks
- **Platform API Changes:** Social media APIs frequently change; relying heavily on Zernio abstracts some risk, but downstream changes can still impact features.
- **LLM Hallucinations:** Agent might draft inappropriate or off-brand content. Mitigated by the mandatory Human Approval Gate (P0).
- **Scheduler Bottlenecks:** A centralized app-level scheduler polling for thousands of tenants could face performance issues and requires careful architectural design.
- **Cost Overruns (Self-Hosted):** Users might accidentally incur high LLM costs if not properly capped or monitored.

### 10. Open Source Strategy
- **License:** Apache 2.0 or MIT.
- **Model:** Open-core approach. The core platform is free to self-host, with a potential hosted tier offered later for users who prefer managed infrastructure.
