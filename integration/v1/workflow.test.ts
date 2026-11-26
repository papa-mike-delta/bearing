import { execFileSync } from "node:child_process";
import { beforeAll, afterAll, beforeEach, expect, it } from "vitest";
import { Workflow } from "@/lib/v1/workflow";
import { V1, type Principal } from "@/lib/v1/service";
import { V1Backup } from "@/lib/v1/service/backup";
import { db } from "@/lib/db";
import { SESSION_COOKIE, createSession } from "@/lib/session";
import { POST, PUT, GET } from "@/app/api/v1/[...path]/route";
const userId = "workflow-alice",
  other = "workflow-bob",
  p: Principal = { userId, actor: `user:${userId}` },
  q: Principal = { userId: other, actor: `user:${other}` };
const input = (extra: object = {}) => ({
  clientId: crypto.randomUUID(),
  text: "  An unclassified line\n",
  capturedAt: new Date().toISOString(),
  occurredAt: "2026-10-25T02:30:00Z",
  timezone: "America/New_York",
  ...extra,
});
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
it("captures once under retries/concurrency and keeps original text, capture time and local date", async () => {
  const value = input();
  const [a, b] = await Promise.all([
    V1.capture(p, value),
    V1.capture(p, value),
  ]);
  expect(a.value.id).toBe(b.value.id);
  expect(a.value).toMatchObject({
    text: value.text,
    localDate: "2026-10-24",
    needsOrganization: true,
  });
  expect(a.value.capturedAt.toISOString()).toBe(value.capturedAt);
  expect(a.receiptId).toBeTruthy();
  expect(
    await db.ledger.count({
      where: { userId, operation: "v1.capture", status: "success" },
    }),
  ).toBeGreaterThan(0);
  expect(await db.proposal.count({ where: { userId } })).toBe(0);
  await expect(
    V1.capture(p, { ...value, text: "Different" }),
  ).rejects.toMatchObject({ status: 409 });
  expect(await db.item.count({ where: { userId } })).toBe(1);
});
it("creates one canonical Task from an explicit shortcut and reflects its edits in Journal references", async () => {
  const value = input({ text: "/task Call Alex" });
  const capture = await V1.capture(p, value);
  await V1.capture(p, value);
  expect(capture.value.items).toHaveLength(1);
  const item = await V1.item(userId, capture.value.items[0].itemId);
  await V1.updateItem(p, item.id, item.revision, {
    type: "task",
    title: item.title,
    content: item.content,
    status: "done",
  });
  const state = await Workflow.workspace(userId);
  expect(state.items.find((i) => i.id === item.id)?.status).toBe("done");
  expect(state.moments[0].items[0].item.status).toBe("done");
  expect(await db.item.count({ where: { userId, type: "task" } })).toBe(1);
});
it("promotes a raw entry atomically and retry after organization/edit never duplicates the source", async () => {
  const value = input();
  const moment = (await V1.capture(p, value)).value;
  const body = {
    revision: moment.revision,
    item: { type: "task", title: "Clarified Task", status: "todo" },
  };
  await Promise.all([
    V1.organize(p, moment.id, body),
    V1.organize(p, moment.id, body),
  ]);
  const current = await db.journalMoment.findUniqueOrThrow({
    where: { id: moment.id },
  });
  await V1.editMoment(p, moment.id, {
    revision: current.revision,
    text: "Clarified Journal context",
    occurredAt: value.occurredAt,
    timezone: value.timezone,
  });
  await V1.capture(p, value);
  expect(await db.item.count({ where: { userId, type: "task" } })).toBe(1);
  expect((await Workflow.workspace(userId)).moments[0].text).toBe(
    "Clarified Journal context",
  );
});
it("separates check-ins from Journal records, preserves incomplete commands for clarification", async () => {
  const a = input({ text: "/mood 4 energy 3" });
  await V1.capture(p, a);
  await V1.capture(p, a);
  await V1.capture(p, input({ text: "/task" }));
  const state = await Workflow.workspace(userId);
  expect(state.activities).toHaveLength(1);
  expect(state.moments.filter((m) => m.needsOrganization)).toHaveLength(1);
  expect(await db.item.count({ where: { userId, type: "task" } })).toBe(0);
});
it("promotes a Markdown checkbox once with an atomic parent update", async () => {
  const parent = (
    await V1.createItem(p, {
      type: "task",
      title: "Parent",
      content: "- [ ] Call Alex",
    })
  ).value;
  const body = { revision: parent.revision, line: 0, clientId: "promote-step" };
  const a = await V1.promoteTask(p, parent.id, body),
    b = await V1.promoteTask(p, parent.id, body);
  expect(a.value.itemId).toBe(b.value.itemId);
  expect((await V1.item(userId, parent.id)).content).toContain(
    `/app/library/${a.value.itemId}`,
  );
  expect(await db.item.count({ where: { userId, type: "task" } })).toBe(2);
});
it("universal keyword search finds every supported record kind and respects Area inheritance and ownership", async () => {
  const area = (await V1.createTag(p, { name: "Needle Area", kind: "area" }))
    .value;
  const project = (
    await V1.createProject(p, { name: "Needle Project", tagIds: [area.id] })
  ).value;
  const task = (
    await V1.createItem(p, {
      type: "task",
      title: "Needle Task",
      projectId: project.id,
    })
  ).value;
  await V1.capture(p, input({ text: "Needle Journal" }));
  await V1.createReview(p, {
    period: "daily",
    localDate: "2026-10-24",
    timezone: "UTC",
    prompts: { notes: "Needle Review" },
  });
  await V1.createActivity(p, {
    clientId: "activity",
    kind: "observation",
    occurredAt: new Date().toISOString(),
    timezone: "UTC",
    data: { text: "Needle observation" },
  });
  const foreign = (
    await V1.createItem(q, { type: "note", title: "Needle Private" })
  ).value;
  const results = await Workflow.search(userId, { q: "Needle" });
  expect(new Set(results.map((r) => r.kind)).size).toBe(6);
  expect(results.some((r) => r.id === foreign.id)).toBe(false);
  expect(
    (await Workflow.search(userId, { q: "Needle", areaId: area.id })).map(
      (r) => r.id,
    ),
  ).toContain(task.id);
  expect(
    await Workflow.search(other, { q: "Needle", areaId: area.id }),
  ).toHaveLength(0);
  expect(results.every((r) => r.href.startsWith("/app/"))).toBe(true);
});
it("treats wildcard characters as literal keywords and searches typed metadata", async () => {
  await V1.createItem(p, {
    type: "person",
    title: "Alex",
    metadata: { email: "a_percent@example.test" },
  });
  expect(
    (await Workflow.search(userId, { q: "_percent" })).map((r) => r.title),
  ).toEqual(["Alex"]);
  expect(await Workflow.search(userId, { q: "%" })).toHaveLength(0);
});
it("refuses cross-account classification, preferences and sync under a switched cookie", async () => {
  const moment = (await V1.capture(p, input())).value;
  await expect(
    V1.organize(q, moment.id, { revision: 0 }),
  ).rejects.toMatchObject({ status: 404 });
  const req = new Request("http://localhost/api/v1/capture", {
    method: "POST",
    headers: {
      cookie: `${SESSION_COOKIE}=${createSession(other, "other@example.test", true)}`,
      "X-Bearing-Account": userId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input()),
  });
  const result = await POST(req, {
    params: Promise.resolve({ path: ["capture"] }),
  });
  expect(result.status).toBe(409);
  expect(await db.journalMoment.count({ where: { userId: other } })).toBe(0);
  await Workflow.setPreferences(p, {
    startup: "journal",
    timezone: "America/New_York",
  });
  expect((await Workflow.preferences(other)).startup).toBeUndefined();
  const search = await GET(
    new Request("http://localhost/api/v1/search?q=Needle", {
      headers: {
        cookie: `${SESSION_COOKIE}=${createSession(other, "other@example.test", false)}`,
      },
    }),
    { params: Promise.resolve({ path: ["search"] }) },
  );
  expect(search.status).toBe(401);
});

