import {
  ok,
  bad,
  parseBody,
  createSession,
  getUserFromRequest,
} from "@/lib/auth-utils";
import { sessionCookie } from "@/lib/session";
import crypto from "node:crypto";
import type { NextRequest } from "next/server";
export const dynamic = "force-dynamic";
// Ephemeral convenience only. Expiry/restarts fail closed; credentials never bypass 2FA.
const qrTokens = new Map<
  string,
  { userId: string; email: string; createdAt: number; confirmed: boolean }
>();
export async function POST(req: NextRequest) {
  const session = await getUserFromRequest(req);
  if (!session)
    return bad("Sign in and complete 2FA before using QR login", 401);
  const body = await parseBody(req);
  if (body.action === "confirm") {
    const entry =
      typeof body.token === "string" ? qrTokens.get(body.token) : undefined;
    if (!entry || Date.now() - entry.createdAt > 300_000)
      return bad("Invalid or expired QR code", 404);
    if (entry.userId !== session.userId)
      return bad("This QR code belongs to a different account", 403);
    entry.confirmed = true;
    return ok({ authenticated: true });
  }
  // Limit ephemeral memory and evict expired challenges.
  for (const [key, value] of qrTokens)
    if (Date.now() - value.createdAt > 300_000) qrTokens.delete(key);
  if (qrTokens.size >= 1000)
    return bad("QR login temporarily unavailable", 429);
  const token = crypto.randomBytes(32).toString("hex");
  qrTokens.set(token, {
    userId: session.userId,
    email: session.email,
    createdAt: Date.now(),
    confirmed: false,
  });
  return ok({ token, qrUrl: `${req.nextUrl.origin}/login?qr=${token}` });
}
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return bad("Token is required");
  const entry = qrTokens.get(token);
  if (!entry || Date.now() - entry.createdAt > 300_000) {
    qrTokens.delete(token);
    return ok({ expired: true });
  }
  if (!entry.confirmed) return ok({ confirmed: false, waiting: true });
  qrTokens.delete(token);
  return ok(
    { confirmed: true, email: entry.email },
    {
      headers: {
        "Set-Cookie": sessionCookie(
          createSession(entry.userId, entry.email, true),
        ),
      },
    },
  );
}
