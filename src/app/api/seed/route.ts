// ============================================
// Database Seed Endpoint
// Initializes the CTF challenge database
// ============================================

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CTF_CONFIG } from "@/lib/ctf-config";
import crypto from "crypto";

export async function POST() {
  try {
    // Create default user (Youssef)
    let user = await db.user.findFirst({
      where: { email: CTF_CONFIG.DEFAULT_USER_EMAIL },
    });

    if (!user) {
      user = await db.user.create({
        data: {
          uuid: CTF_CONFIG.DEFAULT_USER_UUID,
          email: CTF_CONFIG.DEFAULT_USER_EMAIL,
          name: "Youssef",
          is_admin: false,
        },
      });
    }

    // Create some additional users for realism
    const additionalUsers = [
      { uuid: crypto.randomUUID(), email: "admin@vaultvm.local", name: "System Admin", is_admin: true },
      { uuid: crypto.randomUUID(), email: "dev@vaultvm.local", name: "Developer", is_admin: false },
      { uuid: crypto.randomUUID(), email: "guest@vaultvm.local", name: "Guest User", is_admin: false },
    ];

    for (const userData of additionalUsers) {
      const existing = await db.user.findFirst({
        where: { email: userData.email },
      });
      if (!existing) {
        await db.user.create({ data: userData });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Database seeded successfully",
      users: {
        default: {
          email: user.email,
          uuid: user.uuid,
          isAdmin: user.is_admin,
        },
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Seed failed", detail: e.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const userCount = await db.user.count();
    const sessionCount = await db.session.count();

    return NextResponse.json({
      status: "ready",
      userCount,
      sessionCount,
      defaultUser: CTF_CONFIG.DEFAULT_USER_EMAIL,
    });
  } catch (e: any) {
    return NextResponse.json(
      { status: "not_initialized", error: e.message },
      { status: 500 }
    );
  }
}
