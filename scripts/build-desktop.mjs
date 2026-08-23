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

const HIDE_DIRS = ['src/app/api', 'src/app/actions'];

const BAK_SUFFIX = '_desktop_bak';

function hideServerCode() {
  for (const dir of HIDE_DIRS) {
    if (existsSync(dir)) {
      renameSync(dir, dir + BAK_SUFFIX);
      console.log(`[desktop-build] Temporarily hidden ${dir}`);
    }
  }
}

function restoreServerCode() {
  for (const dir of HIDE_DIRS) {
    const bak = dir + BAK_SUFFIX;
    if (existsSync(bak)) {
      renameSync(bak, dir);
      console.log(`[desktop-build] Restored ${dir}`);
    }
  }
}

// Always restore on exit
process.on('exit', restoreApiRoutes);
process.on('SIGINT', () => { restoreServerCode(); process.exit(1); });
process.on('SIGTERM', () => { restoreServerCode(); process.exit(1); });
process.on('uncaughtException', (e) => { restoreServerCode(); throw e; });

try {
  hideServerCode();
  console.log('[desktop-build] Running Next.js static export...');
  execSync('NEXT_OUTPUT=export next build', { stdio: 'inherit' });
  console.log('[desktop-build] ✓ Static export complete');
} catch (err) {
  console.error('[desktop-build] ✗ Build failed');
  process.exit(1);
}
