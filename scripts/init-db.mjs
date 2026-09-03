import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.log("No DATABASE_URL provided, skipping vector extension initialization.");
  process.exit(0);
}

const sql = postgres(connectionString, { max: 1 });

try {
  await sql`CREATE EXTENSION IF NOT EXISTS vector;`;
  console.log("Successfully verified/initialized PostgreSQL vector extension.");
} catch (err) {
  console.warn("Warning: Unable to create vector extension directly:", err.message);
} finally {
  await sql.end();
}
