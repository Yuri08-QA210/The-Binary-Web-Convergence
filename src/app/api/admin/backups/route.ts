// ============================================
// Admin Backups Endpoint - IDOR Vulnerable
// Step 3a of CTF: IDOR with JWT Manipulation
// ============================================
// VULNERABILITY: Uses UUID-based vault IDs
// that can be discovered via XXE, and JWT
// signed with APP_SECRET_KEY that was leaked
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { verifyJWT, hashVaultUUID } from "@/lib/jwt-utils";
import { CTF_CONFIG } from "@/lib/ctf-config";
import { checkRateLimit, constantTimeResponse } from "@/lib/waf";
import { db } from "@/lib/db";

// Vault backup data
const VAULT_BACKUPS: Record<
  string,
  {
    id: string;
    name: string;
    uuid: string;
    files: { name: string; size: string; modified: string }[];
    encrypted: boolean;
  }
> = {
  [CTF_CONFIG.VAULT_UUIDS.admin]: {
    id: "vault-admin-001",
    name: "Admin Configuration Backup",
    uuid: CTF_CONFIG.VAULT_UUIDS.admin,
    files: [
      { name: "admin_config.json", size: "2.4KB", modified: "2024-12-15T10:30:00Z" },
      { name: "user_registry.db", size: "156KB", modified: "2024-12-15T10:30:00Z" },
      { name: "access_logs.csv", size: "4.2MB", modified: "2024-12-14T23:59:00Z" },
    ],
    encrypted: true,
  },
  [CTF_CONFIG.VAULT_UUIDS.backup]: {
    id: "vault-backup-002",
    name: "System Backup Archive",
    uuid: CTF_CONFIG.VAULT_UUIDS.backup,
    files: [
      { name: "full_backup_20241215.tar.gz", size: "2.1GB", modified: "2024-12-15T06:00:00Z" },
      { name: "incremental_20241214.tar.gz", size: "456MB", modified: "2024-12-14T06:00:00Z" },
      { name: "manual.pdf", size: "1.2MB", modified: "2024-12-10T14:00:00Z" },
      { name: "engine.wasm", size: "100MB", modified: "2024-12-15T08:00:00Z" },
    ],
    encrypted: false,
  },
  [CTF_CONFIG.VAULT_UUIDS.system]: {
    id: "vault-system-003",
    name: "System Core Binaries",
    uuid: CTF_CONFIG.VAULT_UUIDS.system,
    files: [
      { name: "vaultvm_core.bin", size: "45MB", modified: "2024-12-15T09:00:00Z" },
      { name: "runtime_lib.so", size: "12MB", modified: "2024-12-15T09:00:00Z" },
      { name: "firmware_v2.bin", size: "8MB", modified: "2024-12-15T09:00:00Z" },
    ],
    encrypted: true,
  },
};

export async function GET(request: NextRequest) {
  return constantTimeResponse(async () => {
    try {
      // Rate limiting
      const ip = request.headers.get("x-forwarded-for") || "unknown";
      const rateCheck = checkRateLimit(ip, 15, 60000);
      if (!rateCheck.allowed) {
        return NextResponse.json(
          { error: "Rate limit exceeded." },
          { status: 429 }
        );
      }

      // ---- JWT Authentication ----
      const authHeader = request.headers.get("authorization") || "";
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : new URL(request.url).searchParams.get("token") || "";

      if (!token) {
        return NextResponse.json(
          {
            error: "Authentication required",
            detail: "Bearer token or ?token= parameter required.",
          },
          { status: 401 }
        );
      }

      const jwtPayload = verifyJWT(token);
      if (!jwtPayload) {
        return NextResponse.json(
          { error: "Invalid or expired token" },
          { status: 401 }
        );
      }

      // ---- Admin Check (IDOR Protection) ----
      if (!jwtPayload.isAdmin) {
        return NextResponse.json(
          {
            error: "Forbidden",
            detail:
              "Admin privileges required. This endpoint is only accessible to administrators.",
            hint: "Your account does not have admin privileges.",
          },
          { status: 403 }
        );
      }

      // ---- Process Request ----
      const url = new URL(request.url);
      const vaultId = url.searchParams.get("vault_id") || "";
      const action = url.searchParams.get("action") || "list";

      // If no vault_id, list all available vaults
      if (!vaultId) {
        return NextResponse.json({
          service: "VaultVM Backup Manager",
          version: "2.1.0",
          availableVaults: Object.values(VAULT_BACKUPS).map((v) => ({
            id: v.id,
            name: v.name,
            // IDOR: Hashed IDs are used but can be computed
            // if attacker knows APP_SECRET_KEY + UUID
            hashedId: hashVaultUUID(v.uuid),
            fileCount: v.files.length,
            encrypted: v.encrypted,
          })),
          hint: "Use ?vault_id=<uuid>&action=list to view vault contents.",
        });
      }

      // Check if vault exists
      const vault = VAULT_BACKUPS[vaultId];
      if (!vault) {
        return NextResponse.json(
          {
            error: "Vault not found",
            detail: `No vault found with ID: ${vaultId}`,
            hint: "Check the vault UUID and try again.",
          },
          { status: 404 }
        );
      }

      // List vault contents
      if (action === "list") {
        return NextResponse.json({
          vault: {
            id: vault.id,
            name: vault.name,
            uuid: vault.uuid,
            encrypted: vault.encrypted,
          },
          files: vault.files,
          downloadEndpoint: `/api/v1/download?vault_id=${vaultId}&file=<filename>`,
          note: "Use the download endpoint to retrieve individual files.",
        });
      }

      return NextResponse.json({
        vault: vault,
        action: action,
      });
    } catch (e: any) {
      return NextResponse.json(
        { error: "Internal server error", detail: e.message },
        { status: 500 }
      );
    }
  }, 350);
}
