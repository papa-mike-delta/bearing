import { execFileSync } from "node:child_process";
import { beforeAll, afterAll, beforeEach, expect, it } from "vitest";
import { Workflow } from "@/lib/v1/workflow";
import { V1, type Principal } from "@/lib/v1/service";
import { V1Backup } from "@/lib/v1/service/backup";
import { LinkProposals } from "@/lib/v1/link-proposals";
import type { Workspace } from "@/lib/v1/client-model";
import { db } from "@/lib/db";

async function clientWorkspace(userId: string): Promise<Workspace> {
  // Proposal inference consumes the JSON workspace delivered to the browser.
  return JSON.parse(JSON.stringify(await Workflow.workspace(userId)));
}

const userId = "proposal-alice",
  other = "proposal-bob",
  p: Principal = { userId, actor: `user:${userId}` },
  q: Principal = { userId: other, actor: `user:${other}` };

beforeAll(async () => {
  for (const schema of ["prisma/schema.prisma"])
    execFileSync(
      process.execPath,
      [
        "node_modules/prisma/build/index.js",
        "migrate",
        "deploy",
        "--schema",
        schema,
      ],
      { env: process.env, stdio: "pipe" },
    );
  await db.account.createMany({
    data: [userId, other].map((id) => ({
      id,
      email: `${id}@example.test`,
      passwordHash: "test",
    })),
  });
});
afterAll(async () => {
  const schema = new URL(process.env.DATABASE_URL!).searchParams.get("schema")!;
  if (!/^v1_test_[a-f0-9]+$/.test(schema))
    throw new Error("Unsafe test schema");
  await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await db.$disconnect();
});
beforeEach(async () => {
  for (const person of [p, q]) {
    await V1Backup.reset(person, "RESET V1 DATA");
    await db.ledger.deleteMany({ where: { userId: person.userId } });
  }
});

const capture = (extra: Record<string, unknown> = {}) => ({
  clientId: crypto.randomUUID(),
  text: "Saw Alex",
  capturedAt: "2026-11-06T15:00:00.000Z",
  occurredAt: "2026-11-06T15:00:00.000Z",
  timezone: "America/New_York",
  ...extra,
});

async function successCount() {
  return db.ledger.count({
    where: { userId, operation: "v1.link.create", status: "success" },
  });
}

it("proposes a mentions Link from an explicit Journal Item and preserves a bare mention", async () => {
  const person = (
    await V1.createItem(p, { type: "person", title: "Alex" })
  ).value;
  const bare = (await V1.capture(p, capture({ mentionIds: [person.id] })))
    .value;
  expect(bare.items).toEqual([
    expect.objectContaining({ itemId: person.id, relation: "mention" }),
  ]);
  const before = await clientWorkspace(userId);
  expect(
    LinkProposals.infer(before).some(
      (card) =>
        card.accept.kind === "moment" && card.accept.relation === "mention",
    ),
  ).toBe(false);
  expect(await db.link.count({ where: { userId } })).toBe(0);

  const filed = (
    await V1.capture(
      p,
      capture({ text: "/note Clinic note", mentionIds: [person.id] }),
    )
  ).value;
  const workspace = await clientWorkspace(userId);
  const card = LinkProposals.infer(workspace).find(
    (entry) => entry.accept.kind === "link" && entry.accept.type === "mentions",
  );
  expect(card?.accept).toMatchObject({
    kind: "link",
    toId: person.id,
    type: "mentions",
  });
  expect(filed.items.some((ref) => ref.relation === "mention")).toBe(true);
  const linksBeforeAccept = await db.link.count({ where: { userId } });
  const ledgerBeforeReject = await db.ledger.count({ where: { userId } });
  expect(LinkProposals.reject()).toEqual({ writes: false });
  expect(await db.link.count({ where: { userId } })).toBe(linksBeforeAccept);
  expect(await db.ledger.count({ where: { userId } })).toBe(
    ledgerBeforeReject,
  );
});

