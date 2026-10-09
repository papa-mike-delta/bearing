// Two accounts against a real Postgres, through the same functions the
// server actions call with the session user. Needs TEST_POSTGRES_URL pointing
// at a database with the current schema (see README). Without it the suite
// fails in CI and is skipped, with a warning, everywhere else.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { areas, coachThreads, createDb, tasks, users } from "@repo/db";
import { eq, inArray } from "drizzle-orm";
import { coachThread, saveMessage, threadMessages } from "./coach-threads.ts";
import {
  createArea,
  deleteArea,
  loadAccount,
  renameArea,
  setAreaHidden,
  setAreaWip,
  setAreaWorkflow,
} from "./areas.ts";
import { captureDraft, fileDraftAsTask, inboxDrafts } from "./drafts.ts";
import {
  addTask,
  changePriority,
  completeTask,
  maxSourceIdLength,
  moveTask,
  openTasks,
  scheduleOn,
  type Provenance,
} from "./tasks.ts";

const url = process.env.TEST_POSTGRES_URL;

if (!url && process.env.CI) {
  test("account isolation runs in CI", () => {
    assert.fail(
      "TEST_POSTGRES_URL is not set, so the isolation suite can't run",
    );
  });
} else if (!url) {
  console.warn(
    "\n!!! WARNING: account isolation tests SKIPPED. Set TEST_POSTGRES_URL to run them (see README). !!!\n",
  );
}

