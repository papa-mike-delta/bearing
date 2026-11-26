import crypto from "node:crypto";
import { id as idSchema, revision, instant, timezone } from "../contracts";
import { itemDto } from "../client-model";
import type { HabitOccurrence } from "../client-model";
import { markdownTasks } from "../workflow-dates";
import { habitPeriod } from "../connected";
import {
  captureInput,
  captureIntent,
  organizeInput,
  momentEditInput,
} from "../workflow-contracts";
import { canonicalJson } from "../json";
import { Prisma, type Item } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import * as schema from "../contracts";
import { dateInZone, nextOccurrence } from "../dates";
import { validLinkEndpoints } from "../link-policy";
import { LinkProposals } from "../link-proposals";

export type Principal = {
  userId: string;
  actor: `user:${string}` | `agent:${string}`;
  approved?: boolean;
};
export type Tx = Prisma.TransactionClient;
export class Fault extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details: Record<string, unknown> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
/** A Coach batch is not covered at write time. Canonical rows stay unchanged and no apply receipt is written. */
export class TrustDeclined extends Error {
  constructor() {
    super("Trust does not cover this batch");
  }
}
export function parse<T>(contract: z.ZodType<T>, raw: unknown): T {
  const result = contract.safeParse(raw);
  if (!result.success)
    throw new Fault(400, "Invalid V1 input", {
      issues: result.error.issues.map((i) => ({
        path: i.path,
        message: i.message,
      })),
    });
  return result.data;
}
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
function confirmed(id: string, raw: unknown) {
  const revision = z
    .object({ revision: z.number().int().nonnegative() })
    .safeParse(raw);
  return { id, revision: revision.success ? revision.data.revision : 0 };
}
/** A revisioned retry of an existing Link. Caught inside the write transaction so it commits no new success receipt. */
class LinkReplay<T> extends Error {
  constructor(
    readonly value: T,
    readonly receiptId: string,
  ) {
    super("Link already recorded");
  }
}
export async function write<T>(
  principal: Principal,
  operation: string,
  payload: unknown,
  work: (tx: Tx) => Promise<T>,
  transaction?: Tx,
  // Runs after the success receipt is inserted, still inside the same transaction.
  finalize?: (tx: Tx) => Promise<void>,
) {
  const { userId, actor } = principal;
  const run = async (tx: Tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(731909)::text`;
    if (actor.startsWith("user:") && actor !== `user:${userId}`)
      throw new Fault(403, "Actor does not own this account");
    if (actor.startsWith("agent:") && !principal.approved)
      throw new Fault(403, "An approved change set is required");
    try {
      const value = await work(tx);
      const receipt = await tx.ledger.create({
        data: {
          userId,
          actor,
          operation,
          payload: JSON.stringify(payload ?? null),
          status: "success",
          receipt: JSON.stringify({ ok: true, value }),
        },
      });
      if (finalize) await finalize(tx);
      return { ok: true as const, value, receiptId: receipt.id };
    } catch (error) {
      if (error instanceof LinkReplay)
        return {
          ok: true as const,
          value: error.value as T,
          receiptId: error.receiptId,
        };
      throw error;
    }
  };
  // Composition shares writes and receipts; only the outer transaction records refusal.
  if (transaction) return run(transaction);
  try {
    return await db.$transaction(run, { timeout: 30_000 });
  } catch (error) {
    if (error instanceof TrustDeclined) throw error;
    const fault =
      error instanceof Fault
        ? error
        : error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ? new Fault(409, "Record already exists")
          : error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === "P2003"
            ? new Fault(400, "Invalid owned relationship")
            : new Fault(
                500,
                "V1 operation failed; no changes were saved",
                {},
                { cause: error },
              );
    const receipt = await db.ledger.create({
      data: {
        userId,
        actor,
        operation,
        payload: JSON.stringify(payload ?? null),
        status: "refused",
        receipt: JSON.stringify({
          ok: false,
          error: fault.message,
          ...fault.details,
        }),
      },
    });
    throw new Fault(
      fault.status,
      fault.message,
      { ...fault.details, receiptId: receipt.id },
      { cause: fault.cause },
    );
  }
}
export async function owned(
  tx: Tx,
  userId: string,
  kind:
    | "item"
    | "project"
    | "tag"
    | "journalMoment"
    | "review"
    | "recurrence"
    | "conversation",
  id: string,
) {
  // Keep a narrow delegate dispatch; every lookup includes ownership.
  const found = await (tx[kind] as typeof tx.item).findFirst({
    where: { userId, id },
  });
  if (!found) throw new Fault(404, "Not found");
  return found;
}
export async function guardOpen(tx: Tx, p: Principal, itemIds?: string[]) {
  if (p.actor.startsWith("user:")) return;
  const lease = await tx.lease.findFirst({
    where: {
      userId: p.userId,
      expiresAt: { gt: new Date() },
      ...(itemIds ? { itemId: { in: itemIds } } : {}),
    },
  });
  if (lease) throw new Fault(423, "Item is open", { itemId: lease.itemId });
}
async function cap(tx: Tx, p: Principal, kind: "item" | "link") {
  const limit = kind === "item" ? 20 : 50;
  const count = await tx.ledger.count({
    where: {
      userId: p.userId,
      actor: p.actor,
      operation: { in: [`${kind}.create`, `v1.${kind}.create`] },
      status: "success",
      createdAt: { gt: new Date(Date.now() - 3600_000) },
    },
  });
  if (count >= limit) throw new Fault(429, "Write cap reached", { limit });
}
async function validTags(tx: Tx, userId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (
    (await tx.tag.count({ where: { userId, id: { in: unique } } })) !==
    unique.length
  )
    throw new Fault(404, "Not found");
  return unique;
}
async function itemRelations(
  tx: Tx,
  userId: string,
  value: schema.CanonicalItem,
) {
  if (value.projectId) await owned(tx, userId, "project", value.projectId);
  if (value.delegateId) {
    const person = await owned(tx, userId, "item", value.delegateId);
    if (person.type !== "person")
      throw new Fault(400, "Delegate must be a Person");
  }
  return validTags(tx, userId, value.tagIds);
}
function scalars(value: schema.CanonicalItem) {
  const { tagIds: _, ...rest } = value;
  return {
    ...rest,
    metadata: json(value.metadata),
    dueAt: value.dueAt && new Date(value.dueAt),
    scheduledAt: value.scheduledAt && new Date(value.scheduledAt),
    startAt: value.startAt && new Date(value.startAt),
    endAt: value.endAt && new Date(value.endAt),
    followUpAt: value.followUpAt && new Date(value.followUpAt),
  };
}
const itemInclude = {
  tags: { include: { tag: true } },
  project: { include: { tags: { include: { tag: true } } } },
  selfProfile: true,
} as const;
export function withAreas(
  item: Prisma.ItemGetPayload<{ include: typeof itemInclude }>,
) {
  return {
    ...item,
    directAreas: item.tags
      .filter((t) => t.tag.kind === "area")
      .map((t) => t.tag),
    inheritedAreas:
      item.project?.tags
        .filter((t) => t.tag.kind === "area")
        .map((t) => t.tag) ?? [],
  };
}
const occurrenceInput = z.strictObject({
  revision,
  occurredAt: instant,
  timezone,
  checklist: z.array(z.boolean()).max(500),
  value: z.number().finite().nonnegative(),
  complete: z.boolean(),
});

const includeMoment = { items: { include: { item: true } } } as const;
async function originalReceipt(
  tx: Tx,
  userId: string,
  operation: string,
  parts: string[],
) {
  const rows = await tx.ledger.findMany({
    where: {
      userId,
      operation,
      status: "success",
      receipt: { contains: parts[0] },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  return rows.find((row) => parts.every((part) => row.receipt.includes(part)));
}
export class V1 {
  static mention(p: Principal, momentId: string, raw: unknown) {
    return write(
      p,
      "v1.moment.mention",
      { momentId, data: raw },
      async (tx) => {
        const { itemId, revision: expectedRevision } = parse(
          z.strictObject({ itemId: schema.id, revision }),
          raw,
        );
        const moment = await owned(tx, p.userId, "journalMoment", momentId);
        if (moment.revision !== expectedRevision)
          throw new Fault(409, "Journal entry changed", {
            currentRevision: moment.revision,
          });
        await owned(tx, p.userId, "item", itemId);
        await guardOpen(tx, p, [itemId]);
        const reference = await tx.momentItem.upsert({
          where: {
            userId_momentId_itemId_relation: {
              userId: p.userId,
              momentId,
              itemId,
              relation: "mention",
            },
          },
          create: { userId: p.userId, momentId, itemId, relation: "mention" },
          update: {},
        });
        await tx.journalMoment.update({
          where: { userId_id: { userId: p.userId, id: momentId } },
          data: { revision: { increment: 1 }, demoBatchId: null },
        });
        return reference;
      },
    );
  }

  static relateMoment(p: Principal, momentId: string, raw: unknown) {
    return write(
      p,
      "v1.moment.relate",
      { momentId, data: raw },
      async (tx) => {
        const value = parse(
          z.strictObject({
            itemId: schema.id,
            revision,
            relation: z.enum(["mention", "located_at"]),
          }),
          raw,
        );
        const moment = await owned(tx, p.userId, "journalMoment", momentId);
        const item = await owned(tx, p.userId, "item", value.itemId);
        if (value.relation === "mention" && item.type !== "person")
          throw new Fault(400, "A Journal mention names a Person");
        if (
          value.relation === "located_at" &&
          (item.type !== "bookmark" ||
            !LinkProposals.capturedPlace(item.metadata, momentId))
        )
          throw new Fault(400, "This entry was not captured at that Place");
        await guardOpen(tx, p, [value.itemId]);
        const existing = await tx.momentItem.findUnique({
          where: {
            userId_momentId_itemId_relation: {
              userId: p.userId,
              momentId,
              itemId: value.itemId,
              relation: value.relation,
            },
          },
        });
        if (existing) {
          const prior = await originalReceipt(tx, p.userId, "v1.moment.relate", [
            existing.momentId,
            existing.itemId,
            `"relation":"${value.relation}"`,
          ]);
          if (!prior) throw new Fault(409, "Record already exists");
          throw new LinkReplay(existing, prior.id);
        }
        if (moment.revision !== value.revision)
          throw new Fault(409, "Journal entry changed", {
            currentRevision: moment.revision,
          });
        const reference = await tx.momentItem.create({
          data: {
            userId: p.userId,
            momentId,
            itemId: value.itemId,
            relation: value.relation,
          },
        });
        await tx.journalMoment.update({
          where: { userId_id: { userId: p.userId, id: momentId } },
          data: { revision: { increment: 1 }, demoBatchId: null },
        });
        return reference;
      },
    );
  }

  static placeTask(p: Principal, itemId: string, raw: unknown) {
    return write(p, "v1.task.place", { itemId, data: raw }, async (tx) => {
      const value = parse(
        z.strictObject({ projectId: schema.id, revision }),
        raw,
      );
      const item = await owned(tx, p.userId, "item", itemId);
      if (item.type !== "task") throw new Fault(400, "Choose a Task");
      await owned(tx, p.userId, "project", value.projectId);
      await guardOpen(tx, p, [itemId]);
      if (item.projectId === value.projectId) {
        const prior = await originalReceipt(tx, p.userId, "v1.task.place", [
          `"id":"${item.id}"`,
        ]);
        if (!prior) throw new Fault(409, "Record already exists");
        throw new LinkReplay(item, prior.id);
      }
      if (item.revision !== value.revision)
        throw new Fault(409, "Item changed", {
          currentRevision: item.revision,
        });
      return tx.item.update({
        where: { userId_id: { userId: p.userId, id: itemId } },
        data: {
          projectId: value.projectId,
          revision: { increment: 1 },
          demoBatchId: null,
        },
      });
    });
  }

  static habit(p: Principal, itemId: string, raw: unknown) {
    return write(
      p,
      "v1.habit.occurrence",
      { itemId, data: raw },
      async (tx) => {
        const input = parse(occurrenceInput, raw);
        const item = await owned(tx, p.userId, "item", itemId);
        if (item.type !== "habit" || item.status === "archived")
          throw new Fault(400, "Choose an active Habit");
        // Habit timezone anchors cadence, independent of which device records the occurrence.
        const cadence =
          (item.metadata as { cadence?: string }).cadence || "daily";
        const period = habitPeriod(input.occurredAt, item.timezone, cadence);
        const key = `habit.${itemId}.${cadence}.${period}`;
        const previous = await tx.preference.findUnique({
          where: { userId_key: { userId: p.userId, key } },
        });
        const saved = previous?.value as HabitOccurrence | undefined;
        if (saved?.completed) {
          if (
            input.complete &&
            saved.value === input.value &&
            JSON.stringify(saved.checklist) === JSON.stringify(input.checklist)
          )
            return saved;
          throw new Fault(
            409,
            "This occurrence is complete; its history is retained",
          );
        }
        if ((saved?.revision || 0) !== input.revision)
          throw new Fault(409, "Habit occurrence changed", {
            currentRevision: saved?.revision || 0,
          });
        const content = saved?.content ?? item.content;
        if (input.checklist.length !== markdownTasks(content).length)
          throw new Fault(400, "Checklist changed; reload the occurrence");
        const value: HabitOccurrence = {
          revision: input.revision + 1,
          period,
          content,
          checklist: input.checklist,
          value: input.value,
          completed: input.complete,
        };
        if (input.complete)
          await V1.createActivity(
            p,
            {
              kind: "habit_completion",
              clientId: `habit_${itemId}_${cadence}_${period}`,
              itemId,
              occurredAt: input.occurredAt,
              timezone: item.timezone,
              data: {
                value: input.value,
                checklist: input.checklist,
                content,
                period,
              },
            },
            tx,
          );
        await tx.preference.upsert({
          where: { userId_key: { userId: p.userId, key } },
          create: { userId: p.userId, key, value },
          update: { value },
        });
        return value;
      },
    );
  }
  static capture(p: Principal, raw: unknown) {
    return write(p, "v1.capture", raw, async (tx) => {
      const value = parse(captureInput, raw),
        hash = crypto
          .createHash("sha256")
          .update(JSON.stringify(value))
          .digest("hex");
      const buried = await tx.momentTombstone.findUnique({
        where: {
          userId_clientId: { userId: p.userId, clientId: value.clientId },
        },
      });
      if (buried)
        return {
          id: buried.momentId,
          userId: p.userId,
          clientId: value.clientId,
          revision: buried.revision,
          text: "",
          occurredAt: new Date(value.occurredAt),
          capturedAt: new Date(value.capturedAt),
          createdAt: new Date(0),
          updatedAt: new Date(0),
          localDate: dateInZone(value.occurredAt, value.timezone),
          timezone: value.timezone,
          needsOrganization: false,
          intendedType: null,
          ingestHash: hash,
          demoBatchId: null,
          items: [],
        } as Prisma.JournalMomentGetPayload<{ include: typeof includeMoment }>;
      const previous = await tx.journalMoment.findUnique({
        where: {
          userId_clientId: { userId: p.userId, clientId: value.clientId },
        },
        include: includeMoment,
      });
      if (previous) {
        if (previous.ingestHash !== hash)
          throw new Fault(
            409,
            "Capture key already used for different text or time",
          );
        return previous;
      }
      const intent = value.place
        ? {
            kind: "item" as const,
            item: {
              type: "bookmark" as const,
              template: "place",
              title:
                value.text
                  .trim()
                  .replace(/^\/place\s*/i, "")
                  .split("\n")[0]
                  .slice(0, 300) || "Captured place",
              content: value.text,
              status: "inbox" as const,
              metadata: {
                version: 1 as const,
                category: "place" as const,
                ...value.place,
              },
            },
          }
        : captureIntent(value.text, value.intendedType);
      const { value: moment } = await V1.createMoment(
        p,
        {
          clientId: value.clientId,
          text: value.text,
          occurredAt: value.occurredAt,
          timezone: value.timezone,
          intendedType: value.intendedType,
          items: (value.mentionIds || []).map((itemId) => ({
            itemId,
            relation: "mention",
          })),
        },
        tx,
      );
      if (intent.kind === "item") {
        const itemInput = {
          ...intent.item,
          timezone: value.timezone,
          ...(value.place
            ? {
                metadata: {
                  ...intent.item.metadata,
                  capturedMomentId: moment.id,
                },
              }
            : {}),
        };
        const { value: item } = await V1.createItem(p, itemInput, tx);
        await tx.momentItem.create({
          data: {
            userId: p.userId,
            momentId: moment.id,
            itemId: item.id,
            relation: "reference",
          },
        });
      } else if (intent.kind === "check_in")
        await V1.createActivity(
          p,
          {
            clientId: value.clientId,
            occurredAt: value.occurredAt,
            timezone: value.timezone,
            kind: "check_in",
            data: intent.data,
          },
          tx,
        );
      return tx.journalMoment.update({
        where: { id: moment.id },
        data: {
          capturedAt: new Date(value.capturedAt),
          ingestHash: hash,
          needsOrganization: intent.kind !== "check_in",
        },
        include: includeMoment,
      });
    });
  }
  static organize(p: Principal, id: string, raw: unknown, transaction?: Tx) {
    return write(
      p,
      "v1.moment.organize",
      { id, data: raw },
      async (tx) => {
        const value = parse(organizeInput, raw);
        await owned(tx, p.userId, "journalMoment", id);
        const moment = await tx.journalMoment.findUniqueOrThrow({
          where: { id },
          include: includeMoment,
        });
        // A repeated promotion returns its canonical reference, never a duplicate Task.
        if (value.item && moment.items.some((r) => r.relation === "reference"))
          return moment;
        if (moment.revision !== value.revision)
          throw new Fault(409, "Journal entry changed", {
            currentRevision: moment.revision,
          });
        if (value.item) {
          const { value: item } = await V1.createItem(p, value.item, tx);
          await tx.momentItem.create({
            data: {
              userId: p.userId,
              momentId: id,
              itemId: item.id,
              relation: "reference",
            },
          });
        }
        if (!value.item && value.resolved) {
          for (const ref of moment.items.filter(
            (r) => r.relation === "reference" && r.item.status === "inbox",
          )) {
            const tags = await tx.itemTag.findMany({
              where: { userId: p.userId, itemId: ref.itemId },
            });
            const dto = itemDto({
              ...JSON.parse(JSON.stringify(ref.item)),
              tagIds: tags.map((t) => t.tagId),
            });
            await V1.updateItem(
              p,
              ref.itemId,
              ref.item.revision,
              { ...dto, status: "todo" },
              tx,
            );
          }
        }
        return tx.journalMoment.update({
          where: { id },
          data: {
            needsOrganization: !value.resolved,
            revision: { increment: 1 },
            demoBatchId: null,
          },
          include: includeMoment,
        });
      },
      transaction,
    );
  }
  static promoteTask(p: Principal, id: string, raw: unknown) {
    return write(p, "v1.checklist.promote", { id, data: raw }, async (tx) => {
      const value = parse(
        z.strictObject({
          revision,
          line: z.number().int().nonnegative(),
          clientId: idSchema,
        }),
        raw,
      );
      const key = `promotion:${value.clientId}`,
        previous = await tx.preference.findUnique({
          where: { userId_key: { userId: p.userId, key } },
        });
      if (previous) {
        const saved = previous.value as {
          parentId: string;
          line: number;
          itemId: string;
        };
        if (saved.parentId !== id || saved.line !== value.line)
          throw new Fault(409, "Promotion key already used");
        return { itemId: saved.itemId };
      }
      const parent = await owned(tx, p.userId, "item", id);
      if (parent.revision !== value.revision)
        throw new Fault(409, "Item changed", {
          currentRevision: parent.revision,
        });
      await guardOpen(tx, p, [id]);
      if (parent.type !== "task")
        throw new Fault(400, "Only Task checklist steps can be promoted");
      const step = markdownTasks(parent.content).find(
        (task) => task.index === value.line,
      );
      if (!step || !step.text.trim() || step.text.trim().length > 300)
        throw new Fault(400, "Choose a checklist step with a short Task title");
      const tags = await tx.itemTag.findMany({
        where: { userId: p.userId, itemId: id },
      });
      const { value: child } = await V1.createItem(
        p,
        {
          type: "task",
          title: step.text.trim(),
          status: step.checked ? "done" : "todo",
          tagIds: tags.map((t) => t.tagId),
          timezone: parent.timezone,
        },
        tx,
      );
      const lines = parent.content.split("\n"),
        prefix = lines[value.line].match(/^(\s*(?:[-*+]|\d+\.)\s+)/)![1];
      lines[value.line] =
        `${prefix}[${step.text.replace(/[\[\]]/g, "")}](/app/library/${child.id})`;
      await V1.updateItem(
        p,
        id,
        value.revision,
        {
          ...itemDto({
            ...JSON.parse(JSON.stringify(parent)),
            tagIds: tags.map((t) => t.tagId),
          }),
          content: lines.join("\n"),
        },
        tx,
      );
      await tx.preference.create({
        data: {
          userId: p.userId,
          key,
          value: { parentId: id, line: value.line, itemId: child.id },
        },
      });
      return { itemId: child.id };
    });
  }
  static editMoment(p: Principal, id: string, raw: unknown, transaction?: Tx) {
    return write(
      p,
      "v1.moment.update",
      { id, data: raw },
      async (tx) => {
        const value = parse(momentEditInput, raw),
          row = await owned(tx, p.userId, "journalMoment", id);
        if (row.revision !== value.revision)
          throw new Fault(409, "Journal entry changed", {
            currentRevision: row.revision,
          });
        return tx.journalMoment.update({
          where: { id },
          data: {
            text: value.text,
            occurredAt: new Date(value.occurredAt),
            localDate: dateInZone(value.occurredAt, value.timezone),
            timezone: value.timezone,
            revision: { increment: 1 },
            demoBatchId: null,
          },
          include: includeMoment,
        });
      },
      transaction,
    );
  }

  static async items(
    userId: string,
    filters: {
      areaId?: string;
      status?: string;
      projectId?: string;
      type?: string;
      limit?: number;
    } = {},
  ) {
    const rows = await db.item.findMany({
      where: {
        userId,
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
        ...(filters.status
          ? {
              status:
                filters.status === "in_progress"
                  ? { in: ["in_progress", "delegated"] }
                  : filters.status,
            }
          : {}),
        ...(filters.areaId
          ? {
              OR: [
                {
                  tags: {
                    some: { tagId: filters.areaId, tag: { kind: "area" } },
                  },
                },
                {
                  project: {
                    tags: {
                      some: { tagId: filters.areaId, tag: { kind: "area" } },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      ...(filters.limit
        ? { take: Math.max(1, Math.min(50, filters.limit)) }
        : {}),
      include: itemInclude,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(withAreas);
  }
  static async item(userId: string, id: string) {
    const row = await db.item.findFirst({
      where: { userId, id },
      include: itemInclude,
    });
    if (!row) throw new Fault(404, "Not found");
    return withAreas(row);
  }
  static createItem(p: Principal, raw: unknown, transaction?: Tx) {
    return write(
      p,
      "v1.item.create",
      raw,
      async (tx) => {
        const value = parse(schema.itemInput, raw),
          tagIds = await itemRelations(tx, p.userId, value);
        await cap(tx, p, "item");
        const row = await tx.item.create({
          data: {
            ...scalars(value),
            userId: p.userId,
            completedAt: value.status === "done" ? new Date() : null,
            tags: { create: tagIds.map((tagId) => ({ tagId })) },
          },
          include: itemInclude,
        });
        return withAreas(row);
      },
      transaction,
    );
  }
  static updateItem(
    p: Principal,
    id: string,
    revision: number,
    raw: unknown,
    transaction?: Tx,
  ) {
    return write(
      p,
      "v1.item.update",
      { id, revision, changes: raw },
      async (tx) => {
        parse(schema.revision, revision);
        const previous = await owned(tx, p.userId, "item", id);
        if (previous.revision !== revision)
          throw new Fault(409, "Item changed", {
            currentRevision: previous.revision,
          });
        await guardOpen(tx, p, [id]);
        const value = parse(schema.itemInput, raw);
        const me = await tx.selfProfile.findUnique({
          where: { userId: p.userId },
        });
        if (
          me?.itemId === id &&
          (value.status === "archived" || value.type !== "person")
        )
          throw new Fault(400, "Me must remain an unarchived Person");
        const tags = await itemRelations(tx, p.userId, value);
        if (value.type !== previous.type) {
          const hasHistory = await tx.taskOccurrence.count({
            where: { userId: p.userId, itemId: id },
          });
          const usedAsDelegate = await tx.item.count({
            where: { userId: p.userId, delegateId: id },
          });
          const activities = await tx.activity.findMany({
            where: { userId: p.userId, itemId: id },
          });
          const expected = {
            habit_completion: "habit",
            task_completion: "task",
            interaction: "person",
          };
          if (
            hasHistory ||
            (usedAsDelegate && value.type !== "person") ||
            activities.some(
              (a) =>
                expected[a.kind as keyof typeof expected] &&
                expected[a.kind as keyof typeof expected] !== value.type,
            )
          )
            throw new Fault(
              400,
              "Existing history or delegation requires this Item type",
            );
        }
        const links = await tx.link.findMany({
          where: { userId: p.userId, OR: [{ fromId: id }, { toId: id }] },
          include: { from: true, to: true },
        });
        if (
          links.some(
            (link) =>
              !validLinkEndpoints(
                link.type,
                link.fromId === id ? value : link.from,
                link.toId === id ? value : link.to,
              ),
          )
        )
          throw new Fault(
            400,
            "Existing semantic Links require compatible Item types",
          );
        if (
          previous.status === "done" &&
          value.status !== "done" &&
          (await tx.taskOccurrence.findFirst({
            where: { userId: p.userId, itemId: id, completedAt: { not: null } },
          }))
        )
          throw new Fault(
            400,
            "Completed recurring occurrences are immutable history",
          );
        await tx.itemTag.deleteMany({
          where: { userId: p.userId, itemId: id },
        });
        const row = await tx.item.update({
          where: { userId_id: { userId: p.userId, id } },
          data: {
            ...scalars(value),
            completedAt:
              value.status === "done"
                ? (previous.completedAt ?? new Date())
                : null,
            revision: { increment: 1 },
            demoBatchId: null,
            tags: { create: tags.map((tagId) => ({ tagId })) },
          },
          include: itemInclude,
        });
        if (
          previous.status !== "done" &&
          value.status === "done" &&
          row.type === "task"
        ) {
          const activity = {
            clientId: `task_${id}_${row.revision}`,
            kind: "task_completion",
            itemId: id,
            occurredAt: row.completedAt!.toISOString(),
            timezone: row.timezone,
            data: {},
          };
          await write(
            p,
            "v1.activity.create",
            activity,
            (tx) =>
              tx.activity.create({
                data: {
                  ...activity,
                  userId: p.userId,
                  occurredAt: row.completedAt!,
                  localDate: dateInZone(row.completedAt!, row.timezone),
                },
              }),
            tx,
          );
          await V1.completeOccurrence(tx, p, row);
        }
        return withAreas(row);
      },
      transaction,
    );
  }
  static async me(userId: string) {
    const self = await db.selfProfile.findUniqueOrThrow({
      where: { userId },
    });
    return V1.item(userId, self.itemId);
  }
  static createProject(p: Principal, raw: unknown, transaction?: Tx) {
    return write(
      p,
      "v1.project.create",
      raw,
      async (tx) => {
        const value = parse(schema.projectInput, raw),
          tagIds = await validTags(tx, p.userId, value.tagIds);
        const { tagIds: _, ...data } = value;
        return tx.project.create({
          data: {
            ...data,
            userId: p.userId,
            tags: { create: tagIds.map((tagId) => ({ tagId })) },
          },
          include: { tags: { include: { tag: true } } },
        });
      },
      transaction,
    );
  }
  static updateProject(
    p: Principal,
    id: string,
    revision: number,
    raw: unknown,
    transaction?: Tx,
  ) {
    return write(
      p,
      "v1.project.update",
      { id, revision, changes: raw },
      async (tx) => {
        parse(schema.revision, revision);
        const previous = await owned(tx, p.userId, "project", id);
        if (previous.revision !== revision)
          throw new Fault(409, "Project changed", {
            currentRevision: previous.revision,
          });
        await guardOpen(
          tx,
          p,
          (
            await tx.item.findMany({
              where: { userId: p.userId, projectId: id },
              select: { id: true },
            })
          ).map((i) => i.id),
        );
        const value = parse(schema.projectInput, raw),
          tagIds = await validTags(tx, p.userId, value.tagIds);
        const { tagIds: _, ...data } = value;
        await tx.projectTag.deleteMany({
          where: { userId: p.userId, projectId: id },
        });
        return tx.project.update({
          where: { userId_id: { userId: p.userId, id } },
          data: {
            ...data,
            revision: { increment: 1 },
            demoBatchId: null,
            tags: { create: tagIds.map((tagId) => ({ tagId })) },
          },
        });
      },
      transaction,
    );
  }
  static createTag(p: Principal, raw: unknown, transaction?: Tx) {
    return write(
      p,
      "v1.tag.create",
      raw,
      async (tx) =>
        tx.tag.create({
          data: { ...parse(schema.tagInput, raw), userId: p.userId },
        }),
      transaction,
    );
  }
  static createLink(p: Principal, raw: unknown, transaction?: Tx) {
    return write(
      p,
      "v1.link.create",
      raw,
      async (tx) => {
        const value = parse(schema.linkInput, raw),
          from = await owned(tx, p.userId, "item", value.fromId),
          to = await owned(tx, p.userId, "item", value.toId);
        const { fromRevision, toRevision, ...link } = value;
        const revisioned =
          fromRevision !== undefined || toRevision !== undefined;
        if (revisioned) {
          const existing = await tx.link.findUnique({
            where: {
              userId_fromId_toId_type: {
                userId: p.userId,
                fromId: link.fromId,
                toId: link.toId,
                type: link.type,
              },
            },
          });
          if (existing) {
            const prior = await tx.ledger.findFirst({
              where: {
                userId: p.userId,
                operation: "v1.link.create",
                status: "success",
                receipt: { contains: `"id":"${existing.id}"` },
              },
              orderBy: { createdAt: "asc" },
            });
            if (!prior) throw new Fault(409, "Record already exists");
            throw new LinkReplay(existing, prior.id);
          }
          if (fromRevision !== undefined && from.revision !== fromRevision)
            throw new Fault(409, "Item changed", {
              currentRevision: from.revision,
            });
          if (toRevision !== undefined && to.revision !== toRevision)
            throw new Fault(409, "Item changed", {
              currentRevision: to.revision,
            });
        }
        await guardOpen(tx, p, [value.fromId, value.toId]);
        await cap(tx, p, "link");
        if (!validLinkEndpoints(value.type, from, to))
          throw new Fault(400, "Invalid semantic Link endpoints");
        return tx.link.create({ data: { ...link, userId: p.userId } });
      },
      transaction,
    );
  }
  static deleteLink(p: Principal, id: string, transaction?: Tx) {
    return write(
      p,
      "v1.link.delete",
      { id },
      async (tx) => {
        const row = await tx.link.findFirst({
          where: { id, userId: p.userId },
        });
        if (!row) throw new Fault(404, "Not found");
        await guardOpen(tx, p, [row.fromId, row.toId]);
        await tx.link.delete({ where: { id } });
        return { deleted: true };
      },
      transaction,
    );
  }
  static createMoment(p: Principal, raw: unknown, transaction?: Tx) {
    return write(
      p,
      "v1.moment.create",
      raw,
      async (tx) => {
        const value = parse(schema.momentInput, raw),
          buried = await tx.momentTombstone.findUnique({
            where: {
              userId_clientId: { userId: p.userId, clientId: value.clientId },
            },
          });
        if (buried) throw new Fault(409, "Journal entry was deleted");
        const existing = await tx.journalMoment.findUnique({
            where: {
              userId_clientId: { userId: p.userId, clientId: value.clientId },
            },
          });
        if (existing) {
          if (
            existing.text !== value.text ||
            +existing.occurredAt !== Date.parse(value.occurredAt) ||
            existing.timezone !== value.timezone
          )
            throw new Fault(
              409,
              "Idempotency key already used for different capture",
            );
          return existing;
        }
        for (const ref of value.items)
          await owned(tx, p.userId, "item", ref.itemId);
        const { items, ...data } = value;
        return tx.journalMoment.create({
          data: {
            ...data,
            userId: p.userId,
            occurredAt: new Date(value.occurredAt),
            localDate: dateInZone(value.occurredAt, value.timezone),
            items: { create: items.map((ref) => ({ ...ref })) },
          },
        });
      },
      transaction,
    );
  }
  static createActivity(p: Principal, raw: unknown, transaction?: Tx) {
    return write(
      p,
      "v1.activity.create",
      raw,
      async (tx) => {
        const value = parse(schema.activityInput, raw),
          existing = await tx.activity.findUnique({
            where: {
              userId_clientId: { userId: p.userId, clientId: value.clientId },
            },
          });
        if (existing) {
          if (
            existing.kind !== value.kind ||
            +existing.occurredAt !== Date.parse(value.occurredAt) ||
            existing.itemId !== value.itemId ||
            existing.timezone !== value.timezone ||
            canonicalJson(existing.data) !== canonicalJson(value.data)
          )
            throw new Fault(
              409,
              "Idempotency key already used for different Activity",
            );
          return existing;
        }
        if (value.kind === "task_completion")
          throw new Fault(
            400,
            "Task completion is recorded by saving the Task",
          );
        if (value.itemId) {
          const item = await owned(tx, p.userId, "item", value.itemId);
          if (value.kind === "focus" && !["task", "habit"].includes(item.type))
            throw new Fault(400, "Focus can reference a Task or Habit");
          const required = {
            habit_completion: "habit",
            task_completion: "task",
            interaction: "person",
          }[value.kind as string];
          if (required && item.type !== required)
            throw new Fault(400, "Activity has incompatible Item type");
        }
        return tx.activity.create({
          data: {
            ...value,
            data: json(value.data),
            userId: p.userId,
            occurredAt: new Date(value.occurredAt),
            localDate: dateInZone(value.occurredAt, value.timezone),
          },
        });
      },
      transaction,
    );
  }
  static createReview(p: Principal, raw: unknown, transaction?: Tx) {
    return write(
      p,
      "v1.review.create",
      raw,
      async (tx) => {
        const { itemIds, ...value } = parse(schema.reviewInput, raw);
        for (const id of itemIds) await owned(tx, p.userId, "item", id);
        return tx.review.create({
          data: {
            ...value,
            userId: p.userId,
            prompts: json(value.prompts),
            items: {
              create: [...new Set(itemIds)].map((itemId) => ({ itemId })),
            },
          },
        });
      },
      transaction,
    );
  }
  static setLease(p: Principal, itemId: string, token: string, open: boolean) {
    return write(p, "v1.item.lease", { itemId, token, open }, async (tx) => {
      if (p.actor !== `user:${p.userId}`)
        throw new Fault(403, "Only users may hold editor leases");
      parse(schema.id, token);
      await owned(tx, p.userId, "item", itemId);
      const key = { userId: p.userId, itemId, token };
      if (open)
        await tx.lease.upsert({
          where: { userId_itemId_token: key },
          create: { ...key, expiresAt: new Date(Date.now() + 90_000) },
          update: { expiresAt: new Date(Date.now() + 90_000) },
        });
      else await tx.lease.deleteMany({ where: key });
      return { open };
    });
  }
  static createRecurrence(
    p: Principal,
    itemId: string,
    revision: number,
    raw: unknown,
  ) {
    return write(
      p,
      "v1.recurrence.create",
      { itemId, revision, rule: raw },
      async (tx) => {
        const rule = parse(schema.recurrenceRule, raw),
          item = await owned(tx, p.userId, "item", itemId);
        parse(schema.revision, revision);
        if (item.revision !== revision)
          throw new Fault(409, "Item changed", {
            currentRevision: item.revision,
          });
        if (item.type !== "task" || item.status === "done" || !item.scheduledAt)
          throw new Fault(
            400,
            "Recurrence requires an unfinished scheduled Task",
          );
        await guardOpen(tx, p, [itemId]);
        const recurrence = await tx.recurrence.create({
          data: { userId: p.userId, itemId, rule: json(rule) },
        });
        await tx.taskOccurrence.create({
          data: {
            userId: p.userId,
            recurrenceId: recurrence.id,
            itemId,
            scheduledAt: item.scheduledAt,
          },
        });
        await tx.item.update({
          where: { id: itemId },
          data: { revision: { increment: 1 }, demoBatchId: null },
        });
        return recurrence;
      },
    );
  }
  static deleteItem(p: Principal, id: string, raw: unknown, transaction?: Tx) {
    return write(
      p,
      "v1.item.delete",
      confirmed(id, raw),
      async (tx) => {
        const expected = parse(
          z.strictObject({
            revision,
            confirmation: z.literal(schema.deleteItemConfirmation),
          }),
          raw,
        );
        const item = await owned(tx, p.userId, "item", id);
        if (item.revision !== expected.revision)
          throw new Fault(409, "Item changed", {
            currentRevision: item.revision,
          });
        const me = await tx.selfProfile.findUnique({
          where: { userId: p.userId },
        });
        if (me?.itemId === id) throw new Fault(400, "Me cannot be deleted");
        await guardOpen(tx, p, [id]);
        const activities = await tx.activity.findMany({
          where: { userId: p.userId, itemId: id },
        });
        for (const activity of activities)
          await V1.deleteActivity(
            p,
            activity.id,
            { revision: activity.revision },
            tx,
          );
        const mentions = await tx.momentItem.findMany({
          where: { userId: p.userId, itemId: id },
        });
        for (const mention of mentions) {
          await tx.momentItem.delete({
            where: {
              userId_momentId_itemId_relation: {
                userId: p.userId,
                momentId: mention.momentId,
                itemId: id,
                relation: mention.relation,
              },
            },
          });
          await tx.journalMoment.update({
            where: { userId_id: { userId: p.userId, id: mention.momentId } },
            data: { revision: { increment: 1 }, demoBatchId: null },
          });
        }
        const reviews = await tx.reviewItem.findMany({
          where: { userId: p.userId, itemId: id },
        });
        if (reviews.length) {
          await tx.reviewItem.deleteMany({
            where: { userId: p.userId, itemId: id },
          });
          await tx.review.updateMany({
            where: {
              userId: p.userId,
              id: { in: [...new Set(reviews.map((row) => row.reviewId))] },
            },
            data: { revision: { increment: 1 } },
          });
        }
        const delegated = await tx.item.findMany({
          where: { userId: p.userId, delegateId: id },
        });
        for (const task of delegated) {
          const tags = await tx.itemTag.findMany({
            where: { userId: p.userId, itemId: task.id },
          });
          await V1.updateItem(
            p,
            task.id,
            task.revision,
            {
              ...itemDto({
                ...JSON.parse(JSON.stringify(task)),
                tagIds: tags.map((tag) => tag.tagId),
              }),
              delegateId: null,
              status: task.status === "delegated" ? "todo" : task.status,
            },
            tx,
          );
        }
        const anchored = await tx.recurrence.findUnique({
          where: { userId_itemId: { userId: p.userId, itemId: id } },
        });
        if (anchored) {
          await tx.taskOccurrence.deleteMany({
            where: { userId: p.userId, recurrenceId: anchored.id },
          });
          await tx.recurrence.delete({ where: { id: anchored.id } });
        }
        await tx.taskOccurrence.updateMany({
          where: { userId: p.userId, nextItemId: id },
          data: { nextItemId: null },
        });
        await tx.taskOccurrence.deleteMany({
          where: { userId: p.userId, itemId: id },
        });
        const links = await tx.link.findMany({
          where: { userId: p.userId, OR: [{ fromId: id }, { toId: id }] },
        });
        for (const link of links) await V1.deleteLink(p, link.id, tx);
        await tx.item.delete({
          where: { userId_id: { userId: p.userId, id } },
        });
        return { id, revision: item.revision };
      },
      transaction,
    );
  }
  static deleteMoment(p: Principal, id: string, raw: unknown, transaction?: Tx) {
    return write(
      p,
      "v1.moment.delete",
      confirmed(id, raw),
      async (tx) => {
        const expected = parse(z.strictObject({ revision }), raw);
        const row = await tx.journalMoment.findFirst({
          where: { id, userId: p.userId },
        });
        if (!row) throw new Fault(404, "Not found");
        if (row.revision !== expected.revision)
          throw new Fault(409, "Journal entry changed", {
            currentRevision: row.revision,
          });
        await tx.momentTombstone.upsert({
          where: {
            userId_clientId: { userId: p.userId, clientId: row.clientId },
          },
          create: {
            userId: p.userId,
            clientId: row.clientId,
            momentId: row.id,
            revision: row.revision,
          },
          update: { momentId: row.id, revision: row.revision },
        });
        await tx.journalMoment.delete({ where: { id: row.id } });
        return { id: row.id, revision: row.revision };
      },
      transaction,
    );
  }
  static detachMoment(p: Principal, momentId: string, raw: unknown) {
    return write(
      p,
      "v1.moment.detach",
      confirmed(momentId, raw),
      async (tx) => {
        const value = parse(
          z.strictObject({
            itemId: schema.id,
            relation: z.enum(["mention", "reference", "located_at"]),
            revision,
          }),
          raw,
        );
        const moment = await owned(tx, p.userId, "journalMoment", momentId);
        if (moment.revision !== value.revision)
          throw new Fault(409, "Journal entry changed", {
            currentRevision: moment.revision,
          });
        const existing = await tx.momentItem.findUnique({
          where: {
            userId_momentId_itemId_relation: {
              userId: p.userId,
              momentId,
              itemId: value.itemId,
              relation: value.relation,
            },
          },
        });
        if (!existing) throw new Fault(404, "Not found");
        await tx.momentItem.delete({
          where: {
            userId_momentId_itemId_relation: {
              userId: p.userId,
              momentId,
              itemId: value.itemId,
              relation: value.relation,
            },
          },
        });
        await tx.journalMoment.update({
          where: { userId_id: { userId: p.userId, id: momentId } },
          data: { revision: { increment: 1 }, demoBatchId: null },
        });
        return { id: momentId, revision: moment.revision };
      },
    );
  }
  static updateActivity(
    p: Principal,
    id: string,
    raw: unknown,
    transaction?: Tx,
  ) {
    return write(
      p,
      "v1.activity.update",
      confirmed(id, raw),
      async (tx) => {
        const input = parse(
          z.strictObject({ revision, data: schema.activityInput }),
          raw,
        );
        const row = await tx.activity.findFirst({
          where: { id, userId: p.userId },
        });
        if (!row) throw new Fault(404, "Not found");
        if (row.revision !== input.revision)
          throw new Fault(409, "Activity changed", {
            currentRevision: row.revision,
          });
        if (input.data.clientId !== row.clientId)
          throw new Fault(400, "Activity identity cannot change");
        if (
          input.data.kind === "task_completion" ||
          row.kind === "task_completion"
        )
          throw new Fault(
            400,
            "Task completion is recorded by saving the Task",
          );
        await V1.assertActivityItem(tx, p.userId, input.data);
        return tx.activity.update({
          where: { userId_id: { userId: p.userId, id } },
          data: {
            kind: input.data.kind,
            itemId: input.data.itemId,
            occurredAt: new Date(input.data.occurredAt),
            timezone: input.data.timezone,
            localDate: dateInZone(input.data.occurredAt, input.data.timezone),
            data: json(input.data.data),
            revision: { increment: 1 },
            demoBatchId: null,
          },
        });
      },
      transaction,
    );
  }
  static deleteActivity(
    p: Principal,
    id: string,
    raw: unknown,
    transaction?: Tx,
  ) {
    return write(
      p,
      "v1.activity.delete",
      confirmed(id, raw),
      async (tx) => {
        const expected = parse(z.strictObject({ revision }), raw);
        const row = await tx.activity.findFirst({
          where: { id, userId: p.userId },
        });
        if (!row) throw new Fault(404, "Not found");
        if (row.revision !== expected.revision)
          throw new Fault(409, "Activity changed", {
            currentRevision: row.revision,
          });
        if (row.kind === "habit_completion" && row.itemId)
          await V1.reopenHabit(tx, p.userId, row);
        await tx.activity.delete({ where: { id: row.id } });
        return { id: row.id, revision: row.revision };
      },
      transaction,
    );
  }
  static undoHabit(p: Principal, itemId: string, raw: unknown) {
    return write(
      p,
      "v1.habit.undo",
      confirmed(itemId, raw),
      async (tx) => {
        const input = parse(
          z.strictObject({ revision, occurredAt: instant, timezone }),
          raw,
        );
        const item = await owned(tx, p.userId, "item", itemId);
        if (item.type !== "habit") throw new Fault(400, "Choose a Habit");
        const cadence =
          (item.metadata as { cadence?: string }).cadence || "daily";
        const period = habitPeriod(input.occurredAt, item.timezone, cadence);
        const key = `habit.${itemId}.${cadence}.${period}`;
        const previous = await tx.preference.findUnique({
          where: { userId_key: { userId: p.userId, key } },
        });
        const saved = previous?.value as HabitOccurrence | undefined;
        if (!saved?.completed)
          throw new Fault(400, "This occurrence is not complete");
        if ((saved.revision || 0) !== input.revision)
          throw new Fault(409, "Habit occurrence changed", {
            currentRevision: saved.revision || 0,
          });
        const activity = await tx.activity.findUnique({
          where: {
            userId_clientId: {
              userId: p.userId,
              clientId: `habit_${itemId}_${cadence}_${period}`,
            },
          },
        });
        if (activity)
          await V1.deleteActivity(
            p,
            activity.id,
            { revision: activity.revision },
            tx,
          );
        else await V1.reopenHabit(tx, p.userId, { itemId, data: { period } });
        return { id: itemId, revision: input.revision };
      },
    );
  }
  private static async assertActivityItem(
    tx: Tx,
    userId: string,
    value: { kind: string; itemId: string | null },
  ) {
    if (!value.itemId) return;
    const item = await owned(tx, userId, "item", value.itemId);
    if (value.kind === "focus" && !["task", "habit"].includes(item.type))
      throw new Fault(400, "Focus can reference a Task or Habit");
    const required = {
      habit_completion: "habit",
      task_completion: "task",
      interaction: "person",
    }[value.kind];
    if (required && item.type !== required)
      throw new Fault(400, "Activity has incompatible Item type");
  }
  private static async reopenHabit(
    tx: Tx,
    userId: string,
    row: { itemId: string | null; data: unknown },
  ) {
    if (!row.itemId) return;
    const item = await tx.item.findFirst({
      where: { id: row.itemId, userId },
    });
    if (!item || item.type !== "habit") return;
    const cadence = (item.metadata as { cadence?: string }).cadence || "daily";
    const period =
      (row.data as { period?: string }).period ||
      habitPeriod(new Date().toISOString(), item.timezone, cadence);
    const key = `habit.${item.id}.${cadence}.${period}`;
    const previous = await tx.preference.findUnique({
      where: { userId_key: { userId, key } },
    });
    const saved = previous?.value as HabitOccurrence | undefined;
    if (!saved?.completed) return;
    await tx.preference.update({
      where: { userId_key: { userId, key } },
      data: {
        value: {
          ...saved,
          completed: false,
          revision: (saved.revision || 0) + 1,
        },
      },
    });
  }
  private static async completeOccurrence(tx: Tx, p: Principal, item: Item) {
    const occurrence = await tx.taskOccurrence.findUnique({
      where: { userId_itemId: { userId: p.userId, itemId: item.id } },
      include: { recurrence: true },
    });
    if (!occurrence || occurrence.completedAt) return;
    await tx.taskOccurrence.update({
      where: { id: occurrence.id },
      data: { completedAt: item.completedAt },
    });
    if (!occurrence.recurrence.active) return;
    const rule = parse(schema.recurrenceRule, occurrence.recurrence.rule);
    const anchor = await tx.taskOccurrence.findFirstOrThrow({
      where: { userId: p.userId, recurrenceId: occurrence.recurrenceId },
      orderBy: { scheduledAt: "asc" },
    });
    const nextAt = nextOccurrence(
      rule,
      occurrence.scheduledAt,
      item.completedAt!,
      anchor.scheduledAt,
    );
    const tags = await tx.itemTag.findMany({
      where: { userId: p.userId, itemId: item.id },
    });
    // Date-only deadlines retain their offset from the occurrence's local calendar day.
    const calendarOffset = item.localDate
      ? Math.round(
          (Date.parse(`${item.localDate}T00:00:00Z`) -
            Date.parse(
              `${dateInZone(occurrence.scheduledAt, item.timezone)}T00:00:00Z`,
            )) /
            86400_000,
        )
      : 0;
    const nextDate = item.localDate
      ? new Date(
          Date.parse(`${dateInZone(nextAt, rule.timezone)}T00:00:00Z`) +
            calendarOffset * 86400_000,
        )
          .toISOString()
          .slice(0, 10)
      : null;
    const { value: next } = await V1.createItem(
      p,
      {
        ...itemDto({
          ...JSON.parse(JSON.stringify(item)),
          tagIds: tags.map((t) => t.tagId),
        }),
        timezone: rule.timezone,
        localDate: nextDate,
        status: "todo",
        scheduledAt: nextAt.toISOString(),
        dueAt: item.dueAt
          ? new Date(
              +nextAt + (+item.dueAt - +occurrence.scheduledAt),
            ).toISOString()
          : null,
      },
      tx,
    );
    await tx.taskOccurrence.create({
      data: {
        userId: p.userId,
        recurrenceId: occurrence.recurrenceId,
        itemId: next.id,
        scheduledAt: nextAt,
      },
    });
    await tx.taskOccurrence.update({
      where: { id: occurrence.id },
      data: { nextItemId: next.id },
    });
  }
}
