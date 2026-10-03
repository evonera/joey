import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { requireDisposableDatabase } from './require-disposable-database';

await requireDisposableDatabase();
const origin = new URL(process.env.JOEY_LOCAL_EVE_URL || 'http://127.0.0.1:4274');
assert.ok(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname) && origin.pathname === '/' && !origin.username && !origin.password && !origin.search && !origin.hash, 'Only a local HTTP Eve origin is allowed.');
const secret = process.env.CRON_SECRET;
assert.ok(secret, 'A local CRON_SECRET is required.');
const send = (body: unknown, authorized: boolean) => fetch(new URL('/scout-dispatch', origin), {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(authorized ? { authorization: `Bearer ${secret}` } : {}) },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(10_000),
});
const unauthorized = await send({}, false);
assert.equal(unauthorized.status, 401);
const invalid = await send({ jobs: [] }, true);
assert.equal(invalid.status, 400);
// An unbound random identity cannot reach collection, judging or publishing.
// This is real HTTP/Workflow transport acceptance, not provider acceptance.
const accepted = await send({ jobs: [{
  scoutId: randomUUID(), tenantId: `local-nonexistent-${randomUUID()}`,
  evaluationId: randomUUID(), dispatchAttempt: 1,
  dispatchLeaseUntil: new Date(Date.now() + 60_000).toISOString(),
}] }, true);
assert.equal(accepted.status, 202);
const receipt = await accepted.json() as { accepted: number; runId: string };
assert.equal(receipt.accepted, 1);
assert.match(receipt.runId, /^[a-zA-Z0-9_-]+$/);
const dataDirectory = join(process.cwd(), '.eve/.workflow-data');
const deadline = Date.now() + 45_000;
let run: { status: string; completedAt?: string; output?: { data: string } } | undefined;
while (Date.now() < deadline) {
  try {
    run = JSON.parse(await readFile(join(dataDirectory, 'runs', `${receipt.runId}.json`), 'utf8'));
    if (run?.status === 'completed' || run?.status === 'failed') break;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await delay(250);
}
assert.equal(run?.status, 'completed', 'The actual authored Workflow must complete.');
assert.match(Buffer.from(run!.output!.data, 'base64').toString('utf8'), /Scout evaluation stopped before a new phase/);
const stepFile = (await readdir(join(dataDirectory, 'steps'))).find(name => name.startsWith(`${receipt.runId}-`) && name.endsWith('.json'));
assert.ok(stepFile);
const step = JSON.parse(await readFile(join(dataDirectory, 'steps', stepFile), 'utf8')) as { status: string; attempt: number };
assert.equal(step.status, 'completed');
assert.equal(step.attempt, 1);
const report = {
  origin: origin.origin,
  unauthorizedStatus: unauthorized.status, invalidStatus: invalid.status, acceptedStatus: accepted.status,
  runId: receipt.runId, runStatus: run!.status, completedAt: run!.completedAt,
  stepStatus: step.status, stepAttempt: step.attempt,
  rejectionMessage: 'Scout evaluation stopped before a new phase.',
  scope: 'Nonexistent local fixture; no provider or approval/resume acceptance.',
};
if (process.env.JOEY_LOCAL_RUNTIME_REPORT) await writeFile(process.env.JOEY_LOCAL_RUNTIME_REPORT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
