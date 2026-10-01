# Self-hosting Joey

## Docker Compose

1. Install Docker Compose and clone the repository.
2. Copy `.env.example` to `.env`.
3. Set `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` to independent values generated with `openssl rand -base64 32`. Set `POSTGRES_PASSWORD`, then set `JOEY_DATABASE_URL` to the internal Compose URL (`db:5432`) with URL-encoded credentials. For example, with the defaults: `postgresql://postgres:<percent-encoded-password>@db:5432/joey`.
4. Set `NEXT_PUBLIC_APP_URL` to the URL users will open. It is used during the Docker build, so rebuild after changing it.
5. Start Joey with `docker compose up --build -d` and inspect migration startup with `docker compose logs -f migrate`.

Compose uses the internal `db` hostname for the application and migration container. PostgreSQL data persists in the `joey_postgres_data` volume. Optional providers can remain unset until their features are configured.

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
- **Login URL is wrong:** Set `NEXT_PUBLIC_APP_URL` and rebuild the Docker image.
- **Migration stops on an existing schema:** Back up the database and follow the baseline instructions shown by the migrator; do not switch to `drizzle-kit push`.
- **Media or publishing is unavailable:** Configure the relevant R2, Modal, Zernio, or provider credentials. These integrations are separate from core signup and self-hosted app startup.
