import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createDb, users } from "@repo/db";
import { inArray } from "drizzle-orm";
import { createPerson } from "./people.ts";
import { relatedActions } from "./related-actions.ts";

test(
  "Related actions refuse self, duplicate and foreign person links and refresh both endpoints",
  { skip: !process.env.TEST_POSTGRES_URL },
  async () => {
    const db = createDb(process.env.TEST_POSTGRES_URL!);
    const owner = randomUUID(),
      other = randomUUID();
    try {
      await db
        .insert(users)
        .values(
          [owner, other].map((id) => ({
            id,
            email: `${id}@test.invalid`,
            passwordHash: "-",
          })),
        );
      const a = await createPerson(owner, { name: "Ada", group: "Family" }, db);
      const b = await createPerson(owner, { name: "Bo", group: "Family" }, db);
      const foreign = await createPerson(
        other,
        { name: "Secret", group: "Family" },
        db,
      );
      const refreshed: string[] = [];
      const actions = relatedActions({
        db,
        requireUser: async () => ({ id: owner }),
        refresh: (end) => {
          refreshed.push(`${end.kind}:${end.id}`);
        },
      });
      const today = "2026-10-21";
      assert.deepEqual(
        await actions.createLink("person", a.id, "person", a.id, today),
        { error: "A link can't point at the same item." },
      );
      assert.deepEqual(
        await actions.createLink("person", a.id, "person", foreign.id, today),
        { error: "That item is unavailable." },
      );
      assert.deepEqual(
        await actions.findLinkTargets("Secret", 0, today, "person", a.id),
        { hits: [], more: false },
      );
      const first = await actions.createLink(
        "person",
        a.id,
        "person",
        b.id,
        today,
      );
      assert.ok("related" in first);
      assert.equal(first.exists, false);
      assert.equal(first.related.outgoing.length, 1);
      const repeat = await actions.createLink(
        "person",
        a.id,
        "person",
        b.id,
        today,
      );
      assert.ok("related" in repeat);
      assert.equal(repeat.exists, true);
      assert.equal(repeat.related.outgoing.length, 1);
      assert.deepEqual(
        await actions.deleteLink(
          first.related.outgoing[0]!.edgeId,
          "person",
          b.id,
        ),
        { error: "That item is unavailable." },
      );
      assert.deepEqual(
        await actions.deleteLink(
          first.related.outgoing[0]!.edgeId,
          "person",
          a.id,
        ),
        { related: { outgoing: [], incoming: [] } },
      );
      assert.ok(refreshed.includes(`person:${a.id}`));
      assert.ok(refreshed.includes(`person:${b.id}`));
      const signedOut = relatedActions({
        db,
        refresh: () => {},
        requireUser: async () => {
          throw new Error("sign-in");
        },
      });
      await assert.rejects(
        signedOut.createLink("person", a.id, "person", b.id, today),
        /sign-in/,
      );
    } finally {
      await db.delete(users).where(inArray(users.id, [owner, other]));
      await db.$client.end();
    }
  },
);
