import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { createDb, users } from "@repo/db";
import { inArray } from "drizzle-orm";
import {
  createPerson,
  getPerson,
  listPeople,
  savePerson,
  deletePerson,
  setCoachPersonDay,
} from "./people.ts";
const url = process.env.TEST_POSTGRES_URL;
if (!url && process.env.CI)
  test("people require Postgres in CI", () =>
    assert.fail("TEST_POSTGRES_URL missing"));
describe(
  "people account-scoped mutations used by server actions",
  { skip: !url },
  () => {
    const db = createDb(url!);
    const a = randomUUID(),
      b = randomUUID();
    const today = "2026-10-21";
    before(async () => {
      await db
        .insert(users)
        .values(
          [a, b].map((id) => ({
            id,
            email: `${id}@test.invalid`,
            passwordHash: "-",
          })),
        );
    });
    after(async () => {
      await db.delete(users).where(inArray(users.id, [a, b]));
      await db.$client.end();
    });
    test("create trims, permits duplicates, requires group, and starts with no dates or rule", async () => {
      for (const input of [
        { name: "", group: "Family" },
        { name: "x".repeat(201), group: "Family" },
        { name: "Ada", group: "" },
      ])
        await assert.rejects(createPerson(a, input, db));
      assert.deepEqual(await listPeople(a, db), []);
      const p = await createPerson(a, { name: " Ada ", group: "Family" }, db);
      assert.equal(p.name, "Ada");
      assert.equal(p.rule, null);
      assert.equal(p.lastConnected, null);
      assert.equal(p.agreedDay, null);
      await createPerson(a, { name: "Ada", group: "Family" }, db);
      assert.equal((await listPeople(a, db)).length, 2);
    });
    test("save all fields atomically; future last connected and invalid agreed day store nothing", async () => {
      const p = await createPerson(
        a,
        { name: "Save", group: "Close friends" },
        db,
      );
      for (const patch of [
        { name: " " },
        { name: "x".repeat(201) },
        { group: "" },
        { lastConnected: "2026-10-22" },
        { agreedDay: "2026-10-20" },
        { agreedDay: today },
      ]) {
        await assert.rejects(
          savePerson(a, p.id, { ...p, ...patch }, today, db),
        );
        assert.deepEqual(await getPerson(a, p.id, db), p);
      }
      const saved = await savePerson(
        a,
        p.id,
        {
          name: " Renamed ",
          group: "Family",
          rule: { every: 1, unit: "months" },
          lastConnected: today,
          agreedDay: "2026-11-03",
        },
        today,
        db,
      );
      assert.equal(saved.name, "Renamed");
      assert.equal(saved.lastConnected, today);
      assert.equal(saved.agreedDay, "2026-11-03");
      await savePerson(a, p.id, { ...saved, agreedDay: null }, today, db);
      assert.equal((await getPerson(a, p.id, db))?.agreedDay, null);
    });
    test("another account cannot list, read, save, delete or coach-write a person; delete removes it", async () => {
      const p = await createPerson(a, { name: "Private", group: "Family" }, db);
      assert.deepEqual(await listPeople(b, db), []);
      assert.equal(await getPerson(b, p.id, db), null);
      assert.equal(await getPerson(a, "bad", db), null);
      await assert.rejects(savePerson(b, p.id, p, today, db));
      await assert.rejects(deletePerson(b, p.id, db));
      await assert.rejects(
        setCoachPersonDay(
          b,
          {
            personId: p.id,
            field: "lastConnected",
            day: today,
            today,
            operationId: randomUUID(),
          },
          db,
        ),
      );
      assert.ok(await getPerson(a, p.id, db));
      await deletePerson(a, p.id, db);
      assert.equal(await getPerson(a, p.id, db), null);
    });
    test("Coach replay is durable, concurrent-safe, and cannot overwrite a later edit; refusals write nothing", async () => {
      const p = await createPerson(a, { name: "Replay", group: "Family" }, db);
      const input = {
        personId: p.id,
        field: "lastConnected" as const,
        day: today,
        today,
        operationId: randomUUID(),
      };
      const results = await Promise.all([
        setCoachPersonDay(a, input, db),
        setCoachPersonDay(a, input, db),
      ]);
      assert.deepEqual(results[0], results[1]);
      await savePerson(
        a,
        p.id,
        {
          ...p,
          lastConnected: "2026-10-09",
          rule: { every: 1, unit: "months" },
        },
        today,
        db,
      );
      await setCoachPersonDay(a, input, db);
      assert.equal((await getPerson(a, p.id, db))?.lastConnected, "2026-10-09");
      const agreed = {
        ...input,
        field: "agreedDay" as const,
        operationId: randomUUID(),
        day: "2026-10-20",
      };
      await assert.rejects(setCoachPersonDay(a, agreed, db));
      await setCoachPersonDay(a, { ...agreed, day: "2026-11-03" }, db);
      assert.equal((await getPerson(a, p.id, db))?.agreedDay, "2026-11-03");
      await setCoachPersonDay(
        a,
        { ...agreed, day: null, operationId: randomUUID() },
        db,
      );
      assert.equal((await getPerson(a, p.id, db))?.agreedDay, null);
      await deletePerson(a, p.id, db);
      assert.deepEqual(await setCoachPersonDay(a, input, db), results[0]);
    });
  },
);
