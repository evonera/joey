import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = join(repositoryRoot, "src/lib/db/migrations");
const journalPath = join(migrationsDirectory, "meta/_journal.json");

const files = (await readdir(migrationsDirectory))
  .filter((file) => /^\d{4}_.+\.sql$/.test(file))
  .sort();
const journal = JSON.parse(await readFile(journalPath, "utf8"));

if (!Array.isArray(journal.entries)) {
  throw new Error("Migration journal entries must be an array");
}

const expectedTags = files.map((file) => basename(file, ".sql"));
const journalTags = journal.entries.map((entry, position) => {
  if (entry.idx !== position) {
    throw new Error(`Migration journal index ${entry.idx} must equal its position ${position}`);
  }
  if (entry.version !== journal.version) {
    throw new Error(`Migration ${entry.tag} uses journal version ${entry.version}, expected ${journal.version}`);
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
