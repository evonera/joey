import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = join(repositoryRoot, "src/lib/db/migrations");
const journalPath = join(migrationsDirectory, "meta/_journal.json");

const allFiles = await readdir(migrationsDirectory);
const sqlFiles = allFiles.filter((file) => file.endsWith(".sql"));
for (const file of sqlFiles) {
  if (!/^\d{4}_.+\.sql$/.test(file)) {
    throw new Error(`Migration SQL file ${file} does not match expected naming convention (0000_name.sql)`);
  }
}
const files = sqlFiles.sort();
const journal = JSON.parse(await readFile(journalPath, "utf8"));

if (!Array.isArray(journal.entries)) {
  throw new Error("Migration journal entries must be an array");
}

const expectedTags = files.map((file) => basename(file, ".sql"));
// These already-applied historical entries predate their predecessors. Never
// rewrite shipped history; require every subsequent migration to advance time.
const historicalTimestamps = new Map([
  ["0004_add_webhook_events_index", 1743199200000],
  ["0031_workable_daredevil", 1788263314825],
]);
const journalTags = journal.entries.map((entry, position) => {
  if (entry.idx !== position) {
    throw new Error(`Migration journal index ${entry.idx} must equal its position ${position}`);
  }
  if (entry.version !== journal.version) {
    throw new Error(`Migration ${entry.tag} uses journal version ${entry.version}, expected ${journal.version}`);
  }
  if (!Number.isSafeInteger(entry.when) || entry.when <= 0) throw new Error(`Invalid timestamp for ${entry.tag}`);
  if (position > 0 && entry.when <= journal.entries[position - 1].when && historicalTimestamps.get(entry.tag) !== entry.when) {
    throw new Error(`Migration ${entry.tag} must have a timestamp newer than its predecessor; Drizzle would otherwise skip it on existing databases`);
  }
  return entry.tag;
});

if (new Set(journalTags).size !== journalTags.length) {
  throw new Error("Migration journal contains duplicate tags");
}

if (JSON.stringify(journalTags) !== JSON.stringify(expectedTags)) {
  throw new Error(
    `Migration journal does not match SQL files\nExpected: ${expectedTags.join(", ")}\nActual: ${journalTags.join(", ")}`,
  );
}

for (const file of files) {
  const sql = (await readFile(join(migrationsDirectory, file), "utf8")).trim();
  if (!sql) {
    throw new Error(`Migration ${file} is empty`);
  }
}

console.log(`Validated ${files.length} ordered PostgreSQL migrations`);
