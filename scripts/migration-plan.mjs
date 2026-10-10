/** Preserve baselined history while rejecting newer migrations that timestamps would skip. */
export function migrationPlan(migrations, applied) {
  const hashes = new Set(applied.map(row => row.hash));
  const latestTimestamp = Math.max(0, ...applied.map(row => Number(row.created_at)));
  const lastMatchedIndex = migrations.reduce((latest, item, index) => hashes.has(item.hash) ? index : latest, -1);
  const skipped = migrations.filter((item, index) => index > lastMatchedIndex && !hashes.has(item.hash) && item.folderMillis <= latestTimestamp);
  if (skipped.length) {
    throw new Error(`Migration timestamps would skip newer unapplied files: ${skipped.map(item => item.tag).join(', ')}. Reconcile their order before migrating. No schema changes were applied.`);
  }
  return {
    pending: migrations.filter(item => item.folderMillis > latestTimestamp),
    legacyRecords: applied.filter(row => !migrations.some(item => item.hash === row.hash)).length,
  };
}
