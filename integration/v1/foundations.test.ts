import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, expect, it } from "vitest";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { V1, type Principal } from "@/lib/v1/service";
import { V1Backup } from "@/lib/v1/service/backup";
import { V1Demo } from "@/lib/v1/service/demo";
import { registerInvited, invitationHash } from "@/lib/v1/invitations";
import { itemInput } from "@/lib/v1/contracts";
import { SESSION_COOKIE, createSession } from "@/lib/session";
import { generateTOTPCode } from "@/lib/auth";
import { GET, POST, PUT, DELETE } from "@/app/api/v1/[...path]/route";
import { POST as qrPost, GET as qrGet } from "@/app/api/auth/qr-login/route";
import { POST as setup2fa } from "@/app/api/auth/setup-2fa/route";
import { POST as verify2fa } from "@/app/api/auth/verify/route";
import { POST as registerRoute } from "@/app/api/auth/register/route";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const owner = "v1-owner",
  other = "v1-other";
const p: Principal = { userId: owner, actor: `user:${owner}` },
  q: Principal = { userId: other, actor: `user:${other}` };
const note = (title = "Note", extra: object = {}) => ({
  type: "note",
  title,
  ...extra,
});
const task = (extra: object = {}) => ({
  type: "task",
  title: "Task",
  status: "todo",
  ...extra,
});
const ids = () => randomUUID();
function req(
  path: string,
  method = "GET",
  body?: unknown,
  userId = owner,
  verified = true,
) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      cookie: `${SESSION_COOKIE}=${createSession(userId, `${userId}@example.test`, verified)}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function api(
  path: string,
  method = "GET",
  body?: unknown,
  userId = owner,
  verified = true,
) {
  const handlers = { GET, POST, PUT, DELETE };
  return handlers[method as keyof typeof handlers](
    req(`/api/v1/${path}`, method, body, userId, verified),
    { params: Promise.resolve({ path: path.split("/") }) },
  );
}
async function payload(id: string, changes: object = {}) {
  const row = await V1.item(owner, id);
  const {
    type,
    template,
    title,
    content,
    status,
    priority,
    metadata,
    projectId,
    delegateId,
    dueAt,
    scheduledAt,
    startAt,
    endAt,
    followUpAt,
    localDate,
    timezone,
  } = JSON.parse(JSON.stringify(row));
  return {
    type,
    template,
    title,
    content,
    status,
    priority,
    metadata,
    projectId,
    delegateId,
    dueAt,
    scheduledAt,
    startAt,
    endAt,
    followUpAt,
    localDate,
    timezone,
    tagIds: row.tags.map((t) => t.tagId),
    ...changes,
  };
}

beforeAll(async () => {
  const migrate = (schema: string) =>
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
  migrate("prisma/schema.prisma");
  await db.account.create({
    data: {
      id: "legacy-before-v1",
      email: "legacy@example.test",
      passwordHash: "not-used",
    },
  });
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
beforeEach(async () => {
  for (const principal of [p, q]) {
    await V1Backup.reset(principal, "RESET V1 DATA");
    await db.ledger.deleteMany({ where: { userId: principal.userId } });
  }
});

it("creates exactly one protected Me for each account and has no legacy Item table", async () => {
  expect((await V1.me("legacy-before-v1")).type).toBe("person");
  await expect(db.$queryRaw`SELECT count(*)::int AS count FROM "Item"`).rejects.toThrow();
  const me = await V1.me(owner);
  expect(me.type).toBe("person");
  expect(me.title).toBe("Me");
  expect(await db.selfProfile.count({ where: { userId: owner } })).toBe(1);
  await expect(
    db.selfProfile.create({ data: { userId: owner, itemId: me.id } }),
  ).rejects.toThrow();
  await expect(
    db.selfProfile.delete({ where: { userId: owner } }),
  ).rejects.toThrow();
  await expect(
    db.item.update({ where: { id: me.id }, data: { type: "note" } }),
  ).rejects.toThrow();
  await expect(
    V1.updateItem(
      p,
      me.id,
      me.revision,
      await payload(me.id, { status: "archived" }),
    ),
  ).rejects.toMatchObject({ status: 400 });
});
it("shares typed validation through HTTP and domain and never accepts userId/nested writes", async () => {
  for (const data of [
    note("Bad", { userId: other }),
    task({ priority: 8 }),
    { type: "finance", title: "Retired" },
    note("Bad", { metadata: { version: 2 } }),
  ]) {
    expect((await api("items", "POST", data)).status).toBe(400);
  }
  const response = await api("items", "POST", task());
  expect(response.status).toBe(200);
  expect((await response.json()).value).toMatchObject({
    userId: owner,
    priority: 0,
    status: "todo",
  });
  const receipts = await db.ledger.findMany({ where: { userId: owner } });
  expect(receipts.filter((r) => r.status === "refused")).toHaveLength(4);
});
it("distinguishes direct/inherited Areas and updates inheritance without copying assignments", async () => {
  const area = (await V1.createTag(p, { name: "Health", kind: "area" })).value;
  const direct = (await V1.createTag(p, { name: "Home", kind: "area" })).value;
  const tag = (await V1.createTag(p, { name: "Reading" })).value;
  const project = (
    await V1.createProject(p, { name: "Ongoing", tagIds: [area.id, tag.id] })
  ).value;
  const item = (
    await V1.createItem(p, task({ projectId: project.id, tagIds: [direct.id] }))
  ).value;
  expect(
    (await V1.items(owner, { areaId: area.id })).map((i) => i.id),
  ).toContain(item.id);
  expect(item.directAreas.map((a) => a.id)).toEqual([direct.id]);
  expect(item.inheritedAreas.map((a) => a.id)).toEqual([area.id]);
  expect(
    await db.itemTag.count({
      where: { userId: owner, itemId: item.id, tagId: area.id },
    }),
  ).toBe(0);
  await V1.updateProject(p, project.id, project.revision, {
    name: "Ongoing",
    tagIds: [],
  });
  expect(await V1.items(owner, { areaId: area.id })).toHaveLength(0);
  expect((await V1.item(owner, item.id)).directAreas).toHaveLength(1);
});
it("includes delegated in In Progress without rewriting its stored status", async () => {
  const person = (await V1.createItem(p, { type: "person", title: "Alex" }))
    .value;
  const item = (
    await V1.createItem(
      p,
      task({ status: "delegated", delegateId: person.id, priority: -2 }),
    )
  ).value;
  expect(
    (await V1.items(owner, { status: "in_progress" })).map((i) => i.status),
  ).toEqual(["delegated"]);
  expect((await V1.item(owner, item.id)).priority).toBe(-2);
});
it("rejects every cross-account relationship in services and in database foreign keys", async () => {
  const foreign = (await V1.createItem(q, note("Foreign"))).value;
  const local = (await V1.createItem(p, note("Local"))).value;
  const project = (await V1.createProject(q, { name: "Foreign" })).value,
    tag = (await V1.createTag(q, { name: "Foreign" })).value;
  for (const data of [
    note("Bad", { projectId: project.id }),
    note("Bad", { tagIds: [tag.id] }),
    task({ delegateId: foreign.id }),
  ])
    await expect(V1.createItem(p, data)).rejects.toMatchObject({ status: 404 });
  await expect(
    V1.createLink(p, {
      fromId: local.id,
      toId: foreign.id,
      type: "related_to",
    }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    V1.createMoment(p, {
      clientId: ids(),
      text: "Mention",
      occurredAt: new Date().toISOString(),
      timezone: "UTC",
      items: [{ itemId: foreign.id }],
    }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    V1.createActivity(p, {
      clientId: ids(),
      kind: "focus",
      itemId: foreign.id,
      occurredAt: new Date().toISOString(),
      timezone: "UTC",
      data: { minutes: 25 },
    }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    V1.createReview(p, {
      period: "daily",
      localDate: "2026-10-24",
      timezone: "UTC",
      prompts: {},
      itemIds: [foreign.id],
    }),
  ).rejects.toMatchObject({ status: 404 });
  for (const query of [
    () =>
      db.itemTag.create({
        data: { userId: owner, itemId: local.id, tagId: tag.id },
      }),
    () =>
      db.projectTag.create({
        data: { userId: owner, projectId: project.id, tagId: tag.id },
      }),
    () =>
      db.link.create({
        data: {
          userId: owner,
          fromId: local.id,
          toId: foreign.id,
          type: "mentions",
        },
      }),
    () =>
      db.item.update({
        where: { id: local.id },
        data: { projectId: project.id },
      }),
  ])
    await expect(query()).rejects.toThrow();
  expect((await api(`items/${foreign.id}`)).status).toBe(404);
  expect((await api("items", "GET", undefined, other)).status).toBe(200);
  expect((await V1.items(owner)).some((i) => i.id === foreign.id)).toBe(false);
});
it("guards revisions, open editor ownership and agent approval with durable receipts", async () => {
  const item = (await V1.createItem(p, task())).value;
  await expect(
    V1.updateItem(p, item.id, 99, await payload(item.id)),
  ).rejects.toMatchObject({ status: 409 });
  await expect(V1.setLease(q, item.id, "lease", true)).rejects.toMatchObject({
    status: 404,
  });
  await V1.setLease(p, item.id, "lease", true);
  const agent: Principal = {
    userId: owner,
    actor: "agent:coach",
    approved: true,
  };
  await expect(
    V1.updateItem(
      agent,
      item.id,
      item.revision,
      await payload(item.id, { title: "Agent" }),
    ),
  ).rejects.toMatchObject({ status: 423 });
  await expect(
    V1.createItem({ ...agent, approved: false }, note("Unapproved")),
  ).rejects.toMatchObject({ status: 403 });
  await V1.setLease(p, item.id, "lease", false);
  await expect(
    V1.updateItem(
      agent,
      item.id,
      item.revision,
      await payload(item.id, { title: "Approved" }),
    ),
  ).resolves.toMatchObject({ ok: true });
  expect(
    await db.ledger.count({ where: { userId: owner, status: "refused" } }),
  ).toBe(3);
});
it("preserves occurred vs created time, idempotent capture and mention vs interaction facts", async () => {
  const person = (await V1.createItem(p, { type: "person", title: "Alex" }))
    .value;
  const input = {
    clientId: ids(),
    text: "  Thought of Alex\n",
    occurredAt: "2026-10-25T01:00:00Z",
    timezone: "America/New_York",
    items: [{ itemId: person.id }],
  };
  const result = await Promise.all([
    V1.createMoment(p, input),
    V1.createMoment(p, input),
  ]);
  expect(result[0].value.id).toBe(result[1].value.id);
  expect(result[0].value.text).toBe(input.text);
  expect(result[0].value.localDate).toBe("2026-10-24");
  expect(+result[0].value.createdAt).toBeGreaterThan(
    Date.parse(input.occurredAt),
  );
  expect(
    await db.activity.count({
      where: { userId: owner, kind: "interaction" },
    }),
  ).toBe(0);
  await expect(
    V1.createMoment(p, { ...input, text: "Different" }),
  ).rejects.toMatchObject({ status: 409 });
  await V1.createActivity(p, {
    clientId: ids(),
    kind: "interaction",
    itemId: person.id,
    occurredAt: input.occurredAt,
    timezone: "UTC",
    data: { note: "Actually called" },
  });
  expect(
    await db.activity.count({
      where: { userId: owner, kind: "interaction" },
    }),
  ).toBe(1);
});
it("allows multiple check-ins, separate Reviews and independent routine occurrence snapshots", async () => {
  const habit = (
    await V1.createItem(p, {
      type: "habit",
      template: "routine",
      title: "Morning",
      content: "- [ ] Stretch",
    })
  ).value;
  for (const n of [1, 2])
    await V1.createActivity(p, {
      clientId: `check_${n}`,
      kind: "check_in",
      occurredAt: "2026-10-24T12:00:00Z",
      timezone: "UTC",
      data: { mood: n, energy: n },
    });
  const focus = {
    clientId: "focus_1",
    kind: "focus",
    occurredAt: "2026-10-24T12:00:00Z",
    timezone: "UTC",
    data: { minutes: 25 },
  };
  await V1.createActivity(p, focus);
  await V1.createActivity(p, focus);
  for (const [n, checklist] of [
    [1, [true]],
    [2, [false]],
  ] as const)
    await V1.createActivity(p, {
      clientId: `habit_${n}`,
      kind: "habit_completion",
      itemId: habit.id,
      occurredAt: `2026-10-2${n}T12:00:00Z`,
      timezone: "UTC",
      data: { value: 1, checklist: [...checklist] },
    });
  await V1.createReview(p, {
    period: "monthly",
    localDate: "2026-10-01",
    timezone: "UTC",
    prompts: { notes: "Month" },
  });
  expect(
    await db.activity.count({ where: { userId: owner, kind: "check_in" } }),
  ).toBe(2);
  expect(
    await db.activity.count({ where: { userId: owner, kind: "focus" } }),
  ).toBe(1);
  expect(await db.review.count({ where: { userId: owner } })).toBe(1);
  expect((await V1.item(owner, habit.id)).content).toBe("- [ ] Stretch");
});
it.each(["calendar", "completion"])(
  "creates the next %s occurrence once and preserves completion history",
  async (mode) => {
    const first = (
      await V1.createItem(
        p,
        task({
          scheduledAt: "2026-03-07T14:00:00Z",
          dueAt: "2026-03-07T15:00:00Z",
          timezone: "America/New_York",
        }),
      )
    ).value;
    const rule = {
      mode,
      unit: "day",
      interval: 1,
      timezone: "America/New_York",
      ...(mode === "calendar" ? { localTime: "09:00" } : {}),
    };
    await V1.createRecurrence(p, first.id, first.revision, rule);
    const current = await V1.item(owner, first.id),
      data = await payload(first.id, { status: "done" });
    const attempts = await Promise.allSettled([
      V1.updateItem(p, first.id, current.revision, data),
      V1.updateItem(p, first.id, current.revision, data),
    ]);
    if (attempts.every((r) => r.status === "rejected"))
      throw (attempts[0] as PromiseRejectedResult).reason;
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const occurrences = await db.taskOccurrence.findMany({
      where: { userId: owner },
      orderBy: { scheduledAt: "asc" },
    });
    expect(occurrences).toHaveLength(2);
    expect(occurrences[0].completedAt).not.toBeNull();
    expect(occurrences[0].nextItemId).toBe(occurrences[1].itemId);
    if (mode === "calendar")
      expect(occurrences[1].scheduledAt.toISOString()).toBe(
        "2026-03-08T13:00:00.000Z",
      );
    else expect(+occurrences[1].scheduledAt).toBeGreaterThan(Date.now());
    expect((await V1.item(owner, first.id)).dueAt?.toISOString()).toBe(
      "2026-03-07T15:00:00.000Z",
    );
    const completed = await V1.item(owner, first.id);
    await expect(
      V1.updateItem(
        p,
        first.id,
        completed.revision,
        await payload(first.id, { status: "todo" }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  },
);
it("backup/reset/restore round trips all durable tables and keeps the other account untouched", async () => {
  await V1Demo.seed(p);
  const otherItem = (await V1.createItem(q, note("Private"))).value;
  const conversation = await db.conversation.create({
    data: { userId: owner, title: "Planning" },
  });
  await db.message.create({
    data: {
      userId: owner,
      conversationId: conversation.id,
      role: "user",
      content: "Hello",
    },
  });
  await db.proposal.create({
    data: {
      userId: owner,
      conversationId: conversation.id,
      operations: [],
      status: "rejected",
    },
  });
  await db.preference.create({
    data: { userId: owner, key: "timezone", value: "America/New_York" },
  });
  await db.preference.create({
    data: { userId: owner, key: "nullable", value: Prisma.JsonNull },
  });
  const recurring = (
    await V1.createItem(p, task({ scheduledAt: "2026-01-31T09:00:00Z" }))
  ).value;
  await V1.createRecurrence(p, recurring.id, recurring.revision, {
    mode: "calendar",
    unit: "month",
    interval: 1,
    timezone: "UTC",
    localTime: "09:00",
  });
  const current = await V1.item(owner, recurring.id);
  await V1.updateItem(
    p,
    recurring.id,
    current.revision,
    await payload(recurring.id, { status: "done" }),
  );
  const backup = await V1Backup.export(owner),
    auditCount = backup.tables.ledger.length;
  await V1Backup.reset(p, "RESET V1 DATA");
  expect(await db.item.count({ where: { userId: owner } })).toBe(1);
  await V1Backup.restore(p, backup, "RESTORE V1 DATA");
  const restored = await V1Backup.export(owner);
  const normalize = (rows: unknown[]) =>
    rows.map((r) => JSON.stringify(r)).sort();
  for (const key of Object.keys(
    backup.tables,
  ) as (keyof typeof backup.tables)[])
    if (key !== "ledger")
      expect(normalize(restored.tables[key]), key).toEqual(
        normalize(backup.tables[key]),
      );
  expect(restored.tables.ledger.length).toBeGreaterThan(auditCount);
  expect((await V1.item(other, otherItem.id)).title).toBe("Private");
  await V1Backup.restore(p, backup, "RESTORE V1 DATA"); // replay does not duplicate histories
  expect(await db.journalMoment.count({ where: { userId: owner } })).toBe(1);
});
it("invalid, foreign and colliding backups roll back without deleting existing data", async () => {
  const local = (await V1.createItem(p, note("Keep"))).value,
    foreign = (await V1.createItem(q, note("Foreign"))).value;
  const backup = await V1Backup.export(owner);
  await expect(
    V1Backup.restore(q, backup, "RESTORE V1 DATA"),
  ).rejects.toMatchObject({ status: 403 });
  const invalid = structuredClone(backup);
  invalid.tables.items.find((i) => i.id === local.id)!.projectId = "missing";
  await expect(
    V1Backup.restore(p, invalid, "RESTORE V1 DATA"),
  ).rejects.toMatchObject({ status: 400 });
  const collision = structuredClone(backup);
  collision.tables.items.find((i) => i.id === local.id)!.id = foreign.id;
  await expect(
    V1Backup.restore(p, collision, "RESTORE V1 DATA"),
  ).rejects.toMatchObject({ status: 409 });
  expect((await V1.item(owner, local.id)).title).toBe("Keep");
  expect((await V1.item(other, foreign.id)).title).toBe("Foreign");
});
it("removes opt-in demo data only, refuses removal if personal data references it", async () => {
  const personal = (await V1.createItem(p, note("Real"))).value;
  await V1Demo.seed(p);
  await V1Demo.seed(p);
  expect(await db.item.count({ where: { userId: owner } })).toBe(9);
  const demo = await db.item.findFirstOrThrow({
    where: { userId: owner, demoBatchId: { not: null } },
  });
  await V1.createMoment(p, {
    clientId: ids(),
    text: "My real mention",
    occurredAt: new Date().toISOString(),
    timezone: "UTC",
    items: [{ itemId: demo.id }],
  });
  await expect(V1Demo.remove(p, "REMOVE DEMO DATA")).rejects.toMatchObject({
    status: 409,
  });
  await db.journalMoment.deleteMany({
    where: { userId: owner, demoBatchId: null },
  });
  await V1Demo.remove(p, "REMOVE DEMO DATA");
  expect((await V1.item(owner, personal.id)).title).toBe("Real");
  expect(await db.item.count({ where: { userId: owner } })).toBe(2);
});
it("enforces invite email, expiry, single-use consumption and canonical Me creation", async () => {
  const token = ids() + ids(),
    email = `${ids()}@example.test`;
  await db.invitation.create({
    data: {
      email,
      tokenHash: invitationHash(token),
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  await expect(
    registerInvited({
      email: "wrong@example.test",
      token,
      password: "Password123",
    }),
  ).rejects.toMatchObject({ status: 403 });
  const attempts = await Promise.allSettled([
    registerInvited({ email, token, password: "Password123" }),
    registerInvited({ email, token, password: "Password123" }),
  ]);
  const success = attempts.find((r) => r.status === "fulfilled")!;
  expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  if (success.status === "fulfilled")
    expect((await V1.me(success.value.id)).type).toBe("person");
  const expired = ids() + ids();
  await db.invitation.create({
    data: {
      email: "expired@example.test",
      tokenHash: invitationHash(expired),
      expiresAt: new Date(Date.now() - 1),
    },
  });
  await expect(
    registerInvited({
      email: "expired@example.test",
      token: expired,
      password: "Password123",
    }),
  ).rejects.toMatchObject({ status: 403 });
  expect(
    (
      await registerRoute(
        req("/api/auth/register", "POST", {
          email: "open@example.test",
          password: "Password123",
        }),
      )
    ).status,
  ).toBe(400);
});
it("pending 2FA cannot access V1/legacy data, replace a secret, disable 2FA or confirm QR", async () => {
  expect((await api("items", "GET", undefined, owner, false)).status).toBe(401);
  expect(
    proxy(new NextRequest("http://localhost/api/items")).status,
  ).toBe(401);
  expect(
    (await setup2fa(req("/api/auth/setup-2fa", "POST", {}, owner, false)))
      .status,
  ).toBe(401);
  expect(
    (
      await qrPost(
        req(
          "/api/auth/qr-login",
          "POST",
          { action: "confirm", token: "anything" },
          owner,
          false,
        ),
      )
    ).status,
  ).toBe(401);
  const secret = "JBSWY3DPEHPK3PXP";
  await db.account.update({
    where: { id: owner },
    data: { totpSecret: secret, totpVerified: true },
  });
  expect(
    (
      await verify2fa(
        req("/api/auth/verify", "POST", { token: "invalid" }, owner, false),
      )
    ).status,
  ).toBe(401);
  const verified = await verify2fa(
    req(
      "/api/auth/verify",
      "POST",
      { token: generateTOTPCode(secret) },
      owner,
      false,
    ),
  );
  expect(verified.status).toBe(200);
  expect(verified.headers.get("set-cookie")).toContain("HttpOnly");
});
it("QR redemption requires verified same-account confirmation and is single use", async () => {
  const challenge = await (
    await qrPost(req("/api/auth/qr-login", "POST", {}))
  ).json();
  expect(
    (
      await qrPost(
        req(
          "/api/auth/qr-login",
          "POST",
          { action: "confirm", token: challenge.token },
          other,
        ),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await qrPost(
        req("/api/auth/qr-login", "POST", {
          action: "confirm",
          token: challenge.token,
        }),
      )
    ).status,
  ).toBe(200);
  const redeemed = await qrGet(
    req(`/api/auth/qr-login?token=${challenge.token}`),
  );
  expect((await redeemed.json()).confirmed).toBe(true);
  expect(
    (
      await (
        await qrGet(req(`/api/auth/qr-login?token=${challenge.token}`))
      ).json()
    ).expired,
  ).toBe(true);
});

it("enforces owner composites on every history and conversation association", async () => {
  const local = (
    await V1.createItem(p, task({ scheduledAt: "2026-10-24T09:00:00Z" }))
  ).value;
  const foreign = (
    await V1.createItem(q, task({ scheduledAt: "2026-10-24T09:00:00Z" }))
  ).value;
  const foreignMoment = (
    await V1.createMoment(q, {
      clientId: ids(),
      text: "Private",
      occurredAt: new Date().toISOString(),
      timezone: "UTC",
    })
  ).value;
  const localMoment = (
    await V1.createMoment(p, {
      clientId: ids(),
      text: "Mine",
      occurredAt: new Date().toISOString(),
      timezone: "UTC",
    })
  ).value;
  const foreignReview = (
    await V1.createReview(q, {
      period: "daily",
      localDate: "2026-10-24",
      timezone: "UTC",
      prompts: {},
    })
  ).value;
  const localReview = (
    await V1.createReview(p, {
      period: "daily",
      localDate: "2026-10-24",
      timezone: "UTC",
      prompts: {},
    })
  ).value;
  const conversation = await db.conversation.create({
    data: { userId: other, title: "Private conversation" },
  });
  const rule = {
    mode: "completion",
    unit: "day",
    interval: 1,
    timezone: "UTC",
  };
  const foreignRecurrence = (
    await V1.createRecurrence(q, foreign.id, foreign.revision, rule)
  ).value;
  const localRecurrence = (
    await V1.createRecurrence(p, local.id, local.revision, rule)
  ).value;
  const queries = [
    () =>
      db.momentItem.create({
        data: { userId: owner, momentId: foreignMoment.id, itemId: local.id },
      }),
    () =>
      db.momentItem.create({
        data: { userId: owner, momentId: localMoment.id, itemId: foreign.id },
      }),
    () =>
      db.reviewItem.create({
        data: { userId: owner, reviewId: foreignReview.id, itemId: local.id },
      }),
    () =>
      db.reviewItem.create({
        data: { userId: owner, reviewId: localReview.id, itemId: foreign.id },
      }),
    () =>
      db.activity.create({
        data: {
          userId: owner,
          clientId: ids(),
          itemId: foreign.id,
          kind: "focus",
          occurredAt: new Date(),
          localDate: "2026-10-24",
          timezone: "UTC",
          data: { minutes: 25 },
        },
      }),
    () =>
      db.message.create({
        data: {
          userId: owner,
          conversationId: conversation.id,
          role: "user",
          content: "Bad",
        },
      }),
    () =>
      db.proposal.create({
        data: {
          userId: owner,
          conversationId: conversation.id,
          operations: [],
        },
      }),
    () =>
      db.lease.create({
        data: {
          userId: owner,
          itemId: foreign.id,
          token: ids(),
          expiresAt: new Date(),
        },
      }),
    () =>
      db.recurrence.create({
        data: { userId: owner, itemId: foreign.id, rule },
      }),
    () =>
      db.taskOccurrence.create({
        data: {
          userId: owner,
          recurrenceId: foreignRecurrence.id,
          itemId: local.id,
          scheduledAt: new Date(),
        },
      }),
    () =>
      db.taskOccurrence.updateMany({
        where: { userId: owner, recurrenceId: localRecurrence.id },
        data: { nextItemId: foreign.id },
      }),
  ];
  for (const query of queries) await expect(query()).rejects.toThrow();
  for (const [resource, id] of [
    ["journal", foreignMoment.id],
    ["reviews", foreignReview.id],
    ["recurrences", foreignRecurrence.id],
  ])
    expect((await api(`${resource}/${id}`)).status).toBe(404);
});
it("combines legacy and V1 create allowances and does not count failed transactions", async () => {
  await db.ledger.createMany({
    data: Array.from({ length: 20 }, (_, i) => ({
      userId: owner,
      actor: p.actor,
      operation: i % 2 ? "item.create" : "v1.item.create",
      payload: "{}",
      status: "success",
      receipt: "{}",
    })),
  });
  await expect(V1.createItem(p, note("Over cap"))).rejects.toMatchObject({
    status: 429,
  });
  expect(await db.item.count({ where: { userId: owner } })).toBe(1);
  expect(
    await db.ledger.count({ where: { userId: owner, status: "refused" } }),
  ).toBe(1);
});
it("reclassification preserves identity but refuses incompatible history and Links", async () => {
  const item = (await V1.createItem(p, note("Classify"))).value;
  const result = await V1.updateItem(
    p,
    item.id,
    item.revision,
    await payload(item.id, {
      type: "task",
      template: "task",
      metadata: { version: 1 },
    }),
  );
  expect(result.value.id).toBe(item.id);
  expect(result.value.type).toBe("task");
  const person = (await V1.createItem(p, { type: "person", title: "Alex" }))
    .value;
  await V1.createActivity(p, {
    clientId: ids(),
    kind: "interaction",
    itemId: person.id,
    occurredAt: new Date().toISOString(),
    timezone: "UTC",
    data: { note: "Called" },
  });
  await expect(
    V1.updateItem(
      p,
      person.id,
      person.revision,
      await payload(person.id, {
        type: "note",
        template: "note",
        metadata: { version: 1 },
      }),
    ),
  ).rejects.toMatchObject({ status: 400 });
});

it("rolls back the clear when a later restore insert fails", async () => {
  const item = (await V1.createItem(p, note("Keep after failure"))).value;
  const backup = await V1Backup.export(owner);
  backup.tables.items.find((i) => i.id === item.id)!.title =
    "Inject restore failure";
  await db.$executeRawUnsafe(
    `CREATE FUNCTION v1_test_restore_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.title = 'Inject restore failure' THEN RAISE EXCEPTION 'Test insert failure'; END IF; RETURN NEW; END; $$`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER v1_test_restore_failure BEFORE INSERT ON "V1Item" FOR EACH ROW EXECUTE FUNCTION v1_test_restore_failure()`,
  );
  try {
    await expect(
      V1Backup.restore(p, backup, "RESTORE V1 DATA"),
    ).rejects.toMatchObject({ status: 500 });
    expect((await V1.item(owner, item.id)).title).toBe("Keep after failure");
    expect(await db.selfProfile.count({ where: { userId: owner } })).toBe(1);
    expect(
      await db.ledger.count({ where: { userId: owner, status: "refused" } }),
    ).toBe(1);
  } finally {
    await db.$executeRawUnsafe(
      `DROP TRIGGER v1_test_restore_failure ON "V1Item"`,
    );
    await db.$executeRawUnsafe(`DROP FUNCTION v1_test_restore_failure()`);
  }
});
it("recurrence preserves date-only deadline offsets in the configured timezone", async () => {
  const first = (
    await V1.createItem(
      p,
      task({
        scheduledAt: "2026-03-07T14:00:00Z",
        localDate: "2026-03-08",
        timezone: "America/New_York",
      }),
    )
  ).value;
  await V1.createRecurrence(p, first.id, first.revision, {
    mode: "calendar",
    unit: "day",
    interval: 1,
    timezone: "America/New_York",
    localTime: "09:00",
  });
  const current = await V1.item(owner, first.id);
  await V1.updateItem(
    p,
    first.id,
    current.revision,
    await payload(first.id, { status: "done" }),
  );
  const next = await db.item.findFirstOrThrow({
    where: { userId: owner, id: { not: first.id }, type: "task" },
  });
  expect(next.timezone).toBe("America/New_York");
  expect(next.localDate).toBe("2026-03-09");
  expect((await V1.item(owner, first.id)).localDate).toBe("2026-03-08");
});

