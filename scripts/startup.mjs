// ============================================
// Startup Script for Render.com
// Runs Prisma migrations + seed + Next.js server
// ============================================

import { execSync, spawn } from 'child_process';
import { existsSync, copyFileSync, mkdirSync, cpSync } from 'fs';
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
// IMPORTANT: Use `npx next start` instead of standalone server.js
// The standalone import() method causes React hydration failures on Render.com
console.log('[startup] Step 5: Starting Next.js server...');

const server = spawn('npx', ['next', 'start', '-p', '3000'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, PORT: '3000', HOSTNAME: '0.0.0.0' },
});

server.on('error', (err) => {
  console.error('[startup] Failed to start server:', err);
  process.exit(1);
});

server.on('exit', (code) => {
  console.log(`[startup] Server exited with code ${code}`);
  process.exit(code || 0);
});

// Keep the process alive
process.on('SIGINT', () => {
  server.kill('SIGINT');
});

process.on('SIGTERM', () => {
  server.kill('SIGTERM');
});

console.log('[startup] Server starting on port 3000...');
