import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { db } from "@/lib/db";
import { deleteItemConfirmation } from "@/lib/v1/contracts";
import { V1, type Principal } from "@/lib/v1/service";
import { V1Backup } from "@/lib/v1/service/backup";

const owner = "delete-owner";
const other = "delete-other";
const p: Principal = { userId: owner, actor: `user:${owner}` };
const q: Principal = { userId: other, actor: `user:${other}` };
const now = "2026-11-26T15:00:00.000Z";

beforeAll(async () => {
  execFileSync(
    process.execPath,
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
      "--schema",
      "prisma/schema.prisma",
    ],
    { env: process.env, stdio: "pipe" },
  );
  await db.account.createMany({
    data: [owner, other].map((id) => ({
      id,
      email: `${id}@example.test`,
      passwordHash: "not-used",
    })),
  });
});
afterAll(async () => {
  const schema = new URL(process.env.DATABASE_URL!).searchParams.get("schema")!;
  if (!/^v1_test_[a-f0-9]+$/.test(schema))
    throw new Error("Refusing to drop a non-V1-test schema");
  await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await db.$disconnect();
});

async function receipt(id: string) {
  const row = await db.ledger.findUniqueOrThrow({ where: { id } });
  return {
    payload: JSON.parse(row.payload) as { id: string; revision: number },
    value: JSON.parse(row.receipt).value as { id: string; revision: number },
    raw: `${row.payload}${row.receipt}`,
  };
}

