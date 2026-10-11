import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";
import { createDb, users } from "@repo/db";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getJournalDay, saveJournalDay } from "./journal.ts";

const url = process.env.TEST_POSTGRES_URL;
if (!url && process.env.CI) test("Journal database tests require Postgres in CI", () => assert.fail("TEST_POSTGRES_URL missing"));

describe("Journal persistence", { skip: !url && "TEST_POSTGRES_URL missing" }, () => {
  const admin = createDb(url!).$client;
  const database = `bearing_journal_${randomUUID().replaceAll("-", "")}`;
  const connection = new URL(url ?? "postgres://localhost/test");
  connection.pathname = `/${database}`;
  const db = createDb(connection.toString());
  const a = randomUUID(), b = randomUUID();
  before(async () => {
    await admin.query(`create database "${database}"`);
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url)) });
    await db.insert(users).values([a, b].map((id) => ({ id, email: `${id}@test.invalid`, passwordHash: "-" })));
  });
  after(async () => {
    await db.delete(users).where(inArray(users.id, [a, b]));
    await db.$client.end();
    await admin.query(`drop database if exists "${database}"`);
    await admin.end();
  });
  test("opening an empty day is read-only, even with a read-only transaction", async () => {
    await db.transaction(async (tx) => {
      await tx.execute("set transaction read only");
      assert.equal(await getJournalDay(a, "2026-10-10", tx), null);
      assert.equal(await getJournalDay(a, "2026-10-10", tx), null);
    });
    assert.equal(await getJournalDay(a, "2026-10-10", db), null);
  });
  test("first save creates one document and later saves preserve its id and exact markdown", async () => {
    const body = "\n# Reflection\n\nFull **markdown**\r\n";
    const first = (await saveJournalDay(a, "2026-10-09", body, 0, "2026-10-11", db))!;
    assert.equal(first.revision, 1);
    assert.equal((await getJournalDay(a, "2026-10-09", db))?.body, body);
    const saved = (await saveJournalDay(a, "2026-10-09", "Updated\n", 1, "2026-10-11", db))!;
    assert.equal(saved.id, first.id);
    assert.equal(saved.revision, 2);
    assert.equal(saved.createdAt.getTime(), first.createdAt.getTime());
    assert.ok(saved.updatedAt >= first.updatedAt);
    assert.equal((await getJournalDay(a, "2026-10-09", db))?.body, "Updated\n");
  });
  test("concurrent first saves and stale replacements report conflicts without overwriting", async () => {
    const firstSaves = await Promise.allSettled(["First", "Second"].map((body) => saveJournalDay(a, "2026-10-08", body, 0, "2026-10-11", db)));
    assert.equal(firstSaves.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = firstSaves.find((result) => result.status === "rejected");
    assert.ok(rejected?.status === "rejected");
    assert.match(rejected.reason.message, /Conflict.*unsaved text/);
    const first = (await getJournalDay(a, "2026-10-08", db))!;
    const edits = await Promise.allSettled(["Edit A", "Edit B"].map((body) => saveJournalDay(a, first.day, body, first.revision, "2026-10-11", db)));
    assert.equal(edits.filter((result) => result.status === "fulfilled").length, 1);
    const current = (await getJournalDay(a, first.day, db))!;
    assert.equal(current.id, first.id);
    assert.equal(current.revision, 2);
    await assert.rejects(saveJournalDay(a, first.day, "Stale", 1, "2026-10-11", db), /Conflict/);
    assert.equal((await getJournalDay(a, first.day, db))?.body, current.body);
  });
  test("empty saves write nothing and the shared Notes body limit rejects rather than truncates", async () => {
    for (const body of ["", " \n\t"]) {
      await db.transaction(async (tx) => {
        await tx.execute("set transaction read only");
        assert.equal(await saveJournalDay(a, "2026-10-07", body, 0, "2026-10-11", tx), null);
      });
    }
    assert.equal(await getJournalDay(a, "2026-10-07", db), null);
    await assert.rejects(saveJournalDay(a, "2026-10-07", "x".repeat(100_001), 0, "2026-10-11", db), /100,000/);
    assert.equal(await getJournalDay(a, "2026-10-07", db), null);
    const saved = (await saveJournalDay(a, "2026-10-07", "x".repeat(100_000), 0, "2026-10-11", db))!;
    await assert.rejects(saveJournalDay(a, saved.day, "x".repeat(100_001), saved.revision, "2026-10-11", db), /100,000/);
    assert.equal(await saveJournalDay(a, saved.day, "", saved.revision, "2026-10-11", db), null);
    const current = (await getJournalDay(a, saved.day, db))!;
    assert.equal(current.body, saved.body);
    assert.equal(current.revision, saved.revision);
    assert.equal(current.updatedAt.getTime(), saved.updatedAt.getTime());
  });
  test("real leap days work; impossible dates and missing browser Today are refused", async () => {
    const leap = (await saveJournalDay(a, "2024-02-29", "Leap day", 0, "2026-10-11", db))!;
    assert.equal(leap.day, "2024-02-29");
    assert.equal((await getJournalDay(a, leap.day, db))?.body, "Leap day");
    for (const day of ["0096-02-29", "2000-02-29"]) {
      assert.equal((await saveJournalDay(a, day, "Leap year", 0, "2026-10-11", db))?.day, day);
    }
    for (const day of ["0000-01-01", "2023-02-29", "1900-02-29", "2026-04-31", "2026-00-10", "2026-13-01", "2026-10-00", "2026-2-03", "2026-10-10T00:00:00Z", "not-a-day"]) {
      assert.equal(await getJournalDay(a, day, db), null);
      await assert.rejects(saveJournalDay(a, day, "Invalid", 0, "2026-10-11", db), /calendar day/);
    }
    for (const today of ["", "2026-02-29", "yesterday"]) {
      await assert.rejects(saveJournalDay(a, "2026-10-06", "No context", 0, today, db), /calendar day/);
    }
    assert.equal(await getJournalDay(a, "2026-10-06", db), null);
  });
  test("future days are refused relative to browser Today, including empty and existing days", async () => {
    for (const body of ["Reflection", ""]) {
      await assert.rejects(saveJournalDay(a, "2026-10-12", body, 0, "2026-10-11", db), /not open yet/);
    }
    assert.equal(await getJournalDay(a, "2026-10-12", db), null);
    // The same day can be today in another browser; an open dated entry keeps its target.
    const entry = (await saveJournalDay(a, "2026-10-12", "Local today", 0, "2026-10-12", db))!;
    await assert.rejects(saveJournalDay(a, entry.day, "Too early", entry.revision, "2026-10-11", db), /not open yet/);
    assert.equal((await getJournalDay(a, entry.day, db))?.body, "Local today");
  });
  test("days are private, foreign ids behave as missing, and revisions cannot invent entries", async () => {
    const owned = (await saveJournalDay(a, "2026-10-05", "Private A", 0, "2026-10-11", db))!;
    assert.equal(await getJournalDay(b, owned.day, db), null);
    await assert.rejects(saveJournalDay(b, owned.day, "Foreign edit", owned.revision, "2026-10-11", db), /unavailable/);
    assert.equal(await getJournalDay(b, owned.id, db), null);
    await assert.rejects(saveJournalDay(b, owned.id, "Foreign id", owned.revision, "2026-10-11", db), /calendar day/);
    const ownB = (await saveJournalDay(b, owned.day, "Private B", 0, "2026-10-11", db))!;
    assert.notEqual(ownB.id, owned.id);
    assert.equal((await getJournalDay(a, owned.day, db))?.body, "Private A");
    assert.equal((await getJournalDay(b, owned.day, db))?.body, "Private B");
    for (const revision of [-1, 0.5, NaN, Infinity, 2 ** 32]) {
      await assert.rejects(saveJournalDay(a, "2026-10-04", "Invalid revision", revision, "2026-10-11", db), /revision/);
    }
    await assert.rejects(saveJournalDay(a, "2026-10-04", "Missing", 1, "2026-10-11", db), /unavailable/);
    assert.equal(await getJournalDay(a, "2026-10-04", db), null);
  });
  test("deleting an account cascades its journal documents", async () => {
    await saveJournalDay(b, "2026-10-03", "Removed with account", 0, "2026-10-11", db);
    await db.delete(users).where(eq(users.id, b));
    assert.equal(await getJournalDay(b, "2026-10-03", db), null);
    assert.equal(await getJournalDay(b, "2026-10-05", db), null);
    assert.equal((await getJournalDay(a, "2026-10-05", db))?.body, "Private A");
  });
});
