import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { sessionCookie } from "@/lib/session";
import { V1, Fault, parse, type Principal } from "@/lib/v1/service";
import { V1Account } from "@/lib/v1/service/account";
import { V1Backup } from "@/lib/v1/service/backup";
import { V1Demo } from "@/lib/v1/service/demo";
import { Workflow } from "@/lib/v1/workflow";
import { id, revision } from "@/lib/v1/contracts";
export const dynamic = "force-dynamic";
const edit = z.strictObject({ revision, data: z.unknown() });
async function handle(
  req: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const session = await getUserFromRequest(req);
  if (!session?.twoFactorVerified)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const expected = req.headers.get("X-Bearing-Account");
    if (expected && expected !== session.userId)
      throw new Fault(409, "Account changed; your capture has been retained");
    if (!(await db.account.findUnique({ where: { id: session.userId } })))
      throw new Fault(401, "Unauthorized");
    const p: Principal = {
      userId: session.userId,
      actor: `user:${session.userId}`,
    };
    const { path } = await context.params,
      [resource, recordId, action] = path;
    if (path.length > 3) throw new Fault(404, "Not found");
    if (recordId) parse(id, recordId);
    const method = req.method;
    let body: any = {};
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      const raw = await req.text();
      if (Buffer.byteLength(raw) > 20_000_000)
        throw new Fault(413, "Request too large");
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Fault(400, "Invalid JSON");
      }
    }
    let result: unknown;
    if (resource === "identity" && !recordId && method === "GET")
      result = {
        userId: p.userId,
        email: session.email,
        expiresAt: session.expiresAt,
        timezone: (await Workflow.preferences(p.userId)).timezone ?? null,
      };
    else if (resource === "workspace" && !recordId && method === "GET")
      result = await Workflow.workspace(p.userId);
    else if (resource === "search" && !recordId && method === "GET")
      result = await Workflow.search(
        p.userId,
        Object.fromEntries(new URL(req.url).searchParams),
      );
    else if (resource === "capture" && !recordId && method === "POST") {
      if (expected !== session.userId)
        throw new Fault(409, "Confirm the signed-in account before syncing");
      result = await V1.capture(p, body);
    } else if (
      resource === "items" &&
      recordId &&
      action === "promote" &&
      method === "POST"
    )
      result = await V1.promoteTask(p, recordId, body);
    else if (
      resource === "items" &&
      recordId &&
      action === "place" &&
      method === "POST"
    )
      result = await V1.placeTask(p, recordId, body);
    else if (resource === "preferences" && !recordId && method === "PUT")
      result = await Workflow.setPreferences(p, body);
    else if (
      resource === "journal" &&
      recordId &&
      action === "organize" &&
      method === "POST"
    )
      result = await V1.organize(p, recordId, body);
    else if (
      resource === "journal" &&
      recordId &&
      action === "mention" &&
      method === "POST"
    )
      result = await V1.mention(p, recordId, body);
    else if (
      resource === "journal" &&
      recordId &&
      action === "relate" &&
      method === "POST"
    )
      result = await V1.relateMoment(p, recordId, body);
    else if (resource === "journal" && recordId && !action && method === "PUT")
      result = await V1.editMoment(p, recordId, body);
    else if (resource === "journal" && recordId && !action && method === "DELETE")
      result = await V1.deleteMoment(p, recordId, body);
    else if (
      resource === "journal" &&
      recordId &&
      action === "mention" &&
      method === "DELETE"
    )
      result = await V1.detachMoment(p, recordId, body);
    else if (
      resource === "items" &&
      recordId &&
      action === "occurrence" &&
      method === "PUT"
    )
      result = await V1.habit(p, recordId, body);
    else if (
      resource === "items" &&
      recordId &&
      action === "undo" &&
      method === "POST"
    )
      result = await V1.undoHabit(p, recordId, body);
    else if (resource === "items" && !action) {
      if (method === "GET") {
        if (recordId) result = await V1.item(p.userId, recordId);
        else {
          const params = parse(
            z.strictObject({
              areaId: id.optional(),
              projectId: id.optional(),
              type: z
                .enum([
                  "task",
                  "note",
                  "habit",
                  "person",
                  "bookmark",
                  "event",
                  "goal",
                ])
                .optional(),
              status: z
                .enum([
                  "inbox",
                  "todo",
                  "in_progress",
                  "delegated",
                  "done",
                  "archived",
                ])
                .optional(),
            }),
            Object.fromEntries(new URL(req.url).searchParams),
          );
          result = await V1.items(p.userId, params);
        }
      } else if (method === "POST" && !recordId)
        result = await V1.createItem(p, body);
      else if (method === "PUT" && recordId) {
        const value = parse(edit, body);
        result = await V1.updateItem(p, recordId, value.revision, value.data);
      } else if (method === "DELETE" && recordId)
        result = await V1.deleteItem(p, recordId, body);
      else throw new Fault(405, "Method not allowed");
    } else if (
      resource === "items" &&
      recordId &&
      action === "lease" &&
      method === "POST"
    ) {
      const value = parse(
        z.strictObject({ token: id, open: z.boolean() }),
        body,
      );
      result = await V1.setLease(p, recordId, value.token, value.open);
    } else if (
      resource === "items" &&
      recordId &&
      action === "recurrence" &&
      method === "POST"
    ) {
      const value = parse(edit, body);
      result = await V1.createRecurrence(
        p,
        recordId,
        value.revision,
        value.data,
      );
    } else if (resource === "me" && !recordId && method === "GET")
      result = await V1.me(p.userId);
    else if (
      resource === "projects" &&
      !action &&
      method === "POST" &&
      !recordId
    )
      result = await V1.createProject(p, body);
    else if (
      resource === "projects" &&
      recordId &&
      !action &&
      method === "PUT"
    ) {
      const value = parse(edit, body);
      result = await V1.updateProject(p, recordId, value.revision, value.data);
    } else if (resource === "tags" && !recordId && method === "POST")
      result = await V1.createTag(p, body);
    else if (resource === "links" && !recordId && method === "POST")
      result = await V1.createLink(p, body);
    else if (resource === "links" && recordId && method === "DELETE")
      result = await V1.deleteLink(p, recordId);
    else if (resource === "journal" && !recordId && method === "POST")
      result = await V1.createMoment(p, body);
    else if (resource === "activities" && !recordId && method === "POST")
      result = await V1.createActivity(p, body);
    else if (resource === "activities" && recordId && !action && method === "PUT")
      result = await V1.updateActivity(p, recordId, body);
    else if (
      resource === "activities" &&
      recordId &&
      !action &&
      method === "DELETE"
    )
      result = await V1.deleteActivity(p, recordId, body);
    else if (resource === "reviews" && !recordId && method === "POST")
      result = await V1.createReview(p, body);
    else if (resource === "backup" && !recordId && method === "GET")
      result = await V1Backup.export(p.userId);
    else if (resource === "backup" && !recordId && method === "POST") {
      const value = parse(
        z.strictObject({
          confirmation: z.literal("RESTORE V1 DATA"),
          backup: z.unknown(),
        }),
        body,
      );
      result = await V1Backup.restore(p, value.backup, value.confirmation);
    } else if (resource === "account" && !recordId && method === "DELETE") {
      result = await V1Account.delete(p, body);
      const response = NextResponse.json(result);
      response.headers.set("Set-Cookie", sessionCookie("", 0));
      return response;
    } else if (resource === "reset" && !recordId && method === "POST")
      result = await V1Backup.reset(
        p,
        parse(
          z.strictObject({ confirmation: z.literal("RESET V1 DATA") }),
          body,
        ).confirmation,
      );
    else if (resource === "demo" && !recordId && method === "POST") {
      parse(z.strictObject({}), body);
      result = await V1Demo.seed(p);
    } else if (resource === "demo" && !recordId && method === "DELETE")
      result = await V1Demo.remove(
        p,
        parse(
          z.strictObject({ confirmation: z.literal("REMOVE DEMO DATA") }),
          body,
        ).confirmation,
      );
    else if (method === "GET" && !action) {
      const where = { userId: p.userId, ...(recordId ? { id: recordId } : {}) };
      const readers = {
        projects: () =>
          db.project.findMany({
            where,
            include: { tags: { include: { tag: true } } },
          }),
        tags: () => db.tag.findMany({ where }),
        links: () => db.link.findMany({ where }),
        journal: () =>
          db.journalMoment.findMany({
            where,
            include: { items: true },
            orderBy: { occurredAt: "desc" },
          }),
        activities: () =>
          db.activity.findMany({ where, orderBy: { occurredAt: "desc" } }),
        reviews: () =>
          db.review.findMany({ where, include: { items: true } }),
        recurrences: () =>
          db.recurrence.findMany({ where, include: { occurrences: true } }),
      };
      if (!(resource in readers)) throw new Fault(404, "Not found");
      const rows = await readers[resource as keyof typeof readers]();
      if (recordId && !rows.length) throw new Fault(404, "Not found");
      result = recordId ? rows[0] : rows;
    } else throw new Fault(404, "Not found");
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Fault)
      return NextResponse.json(
        { error: error.message, ...error.details },
        { status: error.status },
      );
    return NextResponse.json({ error: "V1 data unavailable" }, { status: 503 });
  }
}
export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
