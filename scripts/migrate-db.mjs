import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to apply migrations.");
const client = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  // A schema installed with drizzle-kit push has no migration journal. Running
  // every historical migration against it is unsafe; require an explicit baseline.
  const [state] = await client`SELECT to_regclass('public.tenants') AS existing, to_regclass('drizzle.__drizzle_migrations') AS journal`;
  if (state.existing && !state.journal) {
    throw new Error("Existing schema has no migration history. Back up and baseline this database before migrating; see docs/production-readiness-audit.md. No schema changes were applied.");
  }
  await migrate(drizzle(client), { migrationsFolder: fileURLToPath(new URL("../src/lib/db/migrations", import.meta.url)) });
  console.log("Database migrations applied successfully.");
} finally {
  await client.end();
}
