# Single-host pilot with managed PostgreSQL

Keep Next.js, Eve, Drizzle, Neon, R2 and the existing Modal media worker. This pilot changes web hosting, not the production database. `compose.hosted-db.yml` deliberately has no database service and no automatic migration on web startup.

Use one web replica with persistent `/app/.eve` storage. Eve's default local Workflow world keeps durable execution state there; this configuration is not safe for multiple independent web replicas. Back up the volume and verify restoration before a customer cutover. A managed shared Workflow world would be a separate architecture change.

For a pilot, provision an isolated test database and TEST billing. Start with a candidate host offering 2 vCPUs and 4 GB RAM; this is a test sizing assumption, not a benchmark or a price quote. Choose a region near the database. Review the actual host, storage, backup and traffic quote before purchasing.

## Runtime configuration

Create an operator-owned env file outside the repository, mode `0600`, based on `.env.example`. Set:

- `DATABASE_URL` to the isolated database; use `DATABASE_PROVIDER=neon` for Neon.
- Matching `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` with the pilot HTTPS origin.
- `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY` and `CRON_SECRET` securely. A production migration must preserve existing encryption and authentication secrets.
- TEST Dodo product IDs, API key and webhook secret. Do not load production billing credentials into this pilot.
- Required R2/media configuration. Use test storage and avoid sending public posts.
- The same `EVE_NEXT_PRODUCTION_PORT` at build and runtime, default `4274`.

Do not copy Vercel-injected `VERCEL*` variables or `EVE_NEXT_PRODUCTION_ORIGIN` into the self-hosted runtime. Those select an external Eve runtime rather than the container's loopback service. Remove mock providers and development fallbacks before a production release.

Configure a TLS reverse proxy on the host to forward to `127.0.0.1:3000`, preserving paths, streaming and long-lived requests, including `/eve/` and `/.well-known/workflow/`. Port 4274 stays inside the container. The Compose file binds the web port to loopback; configure TLS and firewall rules separately.

## Build and verify

Set these shell variables to non-secret values; Compose reads runtime secrets from the protected file:

```sh
export JOEY_ENV_FILE=/absolute/protected/joey-pilot.env
export NEXT_PUBLIC_APP_URL=https://pilot.example.com
export JOEY_IMAGE_TAG=reviewed-commit-sha
docker compose -f compose.hosted-db.yml build app migrate
docker compose -f compose.hosted-db.yml --profile migration run --rm migrate
docker compose -f compose.hosted-db.yml up -d app
docker compose -f compose.hosted-db.yml ps
```

Verify signup, login, a real AI turn with an approved test key, draft/edit/approval, provider failure recovery, TEST billing/webhooks and scheduled Scouts. Do not treat homepage health as proof of these journeys. Restart the container during an isolated pending workflow and verify completion without duplicate actions; then test restoring its persistent volume.

The normal Eve runtime runs its authored schedules itself. For the existing minute maintenance cadence, retain exactly one external caller of authenticated `/api/cron` (the Modal scheduler) when testing the host. Do not enable another minute loop in Compose. The database admission gate deduplicates overlapping HTTP ticks, and maintenance windows are shared with native Eve schedule calls. Native tenant/agent schedules still need observation because they can trigger model calls.

## Production decision and rollback

Measure web CPU/RAM, latency, scheduler completion and all provider costs during a bounded pilot. Compare them with Vercel Pro using actual usage, rather than a server's headline price. Keep production traffic and webhooks unchanged until the pilot passes.

Before any cutover: take database and workflow-state backups, reconcile pending jobs on the old host, preserve encryption keys, verify callback origins and OAuth/Zernio/Dodo webhook routing, and agree on a rollback point. Do not migrate in-flight Vercel workflows by copying the local volume; they need an explicit drain or migration plan. Stop the old scheduler/runtime before enabling production work on the new one. Test production against the same Neon database only after isolated acceptance and cutover approval.

Rollback restores the previous reviewed web image and its compatible workflow volume. Database migrations may not be reversible; review them before applying. Keep the managed database and its backup intact. No host purchase, DNS change, credential rotation or production migration is part of preparing this pilot.
