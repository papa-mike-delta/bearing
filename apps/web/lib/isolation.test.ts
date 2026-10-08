// Two accounts against a real Postgres, through the same functions the
// server actions call with the session user. Skipped unless TEST_POSTGRES_URL
// points at a database with the current schema (see README).

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { areas, createDb, tasks, users } from "@repo/db";
import { eq, inArray } from "drizzle-orm";
import { captureDraft, fileDraftAsTask, inboxDrafts } from "./drafts.ts";
import {
  addTask,
  changePriority,
  completeTask,
  createArea,
  openTasks,
} from "./tasks.ts";

const url = process.env.TEST_POSTGRES_URL;

describe(
  "account isolation",
  { skip: !url && "TEST_POSTGRES_URL not set" },
  () => {
    const db = createDb(url!);
    const ids: string[] = [];
    let a = "";
    let b = "";

    async function account({ area = true } = {}) {
      const [user] = await db
        .insert(users)
        .values({ email: `${randomUUID()}@test.invalid`, passwordHash: "-" })
        .returning({ id: users.id });
      ids.push(user!.id);
      if (area) await createArea(user!.id, db);
      return user!.id;
    }
    const taskOf = async (userId: string, name: string) =>
      (await openTasks(userId, db)).find((t) => t.name === name)!;
    const priorityOf = async (id: string) =>
      (await db.select().from(tasks).where(eq(tasks.id, id)))[0]!;

    before(async () => {
      a = await account();
      b = await account();
    });
    after(async () => {
      if (ids.length) await db.delete(users).where(inArray(users.id, ids));
      await db.$client.end();
    });

    test("another account's tasks can't be read, completed, or reprioritised", async () => {
      await addTask(a, { name: "A's task" }, db);
      const task = await taskOf(a, "A's task");
      assert.deepEqual(await openTasks(b, db), []);
      await completeTask(b, task.id, db);
      await changePriority(b, task.id, 1, db);
      const row = await priorityOf(task.id);
      assert.equal(row.completedAt, null);
      assert.equal(row.priority, 0);
    });

    test("another account's Drafts can't be read or filed", async () => {
      await captureDraft(a, "A's draft", db);
      const [draft] = await inboxDrafts(a, db);
      assert.deepEqual(await inboxDrafts(b, db), []);
      await fileDraftAsTask(b, draft!.id, db);
      assert.equal((await inboxDrafts(a, db)).length, 1);
      assert.deepEqual(await openTasks(b, db), []);
    });

    test("filing the same Draft twice makes one task", async () => {
      await captureDraft(a, "Once\nwith a note", db);
      const draft = (await inboxDrafts(a, db)).find((d) =>
        d.body.startsWith("Once"),
      )!;
      await Promise.all([
        fileDraftAsTask(a, draft.id, db),
        fileDraftAsTask(a, draft.id, db),
      ]);
      const filed = (await openTasks(a, db)).filter((t) => t.name === "Once");
      assert.equal(filed.length, 1);
      assert.equal(filed[0]!.note, "with a note");
    });

    test("a Draft that can't be a task stays in the Inbox and adds no task", async () => {
      const before = (await openTasks(a, db)).length;
      await captureDraft(a, "x".repeat(501), db);
      const draft = (await inboxDrafts(a, db)).find((d) =>
        d.body.startsWith("xxx"),
      )!;
      assert.equal(await fileDraftAsTask(a, draft.id, db), false);
      assert.ok((await inboxDrafts(a, db)).some((d) => d.id === draft.id));
      assert.equal((await openTasks(a, db)).length, before);
    });

    test("ids that aren't uuids are ignored, not errors", async () => {
      for (const id of ["not-a-uuid", "", "1; drop table tasks"]) {
        await completeTask(a, id, db);
        await changePriority(a, id, 1, db);
        assert.equal(await fileDraftAsTask(a, id, db), true);
      }
    });

    test("an account made before Areas existed gets one on its first task", async () => {
      const old = await account({ area: false });
      assert.equal(await addTask(old, { name: "First" }, db), true);
      assert.equal((await openTasks(old, db))[0]?.name, "First");
      await captureDraft(old, "Filed", db);
      const [draft] = await inboxDrafts(old, db);
      assert.equal(await fileDraftAsTask(old, draft!.id, db), true);
      assert.equal((await openTasks(old, db)).length, 2);
    });

    test("a blank or overlong name adds nothing", async () => {
      const before = (await openTasks(a, db)).length;
      assert.equal(await addTask(a, { name: "  " }, db), false);
      assert.equal(await addTask(a, { name: "x".repeat(501) }, db), false);
      assert.equal((await openTasks(a, db)).length, before);
    });

    test("a completed task's priority can't change", async () => {
      await addTask(a, { name: "Done" }, db);
      const task = await taskOf(a, "Done");
      await completeTask(a, task.id, db);
      await changePriority(a, task.id, 1, db);
      assert.equal((await priorityOf(task.id)).priority, 0);
    });

    test("concurrent raises are not lost and stop at the top", async () => {
      await addTask(a, { name: "Raced" }, db);
      const task = await taskOf(a, "Raced");
      await db.update(tasks).set({ priority: -2 }).where(eq(tasks.id, task.id));
      await Promise.all([1, 2, 3].map(() => changePriority(a, task.id, 1, db)));
      assert.equal((await priorityOf(task.id)).priority, 1);
      await Promise.all([1, 2, 3].map(() => changePriority(a, task.id, 1, db)));
      assert.equal((await priorityOf(task.id)).priority, 2);
    });

    test("the database refuses a priority outside -2..2", async () => {
      const task = await taskOf(a, "Raced");
      await assert.rejects(
        db.update(tasks).set({ priority: 5 }).where(eq(tasks.id, task.id)),
      );
    });

    test("one Area per account", async () => {
      await createArea(a, db); // a no-op, not a second Area
      await addTask(a, { name: "Still one list" }, db);
      assert.ok(await taskOf(a, "Still one list"));
      await assert.rejects(
        db
          .insert(areas)
          .values({ userId: a, name: "Two", workflow: "priority-list" }),
      );
    });
  },
);
