import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { Invitations } from "@/lib/v1/invitations";
import { V1, type Principal } from "@/lib/v1/service";
import { V1Account } from "@/lib/v1/service/account";
import { GET, POST, DELETE } from "@/app/api/v1/[...path]/route";
import { SESSION_COOKIE, createSession } from "@/lib/session";
import { NextRequest } from "next/server";

const owner = `set_${randomUUID().replaceAll("-", "")}`;
const other = `set_${randomUUID().replaceAll("-", "")}`;
const password = "current-password";
const p: Principal = { userId: owner, actor: `user:${owner}` };
const q: Principal = { userId: other, actor: `user:${other}` };

function call(method: "GET" | "POST" | "DELETE", path: string, userId: string) {
  const handlers = { GET, POST, DELETE };
  return handlers[method](
    new NextRequest(`http://localhost/api/v1/${path}`, {
      method,
      headers: {
        cookie: `${SESSION_COOKIE}=${createSession(userId, `${userId}@example.test`, true)}`,
      },
    }),
    { params: Promise.resolve({ path: path.split("/") }) },
  );
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

it("changes a password only when the current one matches and does not store it", async () => {
  await expect(
    V1Account.changePassword(p, {
      currentPassword: "wrong",
      nextPassword: "next-password",
    }),
  ).rejects.toMatchObject({ status: 403 });
  const changed = await V1Account.changePassword(p, {
    currentPassword: password,
    nextPassword: "next-password",
  });
  expect(changed.value).toEqual({ id: owner, revision: 0 });
  const row = await db.ledger.findUniqueOrThrow({
    where: { id: changed.receiptId },
  });
  expect(row.payload + row.receipt).not.toContain("next-password");
  expect(row.payload + row.receipt).not.toContain(password);
  const account = await db.account.findUniqueOrThrow({ where: { id: owner } });
  expect(await bcrypt.compare("next-password", account.passwordHash)).toBe(true);
  await expect(
    V1Account.changePassword(q, {
      currentPassword: "next-password",
      nextPassword: "other-password",
    }),
  ).rejects.toMatchObject({ status: 403 });
});

it("changes email when the password matches and the address is free", async () => {
  const next = `moved-${owner}@example.test`;
  await expect(
    V1Account.changeEmail(p, {
      password: "next-password",
      email: `${other}@example.test`,
    }),
  ).rejects.toMatchObject({ status: 409 });
  const changed = await V1Account.changeEmail(p, {
    password: "next-password",
    email: next,
  });
  expect(changed.value).toEqual({ id: owner, revision: 0 });
  expect((await db.account.findUniqueOrThrow({ where: { id: owner } })).email).toBe(
    next,
  );
  const row = await db.ledger.findUniqueOrThrow({
    where: { id: changed.receiptId },
  });
  expect(row.payload + row.receipt).not.toContain("next-password");
});

it("lists only this account's receipts and stays read-only", async () => {
  await V1.createItem(p, { type: "note", title: "Ledger note" });
  await V1.createItem(q, { type: "note", title: "Other ledger note" });
  const first = await V1Account.ledger(owner, { page: "1", limit: "2" });
  expect(first.entries.length).toBeGreaterThan(0);
  expect(first.entries.length).toBeLessThanOrEqual(2);
  expect(first.total).toBeGreaterThan(2);
  expect(first.entries.every((entry) => !("payload" in entry))).toBe(true);
  const second = await V1Account.ledger(owner, { page: 2, limit: 2 });
  expect(second.entries.map((entry) => entry.id)).not.toEqual(
    first.entries.map((entry) => entry.id),
  );
  const foreign = await V1Account.ledger(other, {});
  expect(foreign.entries.map((entry) => entry.id)).not.toEqual(
    expect.arrayContaining(first.entries.map((entry) => entry.id)),
  );
  expect((await call("POST", "ledger", owner)).status).toBe(404);
  expect((await call("DELETE", "ledger", owner)).status).toBe(404);
});

it("lists invitations without secrets and revokes an open one", async () => {
  const email = `guest-${owner}@example.test`;
  await db.invitation.create({
    data: {
      email,
      tokenHash: `hash-${owner}`,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  const rows = await Invitations.list();
  const row = rows.find((item) => item.email === email);
  expect(row).toMatchObject({ email, consumedAt: null });
  expect(row).not.toHaveProperty("tokenHash");
  expect(await Invitations.revoke(email)).toEqual({ revoked: 1 });
  await expect(Invitations.revoke(email)).rejects.toMatchObject({ status: 404 });
  expect(await db.invitation.findFirst({ where: { email } })).toBeNull();
});
