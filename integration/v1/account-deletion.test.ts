import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { deleteAccountConfirmation } from "@/lib/v1/contracts";
import { V1, type Principal } from "@/lib/v1/service";
import { V1Account } from "@/lib/v1/service/account";
import { SESSION_COOKIE, createSession } from "@/lib/session";
import { DELETE } from "@/app/api/v1/[...path]/route";
import { NextRequest } from "next/server";

const owner = `acct_${randomUUID().replaceAll("-", "")}`;
const other = `keep_${randomUUID().replaceAll("-", "")}`;
const password = "correct-horse-battery";
const p: Principal = { userId: owner, actor: `user:${owner}` };
const q: Principal = { userId: other, actor: `user:${other}` };
const secret = `secret-title-${owner}`;

function meId(userId: string) {
  return `me_${userId}`;
}

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
  const passwordHash = bcrypt.hashSync(password, 4);
  await db.account.createMany({
    data: [owner, other].map((id) => ({
      id,
      email: `${id}@example.test`,
      name: id,
      passwordHash,
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

it("lists every Prisma model as an account table", () => {
  const models = Prisma.dmmf.datamodel.models
    .map((model) => model.dbName ?? model.name)
    .sort();
  expect(models).toEqual([...V1Account.tables].sort());
});

it("still blocks ordinary Me deletes", async () => {
  await expect(db.item.delete({ where: { id: meId(owner) } })).rejects.toThrow(
    /Canonical Me cannot be deleted/,
  );
  await expect(
    db.selfProfile.delete({ where: { userId: owner } }),
  ).rejects.toThrow(/cannot be removed or reassigned/);
});

it("rejects a deletion marker for a different account", async () => {
  await expect(
    db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('bearing.deleting_account', ${other}, true)`;
      await tx.item.delete({ where: { id: meId(owner) } });
    }),
  ).rejects.toThrow(/Canonical Me cannot be deleted/);
  await expect(
    db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('bearing.deleting_account', ${other}, true)`;
      await tx.selfProfile.delete({ where: { userId: owner } });
    }),
  ).rejects.toThrow(/cannot be removed or reassigned/);
  expect(await db.item.findUnique({ where: { id: meId(owner) } })).toBeTruthy();
});

it("does not let the marker archive Me or survive the transaction", async () => {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('bearing.deleting_account', ${owner}, true)`;
    const marked = await tx.$queryRaw<{ current: string | null }[]>`
      SELECT current_setting('bearing.deleting_account', true) AS current
    `;
    expect(marked[0]?.current).toBe(owner);
  });
  await expect(
    db.$transaction(async (tx) => {
      const marked = await tx.$queryRaw<{ current: string | null }[]>`
        SELECT current_setting('bearing.deleting_account', true) AS current
      `;
      // A transaction-local marker resets to empty; NULLIF in the trigger treats that as unset.
      expect(marked[0]?.current || null).toBeNull();
      await tx.item.update({
        where: { id: meId(owner) },
        data: { status: "archived" },
      });
    }),
  ).rejects.toThrow(/unarchived Person/);
  await expect(db.item.delete({ where: { id: meId(owner) } })).rejects.toThrow(
    /Canonical Me cannot be deleted/,
  );
});

it("allows Me deletion only for the marked account", async () => {
  const id = `marked_${randomUUID().replaceAll("-", "")}`;
  await db.account.create({
    data: { id, email: `${id}@example.test`, passwordHash: "x" },
  });
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('bearing.deleting_account', ${id}, true)`;
    await tx.selfProfile.delete({ where: { userId: id } });
    await tx.item.delete({ where: { id: meId(id) } });
    await tx.account.delete({ where: { id } });
  });
  expect(await db.account.findUnique({ where: { id } })).toBeNull();
  expect(await db.item.findUnique({ where: { id: meId(id) } })).toBeNull();
  expect(await db.item.findUnique({ where: { id: meId(owner) } })).toBeTruthy();
});

it("deletes one account completely and leaves the other untouched", async () => {
  await db.setting.create({
    data: { id: `theme_${owner}`, userId: owner, value: "bearing" },
  });
  await db.setting.create({
    data: { id: `theme_${other}`, userId: other, value: "kept" },
  });
  await db.invitation.createMany({
    data: [owner, other].map((id) => ({
      email: `${id}@example.test`,
      tokenHash: `invite_${id}`,
      expiresAt: new Date(Date.now() + 86_400_000),
    })),
  });
  const tag = await V1.createTag(p, { name: "Life", kind: "area" });
  expect(tag.value.revision).toBe(0);
  const project = await V1.createProject(p, {
    name: "Keep walking",
    tagIds: [tag.value.id],
  });
  const item = await V1.createItem(p, {
    type: "note",
    title: secret,
    projectId: project.value.id,
    tagIds: [tag.value.id],
  });
  const activity = await V1.createActivity(p, {
    clientId: `check_${owner}`,
    kind: "check_in",
    occurredAt: new Date().toISOString(),
    timezone: "UTC",
    data: { mood: 3 },
  });
  expect(activity.value.revision).toBe(0);
  await V1.createMoment(p, {
    clientId: `moment_${owner}`,
    text: secret,
    occurredAt: new Date().toISOString(),
    timezone: "UTC",
    items: [{ itemId: item.value.id, relation: "reference" }],
  });
  const kept = await V1.createItem(q, { type: "note", title: "Other note" });
  const otherBefore = {
    items: await db.item.count({ where: { userId: other } }),
    settings: await db.setting.findMany({ where: { userId: other } }),
    invites: await db.invitation.count({
      where: { email: `${other}@example.test` },
    }),
    ledger: await db.ledger.count({ where: { userId: other } }),
  };

  await expect(
    V1Account.delete(p, {
      password: "nope",
      confirmation: deleteAccountConfirmation,
    }),
  ).rejects.toThrow(/Password does not match/);
  const refused = await db.ledger.findFirst({
    where: { userId: owner, operation: "v1.account.delete", status: "refused" },
  });
  expect(JSON.parse(refused!.payload)).toEqual({ id: owner, revision: 0 });
  expect(refused!.payload).not.toContain(password);
  expect(refused!.receipt).not.toContain("nope");
  expect(await db.item.findUnique({ where: { id: item.value.id } })).toBeTruthy();

  await expect(
    V1Account.delete(p, { password, confirmation: "delete my account" }),
  ).rejects.toThrow(/Explicit user confirmation required/);
  await expect(
    V1Account.delete(
      { userId: owner, actor: "agent:coach", approved: true },
      { password, confirmation: deleteAccountConfirmation },
    ),
  ).rejects.toThrow(/Explicit user confirmation required/);

  const deleted = await V1Account.delete(p, {
    password,
    confirmation: deleteAccountConfirmation,
  });
  expect(deleted.value).toEqual({ id: owner, revision: 0 });
  expect(
    await db.ledger.findUnique({ where: { id: deleted.receiptId } }),
  ).toBeNull();

  const tables = await db.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_type = 'BASE TABLE'
      AND table_name <> '_prisma_migrations'
  `;
  const catalog = tables.map((row) => row.table_name).sort();
  const models = Prisma.dmmf.datamodel.models
    .map((model) => model.dbName ?? model.name)
    .sort();
  expect(catalog).toEqual(models);
  expect(catalog).toEqual([...V1Account.tables].sort());
  for (const table of catalog) {
    const rows =
      table === "User"
        ? await db.$queryRaw<{ n: number }[]>`
            SELECT count(*)::int AS n FROM "User" WHERE "id" = ${owner}
          `
        : table === "V1Invitation"
          ? await db.$queryRaw<{ n: number }[]>`
              SELECT count(*)::int AS n FROM "V1Invitation"
              WHERE lower("email") = lower(${`${owner}@example.test`})
            `
          : await db.$queryRaw<{ n: number }[]>(
              Prisma.sql`SELECT count(*)::int AS n FROM ${Prisma.raw(`"${table}"`)} WHERE "userId" = ${owner}`,
            );
    expect(Number(rows[0]?.n ?? 0), table).toBe(0);
  }
  expect(await db.item.findFirst({ where: { title: secret } })).toBeNull();
  expect(await db.account.findUnique({ where: { id: other } })).toBeTruthy();
  expect(await db.item.count({ where: { userId: other } })).toBe(
    otherBefore.items,
  );
  expect(await db.item.findUnique({ where: { id: kept.value.id } })).toBeTruthy();
  expect(await db.item.findUnique({ where: { id: meId(other) } })).toBeTruthy();
  expect(await db.setting.findMany({ where: { userId: other } })).toEqual(
    otherBefore.settings,
  );
  expect(
    await db.invitation.count({ where: { email: `${other}@example.test` } }),
  ).toBe(otherBefore.invites);
  expect(await db.ledger.count({ where: { userId: other } })).toBe(
    otherBefore.ledger,
  );
});

it("clears the session cookie through the account route", async () => {
  const id = `http_${randomUUID().replaceAll("-", "")}`;
  await db.account.create({
    data: {
      id,
      email: `${id}@example.test`,
      passwordHash: bcrypt.hashSync(password, 4),
    },
  });
  const response = await DELETE(
    new NextRequest("http://localhost/api/v1/account", {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        cookie: `${SESSION_COOKIE}=${createSession(id, `${id}@example.test`, true)}`,
      },
      body: JSON.stringify({
        password,
        confirmation: deleteAccountConfirmation,
      }),
    }),
    { params: Promise.resolve({ path: ["account"] }) },
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/);
  expect(await db.account.findUnique({ where: { id } })).toBeNull();
  const again = await DELETE(
    new NextRequest("http://localhost/api/v1/account", {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        cookie: `${SESSION_COOKIE}=${createSession(id, `${id}@example.test`, true)}`,
      },
      body: JSON.stringify({
        password,
        confirmation: deleteAccountConfirmation,
      }),
    }),
    { params: Promise.resolve({ path: ["account"] }) },
  );
  expect(again.status).toBe(401);
});

function serverUrl(database: string) {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.delete("schema");
  url.pathname = `/${database}`;
  return url.toString();
}

function prisma(args: string[], env: NodeJS.ProcessEnv, input?: string) {
  return execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", ...args],
    { env, input, encoding: "utf8" },
  );
}

it("applies the migration on a fresh database and matches the schema", async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const fresh = `bearing_fresh_${suffix}`;
  const shadow = `bearing_shadow_${suffix}`;
  const admin = serverUrl("postgres");
  prisma(["db", "execute", "--stdin", "--url", admin], process.env, `CREATE DATABASE "${fresh}";`);
  prisma(["db", "execute", "--stdin", "--url", admin], process.env, `CREATE DATABASE "${shadow}";`);
  const freshUrl = serverUrl(fresh);
  const client = new PrismaClient({ datasources: { db: { url: freshUrl } } });
  try {
    prisma(
      ["migrate", "deploy", "--schema", "prisma/schema.prisma"],
      { ...process.env, DATABASE_URL: freshUrl },
    );
    const columns = await client.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'revision'
        AND table_name IN ('V1Tag', 'V1Activity')
    `;
    expect(columns.map((row) => row.table_name).sort()).toEqual([
      "V1Activity",
      "V1Tag",
    ]);
    const fn = await client.$queryRaw<{ def: string }[]>`
      SELECT pg_get_functiondef('v1_protect_me()'::regprocedure) AS def
    `;
    expect(fn[0]?.def).toContain("bearing.deleting_account");
    let diff = "";
    try {
      diff = prisma(
        [
          "migrate",
          "diff",
          "--from-migrations",
          "prisma/migrations",
          "--to-schema-datamodel",
          "prisma/schema.prisma",
          "--shadow-database-url",
          serverUrl(shadow),
          "--exit-code",
        ],
        process.env,
      );
    } catch (error) {
      const failed = error as { stdout?: string; stderr?: string; status?: number };
      throw new Error(
        `migrate diff exited ${failed.status}\n${failed.stdout ?? ""}\n${failed.stderr ?? ""}`,
      );
    }
    expect(diff).not.toMatch(/Changed the|Removed|Added/);
  } finally {
    await client.$disconnect();
    for (const name of [fresh, shadow])
      prisma(
        ["db", "execute", "--stdin", "--url", admin],
        process.env,
        `DROP DATABASE IF EXISTS "${name}" WITH (FORCE);`,
      );
  }
}, 60_000);
