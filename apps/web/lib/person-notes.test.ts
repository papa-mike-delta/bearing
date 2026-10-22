import { coachThread, saveMessage, threadMessages } from "./coach-threads.ts";
import { appliedWritesBlock, checkedResultsBlock } from "./coach-turn.ts";
import { coachTools } from "./coach-execution.ts";
import { readPerson, receipt, shownParts } from "@repo/coach";
import { coachData } from "./coach-tools.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createDb, users, entityLinks } from "@repo/db";
import { eq } from "drizzle-orm";
import { createPerson, deletePerson } from "./people.ts";
import { logNoteOnPerson } from "./person-notes.ts";
import { noteHref, getNote, listLooseNotes, deleteNote } from "./notes.ts";
import { captureDraft, inboxDrafts } from "./drafts.ts";
import { fileDraftOnPerson } from "./draft-filing/index.ts";
import { related } from "./links.ts";
const url = process.env.TEST_POSTGRES_URL;
test(
  "log on person creates a loose Note and outgoing edge together, splits text and replays once",
  { skip: !url },
  async () => {
    const db = createDb(url!);
    const user = randomUUID();
    try {
      await db
        .insert(users)
        .values({ id: user, email: `${user}@test.invalid`, passwordHash: "-" });
      const p = await createPerson(user, { name: "Ada", group: "Family" }, db);
      const input = {
        personId: p.id,
        text: "\n  A quote  \nExact words\nSecond line",
        occasionDate: "2026-10-09",
        today: "2026-10-21",
        operationId: randomUUID(),
      };
      const [r, replay] = await Promise.all([
        logNoteOnPerson(user, input, db),
        logNoteOnPerson(user, input, db),
      ]);
      assert.deepEqual(replay, r);
      const n = await getNote(user, r.id, db);
      assert.equal(n?.title, "A quote");
      assert.equal(n?.body, "Exact words\nSecond line");
      assert.equal(n?.notebookId, null);
      assert.equal(n?.occasionDate, "2026-10-09");
      assert.equal((await listLooseNotes(user, db)).length, 1);
      assert.deepEqual(
        (await related(user, { kind: "person", id: p.id }, db)).outgoing.map(
          (x) => x.id,
        ),
        [r.id],
      );
      assert.deepEqual(
        (await related(user, { kind: "note", id: r.id }, db)).incoming.map(
          (x) => x.id,
        ),
        [p.id],
      );
      for (const patch of [
        { text: " \n " },
        { occasionDate: "2026-10-22" },
        { personId: randomUUID() },
      ]) {
        await assert.rejects(
          logNoteOnPerson(
            user,
            { ...input, ...patch, operationId: randomUUID() },
            db,
          ),
        );
        assert.equal((await listLooseNotes(user, db)).length, 1);
      }
      await deleteNote(user, r.id, n!.revision, db);
      assert.deepEqual(
        (await related(user, { kind: "person", id: p.id }, db)).outgoing,
        [],
      );
      const keep = await logNoteOnPerson(
        user,
        { ...input, operationId: randomUUID() },
        db,
      );
      await deletePerson(user, p.id, db);
      assert.ok(await getNote(user, keep.id, db));
      assert.deepEqual(await related(user, { kind: "note", id: keep.id }, db), {
        outgoing: [],
        incoming: [],
      });
    } finally {
      await db.delete(users).where(eq(users.id, user));
      await db.$client.end();
    }
  },
);