it("concurrent explicit demo setup is idempotent and preserves both accounts' real data", async () => {
  const real = await V1.createItem(p, note("Keep my real note"));
  const foreign = await V1.createItem(q, note("Other account private note"));
  const results = await Promise.all([V1Demo.seed(p), V1Demo.seed(p)]);
  expect(results.filter(r => "seeded" in r.value)).toHaveLength(1);
  expect(results.filter(r => "alreadySeeded" in r.value)).toHaveLength(1);
  expect(await db.item.count({ where: { userId: owner, demoBatchId: { not: null } } })).toBe(7);
  await V1Demo.remove(p, "REMOVE DEMO DATA");
  expect((await V1.item(owner, real.value.id)).title).toBe("Keep my real note");
  expect((await V1.item(other, foreign.value.id)).title).toBe("Other account private note");
  expect(await db.item.count({ where: { userId: owner, demoBatchId: { not: null } } })).toBe(0);
});

it("failed demo setup rolls back partial examples and a later explicit retry succeeds", async () => {
  await db.$executeRawUnsafe(`CREATE FUNCTION fail_demo_review() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture seed failure'; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER fail_demo_review BEFORE INSERT ON "V1Review" FOR EACH ROW EXECUTE FUNCTION fail_demo_review()`);
  try {
    await expect(V1Demo.seed(p)).rejects.toThrow("no changes were saved");
    expect(await db.item.count({ where: { userId: owner, demoBatchId: { not: null } } })).toBe(0);
    expect(await db.preference.findUnique({ where: { userId_key: { userId: owner, key: "system.demo" } } })).toBeNull();
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER fail_demo_review ON "V1Review"`);
    await db.$executeRawUnsafe(`DROP FUNCTION fail_demo_review()`);
  }
  expect((await V1Demo.seed(p)).value).toMatchObject({ seeded: true });
});
