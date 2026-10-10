import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrationPlan } from "./migration-plan.mjs";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to apply migrations.");
const connection = new URL(process.env.DATABASE_URL);
if (connection.hostname.endsWith(".neon.tech")) connection.hostname = connection.hostname.replace("-pooler.", ".");
const client = postgres(connection.toString(), { max: 1, connection: { lock_timeout: "10s", statement_timeout: "120s" } });
try {
  // A schema installed with drizzle-kit push has no migration journal. Running
  // every historical migration against it is unsafe; require an explicit baseline.
  const [state] = await client`SELECT to_regclass('public.tenants') AS existing, to_regclass('drizzle.__drizzle_migrations') AS journal`;
  if (state.existing && !state.journal) {
    throw new Error("Existing schema has no migration history. Back up and baseline this database before migrating; see docs/production-readiness-audit.md. No schema changes were applied.");
  }
  const migrationsFolder = fileURLToPath(new URL("../src/lib/db/migrations", import.meta.url));
  const journal = JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8"));
  const migrations = readMigrationFiles({ migrationsFolder }).map((item, index) => ({ ...item, tag: journal.entries[index].tag }));
  const applied = state.journal ? await client`SELECT hash, created_at FROM drizzle.__drizzle_migrations` : [];
  const plan = migrationPlan(migrations, applied);
  console.log(JSON.stringify({ pending: plan.pending.map(item => item.tag), preservedLegacyJournalRecords: plan.legacyRecords }));
  if (process.argv.includes("--check")) {
    console.log("Migration preflight passed; no schema changes applied.");
  } else {
    await migrate(drizzle(client), { migrationsFolder });
    console.log("Database migrations applied successfully.");
  }
} finally {
  await client.end();
}
