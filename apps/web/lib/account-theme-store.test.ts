// Two accounts against a real Postgres, through the functions the import
// action calls. Needs TEST_POSTGRES_URL pointing at a database with the
// current schema (see README). Without it the suite fails in CI and is
// skipped, with a warning, everywhere else.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";
import { createDb, users } from "@repo/db";
import { eq, inArray } from "drizzle-orm";
import { defaultAccountTheme, themeChoices, themeDeclarations } from "./account-theme.ts";
import {
  loadAccountTheme,
  saveAccountTheme,
  switchAccountTheme,
} from "./account-theme-store.ts";
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

    function importedTheme(code: string) {
      const blocks = expandPreset(code);
      if (!blocks) throw new Error(`${code} did not expand`);
      return {
        choice: "imported" as const,
        code,
        light: blocks.light,
        dark: blocks.dark,
      };
    }

    async function themeRow(id: string) {
      const [row] = await db
        .select({
          themeChoice: users.themeChoice,
          themeCode: users.themeCode,
          themeLight: users.themeLight,
          themeDark: users.themeDark,
        })
        .from(users)
        .where(eq(users.id, id));
      return row;
    }

    test("switching one account to navy leaves the other on the shared default, and leaves its import", async () => {
      const a = await account();
      const b = await account();
      const switched = await switchAccountTheme(db, a, "navy");
      assert.equal(switched.error, null);
      assert.deepEqual(await loadAccountTheme(db, a), {
        ...defaultAccountTheme,
        choice: "navy",
      });
      const bDefault = await themeRow(b);
      assert.ok(bDefault);
      assert.equal(bDefault.themeChoice, "grayscale");
      assert.equal(bDefault.themeCode, null);
      assert.equal(bDefault.themeLight, null);
      assert.equal(bDefault.themeDark, null);
      assert.deepEqual(await loadAccountTheme(db, b), defaultAccountTheme);

      const bImport = importedTheme("b1sACkXE8");
      await saveAccountTheme(db, b, bImport);
      const again = await switchAccountTheme(db, a, "phthalo");
      assert.equal(again.error, null);
      assert.deepEqual(await loadAccountTheme(db, b), bImport);
    });

    test("switching to a built-in and back to imported leaves the import's code and variables", async () => {
      const a = await account();
      const saved = importedTheme("b1sACkXE8");
      await saveAccountTheme(db, a, saved);
      const toGold = await switchAccountTheme(db, a, "old-gold");
      assert.equal(toGold.error, null);
      const whileGold = await loadAccountTheme(db, a);
      assert.equal(whileGold.choice, "old-gold");
      assert.equal(whileGold.code, saved.code);
      assert.equal(whileGold.light, saved.light);
      assert.equal(whileGold.dark, saved.dark);
      assert.deepEqual(themeChoices(whileGold).filter((choice) => choice.id === "imported"), [{ id: "imported", name: "My theme", selected: false }]);
      // Selecting the My theme chip submits "imported" and re-applies the import.
      const back = await switchAccountTheme(db, a, "imported");
      assert.equal(back.error, null);
      const restored = await loadAccountTheme(db, a);
      assert.deepEqual(restored, saved);
      assert.equal(themeDeclarations(restored, "light"), saved.light);
      assert.equal(themeChoices(restored).find((choice) => choice.id === "imported")?.selected, true);
    });

    test("switching after another tab saved a different import keeps that import", async () => {
      const a = await account();
      const x = importedTheme("b1sACkXE8");
      const y = importedTheme("b5de5C2oi");
      await saveAccountTheme(db, a, x);
      await saveAccountTheme(db, a, y);
      const switched = await switchAccountTheme(db, a, "navy");
      assert.equal(switched.error, null);
      const loaded = await loadAccountTheme(db, a);
      assert.equal(loaded.choice, "navy");
      assert.equal(loaded.code, y.code);
      assert.equal(loaded.light, y.light);
      assert.equal(loaded.dark, y.dark);
    });

    test("unknown and miscased choices are rejected and leave the row unchanged", async () => {
      const a = await account();
      for (const choice of [
        "imported",
        "Navy",
        "OLD-GOLD",
        "old gold",
        "not-a-theme",
        "",
      ]) {
        const result = await switchAccountTheme(db, a, choice);
        assert.equal(result.error, "rejected", choice);
        assert.deepEqual(await loadAccountTheme(db, a), defaultAccountTheme, choice);
      }
    });
  },
);
