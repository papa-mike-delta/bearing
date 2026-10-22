import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { createDb, entityLinks, people, journalEntries, users } from "@repo/db";
import { taskHref } from "@repo/domain";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { createArea, renameArea } from "./areas.ts";
import { saveJournalDay, getJournalDay } from "./journal.ts";
import { formatJournalDay } from "./journal-day.ts";
import { addLink, related, removeLink, searchLinkTargets } from "./links.ts";
import { createPerson, deletePerson, getPerson, savePerson } from "./people.ts";
import { setMood } from "./mood.ts";
import {
  createNote,
  createNotebook,
  deleteNote,
  deleteNotebook,
  getNote,
  saveNote,
} from "./notes.ts";
import { addTask, completeTask, openTasks, taskDetail } from "./tasks.ts";

const url = process.env.TEST_POSTGRES_URL;
if (!url && process.env.CI) {
  test("Link database tests require Postgres in CI", () =>
    assert.fail("TEST_POSTGRES_URL missing"));
}

const today = "2026-10-11";
const savedDay = "2026-10-09";
const futureDay = "2026-10-12";

describe(
  "Related links",
  { skip: !url && "TEST_POSTGRES_URL missing", concurrency: false },
  () => {
    const db = createDb(url!);
    const owner = randomUUID();
    const other = randomUUID();
    let areaId = "";
    let book = "";
    const from = () => ({ source: "coach" as const, sourceId: randomUUID() });

    before(async () => {
      await db.insert(users).values(
        [owner, other].map((id) => ({
          id,
          email: `${id}@test.invalid`,
          passwordHash: "-",
        })),
      );
      areaId = (await createArea(owner, "Work", db))!.id;
      await createArea(other, "Private", db);
      book = (await createNotebook(owner, "Ideas", db)).id;
      await createNotebook(other, "Secret", db);
    });

    after(async () => {
      await db.delete(users).where(inArray(users.id, [owner, other]));
      await db.$client.end();
    });

    async function task(userId: string, name: string, note = "") {
      const row = await addTask(userId, { name, note, today }, db);
      assert.ok(row);
      return row;
    }

    async function note(
      userId: string,
      title: string,
      notebookId = book,
      body = "body",
    ) {
      return createNote(userId, { notebookId, title, body }, from(), db);
    }

    test("people link in both directions, refuse duplicates, self and foreign ends, and resolve current names", async () => {
      const p = await createPerson(
        owner,
        { name: "Link Ada", group: "Family" },
        db,
      );
      const foreign = await createPerson(
        other,
        { name: "Link Secret", group: "Family" },
        db,
      );
      const t = await task(owner, "Person task");
      const person = { kind: "person" as const, id: p.id };
      const target = { kind: "task" as const, id: t.id };
      assert.deepEqual(await addLink(owner, person, target, today, db), {
        ok: true,
        created: true,
      });
      assert.deepEqual(await addLink(owner, person, target, today, db), {
        ok: true,
        created: false,
      });
      assert.deepEqual(await addLink(owner, person, person, today, db), {
        ok: false,
        reason: "self",
      });
      assert.deepEqual(
        await addLink(
          owner,
          target,
          { kind: "person", id: foreign.id },
          today,
          db,
        ),
        { ok: false, reason: "not-found" },
      );
      assert.deepEqual(
        await addLink(
          owner,
          { kind: "person", id: foreign.id },
          target,
          today,
          db,
        ),
        { ok: false, reason: "not-found" },
      );
      await addLink(owner, target, person, today, db);
      await savePerson(owner, p.id, { ...p, name: "Renamed Ada" }, today, db);
      const lists = await related(owner, target, db);
      assert.equal(lists.outgoing[0]?.label, "Renamed Ada");
      assert.equal(lists.outgoing[0]?.href, `/people/${p.id}`);
      assert.equal(lists.incoming[0]?.label, "Renamed Ada");
      assert.equal(
        (await removeLink(owner, lists.incoming[0]!.edgeId, target, db)).ok,
        false,
      );
      assert.equal(
        (await removeLink(owner, lists.outgoing[0]!.edgeId, target, db)).ok,
        true,
      );
      assert.ok(await getPerson(owner, p.id, db));
      assert.ok(await taskDetail(owner, t.id, db));
    });

    test("a person links to a different person: Outgoing on one, Backlink on the other; duplicate, self and foreign refused; deleting either person removes the edge", async () => {
      for (const victim of ["from", "to"] as const) {
        const a = await createPerson(
          owner,
          { name: `P2P Ada ${victim}`, group: "Family" },
          db,
        );
        const b = await createPerson(
          owner,
          { name: `P2P Bo ${victim}`, group: "Close friends" },
          db,
        );
        const foreign = await createPerson(
          other,
          { name: `P2P Secret ${victim}`, group: "Family" },
          db,
        );
        const ada = { kind: "person" as const, id: a.id };
        const bo = { kind: "person" as const, id: b.id };
        assert.deepEqual(await addLink(owner, ada, bo, today, db), {
          ok: true,
          created: true,
        });
        assert.deepEqual(await addLink(owner, ada, bo, today, db), {
          ok: true,
          created: false,
        });
        assert.deepEqual(await addLink(owner, ada, ada, today, db), {
          ok: false,
          reason: "self",
        });
        assert.deepEqual(
          await addLink(
            owner,
            ada,
            { kind: "person", id: foreign.id },
            today,
            db,
          ),
          { ok: false, reason: "not-found" },
        );
        const fromAda = await related(owner, ada, db);
        const fromBo = await related(owner, bo, db);
        assert.deepEqual(
          fromAda.outgoing.map((i) => i.label),
          [b.name],
        );
        assert.deepEqual(fromAda.incoming, []);
        assert.deepEqual(fromBo.outgoing, []);
        assert.deepEqual(
          fromBo.incoming.map((i) => i.label),
          [a.name],
        );
        assert.equal(fromBo.incoming[0]?.href, `/people/${a.id}`);
        await deletePerson(owner, victim === "from" ? a.id : b.id, db);
        const left = await db
          .select({ id: entityLinks.id })
          .from(entityLinks)
          .where(
            and(
              eq(entityLinks.userId, owner),
              or(
                inArray(entityLinks.sourceId, [a.id, b.id]),
                inArray(entityLinks.targetId, [a.id, b.id]),
              ),
            ),
          );
        assert.deepEqual(left, []);
        const survivor = victim === "from" ? bo : ada;
        const lists = await related(owner, survivor, db);
        assert.deepEqual([...lists.outgoing, ...lists.incoming], []);
      }
    });

    test("person picker searches only owned names, excludes self, and pages twenty at a time", async () => {
      const source = await task(owner, "Picker source");
      const rows = await Promise.all(
        Array.from({ length: 21 }, (_, n) =>
          createPerson(
            owner,
            {
              name: `Picker person ${String(n).padStart(2, "0")}`,
              group: "Family",
            },
            db,
          ),
        ),
      );
      await createPerson(
        other,
        { name: "Picker person foreign", group: "Family" },
        db,
      );
      const input = {
        query: "picker person",
        offset: 0,
        today,
        exclude: { kind: "task" as const, id: source.id },
      };
      const first = await searchLinkTargets(owner, input, db);
      const second = await searchLinkTargets(
        owner,
        { ...input, offset: 20 },
        db,
      );
      assert.equal(first.hits.length, 20);
      assert.equal(first.more, true);
      assert.deepEqual(
        second.hits.map((h) => h.label),
        ["Picker person 20"],
      );
      assert.equal(second.more, false);
      assert.ok(first.hits.every((h) => h.kind === "person"));
      const self = await searchLinkTargets(
        owner,
        { ...input, exclude: { kind: "person", id: rows[0]!.id } },
        db,
      );
      assert.equal(
        self.hits.some((h) => h.id === rows[0]!.id),
        false,
      );
      const group = await searchLinkTargets(
        owner,
        { ...input, query: "Family" },
        db,
      );
      assert.equal(
        group.hits.some((h) => h.kind === "person"),
        false,
      );
    });

    test("deleting a person removes both directions and preserves Tasks, Notes and Journal", async () => {
      const p = await createPerson(
        owner,
        { name: "Delete linked", group: "Family" },
        db,
      );
      const t = await task(owner, "Keep linked task");
      const n = await note(owner, "Keep linked note");
      const day = "2026-09-01";
      await saveJournalDay(owner, day, "Keep linked day", 0, today, db);
      const end = { kind: "person" as const, id: p.id };
      for (const target of [
        { kind: "task" as const, id: t.id },
        { kind: "note" as const, id: n.id },
        { kind: "journal" as const, id: day },
      ]) {
        await addLink(owner, end, target, today, db);
        await addLink(owner, target, end, today, db);
      }
      await assert.rejects(deletePerson(other, p.id, db));
      assert.equal((await related(owner, end, db)).outgoing.length, 3);
      await deletePerson(owner, p.id, db);
      assert.equal(await getPerson(owner, p.id, db), null);
      assert.deepEqual(await related(owner, end, db), {
        outgoing: [],
        incoming: [],
      });
      assert.ok(await taskDetail(owner, t.id, db));
      assert.ok(await getNote(owner, n.id, db));
      assert.equal(
        (await getJournalDay(owner, day, db))?.body,
        "Keep linked day",
      );
    });

    test("a failed person deletion rolls back edge removal", async () => {
      const p = await createPerson(
        owner,
        { name: "Atomic person", group: "Family" },
        db,
      );
      const t = await task(owner, "Atomic task");
      const person = { kind: "person" as const, id: p.id };
      const target = { kind: "task" as const, id: t.id };
      await addLink(owner, person, target, today, db);
      await addLink(owner, target, person, today, db);
      const name = `refuse_person_${randomUUID().replaceAll("-", "")}`;
      try {
        await db.execute(
          sql.raw(
            `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.id = '${p.id}'::uuid THEN RAISE EXCEPTION 'test delete failure'; END IF; RETURN OLD; END $$`,
          ),
        );
        await db.execute(
          sql.raw(
            `CREATE TRIGGER ${name} BEFORE DELETE ON people FOR EACH ROW EXECUTE FUNCTION ${name}()`,
          ),
        );
        await assert.rejects(deletePerson(owner, p.id, db));
        assert.ok(await getPerson(owner, p.id, db));
        const lists = await related(owner, person, db);
        assert.equal(lists.outgoing.length, 1);
        assert.equal(lists.incoming.length, 1);
      } finally {
        await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${name} ON people`));
        await db.execute(sql.raw(`DROP FUNCTION IF EXISTS ${name}()`));
      }
    });

    test("missing person endpoints are hidden from outgoing and backlinks", async () => {
      const p = await createPerson(
        owner,
        { name: "Gone person", group: "Family" },
        db,
      );
      const t = await task(owner, "Orphan task");
      await addLink(
        owner,
        { kind: "person", id: p.id },
        { kind: "task", id: t.id },
        today,
        db,
      );
      await addLink(
        owner,
        { kind: "task", id: t.id },
        { kind: "person", id: p.id },
        today,
        db,
      );
      await db.delete(people).where(eq(people.id, p.id));
      assert.deepEqual(await related(owner, { kind: "task", id: t.id }, db), {
        outgoing: [],
        incoming: [],
      });
    });

    test("an owned open or completed task opens; a foreign id does not", async () => {
      const open = await task(owner, "Call dentist", "Ask about the crown");
      const done = await task(owner, "Finished errand");
      await completeTask(owner, done.id, db);
      const foreign = await task(other, "Hidden task");
      const openPage = await taskDetail(owner, open.id, db);
      const donePage = await taskDetail(owner, done.id, db);
      assert.equal(openPage?.task.name, "Call dentist");
      assert.equal(openPage?.task.note, "Ask about the crown");
      assert.equal(openPage?.area.name, "Work");
      assert.equal(openPage?.task.status, "later");
      assert.equal(donePage?.task.status, "completed");
      assert.equal(donePage?.task.completedAt instanceof Date, true);
      assert.equal(await taskDetail(owner, foreign.id, db), null);
      assert.equal(await taskDetail(owner, "not-a-task", db), null);
      assert.equal(await taskDetail(other, open.id, db), null);
      assert.equal(
        (await openTasks(owner, db, today)).some((row) => row.id === done.id),
        false,
      );
      assert.equal(taskHref(open.id), `/tasks/item/${open.id}`);
    });

    test("both directions, a repeat, a self-link, and a concurrent duplicate", async () => {
      const source = await task(owner, "Write spec");
      const target = await note(owner, "Spec note");
      const first = await addLink(
        owner,
        { kind: "task", id: source.id },
        { kind: "note", id: target.id },
        today,
        db,
      );
      const again = await addLink(
        owner,
        { kind: "task", id: source.id },
        { kind: "note", id: target.id },
        today,
        db,
      );
      assert.deepEqual(first, { ok: true, created: true });
      assert.deepEqual(again, { ok: true, created: false });
      const back = await addLink(
        owner,
        { kind: "note", id: target.id },
        { kind: "task", id: source.id },
        today,
        db,
      );
      assert.deepEqual(back, { ok: true, created: true });
      const self = await addLink(
        owner,
        { kind: "task", id: source.id },
        { kind: "task", id: source.id },
        today,
        db,
      );
      assert.deepEqual(self, { ok: false, reason: "self" });
      const fromTask = await related(
        owner,
        { kind: "task", id: source.id },
        db,
      );
      assert.equal(fromTask.outgoing.length, 1);
      assert.equal(fromTask.outgoing[0]?.label, "Spec note");
      assert.equal(fromTask.outgoing[0]?.href, `/notes/${book}/${target.id}`);
      assert.equal(fromTask.outgoing[0]?.detail, "Ideas");
      assert.equal(fromTask.incoming.length, 1);
      assert.equal(fromTask.incoming[0]?.label, "Spec note");
      assert.notEqual(
        fromTask.outgoing[0]?.edgeId,
        fromTask.incoming[0]?.edgeId,
      );
      const otherTask = await task(owner, "Race me");
      const otherNote = await note(owner, "Race note");
      const raced = await Promise.all([
        addLink(
          owner,
          { kind: "task", id: otherTask.id },
          { kind: "note", id: otherNote.id },
          today,
          db,
        ),
        addLink(
          owner,
          { kind: "task", id: otherTask.id },
          { kind: "note", id: otherNote.id },
          today,
          db,
        ),
      ]);
      assert.equal(
        raced.filter((result) => result.ok && result.created).length,
        1,
      );
      assert.equal(
        raced.filter((result) => result.ok && !result.created).length,
        1,
      );
      assert.equal(
        (await related(owner, { kind: "task", id: otherTask.id }, db)).outgoing
          .length,
        1,
      );
    });

    test("an uppercase id matches the same edge, and an uppercase self-link is refused", async () => {
      const source = await task(owner, "Case source");
      const target = await note(owner, "Case note");
      const first = await addLink(
        owner,
        { kind: "task", id: source.id },
        { kind: "note", id: target.id },
        today,
        db,
      );
      const again = await addLink(
        owner,
        { kind: "task", id: source.id.toUpperCase() },
        { kind: "note", id: target.id.toUpperCase() },
        today,
        db,
      );
      assert.deepEqual(first, { ok: true, created: true });
      assert.deepEqual(again, { ok: true, created: false });
      const self = await addLink(
        owner,
        { kind: "note", id: target.id.toUpperCase() },
        { kind: "note", id: target.id },
        today,
        db,
      );
      assert.deepEqual(self, { ok: false, reason: "self" });
    });

    test("remove deletes one direction, and a missing or foreign end is not found", async () => {
      const source = await task(owner, "Remove source");
      const target = await note(owner, "Remove target");
      const foreign = await note(
        other,
        "Foreign note",
        (await createNotebook(other, "Other book", db)).id,
      );
      await addLink(
        owner,
        { kind: "task", id: source.id },
        { kind: "note", id: target.id },
        today,
        db,
      );
      await addLink(
        owner,
        { kind: "note", id: target.id },
        { kind: "task", id: source.id },
        today,
        db,
      );
      const lists = await related(owner, { kind: "task", id: source.id }, db);
      const removed = await removeLink(
        owner,
        lists.outgoing[0]!.edgeId,
        { kind: "task", id: source.id },
        db,
      );
      assert.equal(removed.ok, true);
      const afterRemove = await related(
        owner,
        { kind: "task", id: source.id },
        db,
      );
      assert.equal(afterRemove.outgoing.length, 0);
      assert.equal(afterRemove.incoming.length, 1);
      assert.equal(
        (await getNote(owner, target.id, db))?.title,
        "Remove target",
      );
      assert.equal(
        (await taskDetail(owner, source.id, db))?.task.name,
        "Remove source",
      );
      const incoming = afterRemove.incoming[0]!;
      assert.equal(
        (
          await removeLink(
            owner,
            incoming.edgeId,
            { kind: "task", id: source.id },
            db,
          )
        ).ok,
        false,
      );
      assert.equal(
        (await related(owner, { kind: "note", id: target.id }, db)).outgoing
          .length,
        1,
      );
      assert.deepEqual(
        await addLink(
          owner,
          { kind: "task", id: source.id },
          { kind: "note", id: foreign.id },
          today,
          db,
        ),
        { ok: false, reason: "not-found" },
      );
      assert.equal(
        (await related(other, { kind: "note", id: foreign.id }, db)).incoming
          .length,
        0,
      );
      assert.equal(
        (await related(owner, { kind: "note", id: foreign.id }, db)).outgoing
          .length,
        0,
      );
    });

    test("labels are read when shown, and deleting a note drops its edges", async () => {
      const source = await task(owner, "Old task name");
      const target = await note(owner, "Old title");
      const looseBook = await createNotebook(owner, "Moving", db);
      const loose = await note(owner, "Keep me", looseBook.id);
      await addLink(
        owner,
        { kind: "task", id: source.id },
        { kind: "note", id: target.id },
        today,
        db,
      );
      await addLink(
        owner,
        { kind: "note", id: loose.id },
        { kind: "task", id: source.id },
        today,
        db,
      );
      const before = await related(owner, { kind: "task", id: source.id }, db);
      await saveNote(
        owner,
        target.id,
        { title: "New title", body: "body", pinned: false, revision: 1 },
        db,
      );
      assert.equal(
        (await renameArea(owner, areaId, "Renamed work", db)) !== null,
        true,
      );
      const after = await related(owner, { kind: "task", id: source.id }, db);
      assert.equal(after.outgoing[0]?.label, "New title");
      assert.equal(after.outgoing[0]?.edgeId, before.outgoing[0]?.edgeId);
      assert.equal(after.outgoing[0]?.detail, "Ideas");
      assert.equal(
        (await taskDetail(owner, source.id, db))?.area.name,
        "Renamed work",
      );
      assert.equal(taskHref(source.id), `/tasks/item/${source.id}`);
      await deleteNote(owner, target.id, 2, db);
      assert.equal(
        (await related(owner, { kind: "task", id: source.id }, db)).outgoing
          .length,
        0,
      );
      assert.equal(
        await deleteNotebook(db, owner, looseBook.id, "move-notes"),
        true,
      );
      const moved = await related(owner, { kind: "task", id: source.id }, db);
      assert.equal(moved.incoming[0]?.href, `/notes/_/${loose.id}`);
      assert.equal(moved.incoming[0]?.detail, "No notebook");
      const doomed = await createNotebook(owner, "Doomed links", db);
      const gone = await note(owner, "Gone note", doomed.id);
      await addLink(
        owner,
        { kind: "note", id: gone.id },
        { kind: "task", id: source.id },
        today,
        db,
      );
      assert.equal(
        await deleteNotebook(db, owner, doomed.id, "delete-notes"),
        true,
      );
      assert.equal(
        (
          await related(owner, { kind: "task", id: source.id }, db)
        ).outgoing.filter((item) => item.id === gone.id).length,
        0,
      );
      assert.equal(
        (
          await related(owner, { kind: "task", id: source.id }, db)
        ).incoming.some((item) => item.id === gone.id),
        false,
      );
      await completeTask(owner, source.id, db);
      assert.equal(
        (await related(owner, { kind: "task", id: source.id }, db)).incoming[0]
          ?.id,
        loose.id,
      );
    });

    test("search matches names and titles, includes completed tasks, and pages by twenty", async () => {
      const named = await task(owner, "Alpha unique");
      await completeTask(owner, named.id, db);
      await note(owner, "Alpha unique note");
      const body = await note(
        owner,
        "Plain title",
        book,
        "Alpha unique is only in the body",
      );
      const areaName = (await taskDetail(owner, named.id, db))?.area.name;
      const found = await searchLinkTargets(
        owner,
        {
          query: "alpha unique",
          offset: 0,
          today,
          exclude: { kind: "note", id: body.id },
        },
        db,
      );
      assert.equal(
        found.hits.some(
          (hit) =>
            hit.id === named.id && hit.completed && hit.detail === areaName,
        ),
        true,
      );
      assert.equal(
        found.hits.some(
          (hit) => hit.label === "Alpha unique note" && hit.detail === "Ideas",
        ),
        true,
      );
      assert.equal(
        found.hits.some((hit) => hit.id === body.id),
        false,
      );
      assert.equal(
        found.hits.some(
          (hit) => hit.label === "Hidden task" || hit.detail === "Private",
        ),
        false,
      );
      const titles = Array.from({ length: 21 }, (_, index) =>
        note(owner, `Page ${String(index).padStart(2, "0")}`),
      );
      await Promise.all(titles);
      const first = await searchLinkTargets(
        owner,
        {
          query: "Page ",
          offset: 0,
          today,
          exclude: { kind: "note", id: body.id },
        },
        db,
      );
      const second = await searchLinkTargets(
        owner,
        {
          query: "Page ",
          offset: 20,
          today,
          exclude: { kind: "note", id: body.id },
        },
        db,
      );
      assert.equal(first.hits.length, 20);
      assert.equal(first.more, true);
      assert.equal(second.hits.length, 1);
      assert.equal(second.more, false);
      assert.equal(
        first.hits.some((hit) => hit.id === body.id),
        false,
      );
    });

    test("a saved journal day can be linked; an unsaved, future, mood-only, or foreign day cannot", async () => {
      const source = await task(owner, "Reflect");
      await saveJournalDay(owner, savedDay, "A real reflection", 0, today, db);
      const linked = await addLink(
        owner,
        { kind: "task", id: source.id },
        { kind: "journal", id: savedDay },
        today,
        db,
      );
      assert.deepEqual(linked, { ok: true, created: true });
      const lists = await related(owner, { kind: "task", id: source.id }, db);
      const dayLink = lists.outgoing.find((item) => item.kind === "journal");
      assert.equal(dayLink?.label, formatJournalDay(savedDay));
      assert.equal(dayLink?.href, `/journal/${savedDay}`);
      const fromDay = await related(
        owner,
        { kind: "journal", id: savedDay },
        db,
      );
      assert.equal(fromDay.incoming[0]?.label, "Reflect");
      assert.equal(fromDay.incoming[0]?.href, taskHref(source.id));
      assert.deepEqual(
        await addLink(
          owner,
          { kind: "journal", id: "2026-10-08" },
          { kind: "task", id: source.id },
          today,
          db,
        ),
        { ok: false, reason: "not-found" },
      );
      assert.deepEqual(
        await addLink(
          owner,
          { kind: "task", id: source.id },
          { kind: "journal", id: futureDay },
          today,
          db,
        ),
        { ok: false, reason: "not-found" },
      );
      await setMood(
        owner,
        { day: "2026-10-10", today, mood: "Okay", setAt: 1_700_000_000_000 },
        db,
      );
      assert.deepEqual(
        await addLink(
          owner,
          { kind: "journal", id: "2026-10-10" },
          { kind: "task", id: source.id },
          today,
          db,
        ),
        { ok: false, reason: "not-found" },
      );
      await db
        .insert(journalEntries)
        .values({ userId: owner, day: "2026-10-07", body: "   " });
      assert.deepEqual(
        await addLink(
          owner,
          { kind: "journal", id: "2026-10-07" },
          { kind: "task", id: source.id },
          today,
          db,
        ),
        { ok: false, reason: "not-found" },
      );
      await saveJournalDay(
        other,
        "2026-10-06",
        "Their reflection",
        0,
        today,
        db,
      );
      assert.deepEqual(
        await addLink(
          owner,
          { kind: "task", id: source.id },
          { kind: "journal", id: "2026-10-06" },
          today,
          db,
        ),
        { ok: false, reason: "not-found" },
      );
      assert.equal(
        (await related(other, { kind: "journal", id: savedDay }, db)).incoming
          .length,
        0,
      );
      const found = await searchLinkTargets(
        owner,
        {
          query: savedDay,
          offset: 0,
          today,
          exclude: { kind: "task", id: source.id },
        },
        db,
      );
      assert.equal(
        found.hits.some((hit) => hit.kind === "journal" && hit.id === savedDay),
        true,
      );
      const byLabel = await searchLinkTargets(
        owner,
        {
          query: formatJournalDay(savedDay),
          offset: 0,
          today,
          exclude: { kind: "task", id: source.id },
        },
        db,
      );
      assert.equal(
        byLabel.hits.some(
          (hit) => hit.kind === "journal" && hit.id === savedDay,
        ),
        true,
      );
      const hidden = await searchLinkTargets(
        owner,
        {
          query: futureDay,
          offset: 0,
          today,
          exclude: { kind: "task", id: source.id },
        },
        db,
      );
      assert.equal(
        hidden.hits.some((hit) => hit.id === futureDay),
        false,
      );
      const removed = await removeLink(
        owner,
        dayLink!.edgeId,
        { kind: "task", id: source.id },
        db,
      );
      assert.equal(removed.ok, true);
      assert.equal(
        (await getJournalDay(owner, savedDay, db))?.body,
        "A real reflection",
      );
      assert.equal(
        (await taskDetail(owner, source.id, db))?.task.name,
        "Reflect",
      );
      assert.equal(
        (await related(owner, { kind: "journal", id: savedDay }, db)).incoming
          .length,
        0,
      );
      const markdown = await note(
        owner,
        "Just text",
        book,
        `See /journal/${savedDay} and /tasks/item/${source.id}`,
      );
      assert.deepEqual(
        await related(owner, { kind: "note", id: markdown.id }, db),
        { outgoing: [], incoming: [] },
      );
    });
  },
);
