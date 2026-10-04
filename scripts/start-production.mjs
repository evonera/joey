import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

export function loadProductionEnvironment(cwd) {
  // Eve starts before Next. Give both children Next's exact production dotenv
  // precedence, including expansion and existing exported-variable priority.
  process.env.NODE_ENV = 'production';
  const { loadEnvConfig } = require('@next/env');
  return loadEnvConfig(cwd, false).combinedEnv;
}

function port(value, name) {
  const parsed = Number(value);
  if (!/^\d+$/.test(String(value)) || String(parsed) !== String(value) || !Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }
  return parsed;
}

export function productionStartupConfiguration(env, cwd, args = []) {
  const standalone = args.includes('--standalone');
  const appArgs = args.filter(arg => arg !== '--standalone');
  const portFlag = appArgs.findIndex(arg => arg === '--port' || arg === '-p');
  const inlinePort = appArgs.find(arg => arg.startsWith('--port='))?.slice(7);
  const appPort = port(portFlag >= 0 ? appArgs[portFlag + 1] : inlinePort || env.PORT || 3000, 'Next port');
  const externalRuntime = Boolean(env.VERCEL || env.EVE_NEXT_PRODUCTION_ORIGIN?.trim());
  const evePort = externalRuntime ? undefined : port(env.EVE_NEXT_PRODUCTION_PORT || 4274, 'EVE_NEXT_PRODUCTION_PORT');
  if (evePort === appPort) throw new Error('Next and Eve must use different ports.');
  if (standalone && appArgs.length) throw new Error('Standalone startup uses PORT/HOSTNAME rather than Next CLI arguments.');
  return {
    appArgs: standalone ? [join(cwd, 'server.js')] : [join(cwd, 'node_modules/next/dist/bin/next'), 'start', ...appArgs],
    appPort,
    eveFile: join(cwd, '.output/server/index.mjs'),
    evePort,
  };
}

async function requireFreeEvePort(portNumber) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error(`Eve loopback port ${portNumber} is already in use. Stop the conflicting process or rebuild with a different EVE_NEXT_PRODUCTION_PORT.`)));
    probe.listen(portNumber, '127.0.0.1', () => probe.close(resolve));
  });
}

export async function startProduction(env = process.env, cwd = process.cwd(), args = process.argv.slice(2), dependencies = {}) {
  const loadEnvironment = dependencies.loadEnvironment || loadProductionEnvironment;
  const probePort = dependencies.probePort || requireFreeEvePort;
  const spawnProcess = dependencies.spawnProcess || spawn;
  const signals = dependencies.signals || process;
  const fileExists = dependencies.fileExists || existsSync;
  env = { ...loadEnvironment(cwd), ...env, NODE_ENV: 'production' };
  const config = productionStartupConfiguration(env, cwd, args);
  if (config.evePort && !fileExists(config.eveFile)) throw new Error('Built Eve output is missing. Run npm run build:eve before starting production.');
  const children = [];
  let stopping = false;
  let finish;
  const lifetime = new Promise(resolve => { finish = resolve; });
  const shutdown = async (exitCode, signal = 'SIGTERM') => {
    if (stopping) return;
    stopping = true;
    process.exitCode = exitCode;
    const exited = children.map(child => !child.pid || child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise(resolve => child.once('close', resolve)));
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    const force = setTimeout(() => {
      for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, 10_000);
    force.unref();
    await Promise.all(exited);
    clearTimeout(force);
    finish();
  };
  const launch = (childArgs, childEnv, label) => {
    if (stopping) return undefined;
    const child = spawnProcess(process.execPath, childArgs, { cwd, env: { ...env, NODE_ENV: 'production', ...childEnv }, stdio: 'inherit' });
    children.push(child);
    child.once('error', error => { console.error(`[startup] ${label} failed: ${error.message}`); void shutdown(1); });
    child.once('exit', (code, signal) => {
      if (!stopping) {
        console.error(`[startup] ${label} exited (${signal || code}). Stopping the other service.`);
        void shutdown(1);
      }
    });
    return child;
  };
  const onTerm = () => { void shutdown(0); };
  const onInterrupt = () => { void shutdown(0, 'SIGINT'); };
  signals.once('SIGTERM', onTerm);
  signals.once('SIGINT', onInterrupt);
  try {
    if (config.evePort) {
      await probePort(config.evePort);
      if (stopping) { await lifetime; return; }
      const eve = launch([config.eveFile], { HOST: '127.0.0.1', NITRO_HOST: '127.0.0.1', PORT: String(config.evePort), NITRO_PORT: String(config.evePort) }, 'Eve');
      const deadline = Date.now() + 180_000;
      let ready = false;
      while (!stopping && Date.now() < deadline) {
        try {
          const response = await fetch(`http://127.0.0.1:${config.evePort}/`, { signal: AbortSignal.timeout(1_000) });
          await response.body?.cancel();
          if (response.status < 500) { ready = true; break; }
        } catch { /* The owned child may still be opening its listener. */ }
        if (eve.exitCode !== null || eve.signalCode !== null) break;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      if (!ready) {
        if (stopping) { await lifetime; return; }
        throw new Error('Eve did not become ready; refusing to serve a broken agent proxy.');
      }
      console.log(`[startup] Eve ready on loopback:${config.evePort}.`);
    }
    if (!stopping) launch(config.appArgs, {}, 'Next');
    await lifetime;
  } catch (error) {
    await shutdown(1);
    throw error;
  } finally {
    signals.removeListener('SIGTERM', onTerm);
    signals.removeListener('SIGINT', onInterrupt);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await startProduction(); } catch (error) { console.error(`[startup] ${error.message}`); process.exitCode = 1; }
}
