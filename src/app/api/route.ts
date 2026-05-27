import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    service: "VaultVM CTF Challenge",
    version: "2.1.0",
    status: "running",
    endpoints: {
      upload: "POST /api/upload",
      login: "POST /api/auth/login",
      debug: "POST /api/debug/console",
      backups: "GET /api/admin/backups",
      download: "GET /api/v1/download",
      seed: "POST /api/seed",
    },
  });
}
