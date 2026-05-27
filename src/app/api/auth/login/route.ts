// ============================================
// Auth Login Endpoint
// Generates JWT tokens for authenticated users
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { createJWT } from "@/lib/jwt-utils";
import { db } from "@/lib/db";
import { constantTimeResponse } from "@/lib/waf";

export async function POST(request: NextRequest) {
  return constantTimeResponse(async () => {
    try {
      const body = await request.json();
      const { email, sessionToken } = body;

      // If session token provided (from SSTI admin elevation)
      if (sessionToken) {
        const session = await db.session.findFirst({
          where: { token: sessionToken },
          include: { user: true },
        });

        if (session && session.expiresAt > new Date()) {
          // Generate JWT for the session
          const jwt = createJWT(
            session.user.uuid,
            session.user.email,
            session.isAdmin
          );

          return NextResponse.json({
            success: true,
            token: jwt,
            user: {
              uuid: session.user.uuid,
              email: session.user.email,
              isAdmin: session.isAdmin,
            },
          });
        }

        return NextResponse.json(
          { error: "Invalid or expired session token" },
          { status: 401 }
        );
      }

      // Email-based login (basic, for testing)
      if (!email) {
        return NextResponse.json(
          { error: "Email required" },
          { status: 400 }
        );
      }

      const user = await db.user.findFirst({
        where: { email },
      });

      if (!user) {
        return NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        );
      }

      // Generate JWT (note: is_admin reflects DB state)
      const jwt = createJWT(user.uuid, user.email, user.is_admin);

      return NextResponse.json({
        success: true,
        token: jwt,
        user: {
          uuid: user.uuid,
          email: user.email,
          isAdmin: user.is_admin,
        },
      });
    } catch (e: any) {
      return NextResponse.json(
        { error: "Login failed", detail: e.message },
        { status: 500 }
      );
    }
  }, 300);
}
