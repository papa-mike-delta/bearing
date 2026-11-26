import { sessionCookie } from "@/lib/session";
import { ok } from "@/lib/auth-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/auth/logout
export async function POST(_req: NextRequest) {
  const res = ok({ loggedOut: true });
  res.headers.set("Set-Cookie", sessionCookie("", 0));
  return res;
}