it("organizing an explicit Task capture clears both Inbox flags without another Item", async () => {
  const captured = (
    await V1.capture(p, input({ text: "/task Ready to organize" }))
  ).value;
  const itemId = captured.items[0].itemId;
  const organized = await V1.organize(p, captured.id, {
    revision: captured.revision,
  });
  expect(organized.value.needsOrganization).toBe(false);
  expect((await V1.item(userId, itemId)).status).toBe("todo");
  expect(await db.item.count({ where: { userId, type: "task" } })).toBe(1);
});

// #46: connected life contracts over the same canonical records.
it("keeps Person mentions, confirmed interactions, follow-ups and linked references distinct and tenant scoped", async () => {
  const person = (
    await V1.createItem(p, {
      type: "person",
      title: "Alex",
      metadata: {
        version: 1,
        email: "alex@example.test",
        birthday: "1990-12-25",
      },
    })
  ).value;
  const book = (
    await V1.createItem(p, {
      type: "bookmark",
      template: "media",
      title: "A flexible reference",
      metadata: { version: 1, category: "media", format: "Audio essay" },
    })
  ).value;
  await V1.createLink(p, {
    fromId: person.id,
    toId: book.id,
    type: "related_to",
  });
  const moment = (
    await V1.capture(
      p,
      input({ text: "Thought about Alex", mentionIds: [person.id] }),
    )
  ).value;
  await V1.mention(p, moment.id, {
    itemId: person.id,
    revision: moment.revision,
  });
  expect(
    await db.momentItem.count({
      where: { userId, momentId: moment.id, itemId: person.id },
    }),
  ).toBe(1);
  expect(
    await db.activity.count({ where: { userId, kind: "interaction" } }),
  ).toBe(0);
  const task = (
    await V1.createItem(p, {
      type: "task",
      title: "Call Alex",
      status: "delegated",
      delegateId: person.id,
      followUpAt: "2026-11-01T12:00:00Z",
    })
  ).value;
  expect(
    (await V1.items(userId, { status: "in_progress" })).map((i) => i.id),
  ).toContain(task.id);
  const contact = {
    kind: "interaction",
    clientId: "contact-alex",
    itemId: person.id,
    occurredAt: "2026-10-25T14:00:00Z",
    timezone: "UTC",
    data: { note: "Spoke on phone" },
  };
  await V1.createActivity(p, contact);
  await V1.createActivity(p, contact);
  expect(
    await db.activity.count({ where: { userId, kind: "interaction" } }),
  ).toBe(1);
  await expect(
    V1.mention(q, moment.id, { itemId: person.id, revision: moment.revision }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    V1.createLink(q, { fromId: person.id, toId: book.id, type: "related_to" }),
  ).rejects.toMatchObject({ status: 404 });
  expect((await Workflow.workspace(other)).links).toEqual([]);
});
it("links private health-reference Notes to canonical Me without creating a second identity", async () => {
  const me = await V1.me(userId);
  const note = (
    await V1.createItem(p, {
      type: "note",
      template: "note",
      title: "Private medication reference",
      content: "Reference only, no advice.",
    })
  ).value;
  await V1.createLink(p, { fromId: note.id, toId: me.id, type: "related_to" });
  expect((await Workflow.workspace(userId)).links).toHaveLength(1);
  expect(await Workflow.search(other, { q: "medication" })).toEqual([]);
  await expect(V1.item(other, note.id)).rejects.toMatchObject({ status: 404 });
  expect((await V1.me(other)).id).not.toBe(me.id);
});
it("saves routine steps independently and resets the next occurrence while preserving completed snapshots", async () => {
  const habit = (
    await V1.createItem(p, {
      type: "habit",
      template: "routine",
      title: "Morning routine",
      content: "- [x] Drink water\n- [ ] Stretch",
      timezone: "America/New_York",
      metadata: { version: 1, cadence: "daily", unit: "rounds" },
    })
  ).value;
  const payload = {
    revision: 0,
    occurredAt: "2026-11-01T05:30:00Z",
    timezone: "America/New_York",
    checklist: [true, false],
    value: 2,
    complete: false,
  };
  const draft = (await V1.habit(p, habit.id, payload)).value;
  expect(draft.completed).toBe(false);
  expect(
    await db.activity.count({ where: { userId, kind: "habit_completion" } }),
  ).toBe(0);
  const complete = { ...payload, revision: draft.revision, complete: true };
  const [a, b] = await Promise.all([
    V1.habit(p, habit.id, complete),
    V1.habit(p, habit.id, complete),
  ]);
  expect(a.value).toEqual(b.value);
  const history = await db.activity.findMany({
    where: { userId, kind: "habit_completion" },
  });
  expect(history).toHaveLength(1);
  expect(history[0].data).toMatchObject({
    content: habit.content,
    checklist: [true, false],
    value: 2,
    period: "2026-11-01",
  });
  expect((await V1.item(userId, habit.id)).status).toBe("inbox");
  await V1.habit(p, habit.id, {
    ...payload,
    occurredAt: "2026-11-02T17:00:00Z",
    checklist: [false, false],
  });
  const rows = (await Workflow.workspace(userId)).habitOccurrences;
  expect(rows).toHaveLength(2);
  expect(rows.find((r) => r.key.endsWith("2026-11-02"))?.value).toMatchObject({
    checklist: [false, false],
    completed: false,
  });
  await expect(V1.habit(q, habit.id, payload)).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    V1.habit(p, habit.id, { ...complete, value: 3 }),
  ).rejects.toMatchObject({ status: 409 });
});
it("records one Focus Activity per session while mood check-ins and Reviews remain separate", async () => {
  const task = (await V1.createItem(p, { type: "task", title: "Focus anchor" }))
    .value;
  const focus = {
    kind: "focus",
    clientId: "focus-session-one",
    occurredAt: "2026-10-25T14:00:00Z",
    timezone: "UTC",
    itemId: task.id,
    data: { minutes: 25 },
  };
  await Promise.all([V1.createActivity(p, focus), V1.createActivity(p, focus)]);
  expect(await db.activity.count({ where: { userId, kind: "focus" } })).toBe(
    1,
  );
  const mood = {
    kind: "check_in",
    clientId: "mood-one",
    occurredAt: "2026-10-25T15:00:00Z",
    timezone: "UTC",
    data: { mood: 4, energy: 3 },
  };
  await V1.createActivity(p, mood);
  await V1.createActivity(p, { ...mood, data: { energy: 3, mood: 4 } });
  await V1.createActivity(p, {
    ...mood,
    clientId: "mood-two",
    occurredAt: "2026-10-25T17:00:00Z",
  });
  await V1.createReview(p, {
    period: "daily",
    localDate: "2026-10-25",
    timezone: "UTC",
    prompts: { notes: "A separate reflection" },
  });
  expect(
    await db.activity.count({ where: { userId, kind: "check_in" } }),
  ).toBe(2);
  expect(await db.review.count({ where: { userId } })).toBe(1);
  expect((await V1.item(userId, task.id)).status).toBe("inbox");
  await expect(V1.createActivity(q, focus)).rejects.toMatchObject({
    status: 404,
  });
});
it("captures Place coordinates once without venue lookup or visit Activity", async () => {
  const value = input({
    text: "By the river",
    place: { latitude: 40.7, longitude: -73.9 },
  });
  const a = await V1.capture(p, value),
    b = await V1.capture(p, value);
  expect(a.value.id).toBe(b.value.id);
  const places = await V1.items(userId, { type: "bookmark" });
  expect(places).toHaveLength(1);
  expect(places[0].metadata).toMatchObject({
    category: "place",
    latitude: 40.7,
    longitude: -73.9,
  });
  expect(await db.activity.count({ where: { userId } })).toBe(0);
});