test(
  "Inbox matches exactly one owned name ignoring case and archives only successful logging",
  { skip: !url },
  async () => {
    const db = createDb(url!);
    const user = randomUUID();
    try {
      await db
        .insert(users)
        .values({ id: user, email: `${user}@test.invalid`, passwordHash: "-" });
      await createPerson(user, { name: "Ada", group: "Family" }, db);
      await captureDraft(user, "Meeting\nWords", db);
      const [draft] = await inboxDrafts(user, db);
      const input = { name: " aDA ", today: "2026-10-21" };
      for (const patch of [
        { name: "Nobody" },
        { occasionDate: "2026-10-22" },
      ]) {
        await assert.rejects(
          fileDraftOnPerson(user, draft!.id, { ...input, ...patch }, db),
        );
        assert.equal((await inboxDrafts(user, db)).length, 1);
        assert.equal((await listLooseNotes(user, db)).length, 0);
      }
      const r = await fileDraftOnPerson(user, draft!.id, input, db);
      assert.equal((await inboxDrafts(user, db)).length, 0);
      assert.deepEqual(await fileDraftOnPerson(user, draft!.id, input, db), r);
      await createPerson(user, { name: "ADA", group: "Family" }, db);
      await captureDraft(user, "Second", db);
      const [second] = await inboxDrafts(user, db);
      await assert.rejects(fileDraftOnPerson(user, second!.id, input, db));
      assert.equal((await inboxDrafts(user, db)).length, 1);
    } finally {
      await db.delete(users).where(eq(users.id, user));
      await db.$client.end();
    }
  },
);

test(
  "readPerson includes at most twenty Notes in both directions in newest-edge order with bounded bodies",
  { skip: !url },
  async () => {
    const db = createDb(url!);
    const user = randomUUID();
    try {
      await db
        .insert(users)
        .values({ id: user, email: `${user}@test.invalid`, passwordHash: "-" });
      const p = await createPerson(
        user,
        { name: "Reader", group: "Family" },
        db,
      );
      const ids: string[] = [];
      for (let i = 0; i < 22; i++) {
        const r = await logNoteOnPerson(
          user,
          {
            personId: p.id,
            text: `Note ${i}\n${"a".repeat(2100)}`,
            today: "2026-10-21",
            operationId: randomUUID(),
          },
          db,
        );
        ids.unshift(r.id);
        if (i % 2 === 0)
          await db
            .update(entityLinks)
            .set({
              sourceType: "note",
              sourceId: r.id,
              targetType: "person",
              targetId: p.id,
            })
            .where(eq(entityLinks.targetId, r.id));
      }
      const result = await readPerson.run(
        { name: "Reader" },
        {
          userId: user,
          messageId: randomUUID(),
          toolCallId: "read",
          today: "2026-10-21",
          data: coachData(db),
        },
      );
      assert.ok("notes" in result);
      assert.deepEqual(
        result.notes.map((n) => n.id),
        ids.slice(0, 20),
      );
      assert.equal(result.notes[0]!.body.length, 2000);
      assert.equal(result.notes[0]!.occasionDate, null);
    } finally {
      await db.delete(users).where(eq(users.id, user));
      await db.$client.end();
    }
  },
);

test(
  "Coach logs with linked persisted receipts, shared write cap, neutral refusals and resend safety",
  { skip: !url },
  async () => {
    const db = createDb(url!);
    const user = randomUUID();
    try {
      await db
        .insert(users)
        .values({ id: user, email: `${user}@test.invalid`, passwordHash: "-" });
      const p = await createPerson(user, { name: "Ada", group: "Family" }, db);
      const threadId = await coachThread(user, db);
      const data = coachData(db);
      const ctx = {
        userId: user,
        messageId: randomUUID(),
        today: "2026-10-21",
      };
      const tools = coachTools(data);
      const run = (input: { name: string; text: string; day?: string }) =>
        tools.logNoteOnPerson.execute!(input, {
          toolCallId: randomUUID(),
          messages: [],
          context: ctx,
        });
      for (const input of [
        { name: "Nobody", text: "Hi" },
        { name: "Ada", text: " " },
        { name: "Ada", text: "Hi", day: "2026-10-22" },
      ]) {
        const r = await run(input);
        assert.ok("refused" in r && r.refused);
        const message = {
          id: randomUUID(),
          role: "assistant" as const,
          parts: [
            {
              type: "tool-logNoteOnPerson" as const,
              toolCallId: "x",
              state: "output-available" as const,
              input,
              output: r,
            },
          ],
        };
        assert.match(checkedResultsBlock([message]), /No change: asked about/);
        assert.equal(appliedWritesBlock([message]), "");
      }
      for (let i = 0; i < 3; i++) {
        const input = { name: " aDA ", text: `Quote ${i}\nWords` };
        const r = await run(input);
        assert.ok("id" in r);
        const message = {
          id: randomUUID(),
          role: "assistant" as const,
          parts: [
            {
              type: "tool-logNoteOnPerson" as const,
              toolCallId: "x",
              state: "output-available" as const,
              input,
              output: r,
            },
          ],
        };
        assert.equal(receipt(message.parts[0]!), "Logged a note on 'Ada'");
        await saveMessage(user, threadId, message, db);
        const reloaded = await threadMessages(user, threadId, db);
        assert.match(appliedWritesBlock(reloaded!), /Logged a note on 'Ada'/);
        const rendered = shownParts(reloaded!.at(-1)!.parts);
        assert.ok(
          rendered.some(
            (part) => "href" in part && part.href === noteHref(null, r.id),
          ),
        );
        const again = coachTools(data);
        const replay = await again.logNoteOnPerson.execute!(input, {
          toolCallId: "resend",
          messages: [],
          context: ctx,
        });
        assert.deepEqual(replay, r);
      }
      await assert.rejects(
        async () => run({ name: "Ada", text: "Fourth" }),
        /only 3/,
      );
      assert.equal((await listLooseNotes(user, db)).length, 3);
      assert.equal(
        (await related(user, { kind: "person", id: p.id }, db)).outgoing.length,
        3,
      );
    } finally {
      await db.delete(users).where(eq(users.id, user));
      await db.$client.end();
    }
  },
);

