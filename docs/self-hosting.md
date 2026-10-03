# Self-hosting Joey

## Docker Compose

1. Install Docker Compose and clone the repository.
2. Copy `.env.example` to `.env`.
3. Set `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` to independent values generated with `openssl rand -base64 32`. Set `POSTGRES_PASSWORD`, then set `JOEY_DATABASE_URL` to the internal Compose URL (`db:5432`) with URL-encoded credentials. For example, with the defaults: `postgresql://postgres:<percent-encoded-password>@db:5432/joey`.
4. Set **both** `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` to the same origin users will open, including the scheme and port, without a path. For example, when `JOEY_PORT=3180`, use `http://localhost:3180` for both. For a public deployment, use your HTTPS reverse-proxy origin. `NEXT_PUBLIC_APP_URL` is used during the Docker build, so rebuild after changing it.
5. Start Joey with `docker compose up --build -d` and inspect migration startup with `docker compose logs -f migrate`.

Compose uses the internal `db` hostname for the application and migration container. PostgreSQL data persists in the `joey_postgres_data` volume; Eve's local durable runtime state persists in `joey_eve_data`. Back up both. Optional providers can remain unset until their features are configured.

To use a different environment file, set `JOEY_ENV_FILE` to its path and pass
the same path with `docker compose --env-file <path>`. This keeps Compose's
interpolated build/port values and the containers' runtime environment aligned.

Authentication rejects missing production origin configuration and mismatched browser/server origins. It never falls back to the hosted Joey domain. Vercel/Netlify can supply their active deployment URL when explicit URLs are absent; self-hosted instances should always set both URLs. If you enable Google login, register `<your-origin>/api/auth/callback/google` with Google. Password-reset links use the configured auth origin and require email delivery credentials.

For browser monitoring, set `NEXT_PUBLIC_SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_ENVIRONMENT` before building. Compose passes those public values to the Docker builder; changing them requires rebuilding. `SENTRY_AUTH_TOKEN` is private and is not a Docker build argument. This image builds without private source-map upload credentials. Server monitoring uses runtime configuration separately.

Provider keys are optional for signup, manual drafting and setup. AI trials and workspace AI budgets still apply; installing Joey does not include unlimited model, scraping, media or publishing service usage. Configure the services you use and their provider-side spend limits. Keep `AGENCY_AUTOMATION_ENABLED=false` until controlled acceptance passes.

## Scheduled work

The Compose application starts both Next.js and the built Eve runtime through
an explicit supervisor. Eve listens only on container loopback port 4274
(override with `EVE_NEXT_PRODUCTION_PORT` before building and starting); the
supervisor waits for Eve readiness and shuts down both children on a failure or
termination signal. `npm run start` uses the same supervisor for non-container
hosting; build with `npm run build:eve` before `npm run build`. Before either
child starts, the supervisor loads Next's production environment-file
precedence (`.env.production.local`, `.env.local`, `.env.production`, `.env`);
already exported variables retain priority. Set the same Eve port at build and
startup so the built proxy destination matches the runtime listener. Managed Vercel
services and explicitly configured external Eve origins do not spawn a local
Eve child. A bare `next start` is insufficient for this version's built proxy
routes. The stack does not install a
host cron service. Configure your own scheduler to invoke `GET /api/cron` with
`Authorization: Bearer <CRON_SECRET>` for due posts, Flows, standalone Scouts
and outbox recovery. Keep the secret server-side and verify the returned task
summary. Scout ticks now hand off bounded durable jobs, so the host must also
support the generated Workflow runtime and its recovery route.

Eve's authored schedules, including daily agency drafts, need a scheduler that
actually executes them. `eve dev` does not fire scheduled cadence. Eve's
documented self-deployed schedule runner uses `eve build && eve start`; custom
Next.js/container hosting must verify equivalent dispatch and durable execution
before enabling agency automation. A healthy web container alone does not prove
scheduled jobs are running.

## Upgrades and migrations

Back up PostgreSQL before upgrading. Pull the new code, then rebuild and start the stack:

```bash
docker compose up --build -d
docker compose logs -f migrate
```

Migrations run through `scripts/migrate-db.mjs` and are tracked in Drizzle's migration journal. Do not apply `drizzle-kit push` to a deployed or shared database. If Joey detects an existing schema without a migration journal, it stops without changing the schema; follow the version-specific baseline instructions before continuing.

When upgrading a deployment that contains credentials written before the tenant-bound v2 format, deploy the compatible release first, back up the database, and run `npm run db:migrate-secrets`. The command reports only counts, not credential values. After it succeeds and credential integrations are verified, set `ALLOW_LEGACY_UNBOUND_SECRETS=false` and redeploy.

OAuth provider tokens are encrypted by Better Auth using the configured auth secret. Keep `BETTER_AUTH_SECRET` stable across restarts and back it up securely; changing it can make stored provider tokens unavailable.

## Local development

Use Node.js 24.x and npm. Copy `.env.example` to `.env.local`, set `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `ENCRYPTION_KEY`, then run:

```bash
npm ci
npm run db:migrate
npm run dev
```

`DATABASE_PROVIDER=neon` selects the transaction-capable Neon WebSocket pool. The app requires transactions; `neon-http` is not supported. Leave `DATABASE_PROVIDER=postgres` for a local PostgreSQL database.

## Common issues

- **Compose asks for `POSTGRES_PASSWORD`:** Set it in `.env` and rerun Compose.
- **Port is already in use:** Change `JOEY_PORT` or `POSTGRES_PORT` in `.env`.
- **Login URL is wrong or origin validation fails:** Set matching `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` (including a changed `JOEY_PORT`), then rebuild and recreate the application container. Update OAuth callback registrations too.
- **Migration stops on an existing schema:** Back up the database and follow the baseline instructions shown by the migrator; do not switch to `drizzle-kit push`.
- **Media or publishing is unavailable:** Configure the relevant R2, Modal, Zernio, or provider credentials. These integrations are separate from core signup and self-hosted app startup.

## Acceptance before enabling paid integrations

Use an isolated database and a new workspace. Verify signup/login, saving and reopening an account-free Compose draft, onboarding tour continuation after refresh, and paused agent creation. The product E2E suite exercises these without a model or publishing request. Supply `JOEY_INTEGRATION_TEST=true` and the disposable database configuration required by its guard; never run it against production.

The authenticated soak includes `/agents` and repeated roster searches, draft filtering, calendar navigation and local composer edits. It does not submit chat prompts or activate recurring work. Run it with an authenticated `JOEY_SOAK_STORAGE_STATE` against your staging host; a public harness run is not authenticated product acceptance. A real 30-minute run is still required before claiming the long-session gate passed.

Provider-backed Scout research, Eve approval/resume, media rendering and publishing need separate controlled staging acceptance. Passing build/unit tests or account-free product checks does not establish those integrations work.
