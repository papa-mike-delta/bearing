import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { createDb, users } from "@repo/db";
import { eq } from "drizzle-orm";
import { addLink, related } from "./links.ts";
import { createPerson, getPerson } from "./people.ts";
import { peopleActions } from "./people-actions.ts";
const url = process.env.TEST_POSTGRES_URL;
const db = url ? createDb(url) : null;
const id = randomUUID();
const today = "2026-10-21";
before(async () => {
  if (db)
    await db
      .insert(users)
      .values({ id, email: `${id}@test.invalid`, passwordHash: "-" });
});
after(async () => {
  if (db) {
    await db.delete(users).where(eq(users.id, id));
    await db.$client.end();
  }
});
test(
  "server actions authenticate, validate before storage, save explicitly and return errors without partial writes",
  { skip: !db },
  async () => {
    const paths: string[] = [];
    const actions = peopleActions({
      requireUser: async () => ({ id }),
      invalidate: (path) => {
        paths.push(path);
      },
      db: db!,
    });
    assert.ok("error" in (await actions.add({ name: " ", group: "Family" })));
    assert.ok("error" in (await actions.add({ name: "Ada", group: "" })));
    assert.deepEqual(await actions.due(today), { count: 0 });
    const result = await actions.add({ name: " Ada ", group: "Family" });
    assert.ok("href" in result);
    const personId = result.href.split("/").at(-1)!;
    const fields = {
      name: "Ada",
      group: "Family",
      rule: { every: 1, unit: "months" } as const,
      lastConnected: "2026-09-09",
      agreedDay: null,
    };
    assert.ok("person" in (await actions.save(personId, fields, today)));
    assert.deepEqual(await actions.due(today), { count: 1 });
    for (const patch of [
      { name: "x".repeat(201) },
      { lastConnected: "2026-10-22" },
      { agreedDay: "2026-10-20" },
      { rule: null, agreedDay: today },
    ])
      assert.ok(
        "error" in
          (await actions.save(personId, { ...fields, ...patch }, today)),
      );
    assert.deepEqual(await actions.due(today), { count: 1 });
    assert.ok("error" in (await actions.due("invalid")));
    const kept = await createPerson(
      id,
      { name: "Kept person", group: "Family" },
      db!,
    );
    const source = { kind: "person" as const, id: personId };
    const target = { kind: "person" as const, id: kept.id };
    await addLink(id, source, target, today, db!);
    await addLink(id, target, source, today, db!);
    assert.deepEqual(await actions.remove(personId), { href: "/people" });
    assert.deepEqual(await related(id, source, db!), {
      outgoing: [],
      incoming: [],
    });
    assert.deepEqual(await related(id, target, db!), {
      outgoing: [],
      incoming: [],
    });
    assert.ok(await getPerson(id, kept.id, db!));
    assert.deepEqual(await actions.due(today), { count: 0 });
    assert.ok(paths.includes("/people"));
    const signedOut = peopleActions({
      requireUser: async () => {
        throw new Error("redirect:/sign-in");
      },
      invalidate: () => {},
      db: db!,
    });
    await assert.rejects(
      signedOut.add({ name: "X", group: "Family" }),
      /sign-in/,
    );
    await assert.rejects(signedOut.save(personId, fields, today), /sign-in/);
    await assert.rejects(signedOut.remove(personId), /sign-in/);
    await assert.rejects(signedOut.due(today), /sign-in/);
  },
);