test(
  "an edge write failure rolls back the Note, identity claim and Inbox archive; the same identity can retry",
  { skip: !url },
  async () => {
    const db = createDb(url!);
    const user = randomUUID();
    try {
      await db
        .insert(users)
        .values({ id: user, email: `${user}@test.invalid`, passwordHash: "-" });
      const p = await createPerson(
        user,
        { name: "Atomic", group: "Family" },
        db,
      );
      // Inject a failed database write at the DB boundary; all earlier SQL still
      // runs in the real Postgres transaction and must roll back.
      const failing: import("./db.ts").Db = {
        select: db.select,
        insert: db.insert,
        update: db.update,
        delete: db.delete,
        transaction: (run) =>
          db.transaction((tx) =>
            run(
              new Proxy(tx, {
                get(target, key, receiver) {
                  if (key === "insert")
                    return (table: unknown) => {
                      if (table === entityLinks)
                        throw new Error("edge write failed");
                      return Reflect.apply(target.insert, target, [table]);
                    };
                  return Reflect.get(target, key, receiver);
                },
              }),
            ),
          ),
      };
      const input = {
        personId: p.id,
        text: "Keep together\nBody",
        today: "2026-10-21",
        operationId: randomUUID(),
      };
      await assert.rejects(
        logNoteOnPerson(user, input, failing),
        /edge write failed/,
      );
      assert.deepEqual(await listLooseNotes(user, db), []);
      assert.deepEqual(await related(user, { kind: "person", id: p.id }, db), {
        outgoing: [],
        incoming: [],
      });
      const saved = await logNoteOnPerson(user, input, db);
      assert.ok(await getNote(user, saved.id, db));
      await captureDraft(user, "Inbox atomic\nBody", db);
      const [draft] = await inboxDrafts(user, db);
      await assert.rejects(
        fileDraftOnPerson(
          user,
          draft!.id,
          { name: "Atomic", today: input.today },
          failing,
        ),
        /edge write failed/,
      );
      assert.equal((await inboxDrafts(user, db)).length, 1);
      assert.equal((await listLooseNotes(user, db)).length, 1);
      await fileDraftOnPerson(
        user,
        draft!.id,
        { name: "Atomic", today: input.today },
        db,
      );
      assert.equal((await inboxDrafts(user, db)).length, 0);
      assert.equal((await listLooseNotes(user, db)).length, 2);
      await captureDraft(user, " \n ", db);
      const [empty] = await inboxDrafts(user, db);
      await assert.rejects(
        fileDraftOnPerson(
          user,
          empty!.id,
          { name: "Atomic", today: input.today },
          db,
        ),
      );
      assert.equal((await inboxDrafts(user, db)).length, 1);
      assert.equal((await listLooseNotes(user, db)).length, 2);
    } finally {
      await db.delete(users).where(eq(users.id, user));
      await db.$client.end();
    }
  },
);