it("accepts a health suggestion once, refuses another account, and blocks a stale revision", async () => {
  const me = await V1.me(userId);
  const note = (
    await V1.createItem(p, {
      type: "note",
      title: "Medication log",
      content: "Take with food.",
    })
  ).value;
  expect(await db.link.count({ where: { userId } })).toBe(0);
  const card = LinkProposals.infer(await clientWorkspace(userId)).find(
    (entry) => entry.id === `health:${note.id}:${me.id}`,
  );
  expect(card?.confidence).toBe("suggestion");
  expect(card?.accept).toMatchObject({
    kind: "link",
    type: "related_to",
    fromRevision: note.revision,
    toRevision: me.revision,
  });
  const payload = card!.accept;
  if (payload.kind !== "link") throw new Error("expected a Link suggestion");
  const { kind: _kind, ...link } = payload;
  const first = await V1.createLink(p, link);
  const second = await V1.createLink(p, link);
  expect(second.value.id).toBe(first.value.id);
  expect(second.receiptId).toBe(first.receiptId);
  expect(await db.link.count({ where: { userId } })).toBe(1);
  expect(await successCount()).toBe(1);
  expect(
    await db.ledger.count({
      where: { userId, operation: "v1.link.create", status: "refused" },
    }),
  ).toBe(0);

  await expect(V1.createLink(q, link)).rejects.toMatchObject({
    status: 404,
  });
  expect(await db.link.count({ where: { userId: other } })).toBe(0);
  await expect(V1.createLink(p, { ...link, userId })).rejects.toMatchObject({
    status: 400,
  });

  const fresh = (
    await V1.createItem(p, {
      type: "note",
      title: "Symptom log",
      content: "Mild headache.",
    })
  ).value;
  await V1.updateItem(p, fresh.id, fresh.revision, {
    type: "note",
    title: "Symptom log revised",
    content: fresh.content,
  });
  await expect(
    V1.createLink(p, {
      fromId: fresh.id,
      toId: me.id,
      type: "related_to",
      fromRevision: fresh.revision,
      toRevision: me.revision,
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    await db.link.count({
      where: { userId, fromId: fresh.id, toId: me.id },
    }),
  ).toBe(0);
  expect(await successCount()).toBe(1);
});

it("keeps unrevisioned duplicate Links on the existing refusal path", async () => {
  const me = await V1.me(userId);
  const note = (
    await V1.createItem(p, { type: "note", title: "Ordinary note" })
  ).value;
  await V1.updateItem(p, note.id, note.revision, {
    type: "note",
    title: "Ordinary note",
    content: "edited",
  });
  const body = { fromId: note.id, toId: me.id, type: "related_to" as const };
  await V1.createLink(p, body);
  await expect(V1.createLink(p, body)).rejects.toMatchObject({
    status: 409,
    message: "Record already exists",
  });
  expect(await db.link.count({ where: { userId } })).toBe(1);
  expect(await successCount()).toBe(1);
});

it("assigns an inherited Area only through the Item write and leaves GPS and Project membership unlinked", async () => {
  const area = (await V1.createTag(p, { name: "Home", kind: "area" })).value;
  const project = (
    await V1.createProject(p, { name: "Launch", tagIds: [area.id] })
  ).value;
  const goal = (
    await V1.createItem(p, {
      type: "goal",
      title: "Ship",
      projectId: project.id,
    })
  ).value;
  const task = (
    await V1.createItem(p, {
      type: "task",
      title: "Write",
      projectId: project.id,
    })
  ).value;
  const placed = await V1.capture(
    p,
    capture({
      text: "/place Cafe",
      place: { latitude: 40.71, longitude: -74 },
    }),
  );
  const workspace = await clientWorkspace(userId);
  const cards = LinkProposals.infer(workspace);
  expect(
    cards.flatMap((card) => card.accept.kind === "link" ? [card.accept.type] : []),
  ).not.toContain("advances");
  expect(
    cards.some(
      (card) =>
        card.accept.kind === "moment" && card.accept.relation === "located_at",
    ),
  ).toBe(true);
  expect(cards.map((card) => card.accept.kind)).toContain("area");
  expect(goal.projectId).toBe(project.id);
  expect(task.projectId).toBe(project.id);
  expect(placed.value.items.some((ref) => ref.relation === "reference")).toBe(
    true,
  );
  const suggestion = cards.find((card) => card.accept.kind === "area");
  if (!suggestion || suggestion.accept.kind !== "area")
    throw new Error("expected an Area suggestion");
  const accept = suggestion.accept;
  const current = workspace.items.find((item) => item.id === accept.itemId)!;
  const updated = await V1.updateItem(p, current.id, suggestion.accept.revision, {
    type: current.type,
    title: current.title,
    content: current.content,
    status: current.status,
    projectId: current.projectId,
    tagIds: [suggestion.accept.tagId],
    timezone: current.timezone,
  });
  expect(updated.value.directAreas.map((entry) => entry.id)).toContain(area.id);
  await expect(
    V1.updateItem(p, current.id, suggestion.accept.revision, {
      type: current.type,
      title: current.title,
      content: current.content,
      status: current.status,
      projectId: current.projectId,
      tagIds: [suggestion.accept.tagId],
      timezone: current.timezone,
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    await db.itemTag.count({
      where: { userId, itemId: current.id, tagId: area.id },
    }),
  ).toBe(1);
  expect(
    await db.link.count({
      where: { userId, OR: [{ fromId: goal.id }, { toId: goal.id }] },
    }),
  ).toBe(0);
  expect(placed.value.items.some((ref) => ref.relation === "located_at")).toBe(
    false,
  );
  const capturedPlace = (
    await clientWorkspace(userId)
  ).items.find((item) => item.type === "bookmark");
  expect(capturedPlace?.metadata).toMatchObject({
    capturedMomentId: placed.value.id,
    latitude: 40.71,
    longitude: -74,
  });
});

it("records a derived Journal mention once, and keeps an explicit mention immediate", async () => {
  const person = (await V1.createItem(p, { type: "person", title: "Alex Rivera" }))
    .value;
  const named = (
    await V1.capture(p, capture({ text: "Saw Alex Rivera today" }))
  ).value;
  expect(named.items).toEqual([]);
  const workspace = await clientWorkspace(userId);
  const card = LinkProposals.infer(workspace).find(
    (entry) => entry.id === `journal-mention:${named.id}:${person.id}`,
  );
  expect(card?.accept).toMatchObject({
    kind: "moment",
    relation: "mention",
    revision: named.revision,
  });
  const ledgerBefore = await db.ledger.count({ where: { userId } });
  expect(LinkProposals.reject()).toEqual({ writes: false });
  expect(await db.momentItem.count({ where: { userId } })).toBe(0);
  expect(await db.ledger.count({ where: { userId } })).toBe(ledgerBefore);
  const body = {
    itemId: person.id,
    revision: named.revision,
    relation: "mention" as const,
  };
  const [first, second] = await Promise.all([
    V1.relateMoment(p, named.id, body),
    V1.relateMoment(p, named.id, body),
  ]);
  expect(second.receiptId).toBe(first.receiptId);
  expect(
    await db.momentItem.count({
      where: { userId, relation: "mention", itemId: person.id },
    }),
  ).toBe(1);
  expect(
    await db.ledger.count({
      where: { userId, operation: "v1.moment.relate", status: "success" },
    }),
  ).toBe(1);
  const edited = await db.journalMoment.findUniqueOrThrow({
    where: { id: named.id },
  });
  await V1.editMoment(p, named.id, {
    revision: edited.revision,
    text: "Saw Alex Rivera later",
    occurredAt: "2026-11-06T15:00:00.000Z",
    timezone: "America/New_York",
  });
  const otherPerson = (
    await V1.createItem(p, { type: "person", title: "Sam" })
  ).value;
  await expect(
    V1.relateMoment(p, named.id, {
      itemId: otherPerson.id,
      revision: named.revision,
      relation: "mention",
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    await db.momentItem.count({ where: { userId, itemId: otherPerson.id } }),
  ).toBe(0);
  await expect(
    V1.relateMoment(q, named.id, body),
  ).rejects.toMatchObject({ status: 404 });
  const explicit = (
    await V1.capture(p, capture({ text: "Checked", mentionIds: [person.id] }))
  ).value;
  expect(explicit.items).toEqual([
    expect.objectContaining({ itemId: person.id, relation: "mention" }),
  ]);
});

it("places a promoted Task in its parent Project only when accepted", async () => {
  const project = (await V1.createProject(p, { name: "Launch" })).value;
  const parent = (
    await V1.createItem(p, {
      type: "task",
      title: "Parent list",
      content: "- [ ] Call Alex",
      projectId: project.id,
    })
  ).value;
  const explicit = (
    await V1.createItem(p, {
      type: "task",
      title: "Chosen",
      projectId: project.id,
    })
  ).value;
  expect(explicit.projectId).toBe(project.id);
  const promoted = await V1.promoteTask(p, parent.id, {
    revision: parent.revision,
    line: 0,
    clientId: "promote-project",
  });
  const child = await V1.item(userId, promoted.value.itemId);
  expect(child.projectId).toBeNull();
  const card = LinkProposals.infer(await clientWorkspace(userId)).find(
    (entry) => entry.id === `project:${child.id}:${project.id}`,
  );
  expect(card?.accept).toMatchObject({
    kind: "project",
    projectId: project.id,
    revision: child.revision,
  });
  const body = { projectId: project.id, revision: child.revision };
  const [first, second] = await Promise.all([
    V1.placeTask(p, child.id, body),
    V1.placeTask(p, child.id, body),
  ]);
  expect(second.receiptId).toBe(first.receiptId);
  expect((await V1.item(userId, child.id)).projectId).toBe(project.id);
  expect(
    await db.ledger.count({
      where: { userId, operation: "v1.task.place", status: "success" },
    }),
  ).toBe(1);
  const fresh = (
    await V1.createItem(p, { type: "task", title: "Later", projectId: null })
  ).value;
  await V1.updateItem(p, fresh.id, fresh.revision, {
    type: "task",
    title: "Later",
    projectId: project.id,
  });
  await expect(
    V1.placeTask(p, fresh.id, { projectId: project.id, revision: fresh.revision }),
  ).rejects.toMatchObject({ status: 409 });
  expect((await V1.item(userId, fresh.id)).projectId).toBe(project.id);
  await expect(
    V1.placeTask(q, child.id, body),
  ).rejects.toMatchObject({ status: 404 });
});

it("records that a located capture was at its Place and restores that relation", async () => {
  const before = await V1Backup.export(userId);
  const captured = (
    await V1.capture(
      p,
      capture({
        text: "Cafe stop",
        place: { latitude: 40.71, longitude: -74 },
      }),
    )
  ).value;
  const manual = (
    await V1.createItem(p, {
      type: "bookmark",
      template: "place",
      title: "Old place",
      metadata: { version: 1, category: "place", latitude: 1, longitude: 2 },
    })
  ).value;
  const workspace = await clientWorkspace(userId);
  const cards = LinkProposals.infer(workspace);
  expect(cards.some((card) => card.id === `located:${captured.id}:${manual.id}`)).toBe(
    false,
  );
  const card = cards.find((entry) => entry.id.startsWith("located:"));
  expect(card?.accept).toMatchObject({
    kind: "moment",
    relation: "located_at",
    revision: captured.revision,
  });
  expect(card?.reason).toContain("does not place Me");
  const body = {
    itemId: card && card.accept.kind === "moment" ? card.accept.itemId : "",
    revision: captured.revision,
    relation: "located_at" as const,
  };
  const [first, second] = await Promise.all([
    V1.relateMoment(p, captured.id, body),
    V1.relateMoment(p, captured.id, body),
  ]);
  expect(second.receiptId).toBe(first.receiptId);
  expect(
    await db.momentItem.count({ where: { userId, relation: "located_at" } }),
  ).toBe(1);
  expect(
    await db.ledger.count({
      where: { userId, operation: "v1.moment.relate", status: "success" },
    }),
  ).toBe(1);
  expect(
    await db.link.count({ where: { userId, type: "located_at" } }),
  ).toBe(0);
  const current = await db.journalMoment.findUniqueOrThrow({
    where: { id: captured.id },
  });
  await expect(
    V1.relateMoment(p, captured.id, {
      itemId: manual.id,
      revision: current.revision,
      relation: "located_at",
    }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(V1.relateMoment(q, captured.id, body)).rejects.toMatchObject({
    status: 404,
  });
  const exported = await V1Backup.export(userId);
  expect(
    exported.tables.momentItems.some((row) => row.relation === "located_at"),
  ).toBe(true);
  await V1Backup.restore(p, exported, "RESTORE V1 DATA");
  expect(
    await db.momentItem.count({ where: { userId, relation: "located_at" } }),
  ).toBe(1);
  await V1Backup.restore(p, before, "RESTORE V1 DATA");
  expect(
    await db.momentItem.count({ where: { userId, relation: "located_at" } }),
  ).toBe(0);
  expect(before.tables.momentItems.every((row) => row.relation !== "located_at")).toBe(
    true,
  );
});
