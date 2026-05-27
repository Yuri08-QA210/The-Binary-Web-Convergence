/* eslint-disable @typescript-eslint/no-require-imports */
// ============================================
// Database Seed Script for Render.com
// Called during startup to initialize CTF data
// ============================================

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

async function main() {
  console.log('[SEED] Initializing VaultVM CTF database...');

  const DEFAULT_USER_EMAIL = 'youssef@vaultvm.local';
  const DEFAULT_USER_UUID = 'b8e7a9c6-d5f4-3e2d-1c0b-9a8f7e6d5c4b';

  // Create default user (Youssef)
  let user = await prisma.user.findFirst({
    where: { email: DEFAULT_USER_EMAIL },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        uuid: DEFAULT_USER_UUID,
        email: DEFAULT_USER_EMAIL,
        name: 'Youssef',
        is_admin: false,
      },
    });
    console.log(`[SEED] Created user: ${user.email}`);
  } else {
    console.log(`[SEED] User already exists: ${user.email}`);
  }

  // Create additional users for realism
  const additionalUsers = [
    { uuid: crypto.randomUUID(), email: 'admin@vaultvm.local', name: 'System Admin', is_admin: true },
    { uuid: crypto.randomUUID(), email: 'dev@vaultvm.local', name: 'Developer', is_admin: false },
    { uuid: crypto.randomUUID(), email: 'guest@vaultvm.local', name: 'Guest User', is_admin: false },
  ];

  for (const userData of additionalUsers) {
    const existing = await prisma.user.findFirst({
      where: { email: userData.email },
    });
    if (!existing) {
      await prisma.user.create({ data: userData });
      console.log(`[SEED] Created user: ${userData.email}`);
    }
  }

  console.log('[SEED] Database initialization complete!');
}

main()
  .catch((e) => {
    console.error('[SEED] Error:', e.message);
    // Don't exit with error - allow server to start anyway
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
