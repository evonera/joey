#!/usr/bin/env node
/**
 * Desktop build script for Joey.
 * 
 * The desktop app (Tauri) requires a static export from Next.js.
 * API routes are server-only and incompatible with static export,
 * so we temporarily hide them during the build. The desktop app
 * calls these routes on the remote server via REST API.
 */

import { renameSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const API_DIR = 'src/app/api';
const API_BAK = 'src/app/_api_desktop_bak';

function hideApiRoutes() {
  if (existsSync(API_DIR)) {
    renameSync(API_DIR, API_BAK);
    console.log('[desktop-build] Temporarily hidden API routes');
  }
}

function restoreApiRoutes() {
  if (existsSync(API_BAK)) {
    renameSync(API_BAK, API_DIR);
    console.log('[desktop-build] Restored API routes');
  }
}

// Always restore on exit
process.on('exit', restoreApiRoutes);
process.on('SIGINT', () => { restoreApiRoutes(); process.exit(1); });
process.on('SIGTERM', () => { restoreApiRoutes(); process.exit(1); });
process.on('uncaughtException', (e) => { restoreApiRoutes(); throw e; });

try {
  hideApiRoutes();
  console.log('[desktop-build] Running Next.js static export...');
  execSync('NEXT_OUTPUT=export next build', { stdio: 'inherit' });
  console.log('[desktop-build] ✓ Static export complete');
} catch (err) {
  console.error('[desktop-build] ✗ Build failed');
  process.exit(1);
}
