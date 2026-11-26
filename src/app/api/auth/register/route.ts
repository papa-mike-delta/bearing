import { ok, bad, parseBody, createSession } from "@/lib/auth-utils";
import { sessionCookie } from "@/lib/session";
import { registerInvited } from "@/lib/v1/invitations";
import { Fault } from "@/lib/v1/service";
import type { NextRequest } from "next/server";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    const user = await registerInvited(await parseBody(req));
    return ok(
      { authenticated: true, email: user.email, name: user.name },
      {
        headers: {
          "Set-Cookie": sessionCookie(createSession(user.id, user.email, true)),
        },
      },
    );
  } catch (error) {
    return bad(
      error instanceof Fault ? error.message : "Registration unavailable",
      error instanceof Fault ? error.status : 503,
    );
  }
}
