import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  write,
  parse,
  Fault,
  guardOpen,
  type Principal,
  type Tx,
} from "./index";
import {
  backupInput,
  delegates,
  validateRows,
  type Backup,
} from "../backup-contract";
import { linkInput, momentInput } from "../contracts";
import { dateInZone } from "../dates";
import { validLinkEndpoints } from "../link-policy";
import { CoachTrust } from "../coach/trust";

// Dynamic iteration is limited to this audited manifest; callers never choose a Prisma delegate.
type Row = Record<string, unknown>;
type DataDelegate = {
  findMany(args: unknown): Promise<Row[]>;
  findFirst(args: unknown): Promise<Row | null>;
  deleteMany(args: unknown): Promise<unknown>;
  createMany(args: unknown): Promise<unknown>;
};
const table = (tx: Tx, name: keyof typeof delegates) =>
  tx[delegates[name]] as unknown as DataDelegate;
export async function snapshot(tx: Tx, userId: string): Promise<Backup> {
  const tables: Record<string, unknown> = {};
  for (const name of Object.keys(delegates) as (keyof typeof delegates)[]) {
    const rows = await table(tx, name).findMany({ where: { userId } });
    tables[name] = rows.map(({ userId: _, ...row }) => row);
  }
  const me = await tx.selfProfile.findUniqueOrThrow({ where: { userId } });
  return JSON.parse(
    JSON.stringify({
      format: "bearing-v1",
      version: 1,
      owner: userId,
      meId: me.itemId,
      exportedAt: new Date(),
      tables,
    }),
  );
}
export async function clearData(tx: Tx, userId: string) {
  const self = await tx.selfProfile.findUniqueOrThrow({ where: { userId } });
  await tx.lease.deleteMany({ where: { userId } });
  for (const name of [
    "occurrences",
    "recurrences",
    "momentItems",
    "reviewItems",
    "activities",
    "moments",
    "reviews",
    "links",
    "itemTags",
    "projectTags",
    "messages",
    "proposals",
    "conversations",
    "preferences",
    "tombstones",
  ] as const)
    await table(tx, name).deleteMany({ where: { userId } });
  await tx.item.updateMany({
    where: { userId },
    data: { delegateId: null, projectId: null },
  });
  await tx.item.deleteMany({ where: { userId, id: { not: self.itemId } } });
  await tx.project.deleteMany({ where: { userId } });
  await tx.tag.deleteMany({ where: { userId } });
  await tx.item.update({
    where: { id: self.itemId },
    data: {
      title: "Me",
      content: "",
      template: "person",
      status: "todo",
      priority: 0,
      metadata: { version: 1, importantDates: [] },
      dueAt: null,
      scheduledAt: null,
      startAt: null,
      endAt: null,
      followUpAt: null,
      completedAt: null,
      localDate: null,
      timezone: "UTC",
      demoBatchId: null,
      revision: { increment: 1 },
    },
  });
}
const dateFields = new Set([
  "capturedAt",
  "createdAt",
  "updatedAt",
  "dueAt",
  "scheduledAt",
  "startAt",
  "endAt",
  "followUpAt",
  "completedAt",
  "occurredAt",
]);
const jsonFields = new Set([
  "metadata",
  "data",
  "prompts",
  "rule",
  "operations",
  "value",
]);
function rehydrate(row: Row, userId: string) {
  return Object.fromEntries(
    Object.entries({ ...row, ...(typeof row.text === "string" && typeof row.clientId === "string" && !row.capturedAt ? { capturedAt: row.createdAt } : {}), userId }).map(([key, value]) => [
      key,
      dateFields.has(key) && typeof value === "string"
        ? new Date(value)
        : value === null && jsonFields.has(key)
          ? Prisma.JsonNull
          : value,
    ]),
  );
}
function validateGraph(b: Backup) {
  const ids = (
    key:
      | "items"
      | "projects"
      | "tags"
      | "moments"
      | "reviews"
      | "recurrences"
      | "conversations",
  ) => new Set(b.tables[key].map((r) => r.id));
  const sets = {
    itemId: ids("items"),
    fromId: ids("items"),
    toId: ids("items"),
    delegateId: ids("items"),
    nextItemId: ids("items"),
    projectId: ids("projects"),
    tagId: ids("tags"),
    momentId: ids("moments"),
    reviewId: ids("reviews"),
    recurrenceId: ids("recurrences"),
    conversationId: ids("conversations"),
  };
  for (const rows of Object.values(b.tables)) {
    const seen = new Set<string>();
    for (const row of rows) {
      // Duplicate primary keys must not turn a replace into a silent last-write-wins import.
      const key = "id" in row ? row.id : JSON.stringify(row);
      if (seen.has(key as string))
        throw new Fault(400, "Duplicate backup record");
      seen.add(key as string);
      for (const [field, set] of Object.entries(sets))
        if (
          field in row &&
          row[field as keyof typeof row] !== null &&
          !set.has(row[field as keyof typeof row] as string)
        )
          throw new Fault(400, `Missing backup relationship: ${field}`);
    }
  }
  const me = b.tables.items.find((i) => i.id === b.meId);
  if (!me || me.type !== "person" || me.status === "archived")
    throw new Fault(400, "Backup requires canonical Me Person");
  for (const item of b.tables.items)
    if (
      item.delegateId &&
      b.tables.items.find((i) => i.id === item.delegateId)?.type !== "person"
    )
      throw new Fault(400, "Delegate must be a Person");
  for (const row of b.tables.links) {
    parse(linkInput, {
      fromId: row.fromId,
      toId: row.toId,
      type: row.type,
      note: row.note,
    });
    if (
      !validLinkEndpoints(
        row.type,
        b.tables.items.find((i) => i.id === row.fromId)!,
        b.tables.items.find((i) => i.id === row.toId)!,
      )
    )
      throw new Fault(400, "Invalid semantic Link endpoints");
  }
  for (const row of b.tables.recurrences)
    if (b.tables.items.find((i) => i.id === row.itemId)?.type !== "task")
      throw new Fault(400, "Recurrence requires a Task");
  for (const row of b.tables.occurrences) {
    const item = b.tables.items.find((i) => i.id === row.itemId);
    if (item?.type !== "task" || !!row.completedAt !== !!item.completedAt)
      throw new Fault(400, "Invalid occurrence history");
    if (
      row.nextItemId &&
      !b.tables.occurrences.some(
        (o) =>
          o.itemId === row.nextItemId && o.recurrenceId === row.recurrenceId,
      )
    )
      throw new Fault(400, "Missing next occurrence history");
  }
  for (const row of b.tables.activities) {
    const expected = {
      habit_completion: "habit",
      task_completion: "task",
      interaction: "person",
    }[row.kind as string];
    if (
      expected &&
      b.tables.items.find((i) => i.id === row.itemId)?.type !== expected
    )
      throw new Fault(400, "Activity requires a compatible Item");
  }
  for (const row of b.tables.moments) {
    parse(momentInput, {
      clientId: row.clientId,
      text: row.text,
      occurredAt: row.occurredAt,
      timezone: row.timezone,
      intendedType: row.intendedType ?? undefined,
      needsOrganization: row.needsOrganization,
    });
    if (dateInZone(row.occurredAt, row.timezone) !== row.localDate)
      throw new Fault(400, "Journal local date does not match timezone");
  }
  for (const row of b.tables.activities)
    if (dateInZone(row.occurredAt, row.timezone) !== row.localDate)
      throw new Fault(400, "Activity local date does not match timezone");
}
export class V1Backup {
  static export(userId: string) {
    return db.$transaction((tx) => snapshot(tx, userId), {
      isolationLevel: "RepeatableRead",
    });
  }
  static reset(p: Principal, confirmation: unknown) {
    return write(p, "v1.database.reset", {}, async (tx) => {
      if (confirmation !== "RESET V1 DATA" || !p.actor.startsWith("user:"))
        throw new Fault(403, "Explicit user confirmation required");
      await guardOpen(tx, p);
      await clearData(tx, p.userId);
      return { cleared: true };
    });
  }
  static restore(p: Principal, raw: unknown, confirmation: unknown) {
    return write(
      p,
      "v1.database.restore",
      { format: "bearing-v1" },
      async (tx) => {
        if (confirmation !== "RESTORE V1 DATA" || !p.actor.startsWith("user:"))
          throw new Fault(403, "Explicit user confirmation required");
        const backup = parse(backupInput, raw);
        if (backup.owner !== p.userId)
          throw new Fault(403, "Backup belongs to a different account");
        const self = await tx.selfProfile.findUniqueOrThrow({
          where: { userId: p.userId },
        });
        if (backup.meId !== self.itemId)
          throw new Fault(400, "Canonical Me identity cannot change");
        try {
          validateRows(backup);
        } catch {
          throw new Fault(400, "Invalid typed backup record");
        }
        validateGraph(backup);
        for (const [name, rows] of Object.entries(backup.tables)) {
          const ids = rows
            .filter((r) => "id" in r)
            .map((r) => (r as { id: string }).id);
          if (
            ids.length &&
            (await table(tx, name as keyof typeof delegates).findFirst({
              where: { id: { in: ids }, userId: { not: p.userId } },
            }))
          )
            throw new Fault(409, "Record ID is already in use");
        }
        await guardOpen(tx, p);
        await clearData(tx, p.userId);
        for (const name of Object.keys(
          delegates,
        ) as (keyof typeof delegates)[]) {
          if (name === "items") {
            for (const row of backup.tables.items) {
              const data = rehydrate({ ...row, delegateId: null }, p.userId);
              if (row.id === self.itemId)
                await tx.item.update({
                  where: { id: row.id },
                  data: data as unknown as Prisma.ItemUncheckedUpdateInput,
                });
              else
                await tx.item.create({
                  data: data as unknown as Prisma.ItemUncheckedCreateInput,
                });
            }
            for (const row of backup.tables.items)
              if (row.delegateId)
                await tx.item.update({
                  where: { id: row.id },
                  data: { delegateId: row.delegateId },
                });
          } else if (name === "ledger") {
            // Audit history is append-only across reset/restore; never replace a durable receipt.
            for (const row of backup.tables.ledger) {
              if (
                row.actor.startsWith("user:") &&
                row.actor !== `user:${p.userId}`
              )
                throw new Fault(400, "Invalid audit actor");
              const existing = await tx.ledger.findUnique({
                where: { id: row.id },
              });
              if (existing) {
                const { userId: _, ...data } = existing;
                if (
                  JSON.stringify(JSON.parse(JSON.stringify(data))) !==
                  JSON.stringify(row)
                )
                  throw new Fault(409, "Existing audit receipt differs");
              } else
                await tx.ledger.create({
                  data: rehydrate(
                    row,
                    p.userId,
                  ) as unknown as Prisma.LedgerCreateInput,
                });
            }
          } else if (name === "preferences") {
            const rows = backup.tables.preferences.filter((row) =>
              CoachTrust.restorable(row.key),
            );
            if (rows.length)
              await table(tx, name).createMany({
                data: rows.map((row) => rehydrate(row, p.userId)),
              });
          } else if (backup.tables[name].length)
            await table(tx, name).createMany({
              data: backup.tables[name].map((row) => rehydrate(row, p.userId)),
            });
        }
        return { restored: true };
      },
    );
  }
}
