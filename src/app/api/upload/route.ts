// ============================================
// SVG Upload Endpoint - XXE Vulnerable
// Step 1 of CTF: XXE Parser Differential
// ============================================
// VULNERABILITY: WAF checks raw content, but backend
// calls htmlUnescape() before parsing, allowing
// HTML-encoded XXE payloads to bypass WAF
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { wafCheckXXE, htmlUnescape, checkRateLimit, constantTimeResponse } from "@/lib/waf";
import { parseXMLWithXXE, isValidSVG } from "@/lib/xml-parser";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  return constantTimeResponse(async () => {
    try {
      // Rate limiting
      const ip = request.headers.get("x-forwarded-for") || "unknown";
      const rateCheck = checkRateLimit(ip, 20, 60000);
      if (!rateCheck.allowed) {
        return NextResponse.json(
          { error: "Rate limit exceeded. Try again later." },
          { status: 429 }
        );
      }

      // Get raw body content
      const contentType = request.headers.get("content-type") || "";
      let rawContent = "";
      let fileName = "upload.svg";

      if (contentType.includes("multipart/form-data")) {
        const formData = await request.formData();
        const file = formData.get("avatar") as File | null;
        if (!file) {
          return NextResponse.json(
            { error: "No file uploaded. Please select an SVG file." },
            { status: 400 }
          );
        }
        fileName = file.name;
        rawContent = await file.text();
      } else {
        rawContent = await request.text();
      }

      // ---- WAF Gatekeeper Check ----
      // Checks RAW content for XXE patterns
      const wafResult = wafCheckXXE(rawContent);
      if (!wafResult.passed) {
        // Log the blocked attempt
        console.log(`[WAF] Blocked XXE attempt from ${ip}: ${wafResult.reason}`);

        // Log to database
        try {
          await db.wafLog.create({
            data: {
              endpoint: "/api/upload",
              input: rawContent.substring(0, 500),
              blocked: true,
              reason: wafResult.reason,
              ip,
            },
          });
        } catch {}

        return NextResponse.json(
          {
            error: "Upload rejected by security filter",
            detail: `WAF: ${wafResult.reason}`,
            hint: "The uploaded SVG contains prohibited XML constructs.",
          },
          { status: 403 }
        );
      }

      // ---- Backend Processing ----
      // VULNERABILITY: Backend calls htmlUnescape() on the content
      // This revives HTML-encoded XXE payloads that bypassed the WAF
      const unescapedContent = htmlUnescape(rawContent);

      // Validate that it's an SVG
      if (!isValidSVG(unescapedContent) && !isValidSVG(rawContent)) {
        return NextResponse.json(
          {
            error: "Invalid SVG file",
            detail:
              "The uploaded file does not appear to be a valid SVG document.",
          },
          { status: 400 }
        );
      }

      // ---- XML Parsing with XXE support ----
      // The parser resolves XXE entities in the unescaped content
      const parseResult = parseXMLWithXXE(unescapedContent);

      if (!parseResult.success) {
        return NextResponse.json(
          {
            error: "SVG parsing failed",
            detail: parseResult.error,
          },
          { status: 400 }
        );
      }

      // ---- Build Response ----
      const response: Record<string, unknown> = {
        success: true,
        message: "SVG processed successfully",
        file: fileName,
        processingTime: `${Date.now() - startTime}ms`,
        metadata: parseResult.metadata || {},
      };

      // If XXE extracted content, include it in the response
      // This simulates the content leaking through metadata/error messages
      if (parseResult.extractedContent) {
        // The leaked content appears as "metadata" in the response
        // This makes it look like a normal processing artifact
        response.metadata = {
          ...response.metadata,
          // Leak extracted content as "processing metadata"
          processingNotes: "External entity resolved during SVG processing.",
          // The actual leaked content - appears as "debug info"
          debugInfo: parseResult.extractedContent,
        };

        // Log successful XXE
        console.log(
          `[XXE] Entity content leaked from ${ip}: ${Object.keys(parseResult.extractedContent).join(", ")}`
        );

        try {
          await db.wafLog.create({
            data: {
              endpoint: "/api/upload",
              input: "XXE_SUCCESS",
              blocked: false,
              reason: "XXE entity resolved - content leaked",
              ip,
            },
          });
        } catch {}
      }

      // Include resolved entities count
      if (parseResult.entities && Object.keys(parseResult.entities).length > 0) {
        response.entityCount = Object.keys(parseResult.entities).length;
      }

      return NextResponse.json(response);
    } catch (e: any) {
      return NextResponse.json(
        {
          error: "Internal server error",
          detail: e.message,
        },
        { status: 500 }
      );
    }
  }, 300); // Constant time: 300ms minimum
}

// GET endpoint returns upload page info
export async function GET() {
  return NextResponse.json({
    service: "VaultVM SVG Avatar Processor",
    version: "2.1.0",
    maxFileSize: "10MB",
    allowedFormats: ["svg"],
    features: [
      "SVG avatar processing",
      "Metadata extraction",
      "Image optimization",
    ],
    endpoints: {
      upload: "POST /api/upload",
      supportedNamespaces: [
        "http://www.w3.org/2000/svg",
        "http://www.w3.org/1999/xlink",
      ],
    },
  });
}
