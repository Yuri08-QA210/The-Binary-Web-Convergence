// ============================================
// Debug Console Endpoint - SSTI Vulnerable
// Step 2 of CTF: Server-Side Template Injection
// ============================================
// VULNERABILITY: Jinja2-like template engine
// with WAF that blocks body content but NOT URL params
// Attacker can bypass WAF using |attr() filter
// and passing dangerous strings via URL parameters
// ============================================

import { NextRequest, NextResponse } from "next/server";
import {
  wafCheckSSTI,
  containsKnownSSTIPayload,
  checkRateLimit,
  constantTimeResponse,
} from "@/lib/waf";
import {
  createTemplateContext,
  evaluateTemplate,
} from "@/lib/ssti-engine";
import { CTF_CONFIG } from "@/lib/ctf-config";
import { db } from "@/lib/db";
import crypto from "crypto";

// Current secret key (can be rotated on tamper detection)
let currentSecretKey = CTF_CONFIG.APP_SECRET_KEY;

export async function POST(request: NextRequest) {
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

      // ---- Authentication: Requires APP_SECRET_KEY ----
      const authHeader = request.headers.get("x-debug-auth") || "";
      const authParam = new URL(request.url).searchParams.get("key") || "";

      if (authHeader !== currentSecretKey && authParam !== currentSecretKey) {
        return NextResponse.json(
          {
            error: "Authentication required",
            detail:
              "This endpoint requires a valid debug authentication key.",
            hint: "Provide the key via X-Debug-Auth header or ?key= parameter.",
          },
          { status: 401 }
        );
      }

      // ---- Get template input ----
      const body = await request.text();
      const urlParams: Record<string, string> = {};

      // Extract URL parameters (NOT checked by WAF)
      new URL(request.url).searchParams.forEach((value, key) => {
        if (key !== "key") {
          urlParams[key] = value;
        }
      });

      if (!body.trim()) {
        return NextResponse.json({
          service: "VaultVM Debug Console",
          version: "2.1.0",
          engine: "Nunjucks/Jinja2-compatible",
          status: "authenticated",
          hint: "Submit a template expression for evaluation.",
          availableObjects: [
            "request",
            "config",
            "db",
            "lipsum",
            "range",
            "dict",
            "namespace",
            "cycler",
            "joiner",
          ],
          note: "WAF active: certain characters are blocked in request body.",
        });
      }

      // ---- Anti-Tamper: Check for known SSTI payloads ----
      if (containsKnownSSTIPayload(body)) {
        // Rotate the secret key
        const oldKey = currentSecretKey;
        currentSecretKey = `rotated_${crypto.randomBytes(16).toString("hex")}`;

        try {
          await db.keyRotation.create({
            data: {
              oldKey: "[REDACTED]",
              newKey: "[ROTATED]",
              reason: "Known SSTI payload detected",
            },
          });
        } catch {}

        console.log(
          `[SSTI] Key rotated due to known payload from ${ip}`
        );

        return NextResponse.json(
          {
            error: "Security violation detected",
            detail:
              "Known exploit payload detected. Application secret has been rotated for security. All previous sessions are now invalid.",
            consequence:
              "Your APP_SECRET_KEY is no longer valid. You need to re-exploit the XXE to get the new key.",
          },
          { status: 403 }
        );
      }

      // ---- WAF Check on Body Content Only ----
      const wafResult = wafCheckSSTI(body);
      if (!wafResult.passed) {
        // Log blocked attempt
        try {
          await db.wafLog.create({
            data: {
              endpoint: "/debug/console",
              input: body.substring(0, 500),
              blocked: true,
              reason: wafResult.reason,
              ip,
            },
          });
        } catch {}

        return NextResponse.json(
          {
            error: "Template rejected by WAF",
            detail: wafResult.reason,
            hint: "Certain characters are not allowed in the template body. Consider using alternative syntax.",
            blockedChar: wafResult.reason,
          },
          { status: 403 }
        );
      }

      // ---- Evaluate Template ----
      const context = createTemplateContext(
        urlParams,
        request.method,
        "/debug/console"
      );

      const result = await evaluateTemplate(body, context);

      // ---- Handle Admin Elevation ----
      if (result.adminSet) {
        console.log(`[SSTI] Admin elevation from ${ip}`);

        try {
          const user = await db.user.findFirst({
            where: { email: CTF_CONFIG.DEFAULT_USER_EMAIL },
          });

          if (user) {
            await db.user.update({
              where: { id: user.id },
              data: { is_admin: true },
            });

            // Create admin session
            const token = crypto.randomBytes(32).toString("hex");
            await db.session.create({
              data: {
                token,
                userId: user.id,
                isAdmin: true,
                expiresAt: new Date(Date.now() + 86400000),
              },
            });

            return NextResponse.json({
              success: true,
              output: result.output,
              adminElevated: true,
              session: {
                token,
                isAdmin: true,
                userUuid: user.uuid,
                email: user.email,
              },
              message:
                "Admin privileges granted. You can now access /admin/backups.",
            });
          }
        } catch (e: any) {
          console.error("[SSTI] Admin elevation error:", e.message);
        }
      }

      return NextResponse.json({
        success: true,
        output: result.output,
        error: result.error,
      });
    } catch (e: any) {
      return NextResponse.json(
        {
          error: "Template engine error",
          detail: e.message,
        },
        { status: 500 }
      );
    }
  }, 400);
}

// GET returns console info (requires auth)
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("x-debug-auth") || "";
  const authParam = new URL(request.url).searchParams.get("key") || "";

  if (authHeader !== currentSecretKey && authParam !== currentSecretKey) {
    return NextResponse.json(
      { error: "Authentication required", status: "unauthorized" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    service: "VaultVM Debug Console",
    version: "2.1.0",
    engine: "Nunjucks/Jinja2-compatible",
    status: "authenticated",
    wafRules: [
      "Double braces {{ }} are blocked in body",
      "Double underscore __ is blocked in body",
      "Single/double quotes are blocked in body",
      "Plus + and asterisk * are blocked in body",
      "Hex/Unicode escapes are blocked in body",
      "URL query parameters are NOT checked by WAF",
    ],
    hint: "Use |attr() filter to access attributes. Pass attribute names via URL parameters.",
    availableObjects: [
      "request (args, method, path, headers)",
      "config (SECRET_KEY, DEBUG, DATABASE_URL)",
      "db (user, session)",
      "lipsum (generator)",
      "range, dict, namespace, cycler, joiner",
    ],
  });
}
