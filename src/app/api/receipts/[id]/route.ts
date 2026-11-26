import { db } from "@/lib/db";
import { bad, ok, notFound } from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

function parsed(value: string): unknown {
  try { return JSON.parse(value); } catch { return value; }
}

// Ordinary write receipts must remain readable without enabling Coach tools.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getUserFromRequest(req);
  if (!session?.twoFactorVerified) return bad("Unauthorized", 401);
  const { id } = await ctx.params;
  const entry = await db.ledger.findFirst({ where: { id, userId: session.userId } });
  if (!entry) return notFound();
  return ok({ ...entry, payload: parsed(entry.payload), receipt: parsed(entry.receipt) });
}
