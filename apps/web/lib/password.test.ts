import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";
import { createDb, sessions, users } from "@repo/db";
import { eq, inArray } from "drizzle-orm";
import { hashPassword, verifyPassword } from "./credentials.ts";
import {
  changePassword,
  chooseResetPassword,
  resetPassword,
} from "./password.ts";
import { databaseUrl } from "./reset-guard.ts";

test("a new password shorter than sign-up allows is refused", async () => {
  const result = await changePassword("not-a-user", {
    current: "correct horse",
    next: "short",
    confirm: "short",
  });
  assert.deepEqual(result, { ok: false, error: "invalid" });
});

test("a new password of 7 characters is refused", async () => {
  const result = await changePassword("not-a-user", {
    current: "correct horse",
    next: "1234567",
    confirm: "1234567",
  });
  assert.deepEqual(result, { ok: false, error: "invalid" });
});

test("a typed reset password has to meet the sign-up length, and a blank one is generated", () => {
  assert.deepEqual(chooseResetPassword("short", "short", "generated-long"), {
    error: "invalid",
  });
  assert.deepEqual(
    chooseResetPassword("  longenough  ", "longenough", "generated-long"),
    { password: "longenough", generated: false },
  );
  assert.deepEqual(chooseResetPassword("   ", "", "generated-long"), {
    password: "generated-long",
    generated: true,
  });
});

test("a typed reset password has to be typed the same twice", () => {
  for (const confirm of ["", "longenougH", "longenough2"]) {
    assert.deepEqual(
      chooseResetPassword("longenough", confirm, "generated-long"),
      { error: "mismatch" },
      confirm,
    );
  }
});

test("the reset reads the direct database url and falls back to the pooled one", () => {
  assert.equal(
    databaseUrl({
      POSTGRES_URL_NON_POOLING: " postgres://direct/db ",
      POSTGRES_URL: "postgres://pooled/db",
    }),
    "postgres://direct/db",
  );
  assert.equal(
    databaseUrl({ POSTGRES_URL: "postgres://pooled/db" }),
    "postgres://pooled/db",
  );
  assert.equal(databaseUrl({}), null);
});

test("a new password that doesn't match its confirmation is refused", async () => {
  const result = await changePassword("not-a-user", {
    current: "correct horse",
    next: "longenough",
    confirm: "different",
  });
  assert.deepEqual(result, { ok: false, error: "mismatch" });
});

const url = process.env.TEST_POSTGRES_URL;

if (!url && process.env.CI) {
  test("password change runs in CI", () => {
    assert.fail(
      "TEST_POSTGRES_URL is not set, so the password suite can't run",
    );
  });
} else if (!url) {
  console.warn(
    "\n!!! WARNING: password change tests SKIPPED. Set TEST_POSTGRES_URL to run them (see README). !!!\n",
  );
}

describe(
  "changing a password",
  { skip: !url && "TEST_POSTGRES_URL not set" },
  () => {
    const db = createDb(url!);
    const ids: string[] = [];

    after(async () => {
      if (ids.length) await db.delete(users).where(inArray(users.id, ids));
      await db.$client.end();
    });

    async function hashOf(userId: string) {
      const [row] = await db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, userId));
      return row!.passwordHash;
    }

    async function account(password: string) {
      const [user] = await db
        .insert(users)
        .values({
          email: `${randomUUID()}@test.invalid`,
          passwordHash: await hashPassword(password),
        })
        .returning({ id: users.id });
      ids.push(user!.id);
      return user!.id;
    }

    test("the current password has to be right, and a wrong one changes nothing", async () => {
      const userId = await account("correct horse");
      const before = (
        await db
          .select({ passwordHash: users.passwordHash })
          .from(users)
          .where(eq(users.id, userId))
      )[0]!.passwordHash;
      const result = await changePassword(
        userId,
        {
          current: "wrong horse",
          next: "a new passphrase",
          confirm: "a new passphrase",
        },
        { db },
      );
      assert.deepEqual(result, { ok: false, error: "wrong-password" });
      const afterHash = (
        await db
          .select({ passwordHash: users.passwordHash })
          .from(users)
          .where(eq(users.id, userId))
      )[0]!.passwordHash;
      assert.equal(afterHash, before);
    });

    test("the new password replaces the old one and other sessions are signed out", async () => {
      const userId = await account("correct horse");
      const other = await account("someone else");
      const expires = new Date(Date.now() + 60_000);
      await db.insert(sessions).values([
        { sessionToken: `keep-${userId}`, userId, expires },
        { sessionToken: `drop-${userId}`, userId, expires },
        { sessionToken: `other-${other}`, userId: other, expires },
      ]);

      const result = await changePassword(
        userId,
        {
          current: "correct horse",
          next: "a new passphrase",
          confirm: "a new passphrase",
        },
        { db, keepSession: `keep-${userId}` },
      );
      assert.deepEqual(result, { ok: true });

      const stored = (
        await db
          .select({ passwordHash: users.passwordHash })
          .from(users)
          .where(eq(users.id, userId))
      )[0]!.passwordHash;
      assert.equal(await verifyPassword("a new passphrase", stored), true);
      assert.equal(await verifyPassword("correct horse", stored), false);
      assert.equal(
        await verifyPassword("someone else", await hashOf(other)),
        true,
      );

      const left = await db
        .select({ sessionToken: sessions.sessionToken })
        .from(sessions)
        .where(inArray(sessions.userId, [userId, other]));
      assert.deepEqual(
        left.map((row) => row.sessionToken).sort(),
        [`keep-${userId}`, `other-${other}`].sort(),
      );
    });

    test("a reset sets a new password and signs every session out", async () => {
      const userId = await account("correct horse");
      const other = await account("someone else");
      const email = (
        await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, userId))
      )[0]!.email;
      const expires = new Date(Date.now() + 60_000);
      await db.insert(sessions).values([
        { sessionToken: `reset-${userId}`, userId, expires },
        { sessionToken: `other-${other}`, userId: other, expires },
      ]);

      assert.deepEqual(
        await resetPassword("nobody@test.invalid", "longenough", db),
        {
          ok: false,
          error: "unknown",
        },
      );

      const result = await resetPassword(
        `  ${email.toUpperCase()}  `,
        "replacement",
        db,
      );
      assert.deepEqual(result, { ok: true });
      const stored = (
        await db
          .select({ passwordHash: users.passwordHash })
          .from(users)
          .where(eq(users.id, userId))
      )[0]!.passwordHash;
      assert.equal(await verifyPassword("replacement", stored), true);
      assert.equal(await verifyPassword("correct horse", stored), false);
      const left = await db
        .select({ sessionToken: sessions.sessionToken })
        .from(sessions)
        .where(inArray(sessions.userId, [userId, other]));
      assert.deepEqual(left, [{ sessionToken: `other-${other}` }]);
      assert.equal(
        await verifyPassword("someone else", await hashOf(other)),
        true,
      );
    });
  },
);
