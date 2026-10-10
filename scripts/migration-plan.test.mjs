import assert from 'node:assert/strict';
import { test } from 'vitest';
import { migrationPlan } from './migration-plan.mjs';

const files = [
  { tag: 'old-baselined', hash: 'old', folderMillis: 10 },
  { tag: '0049', hash: '49', folderMillis: 20 },
  { tag: '0050', hash: '50', folderMillis: 30 },
  { tag: '0051', hash: '51', folderMillis: 50 },
];
test('detects a migration silently skipped by a later external journal record', () => {
  assert.throws(() => migrationPlan(files, [{ hash: '49', created_at: 20 }, { hash: 'external', created_at: 40 }]), /0050/);
});
test('preserves a baseline and external records while admitting correctly ordered new migrations', () => {
  const result = migrationPlan(files.map(item => item.tag === '0050' ? { ...item, folderMillis: 45 } : item), [{ hash: 'baseline', created_at: 15 }, { hash: '49', created_at: 20 }, { hash: 'external', created_at: 40 }]);
  assert.deepEqual(result.pending.map(item => item.tag), ['0050', '0051']);
  assert.equal(result.legacyRecords, 2);
});
test('fresh databases receive every migration and completed migrations are not repeated', () => {
  assert.equal(migrationPlan(files, []).pending.length, 4);
  assert.equal(migrationPlan(files, files.map(item => ({ hash: item.hash, created_at: item.folderMillis }))).pending.length, 0);
});
