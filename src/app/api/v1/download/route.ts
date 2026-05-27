// ============================================
// Download Endpoint - Path Traversal Vulnerable
// Step 3b of CTF: Path Traversal via Unicode Normalization
// ============================================
// VULNERABILITY: WAF blocks standard traversal patterns
// but doesn't check for Unicode full-width characters.
// Backend normalizes full-width → ASCII before path resolution
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/lib/jwt-utils";
import { wafCheckPath, normalizeUnicodePath, checkRateLimit, constantTimeResponse } from "@/lib/waf";
import { CTF_CONFIG } from "@/lib/ctf-config";
import { db } from "@/lib/db";

// Allowed files per vault (simulated)
const ALLOWED_FILES: Record<string, string[]> = {
  [CTF_CONFIG.VAULT_UUIDS.admin]: [
    "admin_config.json",
    "user_registry.db",
    "access_logs.csv",
  ],
  [CTF_CONFIG.VAULT_UUIDS.backup]: [
    "full_backup_20241215.tar.gz",
    "incremental_20241214.tar.gz",
    "manual.pdf",
    "engine.wasm",
  ],
  [CTF_CONFIG.VAULT_UUIDS.system]: [
    "vaultvm_core.bin",
    "runtime_lib.so",
    "firmware_v2.bin",
  ],
};

export async function GET(request: NextRequest) {
  return constantTimeResponse(async () => {
    try {
      // Rate limiting
      const ip = request.headers.get("x-forwarded-for") || "unknown";
      const rateCheck = checkRateLimit(ip, 10, 60000);
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
          { error: "Authentication required" },
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

      // ---- Admin Check ----
      if (!jwtPayload.isAdmin) {
        return NextResponse.json(
          { error: "Forbidden - Admin access required" },
          { status: 403 }
        );
      }

      // ---- Parse Parameters ----
      const url = new URL(request.url);
      const vaultId = url.searchParams.get("vault_id") || "";
      const file = url.searchParams.get("file") || "";

      if (!vaultId || !file) {
        return NextResponse.json(
          {
            error: "Missing parameters",
            usage: "/api/v1/download?vault_id=<uuid>&file=<filename>",
          },
          { status: 400 }
        );
      }

      // ---- Validate vault_id ----
      if (!ALLOWED_FILES[vaultId]) {
        return NextResponse.json(
          { error: "Invalid vault ID" },
          { status: 404 }
        );
      }

      // ---- WAF Check on file parameter ----
      const wafResult = wafCheckPath(file);
      if (!wafResult.passed) {
        try {
          await db.wafLog.create({
            data: {
              endpoint: "/api/v1/download",
              input: file.substring(0, 500),
              blocked: true,
              reason: wafResult.reason,
              ip,
            },
          });
        } catch {}

        return NextResponse.json(
          {
            error: "Invalid file path",
            detail: wafResult.reason,
          },
          { status: 403 }
        );
      }

      // ---- VULNERABILITY: Unicode Normalization ----
      const normalizedFile = normalizeUnicodePath(file);

      // ---- Serve files ----
      // The VaultVM binary (engine.wasm) is served as a static file from /public/
      // When path traversal resolves to engine.wasm, redirect to the static file
      if (normalizedFile.includes("engine.wasm") || normalizedFile.includes("vaultvm")) {
        console.log(
          `[PATH_TRAVERSAL] VaultVM binary download from ${ip}: ${file} → ${normalizedFile}`
        );

        // Redirect to the static file in /public/engine.wasm
        // This avoids loading 100MB into memory
        const baseUrl = process.env.RENDER_EXTERNAL_URL ||
          `${url.protocol}//${url.host}`;
        return NextResponse.redirect(`${baseUrl}/engine.wasm`);
      }

      // For other files, return simulated content
      if (ALLOWED_FILES[vaultId]?.includes(normalizedFile)) {
        return NextResponse.json({
          vault_id: vaultId,
          file: normalizedFile,
          content: `[Simulated content of ${normalizedFile}]`,
          size: "1.2MB",
          checksum: "sha256:abcdef1234567890",
        });
      }

      // Path traversal that didn't match engine.wasm
      const simulatedFiles: Record<string, string> = {
        "/var/lib/vault/backups/engine.wasm": "[VAULTVM_BINARY_REDIRECT]",
        "/vault/sealed/engine.wasm": "[VAULTVM_BINARY_REDIRECT]",
        "/vault/sealed/flag.txt": "QA{p4th_tr4v3rs4l_un1c0d3_n0rm4l1z4t10n}",
      };

      const content = simulatedFiles[normalizedFile];
      if (content) {
        return NextResponse.json({
          vault_id: vaultId,
          file: normalizedFile,
          content: content,
          warning: "Path traversal detected - file served from outside vault directory",
        });
      }

      return NextResponse.json(
        { error: "File not found in vault", file: normalizedFile },
        { status: 404 }
      );
    } catch (e: any) {
      return NextResponse.json(
        { error: "Internal server error", detail: e.message },
        { status: 500 }
      );
    }
  }, 350);
}
