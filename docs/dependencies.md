# Project Dependencies

This document outlines the dependencies for the social media agent platform.

## Categories

### Core Framework

| Package | Version | Purpose | License | Risk Assessment |
|---|---|---|---|---|
| `next` | 16.x | App Router, React 19 framework | MIT | Very Low (Industry standard, highly maintained) |
| `react`, `react-dom` | 19.x | UI library | MIT | Very Low (Industry standard, highly maintained) |
| `typescript` | 5.x | Type safety | Apache-2.0 | Very Low (Industry standard) |

### Agent Framework

| Package | Version | Purpose | License | Risk Assessment |
|---|---|---|---|---|
| `eve` | ~5.0.0-beta | Vercel's AI agent framework. Shipped June 17, 2026. | Apache-2.0 | High (BETA). Breaking changes expected before GA. |
| `ai` | latest | Vercel AI SDK for model routing | Apache-2.0 | Medium (Evolving ecosystem, but strong backing) |
| `zod` | latest | Schema validation (required by Eve) | MIT | Low (Widely adopted, stable) |

### Social Media API

| Package | Version | Purpose | License | Risk Assessment |
|---|---|---|---|---|
| `@zernio/node` | latest | Unified social media API SDK. 14+ platforms. OpenAPI-generated TypeScript client. | MIT | Medium (Depends on vendor stability, but abstracts many API changes) |

### Authentication

| Package | Version | Purpose | License | Risk Assessment |
|---|---|---|---|---|
| `better-auth` | latest | TypeScript-first auth library. Plugins, self-hosted DB. | MIT | Low-Medium (Growing adoption, high flexibility) |

### Database

| Package | Version | Purpose | License | Risk Assessment |
|---|---|---|---|---|
| `@neondatabase/serverless` | latest | Neon's serverless Postgres driver | MIT | Low (Standard for serverless edge) |
| `drizzle-orm` | latest | TypeScript ORM (type-safe, works with BetterAuth) | Apache-2.0 | Low (Highly popular and maintained) |
| `drizzle-kit` | latest | Database migrations | Apache-2.0 | Low (Companion to ORM) |

### UI Components

| Package | Version | Purpose | License | Risk Assessment |
|---|---|---|---|---|
| `@shadcn/ui` components | latest | Accessible, customizable components | MIT | Low (Copy-paste architecture reduces dependency lock-in) |
| `tailwindcss` | v4 | Utility-first CSS framework | MIT | Low (Industry standard) |
| `@radix-ui/*` | latest | Underlying primitives for shadcn/ui | MIT | Low (Stable, widely used) |
| `lucide-react` | latest | Icons | ISC | Low (Standard icon set) |
| `class-variance-authority` | latest | Variant styling | Apache-2.0 | Low (Stable) |
| `clsx`, `tailwind-merge` | latest | Class utilities | MIT | Low (Stable) |

### State Management & Data Fetching

| Package | Version | Purpose | License | Risk Assessment |
|---|---|---|---|---|
| `zustand` | latest | Client-side state management | MIT | Low (Lightweight, well-maintained) |
| `@tanstack/react-query` | latest | Async state management and caching | MIT | Low (Industry standard) |

### Forms & Validation

| Package | Version | Purpose | License | Risk Assessment |
|---|---|---|---|---|
| `react-hook-form` | latest | Form management | MIT | Low (Industry standard) |
| `@hookform/resolvers` | latest | Schema resolver for react-hook-form | MIT | Low (Stable companion) |

### Date/Time

| Package | Version | Purpose | License | Risk Assessment |
|---|---|---|---|---|
| `date-fns` | latest | Date utilities | MIT | Low (Modular, well-maintained) |
| `date-fns-tz` | latest | Timezone support (critical for scheduling) | MIT | Low (Standard for tz ops) |

### Encryption

> [!NOTE]
> No external dependencies needed for encryption.

| Package | Version | Purpose | License | Risk Assessment |
|---|---|---|---|---|
| `crypto` (Node.js built-in) | N/A | AES-256-GCM for API key encryption at rest. | N/A | Very Low (Standard library) |

### Email (Notifications)

| Package | Version | Purpose | License | Risk Assessment |
|---|---|---|---|---|
| `resend` / `@react-email/components` | latest | Email sending and template building for approval notifications | MIT | Low (Industry standard for modern email) |

### Dev Dependencies

| Package | Version | Purpose | License | Risk Assessment |
|---|---|---|---|---|
| `vitest` | latest | Testing framework | MIT | Low (Vite ecosystem standard) |
| `eslint`, `@typescript-eslint/*` | latest | Linting | MIT | Low (Industry standard) |
| `prettier` | latest | Code formatting | MIT | Low (Industry standard) |

## Risk Matrix

| Dependency | Maturity | Maintenance | Lock-in Risk | Alternatives |
|---|---|---|---|---|
| `next` | High | Active | High (Framework lock-in) | Remix, Astro |
| `eve` | Beta | Active | High (Tightly coupled AI patterns) | LangChain, LlamaIndex, custom implementations |
| `ai` | High | Active | Medium | Custom LLM client implementations |
| `@zernio/node` | High | Active | High (Replaces 14+ specific APIs) | Direct platform SDKs (e.g. twitter-api-v2, meta-graph-api) |
| `better-auth` | Medium | Active | Low (Data owned in custom DB) | NextAuth/Auth.js, Clerk, Supabase Auth |
| `drizzle-orm` | High | Active | Medium (Schema definitions) | Prisma, Kysely |
| `@shadcn/ui` | High | Active | Very Low (Code is copied into project) | Chakra UI, Mantine |
| `tailwindcss` v4 | High | Active | High (Styling paradigm) | CSS Modules, Vanilla Extract |
| `zustand` | High | Active | Low | Redux, Jotai, Context API |
| `@tanstack/react-query`| High | Active | Medium | SWR, Apollo Client |
| `resend` | High | Active | Medium (Service provider) | SendGrid, AWS SES |
