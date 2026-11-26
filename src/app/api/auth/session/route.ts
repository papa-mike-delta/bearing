import { ok } from "@/lib/auth-utils";
import { verifySession } from "@/lib/auth";
import { sessionTokenFromCookie } from "@/lib/session";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/auth/session
export async function GET(req: NextRequest) {
  const session = verifySession(sessionTokenFromCookie(req.headers.get("cookie")));
  if (!session) return ok({ authenticated: false });

  return ok({
    authenticated: true,
    twoFactorVerified: session.twoFactorVerified,
    email: session.email,
    userId: session.userId,
  });
}
