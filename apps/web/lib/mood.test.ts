import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";
import { createDb, dayScores, users } from "@repo/db";
import { and, eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getJournalDay, saveJournalDay } from "./journal.ts";
import { getMood, setMood } from "./mood.ts";

const url = process.env.TEST_POSTGRES_URL;
if (!url && process.env.CI) test("Mood database tests require Postgres in CI", () => assert.fail("TEST_POSTGRES_URL missing"));

describe("Mood for the day", { skip: !url && "TEST_POSTGRES_URL missing" }, () => {
  const admin = createDb(url!).$client;
  const database = `bearing_mood_${randomUUID().replaceAll("-", "")}`;
  const connection = new URL(url ?? "postgres://localhost/test");
  connection.pathname = `/${database}`;
  const db = createDb(connection.toString());
  const a = randomUUID(), b = randomUUID();
  const today = "2026-10-11";
  const setAt = Date.parse("2026-10-11T12:00:00.000Z");
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
  test("missing is null, and a mood can be set without creating a journal document", async () => {
    await db.transaction(async (tx) => {
      await tx.execute("set transaction read only");
      assert.equal(await getMood(a, today, tx), null);
    });
    const score = await setMood(a, { day: today, today, mood: "Very good", setAt }, db);
    assert.equal(score.mood, "Very good");
    assert.equal(score.moodSetAt.getTime(), setAt);
    assert.equal(await getMood(a, today, db), "Very good");
    assert.equal(await getJournalDay(a, today, db), null);
  });
  test("all five words persist and clear stores null while preserving the document", async () => {
    const day = "2026-10-10";
    const entry = await saveJournalDay(a, day, "My reflection", 0, today, db);
    assert.equal(await getMood(a, day, db), null);
    let id;
    for (const [index, mood] of (["Very low", "Low", "Okay", "Good", "Very good"] as const).entries()) {
      const score = await setMood(a, { day, today, mood, setAt: setAt + index }, db);
      id ??= score.id;
      assert.equal(score.id, id);
      assert.equal(await getMood(a, day, db), mood);
    }
    const cleared = await setMood(a, { day, today, mood: null, setAt: setAt + 5 }, db);
    assert.equal(cleared.id, id);
    assert.equal(cleared.mood, null);
    assert.equal(cleared.moodSetAt.getTime(), setAt + 5);
    assert.equal(await getMood(a, day, db), null);
    assert.deepEqual(await getJournalDay(a, day, db), entry);
  });
  test("older sets and clears cannot overwrite newer changes; exact replays are no-ops", async () => {
    const day = "2026-10-09";
    const old = { day, today, mood: "Low" as const, setAt };
    await setMood(a, old, db);
    const newer = { day, today, mood: "Good" as const, setAt: setAt + 1 };
    const saved = await setMood(a, newer, db);
    assert.deepEqual(await setMood(a, old, db), saved);
    assert.deepEqual(await setMood(a, { ...old, mood: null }, db), saved);
    assert.deepEqual(await setMood(a, newer, db), saved);
    // Equal timestamps cannot mutate the row, even with a changed payload.
    assert.deepEqual(await setMood(a, { ...newer, mood: "Okay" }, db), saved);
    const clear = { day, today, mood: null, setAt: setAt + 2 };
    const cleared = await setMood(a, clear, db);
    assert.deepEqual(await setMood(a, old, db), cleared);
    assert.deepEqual(await setMood(a, newer, db), cleared);
    assert.deepEqual(await setMood(a, clear, db), cleared);
    assert.equal(await getMood(a, day, db), null);
    const next = await setMood(a, { ...old, mood: "Very good", setAt: setAt + 3 }, db);
    assert.equal(next.id, saved.id);
    assert.equal(next.createdAt.getTime(), saved.createdAt.getTime());
    assert.equal(await getMood(a, day, db), "Very good");
  });
  test("future days, invalid dates, words and timestamps are refused before any write", async () => {
    const input = { day: "2026-10-08", today, mood: "Okay" as const, setAt };
    await db.transaction(async (tx) => {
      await tx.execute("set transaction read only");
      for (const mood of ["Low", null] as const) {
        await assert.rejects(setMood(a, { ...input, day: "2026-10-12", mood }, tx), /not open yet/);
      }
      for (const day of ["0000-01-01", "2023-02-29", "1900-02-29", "2026-04-31", "2026-2-03", "bad"]) {
        await assert.rejects(setMood(a, { ...input, day }, tx), /real YYYY-MM-DD/);
        assert.equal(await getMood(a, day, tx), null);
      }
      for (const browserToday of ["", "2026-02-30", "bad"]) {
        await assert.rejects(setMood(a, { ...input, today: browserToday }, tx), /real YYYY-MM-DD/);
      }
      for (const mood of ["Happy", "okay", "", 0, undefined]) {
        // @ts-expect-error Deliberately exercise untrusted runtime inputs.
        await assert.rejects(setMood(a, { ...input, mood }, tx), /five mood words/);
      }
      for (const time of [NaN, Infinity, -1, 1.5, 253402300800000, undefined, "2026-10-11"]) {
        // @ts-expect-error Deliberately exercise untrusted runtime inputs.
        await assert.rejects(setMood(a, { ...input, setAt: time }, tx), /client set time/);
      }
    });
    // Null reads alone cannot distinguish a rejected write from a cleared row.
    assert.deepEqual(await db.select().from(dayScores)
      .where(and(eq(dayScores.userId, a), inArray(dayScores.day, [input.day, "2026-10-12"]))), []);
    await setMood(a, { ...input, day: "2024-02-29" }, db);
    assert.equal(await getMood(a, "2024-02-29", db), "Okay");
  });
  test("clearing a missing mood keeps it unset and blocks an older delayed set", async () => {
    const day = "2026-10-07";
    const cleared = await setMood(a, { day, today, mood: null, setAt: setAt + 1 }, db);
    assert.equal(cleared.mood, null);
    assert.deepEqual(await setMood(a, { day, today, mood: "Okay", setAt }, db), cleared);
    assert.equal(await getMood(a, day, db), null);
    assert.equal(await getJournalDay(a, day, db), null);
  });
  test("concurrent writes leave one owned score with the latest client timestamp", async () => {
    const day = "2026-10-06";
    await Promise.all([
      setMood(a, { day, today, mood: "Good", setAt: setAt + 1 }, db),
      setMood(a, { day, today, mood: null, setAt: setAt + 2 }, db),
      setMood(a, { day, today, mood: "Low", setAt }, db),
    ]);
    const latest = await setMood(a, { day, today, mood: "Okay", setAt }, db);
    assert.equal(latest.mood, null);
    assert.equal(latest.moodSetAt.getTime(), setAt + 2);
    assert.equal(await getMood(a, day, db), null);
    assert.equal((await db.select().from(dayScores)
      .where(and(eq(dayScores.userId, a), eq(dayScores.day, day)))).length, 1);
  });
  test("foreign scores are invisible and another person's choices and clears cannot change them", async () => {
    const day = "2026-10-05";
    const owned = await setMood(a, { day, today, mood: "Very low", setAt }, db);
    assert.equal(await getMood(b, day, db), null);
    const foreign = await setMood(b, { day, today, mood: "Very good", setAt: setAt + 1 }, db);
    assert.notEqual(foreign.id, owned.id);
    assert.equal(await getMood(a, day, db), "Very low");
    await setMood(b, { day, today, mood: null, setAt: setAt + 2 }, db);
    assert.equal(await getMood(b, day, db), null);
    assert.deepEqual(await setMood(a, { day, today, mood: null, setAt: setAt - 1 }, db), owned);
  });
  test("the database CHECK allows null but refuses other words, and user deletion cascades", async () => {
    const owner = randomUUID();
    await db.insert(users).values({ id: owner, email: `${owner}@test.invalid`, passwordHash: "-" });
    await assert.rejects(db.insert(dayScores).values({ userId: owner, day: today, mood: "Happy", moodSetAt: new Date(setAt) }),
      (error: unknown) => error instanceof Error && "cause" in error && (error.cause as { code?: string }).code === "23514");
    await setMood(owner, { day: today, today, mood: null, setAt }, db);
    await db.delete(users).where(eq(users.id, owner));
    assert.deepEqual(await db.select().from(dayScores).where(eq(dayScores.userId, owner)), []);
  });
});
