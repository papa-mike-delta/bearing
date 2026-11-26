import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, expect, it } from "vitest";
import { db } from "@/lib/db";
import { V1, type Principal } from "@/lib/v1/service";

const owner = "org-owner";
const other = "org-other";
const p: Principal = { userId: owner, actor: `user:${owner}` };
const q: Principal = { userId: other, actor: `user:${other}` };
const when = "2026-11-26T15:00:00.000Z";

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

it("archives and deletes a project while keeping its items", async () => {
  const project = (
    await V1.createProject(p, { name: "Shed", description: "Tools" })
  ).value;
  const item = (
    await V1.createItem(p, {
      type: "task",
      title: "Oil the hinge",
      projectId: project.id,
    })
  ).value;
  const archived = await V1.updateProject(p, project.id, project.revision, {
    name: "Shed",
    description: "Tools",
    status: "archived",
  });
  expect(archived.value.status).toBe("archived");
  await expect(
    V1.deleteProject(q, project.id, { revision: archived.value.revision }),
  ).rejects.toMatchObject({ status: 404 });
  await V1.deleteProject(p, project.id, { revision: archived.value.revision });
  const kept = await V1.item(owner, item.id);
  expect(kept.projectId).toBeNull();
  expect(kept.revision).toBe(item.revision + 1);
  expect(await db.project.findUnique({ where: { id: project.id } })).toBeNull();
});

it("renames and deletes labels and bumps open item revisions", async () => {
  const tag = (await V1.createTag(p, { name: "Home", kind: "area" })).value;
  const item = (
    await V1.createItem(p, {
      type: "note",
      title: "Porch",
      tagIds: [tag.id],
    })
  ).value;
  await expect(
    V1.updateTag(p, tag.id, {
      revision: 4,
      data: { name: "House", kind: "area" },
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    V1.updateTag(q, tag.id, {
      revision: 0,
      data: { name: "House", kind: "area" },
    }),
  ).rejects.toMatchObject({ status: 404 });
  await V1.updateTag(p, tag.id, {
    revision: 0,
    data: { name: "House", kind: "area" },
  });
  expect((await V1.item(owner, item.id)).revision).toBe(item.revision + 1);
  await expect(
    V1.updateItem(p, item.id, item.revision, {
      type: "note",
      title: "Porch",
      tagIds: [tag.id],
    }),
  ).rejects.toMatchObject({ status: 409 });
  const current = await V1.item(owner, item.id);
  await V1.deleteTag(p, tag.id, { revision: 1 });
  expect(await db.tag.findUnique({ where: { id: tag.id } })).toBeNull();
  expect((await V1.item(owner, item.id)).revision).toBe(current.revision + 1);
  expect((await V1.item(owner, item.id)).tags).toEqual([]);
});

it("edits and deletes a review and opens the same period instead of blocking it", async () => {
  const created = (
    await V1.createReview(p, {
      period: "weekly",
      localDate: "2026-11-23",
      timezone: "UTC",
      prompts: { wins: "First pass", priorities: [] },
    })
  ).value;
  const updated = await V1.updateReview(p, created.id, {
    revision: created.revision,
    data: {
      period: "weekly",
      localDate: "2026-11-23",
      timezone: "UTC",
      prompts: { wins: "Second pass", priorities: ["Rest"] },
    },
  });
  expect(updated.value.revision).toBe(1);
  await expect(
    V1.createReview(p, {
      period: "weekly",
      localDate: "2026-11-23",
      timezone: "UTC",
      prompts: { wins: "Duplicate", priorities: [] },
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    V1.deleteReview(q, created.id, { revision: 1 }),
  ).rejects.toMatchObject({ status: 404 });
  const removed = await V1.deleteReview(p, created.id, { revision: 1 });
  expect(removed.value).toEqual({ id: created.id, revision: 1 });
  expect(await db.review.findUnique({ where: { id: created.id } })).toBeNull();
  const again = await V1.createReview(p, {
    period: "weekly",
    localDate: "2026-11-23",
    timezone: "UTC",
    prompts: { wins: "After delete", priorities: [] },
  });
  expect(again.value.id).not.toBe(created.id);
});

it("stops a repeat series and can replace its rule", async () => {
  const task = (
    await V1.createItem(p, {
      type: "task",
      title: "Water",
      status: "todo",
      scheduledAt: when,
    })
  ).value;
  const series = (
    await V1.createRecurrence(p, task.id, task.revision, {
      mode: "completion",
      unit: "day",
      interval: 1,
      timezone: "UTC",
    })
  ).value;
  const edited = await V1.updateRecurrence(p, series.id, {
    revision: series.revision,
    rule: {
      mode: "completion",
      unit: "week",
      interval: 2,
      timezone: "UTC",
    },
  });
  expect(edited.value.rule).toMatchObject({ unit: "week", interval: 2 });
  await V1.updateRecurrence(p, series.id, {
    revision: edited.value.revision,
    active: false,
  });
  const stopped = await db.recurrence.findUniqueOrThrow({
    where: { id: series.id },
  });
  expect(stopped.active).toBe(false);
  const current = await V1.item(owner, task.id);
  await V1.updateItem(p, task.id, current.revision, {
    type: "task",
    title: "Water",
    status: "done",
    scheduledAt: when,
  });
  expect(await db.item.count({ where: { userId: owner, title: "Water" } })).toBe(1);
  await expect(
    V1.updateRecurrence(q, series.id, { revision: stopped.revision, active: true }),
  ).rejects.toMatchObject({ status: 404 });
});
