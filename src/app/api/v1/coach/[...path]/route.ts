import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { Fault, parse, type Principal } from "@/lib/v1/service";
import { id } from "@/lib/v1/contracts";
import { z } from "zod";
import { chatInput } from "@/lib/v1/coach/contracts";
import { configuration, answerStream } from "@/lib/v1/coach/model";
import { CoachStore } from "@/lib/v1/coach/store";
import { preview, approve, reject } from "@/lib/v1/coach/proposals";
import { CoachTrust } from "@/lib/v1/coach/trust";
export const dynamic = "force-dynamic";
export const maxDuration = 90;
async function handle(
  req: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const session = await getUserFromRequest(req);
  if (!session?.twoFactorVerified)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    if (
      (req.method !== "GET" || req.headers.has("X-Bearing-Account")) &&
      req.headers.get("X-Bearing-Account") !== session.userId
    )
      throw new Fault(409, "Account changed; reload your workspace");
    if (!(await db.account.findUnique({ where: { id: session.userId } })))
      throw new Fault(401, "Unauthorized");
    const userId = session.userId,
      { path } = await context.params,
      [resource, recordId] = path;
    if (path.length > 2) throw new Fault(404, "Not found");
    if (recordId) parse(id, recordId);
    let body: any = {};
    if (req.method !== "GET") {
      const text = await req.text();
      if (Buffer.byteLength(text) > 1000000)
        throw new Fault(413, "Request too large");
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        throw new Fault(400, "Invalid JSON");
      }
    }
    let result: unknown;
    if (resource === "config" && req.method === "GET") result = configuration();
    else if (resource === "chat" && req.method === "POST")
      return await answerStream(userId, parse(chatInput, body), req.signal);
    else if (resource === "conversations" && req.method === "GET")
      result = recordId
        ? await CoachStore.conversation(userId, recordId)
        : await CoachStore.list(userId);
    else if (
      resource === "conversations" &&
      recordId &&
      req.method === "DELETE"
    )
      result = await CoachStore.remove(userId, recordId);
    else if (resource === "memory" && req.method === "GET")
      result = await CoachStore.memories(userId);
    else if (resource === "memory" && req.method === "PUT")
      result = await CoachStore.memory(userId, body);
    else if (resource === "memory" && recordId && req.method === "DELETE")
      result = await CoachStore.deleteMemory(userId, recordId);
    else if (resource === "trust" && !recordId && req.method === "PUT") {
      const principal: Principal = { userId, actor: `user:${userId}` };
      result = await CoachTrust.save(principal, body);
    }
    else if (resource === "preview" && req.method === "POST") {
      const value = parse(
        z.strictObject({
          operations: z.unknown(),
          conversationId: id.optional(),
          id: id.optional(),
          revision: z.number().int().nonnegative().optional(),
        }),
        body,
      );
      result = await preview(userId, value.operations, value);
    } else if (resource === "approve" && req.method === "POST") {
      const value = parse(
        z.strictObject({
          token: z.string().max(900000),
          confirmation: z.string().max(100).default(""),
          approved: z.literal(true),
        }),
        body,
      );
      result = await approve(
        { userId, actor: `user:${userId}` },
        value.token,
        value.confirmation,
      );
    } else if (resource === "reject" && req.method === "POST") {
      const value = parse(
        z.strictObject({ token: z.string().max(900000) }),
        body,
      );
      result = await reject(userId, value.token);
    } else if (resource === "receipts" && recordId && req.method === "GET") {
      result = await db.ledger.findFirst({ where: { userId, id: recordId } });
      if (!result) throw new Fault(404, "Not found");
    } else throw new Fault(404, "Not found");
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Fault)
      return NextResponse.json(
        { error: error.message, ...error.details },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    return NextResponse.json(
      { error: "Coach is unavailable. No proposed changes were applied." },
      { status: 503 },
    );
  }
}
export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
