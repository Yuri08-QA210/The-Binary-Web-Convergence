// ============================================
// JWT Utilities for CTF Challenge
// Uses APP_SECRET_KEY for signing
// ============================================

import crypto from "crypto";
import { CTF_CONFIG, hashVaultId } from "./ctf-config";

export interface JWTPayload {
  sub: string; // user UUID
  email: string;
  isAdmin: boolean;
  iat: number;
  exp: number;
}

export function createJWT(
  userId: string,
  email: string,
  isAdmin: boolean = false,
  expiresIn: number = 86400
): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      email,
      isAdmin,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + expiresIn,
    })
  ).toString("base64url");

  const signature = createHMACSignature(`${header}.${payload}`);
  return `${header}.${payload}.${signature}`;
}

export function verifyJWT(token: string): JWTPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts;
    const expectedSig = createHMACSignature(`${header}.${payload}`);

    if (signature !== expectedSig) return null;

    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf-8")
    );

    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return decoded as JWTPayload;
  } catch {
    return null;
  }
}

function createHMACSignature(input: string): string {
  return crypto
    .createHmac("sha256", CTF_CONFIG.APP_SECRET_KEY)
    .update(input)
    .digest("base64url");
}

// Hash a vault UUID for IDOR protection
export function hashVaultUUID(uuid: string): string {
  return hashVaultId(uuid);
}

// Verify a vault ID hash
export function verifyVaultHash(
  uuid: string,
  hash: string
): boolean {
  return hashVaultId(uuid) === hash;
}