it("revision-checks Journal mentions and refuses foreign or unapproved writes without partial associations", async () => {
  const moment = (await V1.capture(p, input())).value;
  const person = (await V1.createItem(p, { type: "person", title: "Alex" }))
    .value;
  const foreign = (await V1.createItem(q, { type: "person", title: "Private" }))
    .value;
  const mention = { itemId: person.id, revision: moment.revision };
  await expect(
    V1.mention(p, moment.id, { ...mention, itemId: foreign.id }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(V1.mention(q, moment.id, mention)).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    V1.mention({ userId, actor: "agent:coach" }, moment.id, mention),
  ).rejects.toMatchObject({ status: 403 });
  expect(
    await db.momentItem.count({ where: { userId, momentId: moment.id } }),
  ).toBe(0);
  expect(
    await db.journalMoment.findUnique({ where: { id: moment.id } }),
  ).toMatchObject({ revision: moment.revision });
  const result = await V1.mention(p, moment.id, mention);
  expect(
    await db.ledger.findUnique({ where: { id: result.receiptId } }),
  ).toMatchObject({ operation: "v1.moment.mention", status: "success" });
  await expect(V1.mention(p, moment.id, mention)).rejects.toMatchObject({
    status: 409,
  });
  expect(
    await db.journalMoment.findUnique({ where: { id: moment.id } }),
  ).toMatchObject({ revision: moment.revision + 1 });
  expect(
    await db.momentItem.count({ where: { userId, momentId: moment.id } }),
  ).toBe(1);
});
it("saves capture, Journal typing, and Inbox filing through the user routes with receipts and no approval proposal", async () => {
  const headers = {
    cookie: `${SESSION_COOKIE}=${createSession(userId, `${userId}@example.test`, true)}`,
    "content-type": "application/json",
    "X-Bearing-Account": userId,
  };
  const call = (path: string[], method: "POST" | "PUT", body: unknown) =>
    (method === "POST" ? POST : PUT)(
      new Request(`http://localhost/api/v1/${path.join("/")}`, {
        method,
        headers,
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ path }) },
    );
  const captured = await call(["capture"], "POST", input({ text: "Route capture" }));
  expect(captured.status).toBe(200);
  const saved = await captured.json();
  expect(saved.value.text).toBe("Route capture");
  expect(saved.receiptId).toBeTruthy();
  const edited = await call(["journal", saved.value.id], "PUT", {
    revision: saved.value.revision,
    text: "Typed in the Journal",
    occurredAt: saved.value.occurredAt,
    timezone: saved.value.timezone,
  });
  expect(edited.status).toBe(200);
  const typed = await edited.json();
  expect(typed.value.text).toBe("Typed in the Journal");
  const filed = await call(["journal", saved.value.id, "organize"], "POST", {
    revision: typed.value.revision,
    item: { type: "task", title: "Filed from Inbox", status: "todo" },
  });
  expect(filed.status).toBe(200);
  const organized = await filed.json();
  expect(organized.value.needsOrganization).toBe(false);
  expect(await db.proposal.count({ where: { userId } })).toBe(0);
  const operations = (
    await db.ledger.findMany({
      where: { userId, status: "success" },
      select: { operation: true },
    })
  ).map((row) => row.operation);
  expect(operations).toEqual(
    expect.arrayContaining([
      "v1.capture",
      "v1.moment.update",
      "v1.moment.organize",
      "v1.item.create",
    ]),
  );
});
