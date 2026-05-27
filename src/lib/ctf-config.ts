// ============================================
// CTF Challenge Configuration
// All secrets come from environment variables on Render
// ============================================

export const CTF_CONFIG = {
  // Application secret key (used for JWT signing + SSTI auth)
  // Falls back to default for local dev
  APP_SECRET_KEY: process.env.APP_SECRET_KEY || "v4ul7_c7f_2024_xK9mP2nL7qR4wY6",

  // Internal UUIDs for vault system (used in IDOR)
  VAULT_UUIDS: {
    admin: "a3f8c2d1-4b5e-6f7a-8c9d-0e1f2a3b4c5d",
    backup: "e7d6c5b4-3a2f-1e0d-9c8b-7a6f5e4d3c2b",
    system: "f1e2d3c4-b5a6-9786-5d4c-3b2a1098fedc",
  },

  // Flag 1 - obtained via XXE (.env leak)
  FLAG_1: process.env.FLAG_1 || "QA{xx3_p4rs3r_d1ff3r3nt14l_v4ul7_2024}",

  // Default user credentials
  DEFAULT_USER_EMAIL: "youssef@vaultvm.local",
  DEFAULT_USER_UUID: "b8e7a9c6-d5f4-3e2d-1c0b-9a8f7e6d5c4b",
};

// The .env file content that XXE will leak
// This is the simulated /app/.env file that gets leaked through XXE
export const DOT_ENV_CONTENT = `# ============================================
# VaultVM Application Configuration
# Environment: Production
# Last Updated: 2024-12-15
# ============================================

# Application Security
APP_SECRET_KEY=${CTF_CONFIG.APP_SECRET_KEY}

# Database Configuration
DB_HOST=internal-db.render.com
DB_PORT=5432
DB_NAME=vaultdb
DB_USER=vault_admin
DB_PASS=[REDACTED]

# Internal Vault UUIDs (RESTRICTED - DO NOT EXPOSE)
VAULT_UUID_ADMIN=${CTF_CONFIG.VAULT_UUIDS.admin}
VAULT_UUID_BACKUP=${CTF_CONFIG.VAULT_UUIDS.backup}
VAULT_UUID_SYSTEM=${CTF_CONFIG.VAULT_UUIDS.system}

# CTF Flag Stage 1
FLAG_1=${CTF_CONFIG.FLAG_1}
`;

import crypto from "crypto";

export function hashVaultId(uuid: string): string {
  return crypto
    .createHash("sha256")
    .update(CTF_CONFIG.APP_SECRET_KEY + uuid)
    .digest("hex");
}

export const HASHED_VAULT_IDS: Record<string, string> = {
  [CTF_CONFIG.VAULT_UUIDS.admin]: hashVaultId(CTF_CONFIG.VAULT_UUIDS.admin),
  [CTF_CONFIG.VAULT_UUIDS.backup]: hashVaultId(CTF_CONFIG.VAULT_UUIDS.backup),
  [CTF_CONFIG.VAULT_UUIDS.system]: hashVaultId(CTF_CONFIG.VAULT_UUIDS.system),
};