it("permanently deletes an item after clearing blockers and refuses Me, conflicts, and other accounts", async () => {
  const person = (
    await V1.createItem(p, { type: "person", title: "Alex" })
  ).value;
  const task = (
    await V1.createItem(p, {
      type: "task",
      title: "Secret walking plan",
      status: "delegated",
      delegateId: person.id,
      scheduledAt: now,
    })
  ).value;
  await V1.createRecurrence(p, task.id, task.revision, {
    mode: "completion",
    unit: "day",
    interval: 1,
    timezone: "UTC",
  });
  const fresh = await V1.item(owner, task.id);
  await V1.createActivity(p, {
    clientId: `focus-${task.id}`,
    kind: "focus",
    itemId: task.id,
    occurredAt: now,
    timezone: "UTC",
    data: { minutes: 25 },
  });
  await V1.createMoment(p, {
    clientId: `moment-${task.id}`,
    text: "Mention the secret plan",
    occurredAt: now,
    timezone: "UTC",
    items: [{ itemId: task.id, relation: "reference" }],
  });
  await V1.createReview(p, {
    period: "daily",
    localDate: "2026-11-26",
    timezone: "UTC",
    prompts: { notes: "Keep the words" },
    itemIds: [task.id],
  });
  const delegated = (
    await V1.createItem(p, {
      type: "task",
      title: "Ask Alex",
      status: "delegated",
      delegateId: person.id,
    })
  ).value;

  await expect(
    V1.deleteItem(p, fresh.id, { revision: 0, confirmation: deleteItemConfirmation }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    V1.deleteItem(q, fresh.id, {
      revision: fresh.revision,
      confirmation: deleteItemConfirmation,
    }),
  ).rejects.toMatchObject({ status: 404 });
  const me = await db.selfProfile.findUniqueOrThrow({ where: { userId: owner } });
  await expect(
    V1.deleteItem(p, me.itemId, {
      revision: 0,
      confirmation: deleteItemConfirmation,
    }),
  ).rejects.toMatchObject({ status: 400 });

  const removed = await V1.deleteItem(p, fresh.id, {
    revision: fresh.revision,
    confirmation: deleteItemConfirmation,
  });
  const logged = await receipt(removed.receiptId);
  expect(logged.payload).toEqual({ id: fresh.id, revision: fresh.revision });
  expect(logged.value).toEqual({ id: fresh.id, revision: fresh.revision });
  expect(logged.raw).not.toContain("Secret walking plan");
  expect(await db.item.findUnique({ where: { id: fresh.id } })).toBeNull();
  expect(await db.activity.count({ where: { userId: owner, itemId: fresh.id } })).toBe(0);
  expect(await db.momentItem.count({ where: { userId: owner, itemId: fresh.id } })).toBe(0);
  expect(await db.reviewItem.count({ where: { userId: owner, itemId: fresh.id } })).toBe(0);
  expect(await db.recurrence.count({ where: { userId: owner, itemId: fresh.id } })).toBe(0);
  expect(await db.journalMoment.count({ where: { userId: owner } })).toBe(1);
  const returned = await V1.item(owner, delegated.id);
  expect(returned.delegateId).toBe(person.id);
  expect(returned.status).toBe("delegated");

  const cleared = await V1.deleteItem(p, person.id, {
    revision: person.revision,
    confirmation: deleteItemConfirmation,
  });
  expect((await receipt(cleared.receiptId)).value).toEqual({
    id: person.id,
    revision: person.revision,
  });
  const taskAfter = await V1.item(owner, delegated.id);
  expect(taskAfter.delegateId).toBeNull();
  expect(taskAfter.status).toBe("todo");
});

it("deletes a journal moment with a tombstone and can drop a mention", async () => {
  const note = (await V1.createItem(p, { type: "note", title: "Trail" })).value;
  const clientId = `capture-${randomUUID()}`;
  const created = await V1.capture(p, {
    clientId,
    text: "Secret riverside line",
    occurredAt: now,
    capturedAt: now,
    timezone: "UTC",
    mentionIds: [note.id],
  });
  const momentId = created.value.id as string;
  await V1.detachMoment(p, momentId, {
    revision: 0,
    itemId: note.id,
    relation: "mention",
  });
  const mentions = await db.momentItem.findMany({
    where: { userId: owner, momentId, relation: "mention" },
  });
  expect(mentions).toEqual([]);
  const current = await db.journalMoment.findUniqueOrThrow({
    where: { id: momentId },
  });
  const removed = await V1.deleteMoment(p, momentId, {
    revision: current.revision,
  });
  const logged = await receipt(removed.receiptId);
  expect(logged.value).toEqual({ id: momentId, revision: current.revision });
  expect(logged.raw).not.toContain("Secret riverside line");
  expect(await db.journalMoment.findUnique({ where: { id: momentId } })).toBeNull();
  const again = await V1.capture(p, {
    clientId,
    text: "A different late sync",
    occurredAt: now,
    capturedAt: now,
    timezone: "UTC",
  });
  expect(again.value.id).toBe(momentId);
  expect(await db.journalMoment.findUnique({ where: { id: momentId } })).toBeNull();
  expect(
    await db.momentTombstone.findUnique({
      where: { userId_clientId: { userId: owner, clientId } },
    }),
  ).toMatchObject({ momentId });
  await expect(
    V1.deleteMoment(q, momentId, { revision: current.revision }),
  ).rejects.toMatchObject({ status: 404 });
});

it("edits and deletes activities and undoes a completed habit day", async () => {
  const habit = (
    await V1.createItem(p, {
      type: "habit",
      title: "Stretch",
      content: "- [ ] Reach\n- [ ] Breathe",
    })
  ).value;
  const occurredAt = now;
  await V1.habit(p, habit.id, {
    revision: 0,
    occurredAt,
    timezone: "UTC",
    checklist: [true, false],
    value: 1,
    complete: true,
  });
  const activity = await db.activity.findFirstOrThrow({
    where: { userId: owner, itemId: habit.id, kind: "habit_completion" },
  });
  await expect(
    V1.updateActivity(q, activity.id, {
      revision: activity.revision,
      data: {
        clientId: activity.clientId,
        kind: "habit_completion",
        itemId: habit.id,
        occurredAt,
        timezone: "UTC",
        data: { value: 2, checklist: [true, false], period: "2026-11-26" },
      },
    }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    V1.updateActivity(p, activity.id, {
      revision: 9,
      data: {
        clientId: activity.clientId,
        kind: "habit_completion",
        itemId: habit.id,
        occurredAt,
        timezone: "UTC",
        data: { value: 2, checklist: [true, false], period: "2026-11-26" },
      },
    }),
  ).rejects.toMatchObject({ status: 409 });
  const undone = await V1.undoHabit(p, habit.id, {
    revision: 1,
    occurredAt,
    timezone: "UTC",
  });
  expect(undone.value).toEqual({ id: habit.id, revision: 1 });
  expect(await db.activity.findUnique({ where: { id: activity.id } })).toBeNull();
  const saved = await db.preference.findFirstOrThrow({
    where: { userId: owner, key: { startsWith: `habit.${habit.id}.` } },
  });
  expect((saved.value as { completed: boolean }).completed).toBe(false);
  await expect(
    V1.undoHabit(p, habit.id, { revision: 2, occurredAt, timezone: "UTC" }),
  ).rejects.toMatchObject({ status: 400 });

  const note = (
    await V1.createActivity(p, {
      clientId: `note-${randomUUID()}`,
      kind: "observation",
      occurredAt,
      timezone: "UTC",
      data: { text: "Secret observation" },
    })
  ).value;
  const edited = await V1.updateActivity(p, note.id, {
    revision: note.revision,
    data: {
      clientId: note.clientId,
      kind: "observation",
      itemId: null,
      occurredAt,
      timezone: "UTC",
      data: { text: "Revised observation" },
    },
  });
  expect(edited.value.revision).toBe(1);
  const removed = await V1.deleteActivity(p, note.id, { revision: 1 });
  const logged = await receipt(removed.receiptId);
  expect(logged.value).toEqual({ id: note.id, revision: 1 });
  expect(logged.raw).not.toContain("Secret observation");
  expect(logged.raw).not.toContain("Revised observation");
  expect(await db.activity.findUnique({ where: { id: note.id } })).toBeNull();
});

it("round-trips tombstones through backup", async () => {
  await V1Backup.reset(p, "RESET V1 DATA");
  const backup = await V1Backup.export(owner);
  expect(backup.tables.tombstones).toEqual([]);
  await V1Backup.restore(p, backup, "RESTORE V1 DATA");
  expect(await db.momentTombstone.count({ where: { userId: owner } })).toBe(0);
});
