import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";
import { areas, createDb, goals, tasks, users } from "@repo/db";
import { eq, inArray, sql } from "drizzle-orm";
import {
  changePriority,
  completeTask,
  moveTask,
  scheduleOn,
  setTaskGoal,
  taskDetail,
  updateOpenTask,
} from "./owned-task.ts";

const url = process.env.TEST_POSTGRES_URL;
if (!url && process.env.CI) {
  test("owned Task tests require Postgres in CI", () => {
    assert.fail("TEST_POSTGRES_URL missing");
  });
} else if (!url) {
  console.warn("Owned Task tests SKIPPED: TEST_POSTGRES_URL missing");
}

const today = "2026-10-16";
const future = "2026-11-01";

describe(
  "owned Task interface",
  { skip: !url && "TEST_POSTGRES_URL missing" },
  () => {
    const db = createDb(url!);
    const accounts: string[] = [];

    after(async () => {
      if (accounts.length)
        await db.delete(users).where(inArray(users.id, accounts));
      await db.$client.end();
    });

    async function fixture() {
      const userId = randomUUID();
      await db
        .insert(users)
        .values({
          id: userId,
          email: `${userId}@test.invalid`,
          passwordHash: "-",
        });
      accounts.push(userId);
      const [area] = await db
        .insert(areas)
        .values({ userId, name: "Work", workflow: "kanban", wipLimit: 4 })
        .returning();
      const [task] = await db
        .insert(tasks)
        .values({
          areaId: area!.id,
          name: "Ship",
          note: "A note",
          priority: 0,
          age: today,
        })
        .returning();
      return { userId, area: area!, task: task! };
    }

    async function goal(areaId: string, name = "Launch", position = 0) {
      const [row] = await db
        .insert(goals)
        .values({ areaId, name, position })
        .returning();
      return row!;
    }

    async function row(id: string) {
      return (await db.select().from(tasks).where(eq(tasks.id, id)))[0]!;
    }

    async function refused(userId: string, taskId: string) {
      assert.equal(await completeTask(userId, taskId, db), null);
      assert.equal(await changePriority(userId, taskId, 1, db), undefined);
      assert.equal(await moveTask(userId, taskId, "now", db), false);
      assert.equal(await scheduleOn(userId, taskId, future, today, db), null);
      assert.equal(await setTaskGoal(userId, taskId, null, db), false);
      assert.equal(
        await updateOpenTask(
          userId,
          taskId,
          { name: "Changed", status: "started", priority: 2, goal: null },
          db,
        ),
        null,
      );
    }

    test("foreign, missing and malformed Tasks retain each operation's refusal shape", async () => {
      const owner = await fixture();
      const other = await fixture();
      const before = await row(owner.task.id);
      for (const id of [owner.task.id, randomUUID(), "not-a-uuid", ""]) {
        await refused(other.userId, id);
        assert.equal(await taskDetail(other.userId, id, db), null);
      }
      assert.deepEqual(await row(owner.task.id), before);
    });

    test("either completion marker refuses every command while detail stays readable", async () => {
      for (const marker of ["both", "status", "timestamp"]) {
        const { userId, task } = await fixture();
        assert.deepEqual(await completeTask(userId, task.id, db), {
          id: task.id,
          name: task.name,
        });
        if (marker === "status") {
          await db
            .update(tasks)
            .set({ completedAt: null })
            .where(eq(tasks.id, task.id));
        } else if (marker === "timestamp") {
          await db
            .update(tasks)
            .set({ status: "later" })
            .where(eq(tasks.id, task.id));
        }
        const before = await row(task.id);
        await refused(userId, task.id);
        assert.deepEqual(await row(task.id), before);
        const detail = await taskDetail(userId, task.id, db);
        assert.equal(detail?.task.status, before.status);
        assert.deepEqual(detail?.task.completedAt, before.completedAt);
      }
    });

    test("concurrent priority changes serialize, including both limits", async () => {
      const { userId, task } = await fixture();
      await db.update(tasks).set({ priority: -2 }).where(eq(tasks.id, task.id));
      await Promise.all(
        [1, 2, 3].map(() => changePriority(userId, task.id, 1, db)),
      );
      assert.equal((await row(task.id)).priority, 1);
      await Promise.all(
        [1, 2, 3].map(() => changePriority(userId, task.id, 1, db)),
      );
      assert.equal((await row(task.id)).priority, 2);
      await Promise.all(
        [1, 2, 3, 4, 5, 6].map(() => changePriority(userId, task.id, -1, db)),
      );
      assert.equal((await row(task.id)).priority, -2);
    });

    test("Goal ids must exist in the Task's Area; names retain trim and case matching", async () => {
      const { userId, area, task } = await fixture();
      const other = await fixture();
      const [away] = await db
        .insert(areas)
        .values({ userId, name: "Away", workflow: "priority-list" })
        .returning();
      const own = await goal(area.id);
      const foreign = await goal(other.area.id, "Foreign");
      const differentArea = await goal(away!.id, "Elsewhere");
      const before = await row(task.id);
      for (const id of [
        foreign.id,
        differentArea.id,
        randomUUID(),
        "bad-id",
        own.id.toUpperCase(),
      ]) {
        assert.equal(await setTaskGoal(userId, task.id, id, db), false);
        assert.deepEqual(await row(task.id), before);
      }
      for (const name of ["Foreign", "Elsewhere", "Missing"]) {
        assert.equal(
          await updateOpenTask(
            userId,
            task.id,
            { name: "Not saved", goal: name },
            db,
          ),
          null,
        );
        assert.deepEqual(await row(task.id), before);
      }
      assert.equal(await setTaskGoal(userId, task.id, own.id, db), true);
      assert.equal((await row(task.id)).goalId, own.id);
      assert.equal(await setTaskGoal(userId, task.id, null, db), true);
      assert.equal((await row(task.id)).goalId, null);
      assert.deepEqual(
        await updateOpenTask(userId, task.id, { goal: " \tlaUNCH\u00a0" }, db),
        { id: task.id, name: task.name },
      );
      assert.equal((await row(task.id)).goalId, own.id);
      // Empty and null clear, whereas omission keeps the current Goal.
      await updateOpenTask(userId, task.id, { note: "Kept" }, db);
      assert.equal((await row(task.id)).goalId, own.id);
      for (const clear of ["  ", null]) {
        await setTaskGoal(userId, task.id, own.id, db);
        assert.ok(await updateOpenTask(userId, task.id, { goal: clear }, db));
        assert.equal((await row(task.id)).goalId, null);
      }
    });

    test("detail returns the existing projection, including hidden Areas and only their Goals", async () => {
      const { userId, area, task } = await fixture();
      const first = await goal(area.id, "First", 1);
      const second = await goal(area.id, "Second", 0);
      const other = await fixture();
      await goal(other.area.id);
      await db
        .update(users)
        .set({ hiddenAreaIds: [area.id] })
        .where(eq(users.id, userId));
      const detail = await taskDetail(userId, task.id, db);
      assert.deepEqual(detail?.task, {
        id: task.id,
        areaId: area.id,
        name: "Ship",
        note: "A note",
        priority: 0,
        status: "later",
        previousStatus: null,
        age: today,
        date: null,
        goalId: null,
        completedAt: null,
        createdAt: task.createdAt,
      });
      assert.deepEqual(detail?.area, {
        id: area.id,
        name: "Work",
        workflow: "kanban",
        wipLimit: 4,
        createdAt: area.createdAt,
      });
      assert.deepEqual(
        detail?.goals,
        [first, second].map((g) => ({
          id: g.id,
          areaId: g.areaId,
          name: g.name,
          order: g.position,
        })),
      );
      assert.equal(await taskDetail(userId, task.id.toUpperCase(), db), null);
      // Hidden is a list-rendering preference; it doesn't prohibit commands.
      await changePriority(userId, task.id.toUpperCase(), 1, db);
      assert.equal(await moveTask(userId, task.id, "started", db), true);
      assert.equal(await setTaskGoal(userId, task.id, first.id, db), true);
      assert.ok(
        await updateOpenTask(userId, task.id, { note: "Hidden edit" }, db),
      );
      assert.deepEqual(await scheduleOn(userId, task.id, future, today, db), {
        id: task.id,
        name: task.name,
      });
      const scheduled = await row(task.id);
      assert.equal(scheduled.status, "later");
      assert.equal(scheduled.previousStatus, "started");
      assert.equal(scheduled.age, future);
      assert.equal(scheduled.scheduledOn, future);
      assert.equal(scheduled.priority, 1);
      assert.equal(scheduled.goalId, first.id);
      assert.ok(await completeTask(userId, task.id, db));
      assert.equal(
        (await taskDetail(userId, task.id, db))?.task.status,
        "completed",
      );
    });

    test("priority changes acquire no Area or User row locks", async () => {
      const { userId, area, task } = await fixture();
      await db.transaction(async (holding) => {
        await holding
          .select()
          .from(areas)
          .where(eq(areas.id, area.id))
          .for("update");
        await holding
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .for("update");
        await db.transaction(async (editing) => {
          await editing.execute(sql`set local lock_timeout = '1s'`);
          await changePriority(userId, task.id, 1, editing);
        });
      });
      assert.equal((await row(task.id)).priority, 1);
    });

    test("unrelated account collections do not affect single-Task reads or commands", async () => {
      const { userId, area, task } = await fixture();
      const own = await goal(area.id);
      const before = await taskDetail(userId, task.id, db);
      const unrelatedAreas = await db
        .insert(areas)
        .values(
          Array.from({ length: 40 }, (_, i) => ({
            userId,
            name: `Unrelated ${i}`,
            workflow: "legacy-workflow",
          })),
        )
        .returning({ id: areas.id });
      await db
        .insert(goals)
        .values(
          unrelatedAreas.map((a) => ({
            areaId: a.id,
            name: "Launch",
            position: 0,
          })),
        );
      await db
        .insert(tasks)
        .values(
          unrelatedAreas.flatMap((a) =>
            Array.from({ length: 10 }, () => ({
              areaId: a.id,
              name: "Unrelated",
              age: "infinity",
              priority: 2,
            })),
          ),
        );
      const unrelatedBefore = await db
        .select()
        .from(tasks)
        .where(
          inArray(
            tasks.areaId,
            unrelatedAreas.map((a) => a.id),
          ),
        );
      assert.deepEqual(await taskDetail(userId, task.id, db), before);
      await changePriority(userId, task.id, 1, db);
      assert.equal(await moveTask(userId, task.id, "now", db), true);
      assert.equal(await setTaskGoal(userId, task.id, own.id, db), true);
      assert.ok(
        await updateOpenTask(
          userId,
          task.id,
          { goal: "launch", name: "Still targeted" },
          db,
        ),
      );
      assert.ok(await scheduleOn(userId, task.id, future, today, db));
      assert.deepEqual(await completeTask(userId, task.id, db), {
        id: task.id,
        name: "Still targeted",
      });
      const after = await taskDetail(userId, task.id, db);
      assert.equal(after?.task.goalId, own.id);
      assert.equal(after?.task.priority, 1);
      assert.deepEqual(after?.area, before?.area);
      assert.deepEqual(after?.goals, before?.goals);
      assert.deepEqual(
        await db
          .select()
          .from(tasks)
          .where(
            inArray(
              tasks.areaId,
              unrelatedAreas.map((a) => a.id),
            ),
          ),
        unrelatedBefore,
      );
    });
  },
);
