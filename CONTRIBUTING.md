# Contributing to Joey

## Development setup

- Node.js 24.x and npm
- PostgreSQL with the pgvector extension
- Optional provider credentials only for the feature being developed

```bash
git clone https://github.com/evonera/joey.git
cd joey
npm ci
cp .env.example .env.local
# Set DATABASE_URL, BETTER_AUTH_SECRET, and ENCRYPTION_KEY.
npm run db:migrate
npm run dev
```

Never commit `.env`, `.env.local`, provider credentials, or customer data.

## Changes and pull requests

- Keep changes focused and include regression coverage for behavior changes.
- Add database changes as ordered SQL migrations under `src/lib/db/migrations`; do not use `drizzle-kit push` for shared or deployed databases.
- Explain compatibility and rollout steps when a change affects stored data or environment variables.
- Before opening a pull request, run the relevant checks from CI. For a full local pass, use:

```bash
npm run check:migrations
npm run typecheck
npm test
npm run lint:ci
npm run build
npm run build:eve
```

Do not include generated audits, bundled repository clones, test output, or secrets unless the change specifically requires them.
