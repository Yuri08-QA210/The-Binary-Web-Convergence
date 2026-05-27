// ============================================
// Build Script: Pad vaultvm-core.bin to 100MB
// This creates the engine.wasm in public/
// The core binary is ~225KB, padded to 100MB
// with random data to match the CTF challenge
// ============================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const CORE_BIN = join(ROOT, 'scripts', 'vaultvm-core.bin');
const OUTPUT = join(ROOT, 'public', 'engine.wasm');
const TARGET_SIZE = 100 * 1024 * 1024; // 100MB

console.log('[pad-binary] Starting binary padding...');

// Ensure public directory exists
const publicDir = join(ROOT, 'public');
if (!existsSync(publicDir)) {
  mkdirSync(publicDir, { recursive: true });
}

// Read the core binary
if (!existsSync(CORE_BIN)) {
  console.error('[pad-binary] ERROR: vaultvm-core.bin not found at', CORE_BIN);
  process.exit(1);
}

const coreData = readFileSync(CORE_BIN);
console.log(`[pad-binary] Core binary: ${coreData.length} bytes (${(coreData.length / 1024).toFixed(1)} KB)`);

// Create 100MB buffer with core binary + random padding
const paddingSize = TARGET_SIZE - coreData.length;
console.log(`[pad-binary] Adding ${paddingSize} bytes of padding (${(paddingSize / 1024 / 1024).toFixed(1)} MB)...`);

const buffer = Buffer.alloc(TARGET_SIZE);
coreData.copy(buffer, 0);

// Fill padding with pseudo-random data (deterministic for reproducibility)
let seed = 0xDEADBEEF;
for (let i = coreData.length; i < TARGET_SIZE; i += 4) {
  // Simple xorshift32
  seed ^= seed << 13;
  seed ^= seed >> 17;
  seed ^= seed << 5;
  buffer.writeUInt32LE(seed >>> 0, i);
}

// Write the padded binary
writeFileSync(OUTPUT, buffer);
console.log(`[pad-binary] Created engine.wasm: ${TARGET_SIZE} bytes (100MB) at ${OUTPUT}`);
console.log('[pad-binary] Done!');