describe(
  "account isolation",
  { skip: !url && "TEST_POSTGRES_URL not set" },
  () => {
    const db = createDb(url!);
    const ids: string[] = [];
    let a = "";
    let b = "";
    const today = "2026-10-09";

    async function account({ area = true } = {}) {
      const [user] = await db
        .insert(users)
        .values({ email: `${randomUUID()}@test.invalid`, passwordHash: "-" })
        .returning({ id: users.id });
      ids.push(user!.id);
      if (area) await createArea(user!.id, "Tasks", db);
      return user!.id;
    }
    const taskOf = async (userId: string, name: string) =>
      (await openTasks(userId, db)).find((t) => t.name === name)!;
    const rowOf = async (id: string) =>
      (await db.select().from(tasks).where(eq(tasks.id, id)))[0]!;
    const areaRow = async (id: string) =>
      (await db.select().from(areas).where(eq(areas.id, id)))[0]!;
    const coach = (): Provenance => ({
      source: "coach",
      sourceId: `call_${randomUUID()}`,
    });

    before(async () => {
      a = await account();
      b = await account();
    });
    after(async () => {
      if (ids.length) await db.delete(users).where(inArray(users.id, ids));
      await db.$client.end();
    });

    test("another account's tasks can't be read, completed, or reprioritised", async () => {
      await addTask(a, { today, name: "A's task" }, db);
      const task = await taskOf(a, "A's task");
      assert.deepEqual(await openTasks(b, db), []);
      assert.equal(await completeTask(b, task.id, db), null);
      await changePriority(b, task.id, 1, db);
      const row = await rowOf(task.id);
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
        fileDraftAsTask(a, draft.id, db, { today }),
        fileDraftAsTask(a, draft.id, db, { today }),
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
        assert.equal(await completeTask(a, id, db), null);
        await changePriority(a, id, 1, db);
        assert.equal(await fileDraftAsTask(a, id, db), true);
      }
    });

    test("an account with no Area cannot add or file a task", async () => {
      const old = await account({ area: false });
      assert.equal(await addTask(old, { today, name: "First" }, db), null);
      assert.deepEqual(await openTasks(old, db), []);
      await captureDraft(old, "Filed", db);
      const [draft] = await inboxDrafts(old, db);
      assert.equal(await fileDraftAsTask(old, draft!.id, db, { today }), false);
      assert.equal((await inboxDrafts(old, db)).length, 1);
      const rows = await db
        .select({ id: areas.id })
        .from(areas)
        .where(eq(areas.userId, old));
      assert.deepEqual(rows, []);
    });

    test("adding returns the new task's id and trimmed name", async () => {
      const added = await addTask(a, { today, name: "  Returned  " }, db);
      const task = await taskOf(a, "Returned");
      assert.deepEqual(added, { id: task.id, name: "Returned" });
    });

    test("a blank or overlong name, or an overlong note, adds nothing", async () => {
      const before = (await openTasks(a, db)).length;
      assert.equal(await addTask(a, { today, name: "  " }, db), null);
      assert.equal(await addTask(a, { today, name: "x".repeat(501) }, db), null);
      const note = "x".repeat(10_001);
      assert.equal(await addTask(a, { today, name: "Long note", note }, db), null);
      assert.equal((await openTasks(a, db)).length, before);
    });

    test("completing returns the task, and a completed or missing id returns null", async () => {
      const added = (await addTask(a, { today, name: "Done" }, db))!;
      assert.deepEqual(await completeTask(a, added.id, db), added);
      const completedAt = (await rowOf(added.id)).completedAt;
      assert.ok(completedAt);
      assert.equal(await completeTask(a, added.id, db), null);
      assert.deepEqual((await rowOf(added.id)).completedAt, completedAt);
      assert.equal(await completeTask(a, randomUUID(), db), null);
    });

    test("a completed task's priority can't change", async () => {
      const task = (await addTask(a, { today, name: "Done again" }, db))!;
      await completeTask(a, task.id, db);
      await changePriority(a, task.id, 1, db);
      assert.equal((await rowOf(task.id)).priority, 0);
    });

    test("provenance is stored, and repeating it in the same Area adds nothing", async () => {
      const from = coach();
      const first = (await addTask(a, { today, name: "From the Coach", from }, db))!;
      const row = await rowOf(first.id);
      assert.equal(row.source, "coach");
      assert.equal(row.sourceId, from.sourceId);
      const before = (await openTasks(a, db)).length;
      const again = await Promise.all([
        addTask(a, { today, name: "Retried", from }, db),
        addTask(a, { today, name: "Retried", from }, db),
      ]);
      assert.deepEqual(again, [first, first]);
      assert.equal((await openTasks(a, db)).length, before);
    });

    test("concurrent first adds with the same provenance make one task", async () => {
      const c = await account();
      const from = coach();
      const added = await Promise.all(
        [1, 2, 3, 4, 5].map(() => addTask(c, { today, name: "Raced add", from }, db)),
      );
      const open = await openTasks(c, db);
      assert.equal(open.length, 1);
      for (const task of added) assert.equal(task?.id, open[0]!.id);
    });

    test("a blank or overlong source id adds nothing", async () => {
      const before = (await openTasks(a, db)).length;
      for (const sourceId of ["", "  ", "x".repeat(maxSourceIdLength + 1)]) {
        const from: Provenance = { source: "coach", sourceId };
        assert.equal(await addTask(a, { today, name: "No id", from }, db), null);
      }
      assert.equal((await openTasks(a, db)).length, before);
      const longest = "x".repeat(maxSourceIdLength);
      const from: Provenance = { source: "coach", sourceId: longest };
      assert.ok(await addTask(a, { today, name: "Longest id", from }, db));
    });

    test("the same provenance in another account's Area adds a task there", async () => {
      const from = coach();
      const mine = (await addTask(a, { today, name: "Shared id", from }, db))!;
      const theirs = (await addTask(b, { today, name: "Shared id", from }, db))!;
      assert.notEqual(theirs.id, mine.id);
      assert.equal((await taskOf(b, "Shared id")).id, theirs.id);
      // A repeat returns each account's own Task, never the other's.
      assert.deepEqual(await addTask(a, { today, name: "Again", from }, db), mine);
      assert.deepEqual(await addTask(b, { today, name: "Again", from }, db), theirs);
    });

    test("tasks added on the list or from the Inbox have no provenance and coexist", async () => {
      const c = await account();
      await addTask(c, { today, name: "Same" }, db);
      await addTask(c, { today, name: "Same" }, db);
      await captureDraft(c, "Same", db);
      const [draft] = await inboxDrafts(c, db);
      assert.equal(await fileDraftAsTask(c, draft!.id, db, { today }), true);
      const open = await openTasks(c, db);
      assert.equal(open.length, 3);
      for (const t of open) {
        const row = await rowOf(t.id);
        assert.equal(row.source, null);
        assert.equal(row.sourceId, null);
      }
    });

    test("the database refuses a task with only one of source or source id", async () => {
      const [area] = await db
        .select({ id: areas.id })
        .from(areas)
        .where(eq(areas.userId, a));
      const half = { areaId: area!.id, name: "Half", priority: 0 };
      const refused = (e: { cause?: { constraint?: string } }) =>
        e.cause?.constraint === "tasks_source_pair";
      await assert.rejects(
        db.insert(tasks).values({ ...half, source: "coach" }),
        refused,
      );
      await assert.rejects(
        db.insert(tasks).values({ ...half, sourceId: "x" }),
        refused,
      );
    });

    test("concurrent raises are not lost and stop at the top", async () => {
      await addTask(a, { today, name: "Raced" }, db);
      const task = await taskOf(a, "Raced");
      await db.update(tasks).set({ priority: -2 }).where(eq(tasks.id, task.id));
      await Promise.all([1, 2, 3].map(() => changePriority(a, task.id, 1, db)));
      assert.equal((await rowOf(task.id)).priority, 1);
      await Promise.all([1, 2, 3].map(() => changePriority(a, task.id, 1, db)));
      assert.equal((await rowOf(task.id)).priority, 2);
    });

    test("the database refuses a priority outside -2..2", async () => {
      const task = await taskOf(a, "Raced");
      await assert.rejects(
        db.update(tasks).set({ priority: 5 }).where(eq(tasks.id, task.id)),
      );
    });

    test("another account's Coach thread and messages can't be read or written", async () => {
      const mine = await coachThread(a, db);
      const message = {
        id: randomUUID(),
        role: "user" as const,
        parts: [{ type: "text" as const, text: "A's message" }],
      };
      assert.equal(await saveMessage(a, mine, message, db), true);
      const theirs = await coachThread(b, db);
      assert.notEqual(theirs, mine);
      assert.equal(await threadMessages(b, mine, db), null);
      assert.deepEqual(await threadMessages(b, theirs, db), []);
      const other = { ...message, id: randomUUID() };
      await assert.rejects(saveMessage(b, mine, other, db));
      assert.deepEqual(await threadMessages(a, mine, db), [message]);
    });

    test("the first Coach visit makes one thread, even when two load at once", async () => {
      const c = await account();
      // Warm the pool so the visits really overlap.
      await Promise.all(Array.from({ length: 8 }, () => openTasks(c, db)));
      const opened = await Promise.all(
        Array.from({ length: 8 }, () => coachThread(c, db)),
      );
      const rows = await db
        .select({ id: coachThreads.id })
        .from(coachThreads)
        .where(eq(coachThreads.userId, c));
      assert.equal(rows.length, 1);
      for (const id of opened) assert.equal(id, rows[0]!.id);
      assert.equal(await coachThread(c, db), rows[0]!.id);
    });

    test("an account can have many Areas, and names are unique ignoring case", async () => {
      const work = await createArea(a, "Work", db);
      const again = await createArea(a, " work ", db);
      assert.equal(again, null);
      assert.ok(work);
      await addTask(a, { today, name: "In Work", area: "work" }, db);
      assert.ok(await taskOf(a, "In Work"));
      const personal = await createArea(b, "Personal", db);
      assert.ok(personal);
      assert.notEqual(personal!.id, work!.id);
    });

    test("another account's Areas and Tasks can't be changed", async () => {
      const area = (await createArea(b, "B empty", db))!;
      await addTask(b, { today, name: "B's listed", area: "Tasks" }, db);
      const listed = await taskOf(b, "B's listed");
      const areaBefore = await areaRow(area.id);
      const taskBefore = await rowOf(listed.id);
      assert.equal(await renameArea(a, area.id, "Stolen", db), null);
      assert.equal(await deleteArea(a, area.id, db), "missing");
      assert.equal(await setAreaHidden(a, area.id, true, db), false);
      assert.equal(await setAreaWorkflow(a, area.id, "now-later", db), false);
      assert.equal(await setAreaWip(a, area.id, 9, db), false);
      assert.equal(await moveTask(a, listed.id, "now", db), false);
      assert.equal(await scheduleOn(a, listed.id, "2026-12-01", today, db), false);
      assert.deepEqual(await areaRow(area.id), areaBefore);
      assert.deepEqual(await rowOf(listed.id), taskBefore);
      const readA = await loadAccount(a, db);
      const readB = await loadAccount(b, db);
      assert.equal(readA.areas.some((row) => row.id === area.id), false);
      assert.equal(readA.hiddenAreaIds.includes(area.id), false);
      assert.equal(readA.tasks.some((row) => row.id === listed.id), false);
      assert.equal(readB.hiddenAreaIds.includes(area.id), false);
      assert.equal(await setAreaHidden(b, area.id, true, db), true);
      assert.equal((await loadAccount(b, db)).hiddenAreaIds.includes(area.id), true);
      assert.equal((await loadAccount(a, db)).hiddenAreaIds.includes(area.id), false);
    });

    test("deleting an Area is refused while it still has a Task, including a completed one", async () => {
      const c = await account();
      const added = (await addTask(c, { today, name: "Stays" }, db))!;
      const [area] = (await loadAccount(c, db)).areas;
      assert.equal(await deleteArea(c, area!.id, db), "has-tasks");
      assert.equal((await areaRow(area!.id)).name, "Tasks");
      await completeTask(c, added.id, db);
      assert.equal(await deleteArea(c, area!.id, db), "has-tasks");
      assert.equal((await areaRow(area!.id)).name, "Tasks");
    });

    test("deleting an Area clears it from the hidden list", async () => {
      const c = await account();
      const area = (await createArea(c, "Gone", db))!;
      assert.equal(await setAreaHidden(c, area.id, true, db), true);
      assert.equal(await deleteArea(c, area.id, db), "deleted");
      assert.deepEqual((await loadAccount(c, db)).hiddenAreaIds, []);
      assert.deepEqual(
        await db.select({ id: areas.id }).from(areas).where(eq(areas.id, area.id)),
        [],
      );
    });

    test("renaming to another Area's name, ignoring case, is refused", async () => {
      const c = await account();
      const work = (await createArea(c, "Work", db))!;
      const tasksArea = (await loadAccount(c, db)).areas.find(
        (row) => row.name === "Tasks",
      )!;
      assert.equal(await renameArea(c, tasksArea.id, "work", db), null);
      assert.equal((await areaRow(tasksArea.id)).name, "Tasks");
      assert.equal((await areaRow(work.id)).name, "Work");
    });

    test("scheduling today or an earlier day is refused", async () => {
      const c = await account();
      const added = (await addTask(c, { today, name: "When" }, db))!;
      assert.equal(await scheduleOn(c, added.id, today, today, db), false);
      assert.equal(await scheduleOn(c, added.id, "2026-10-08", today, db), false);
      assert.equal((await rowOf(added.id)).scheduledOn, null);
    });
  },
);
