// ============================================
// WAF (Web Application Firewall) Implementation
// Multiple WAF layers for different endpoints
// ============================================

import { db } from "./db";

// ---- XXE WAF ----
// Checks raw SVG content for XXE patterns
// VULNERABILITY: Only checks for raw XML patterns (unescaped)
// If the attacker HTML-encodes the XXE payload, the WAF
// won't detect it because it only matches literal characters
// like <!, not &lt;!. The backend then calls htmlUnescape()
// which converts &lt;! back to <!, reviving the XXE payload.
export function wafCheckXXE(
  rawContent: string
): { passed: boolean; reason?: string } {
  // These patterns only match RAW (unescaped) XML constructs
  // HTML-encoded versions like &lt;!DOCTYPE will NOT match
  const patterns = [
    // Match raw DOCTYPE: the < must be a literal < not &lt;
    { regex: /<!DOCTYPE\b/i, reason: "DOCTYPE declaration detected" },
    // Match raw ENTITY: must be preceded by <!
    { regex: /<!ENTITY\b/i, reason: "ENTITY declaration detected" },
    // Match raw SYSTEM/PUBLIC keywords only when they appear
    // after an unescaped <! (XML context), not in general text
    { regex: /<!\[CDATA\b/i, reason: "CDATA section detected" },
    // Only match file:// when preceded by unescaped quote in XML context
    // Weakness: doesn't detect file:// in general text content
    // because SVGs might legitimately contain URLs
    { regex: /php:\/\//i, reason: "php:// protocol detected" },
    { regex: /expect:\/\//i, reason: "expect:// protocol detected" },
    { regex: /gopher:\/\//i, reason: "gopher:// protocol detected" },
    { regex: /dict:\/\//i, reason: "dict:// protocol detected" },
  ];

  for (const pattern of patterns) {
    if (pattern.regex.test(rawContent)) {
      return { passed: false, reason: pattern.reason };
    }
  }

  return { passed: true };
}

// HTML Unescape function - THE VULNERABILITY
// WAF checks BEFORE this, but backend calls this AFTER WAF check
export function htmlUnescape(str: string): string {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCharCode(parseInt(code, 10))
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    );
}

// ---- SSTI WAF ----
// Blocks dangerous characters in template input body
// Does NOT check URL query parameters
export function wafCheckSSTI(
  bodyInput: string
): { passed: boolean; reason?: string } {
  // Block patterns in the request body only
  const blocked = [
    { regex: /\{\{/g, reason: "Double braces {{ are not allowed" },
    { regex: /__/g, reason: "Double underscore __ is not allowed" },
    { regex: /'/g, reason: "Single quotes are not allowed" },
    { regex: /"/g, reason: "Double quotes are not allowed" },
    { regex: /\+/g, reason: "Plus operator is not allowed" },
    { regex: /\*/g, reason: "Asterisk operator is not allowed" },
    { regex: /\\x[0-9a-fA-F]{2}/g, reason: "Hex escapes are not allowed" },
    { regex: /\\u[0-9a-fA-F]{4}/g, reason: "Unicode escapes are not allowed" },
    { regex: /\\o[0-7]{3}/g, reason: "Octal escapes are not allowed" },
  ];

  for (const block of blocked) {
    if (block.regex.test(bodyInput)) {
      return { passed: false, reason: block.reason };
    }
  }

  return { passed: true };
}

// Check for known SSTI payloads (triggers key rotation)
export function containsKnownSSTIPayload(input: string): boolean {
  const knownPayloads = [
    "__class__",
    "__mro__",
    "__subclasses__",
    "__init__",
    "__globals__",
    "__builtins__",
    "os.system",
    "os.popen",
    "subprocess",
    "importlib",
    "sys.modules",
    "pickle.loads",
    "yaml.load",
    "__import__",
    "Popen",
    "posixpath",
    "linecache",
    "codeobject",
  ];

  const lowerInput = input.toLowerCase();
  return knownPayloads.some((payload) => lowerInput.includes(payload.toLowerCase()));
}

// ---- Path Traversal WAF ----
// Blocks obvious traversal patterns
// VULNERABILITY: Doesn't check for Unicode full-width characters
export function wafCheckPath(
  fileParam: string
): { passed: boolean; reason?: string } {
  const blocked = [
    { regex: /\.\.\//g, reason: "Path traversal detected (../)" },
    { regex: /\.\.\\/g, reason: "Path traversal detected (..\\)" },
    { regex: /%2e%2e%2f/gi, reason: "URL-encoded traversal detected" },
    { regex: /%2e%2e%5c/gi, reason: "URL-encoded traversal detected" },
    { regex: /%252e/gi, reason: "Double-encoded traversal detected" },
    { regex: /\.\.%2f/gi, reason: "Mixed path traversal detected" },
    { regex: /\.\.%5c/gi, reason: "Mixed path traversal detected" },
    { regex: /%c0%ae/gi, reason: "Overlong UTF-8 traversal detected" },
  ];

  for (const block of blocked) {
    if (block.regex.test(fileParam)) {
      return { passed: false, reason: block.reason };
    }
  }

  return { passed: true };
}

// Unicode Normalization - THE VULNERABILITY for path traversal
// Converts full-width characters back to ASCII
export function normalizeUnicodePath(path: string): string {
  let normalized = path;

  // Full-width dot U+FF0E → ASCII dot U+002E
  normalized = normalized.replace(/\uff0e/g, ".");

  // Full-width slash U+FF0F → ASCII slash U+002F
  normalized = normalized.replace(/\uff0f/g, "/");

  // Full-width backslash U+FF3C → ASCII backslash U+005C
  normalized = normalized.replace(/\uff3c/g, "\\");

  // General full-width to ASCII conversion (U+FF01 to U+FF5E)
  normalized = normalized.replace(/[\uff01-\uff5e]/g, (ch) => {
    return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
  });

  return normalized;
}

// ---- Timing Attack Protection ----
// Ensures all failed responses take the same time
export async function constantTimeResponse<T>(
  fn: () => Promise<T>,
  minTimeMs: number = 200
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    return result;
  } finally {
    const elapsed = Date.now() - start;
    if (elapsed < minTimeMs) {
      await new Promise((resolve) => setTimeout(resolve, minTimeMs - elapsed));
    }
  }
}

// ---- Rate Limiting (in-memory) ----
const rateLimitMap = new Map<
  string,
  { count: number; resetAt: number }
>();

export function checkRateLimit(
  ip: string,
  maxRequests: number = 10,
  windowMs: number = 60000
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  entry.count++;
  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: maxRequests - entry.count };
}
