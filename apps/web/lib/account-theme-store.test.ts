// Two accounts against a real Postgres, through the functions the import
// action calls. Needs TEST_POSTGRES_URL pointing at a database with the
// current schema (see README). Without it the suite fails in CI and is
// skipped, with a warning, everywhere else.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";
import { createDb, users } from "@repo/db";
import { eq, inArray } from "drizzle-orm";
import { defaultAccountTheme } from "./account-theme.ts";
import { loadAccountTheme, saveAccountTheme } from "./account-theme-store.ts";
import { expandPreset } from "./expand-preset.ts";

const url = process.env.TEST_POSTGRES_URL;

if (!url && process.env.CI) {
  test("account theme store runs in CI", () => {
    assert.fail(
      "TEST_POSTGRES_URL is not set, so the account theme suite can't run",
    );
  });
} else if (!url) {
  console.warn(
    "\n!!! WARNING: account theme tests SKIPPED. Set TEST_POSTGRES_URL to run them (see README). !!!\n",
  );
}

describe(
  "saving an account theme",
  { skip: !url && "TEST_POSTGRES_URL not set" },
  () => {
    const db = createDb(url!);
    const ids: string[] = [];

    after(async () => {
      if (ids.length) await db.delete(users).where(inArray(users.id, ids));
      await db.$client.end();
    });

    async function account() {
      const [user] = await db
        .insert(users)
        .values({
          email: `${randomUUID()}@test.invalid`,
          passwordHash: "-",
        })
        .returning({ id: users.id });
      ids.push(user!.id);
      return user!.id;
    }

    test("one account's import leaves the other account on the shared default", async () => {
      const a = await account();
      const b = await account();
      const blocks = expandPreset("b1sACkXE8");
      if (!blocks) throw new Error("b1sACkXE8 did not expand");
      await saveAccountTheme(db, a, {
        choice: "imported",
        code: "b1sACkXE8",
        light: blocks.light,
        dark: blocks.dark,
      });

      const [row] = await db
        .select({
          themeChoice: users.themeChoice,
          themeCode: users.themeCode,
          themeLight: users.themeLight,
          themeDark: users.themeDark,
        })
        .from(users)
        .where(eq(users.id, b));
      assert.ok(row);
      assert.equal(row.themeChoice, "grayscale");
      assert.equal(row.themeCode, null);
      assert.equal(row.themeLight, null);
      assert.equal(row.themeDark, null);
      assert.deepEqual(await loadAccountTheme(db, b), defaultAccountTheme);

      const loaded = await loadAccountTheme(db, a);
      assert.equal(loaded.code, "b1sACkXE8");
      assert.equal(loaded.light, blocks.light);
      assert.equal(loaded.dark, blocks.dark);
    });

    test("a missing account loads the shared default", async () => {
      assert.deepEqual(
        await loadAccountTheme(db, randomUUID()),
        defaultAccountTheme,
      );
    });
  },
);
