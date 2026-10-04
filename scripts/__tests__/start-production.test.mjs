import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'vitest';
import { productionStartupConfiguration, startProduction } from '../start-production.mjs';

test('separate local Eve and application ports, including the acceptance port', () => {
  const configuration = productionStartupConfiguration({ EVE_NEXT_PRODUCTION_PORT: '5180' }, '/fixture', ['--port', '3180']);
  assert.equal(configuration.evePort, 5180);
  assert.equal(configuration.appPort, 3180);
  assert.deepEqual(configuration.appArgs, ['/fixture/node_modules/next/dist/bin/next', 'start', '--port', '3180']);
});
test('default local Eve port is 4274, standalone uses container PORT', () => {
  const configuration = productionStartupConfiguration({ PORT: '3000' }, '/app', ['--standalone']);
  assert.equal(configuration.evePort, 4274);
  assert.deepEqual(configuration.appArgs, ['/app/server.js']);
});
test('rejects invalid ports and a shared app/runtime listener', () => {
  for (const value of ['0', '65536', '5180oops', 'NaN', '05180']) assert.throws(() => productionStartupConfiguration({ EVE_NEXT_PRODUCTION_PORT: value }, '/fixture'));
  assert.throws(() => productionStartupConfiguration({ EVE_NEXT_PRODUCTION_PORT: '3180' }, '/fixture', ['-p', '3180']), /different ports/);
  assert.throws(() => productionStartupConfiguration({}, '/fixture', ['--port']), /Next port/);
});
test('Vercel-managed and explicitly external Eve services do not spawn local Eve', () => {
  assert.equal(productionStartupConfiguration({ VERCEL: '1' }, '/fixture').evePort, undefined);
  assert.equal(productionStartupConfiguration({ EVE_NEXT_PRODUCTION_ORIGIN: 'https://agent.example' }, '/fixture').evePort, undefined);
});
test('loads production dotenv precedence before Eve, preserving explicit exports', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'joey-startup-env-'));
  try {
    await writeFile(join(fixture, '.env'), 'EVE_NEXT_PRODUCTION_PORT=4201\nJOEY_FIXTURE_BASE=base\n');
    await writeFile(join(fixture, '.env.production'), 'EVE_NEXT_PRODUCTION_PORT=4202\nJOEY_FIXTURE_PRODUCTION=production\n');
    await writeFile(join(fixture, '.env.local'), 'EVE_NEXT_PRODUCTION_PORT=4203\nJOEY_FIXTURE_LOCAL=local\n');
    await writeFile(join(fixture, '.env.production.local'), 'EVE_NEXT_PRODUCTION_PORT=4204\nJOEY_FIXTURE_HIGHEST=highest\n');
    // jsdom's URL base is an HTTP origin; the isolated Node child needs the
    // real filesystem module URL, not a browser-relative test module URL.
    const moduleURL = pathToFileURL(join(process.cwd(), 'scripts/start-production.mjs')).href;
    const script = `import {loadProductionEnvironment} from ${JSON.stringify(moduleURL)}; const env=loadProductionEnvironment(${JSON.stringify(fixture)}); console.log(JSON.stringify({port:env.EVE_NEXT_PRODUCTION_PORT,base:env.JOEY_FIXTURE_BASE,production:env.JOEY_FIXTURE_PRODUCTION,local:env.JOEY_FIXTURE_LOCAL,highest:env.JOEY_FIXTURE_HIGHEST}));`;
    const childEnv = { PATH: process.env.PATH, NODE_ENV: 'production' };
    const loaded = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: childEnv, encoding: 'utf8' }));
    assert.deepEqual(loaded, { port: '4204', base: 'base', production: 'production', local: 'local', highest: 'highest' });
    const overridden = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...childEnv, EVE_NEXT_PRODUCTION_PORT: '5180' }, encoding: 'utf8' }));
    assert.equal(overridden.port, '5180');
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
test('a termination during the asynchronous port probe cannot launch an orphan', async () => {
  const signals = new EventEmitter();
  const previousExitCode = process.exitCode;
  let launches = 0;
  try {
    await startProduction({ EVE_NEXT_PRODUCTION_PORT: '5180' }, '/fixture', ['--port', '3180'], {
      signals, loadEnvironment: () => ({}), fileExists: () => true,
      probePort: async () => { signals.emit('SIGTERM'); await Promise.resolve(); },
      spawnProcess: () => { launches += 1; throw new Error('Must not spawn after termination.'); },
    });
    assert.equal(launches, 0);
    assert.equal(signals.listenerCount('SIGTERM'), 0);
  } finally {
    process.exitCode = previousExitCode;
  }
});
