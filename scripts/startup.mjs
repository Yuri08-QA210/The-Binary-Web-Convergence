// ============================================
// Startup Script for Render.com
// Runs Prisma migrations + seed + Next.js server
// ============================================

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

console.log('[startup] VaultVM CTF - Render.com Startup');
console.log('[startup] =================================');

// Step 1: Generate Prisma client
console.log('[startup] Step 1: Generating Prisma client...');
try {
  execSync('npx prisma generate', { stdio: 'inherit', cwd: ROOT });
  console.log('[startup] Prisma client generated.');
} catch (e) {
  console.error('[startup] ERROR: Prisma generate failed:', e.message);
  process.exit(1);
}

// Step 2: Push database schema
console.log('[startup] Step 2: Pushing database schema...');
try {
  execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit', cwd: ROOT });
  console.log('[startup] Database schema pushed.');
} catch (e) {
  console.error('[startup] WARNING: Prisma db push failed:', e.message);
  console.log('[startup] Continuing anyway - schema may already exist...');
}

// Step 3: Seed database
console.log('[startup] Step 3: Seeding database...');
try {
  execSync('node scripts/seed.mjs', { stdio: 'inherit', cwd: ROOT });
  console.log('[startup] Database seeded.');
} catch (e) {
  console.error('[startup] WARNING: Seed failed:', e.message);
  console.log('[startup] Continuing anyway - data may already exist...');
}

// Step 4: Pad binary if engine.wasm doesn't exist
const enginePath = join(ROOT, 'public', 'engine.wasm');
if (!existsSync(enginePath)) {
  console.log('[startup] Step 4: engine.wasm not found, running pad-binary...');
  try {
    execSync('node scripts/pad-binary.mjs', { stdio: 'inherit', cwd: ROOT });
    console.log('[startup] engine.wasm created.');
  } catch (e) {
    console.error('[startup] WARNING: Binary padding failed:', e.message);
  }
} else {
  console.log('[startup] Step 4: engine.wasm already exists, skipping padding.');
}

// Step 5: Start Next.js server
console.log('[startup] Step 5: Starting Next.js server...');
const standalonePath = join(ROOT, '.next', 'standalone', 'server.js');
const standaloneEnvPath = join(ROOT, '.next', 'standalone', '.env');

if (existsSync(standalonePath)) {
  console.log('[startup] Using standalone build...');
  // Import and run the standalone server
  import(standalonePath);
} else {
  console.log('[startup] Standalone build not found, using next start...');
  try {
    execSync('npx next start -p 3000', { stdio: 'inherit', cwd: ROOT });
  } catch (e) {
    console.error('[startup] Server failed to start:', e.message);
    process.exit(1);
  }
}
