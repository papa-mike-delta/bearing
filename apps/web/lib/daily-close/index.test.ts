// The interface is the test surface: turn preparation, executable tools and
// reload against isolated Postgres, without a model or Gateway.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";
import { coachMessages, createDb, dayScores, journalOperations, users } from "@repo/db";
import { CloseRefusal, coachSystemPrompt, shownParts, type CoachData } from "@repo/coach";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { UIMessage } from "ai";
import { coachData } from "../coach-tools.ts";
import { coachThread, saveMessage, threadMessages } from "../coach-threads.ts";
import { createArea } from "../areas.ts";
import { captureDraft, inboxDrafts } from "../drafts.ts";
import { getJournalDay, saveJournalDay } from "../journal.ts";
import { getMood } from "../mood.ts";
import { dailyCloseDay, prepareDailyCloseTurn, type DailyCloseTurn } from "./index.ts";

const url = process.env.TEST_POSTGRES_URL;
if (!url && process.env.CI) {
  test("Daily close interface tests run in CI", () => {
    assert.fail("TEST_POSTGRES_URL is not set, so Daily close interface tests can't run");
  });
} else if (!url) {
  console.warn("Daily close interface tests SKIPPED. Set TEST_POSTGRES_URL to run them.");
}

const today = "2026-10-09";
const day = "2026-10-08";
const closeTools = [
  "appendJournal", "fileDraft", "finishDailyClose", "getJournalTemplate", "listInboxDrafts",
  "listNotebooks", "readJournalDay", "readJournalingArticle", "setMood",
];
const message = (text: string) => ({ id: randomUUID(), text });
const refused = (reason: string) => (error: unknown) => {
  assert.ok(error instanceof CloseRefusal);
  assert.equal(error.message, `Daily close refused: ${reason}`);
  assert.deepEqual(shownParts([{ type: "tool-appendJournal", state: "output-error", errorText: error.message }]), []);
  return true;
};

// Execute the actual tool object returned to coachTurn, with its stored context.
function call(turn: DailyCloseTurn, name: keyof DailyCloseTurn["tools"]) {
  return {
    toolCallId: randomUUID(), messages: [], context: turn.toolsContext[name as keyof typeof turn.toolsContext],
  };
}
const append = async (turn: DailyCloseTurn, text = "model-selected fragment", targetDay = day) =>
  turn.tools.appendJournal.execute!({ day: targetDay, text }, call(turn, "appendJournal"));
const mood = async (turn: DailyCloseTurn, choice: "Good" | "Okay" | "Very good" | null) =>
  turn.tools.setMood.execute!({ day, mood: choice }, call(turn, "setMood"));
const file = async (turn: DailyCloseTurn, draftId: string) =>
  turn.tools.fileDraft.execute!({ draftId, destination: { kind: "journal", day } }, call(turn, "fileDraft"));

function assertCloseTools(turn: DailyCloseTurn) {
  assert.deepEqual(Object.keys(turn.tools).sort(), closeTools);
  assert.deepEqual([...turn.activeTools].sort(), closeTools);
}

describe("Daily close interface", { skip: !url && "TEST_POSTGRES_URL not set" }, () => {
  const admin = createDb(url!).$client;
  const database = `bearing_close_${randomUUID().replaceAll("-", "")}`;
  const connection = new URL(url ?? "postgres://localhost/test");
  connection.pathname = `/${database}`;
  const db = createDb(connection.toString());

  before(async () => {
    await admin.query(`create database "${database}"`);
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../../../packages/db/drizzle", import.meta.url)) });
  });
  after(async () => {
    await db.$client.end();
    await admin.query(`drop database if exists "${database}"`);
    await admin.end();
  });

  async function account() {
    const [user] = await db.insert(users).values({ email: `${randomUUID()}@test.invalid`, passwordHash: "-" }).returning();
    await createArea(user!.id, "Tasks", db);
    return { userId: user!.id, threadId: await coachThread(user!.id, db) };
  }

  async function prepare(
    owner: { userId: string; threadId: string },
    incoming: ReturnType<typeof message>,
    options: { today?: string; closeDay?: unknown; data?: CoachData } = {},
  ) {
    const earlier = (await threadMessages(owner.userId, owner.threadId, db))!;
    const resend = earlier.at(-1)?.id === incoming.id;
    const result = await prepareDailyCloseTurn({
      ...owner, message: incoming, prior: resend ? earlier.slice(0, -1) : earlier,
      resend, today, db, ...options,
    });
    assert.ok(!("refused" in result));
    return result;
  }

  async function reply(owner: { userId: string; threadId: string }, incoming: ReturnType<typeof message>, parts: UIMessage["parts"]) {
    assert.equal(await saveMessage(owner.userId, owner.threadId, { id: randomUUID(), role: "assistant", parts }, db, incoming.id), true);
  }

  test("start -> answer -> skip -> cancel preserves writes, progress, selected day and exact tool exposure", async () => {
    const owner = await account();
    const start = await prepare(owner, message("Start Daily close"), { closeDay: day });
    assertCloseTools(start);
    assert.deepEqual(start.read.messages, []);
    assert.match(start.system, /Daily close for 2026-10-08/);
    assert.match(start.system, /Mood: not recorded\.\nAnswers appended: 0\./);
    await assert.rejects(() => append(start), refused("starting, skipping or cancelling writes nothing"));
    await assert.rejects(() => mood(start, "Good"), refused("starting, skipping or cancelling writes nothing"));
    await assert.rejects(() => file(start, randomUUID()), refused("starting, skipping or cancelling writes nothing"));
    assert.equal(await getJournalDay(owner.userId, day, db), null);
    assert.equal(await getMood(owner.userId, day, db), null);
    assert.equal(await dailyCloseDay(owner.userId, owner.threadId, db), day);

    const answer = await prepare(owner, message("  Tea with Sam. Then a walk.  "));
    await assert.rejects(() => append(answer, "Tea", today), refused("only the selected day is allowed"));
    const saved = await append(answer);
    const entry = (await getJournalDay(owner.userId, day, db))!;
    assert.deepEqual(saved, { id: entry.id, day, href: `/journal/${day}` });
    assert.equal(entry.body, "Tea with Sam. Then a walk.");
    assert.equal(await getJournalDay(owner.userId, today, db), null);

    const skip = await prepare(owner, message("skip this!"));
    assertCloseTools(skip);
    assert.match(skip.system, /Answers appended: 1\./);
    await assert.rejects(() => append(skip), refused("starting, skipping or cancelling writes nothing"));
    await assert.rejects(() => mood(skip, "Good"), refused("starting, skipping or cancelling writes nothing"));
    await assert.rejects(() => file(skip, randomUUID()), refused("starting, skipping or cancelling writes nothing"));

    const cancel = await prepare(owner, message("cancel daily close"));
    assertCloseTools(cancel);
    assert.ok(cancel.system.startsWith(coachSystemPrompt(today)));
    assert.match(cancel.system, /Daily close cancelled\.[\s\S]*Answers appended: 1\./);
    assert.equal(cancel.read.messages.length, 2); // Existing fresh Task read on cancel.
    await assert.rejects(() => append(cancel), refused("starting, skipping or cancelling writes nothing"));
    await assert.rejects(() => mood(cancel, "Good"), refused("starting, skipping or cancelling writes nothing"));
    await assert.rejects(() => file(cancel, randomUUID()), refused("starting, skipping or cancelling writes nothing"));
    assert.equal(await dailyCloseDay(owner.userId, owner.threadId, db), null);
    assert.equal((await getJournalDay(owner.userId, day, db))!.body, entry.body);
    assert.equal(await getMood(owner.userId, day, db), null);
    const normal = await prepare(owner, message("What next?"));
    assert.equal(normal.system, coachSystemPrompt(today));
    assert.ok("createTask" in normal.tools);
    assert.ok(!("readJournalDay" in normal.tools));
  });

  test("opening and whole-answer replay keep stored Today, selected day and first append identity", async () => {
    const owner = await account();
    const opening = message("Daily close");
    await prepare(owner, opening, { closeDay: day });
    const openingReplay = await prepare(owner, opening, { today: "2026-10-10", closeDay: null });
    await assert.rejects(() => append(openingReplay), refused("starting, skipping or cancelling writes nothing"));
    const incoming = message("  This daily close helped me reflect. Skipping lunch was hard.  ");
    const first = await prepare(owner, incoming);
    const saved = await append(first, "This daily close");
    assert.deepEqual(await append(first, "Skipping lunch"), saved);
    const replay = await prepare(owner, incoming, { today: "2026-10-10", closeDay: null });
    assertCloseTools(replay);
    assert.match(replay.system, /Daily close for 2026-10-08.*Today is 2026-10-09/);
    assert.deepEqual(await append(replay, "different substring"), saved);
    const entry = (await getJournalDay(owner.userId, day, db))!;
    assert.equal(entry.body, incoming.text.trim());
    const operations = await db.select().from(journalOperations).where(eq(journalOperations.userId, owner.userId));
    assert.equal(operations.length, 1);
    assert.equal(operations[0]!.operationId, `${incoming.id}:${day}:1`);
    const [stored] = await db.select().from(coachMessages).where(eq(coachMessages.id, incoming.id));
    assert.equal(stored!.browserToday, today);
    assert.equal(stored!.closeDay, day);
    await saveJournalDay(owner.userId, day, "Hand edited after commit", entry.revision, today, db);
    assert.deepEqual(await append(replay, "another substring"), saved);
    assert.equal((await getJournalDay(owner.userId, day, db))!.body, "Hand edited after commit");
    assert.equal(await getJournalDay(owner.userId, "2026-10-10", db), null);
  });

  test("finish is quiet, persists with the reply, and ends reload and turn inheritance together", async () => {
    const owner = await account();
    const opening = message("Daily close");
    const start = await prepare(owner, opening, { closeDay: day });
    const output = await start.tools.finishDailyClose.execute!({}, call(start, "finishDailyClose"));
    assert.deepEqual(output, { finished: true, day });
    // The no-write tool does not change domain data or the user's bound mode.
    assert.equal(await dailyCloseDay(owner.userId, owner.threadId, db), day);
    assert.equal(await getJournalDay(owner.userId, day, db), null);
    assert.equal(await getMood(owner.userId, day, db), null);
    const finish = { type: "tool-finishDailyClose" as const, toolCallId: randomUUID(), state: "output-available" as const, input: {}, output };
    assert.deepEqual(shownParts([finish]), []);
    await reply(owner, opening, [finish, { type: "text", text: "That completes today's Daily close." }]);
    assert.equal(await dailyCloseDay(owner.userId, owner.threadId, db), null);

    const normal = await prepare(owner, message("What next?"));
    assert.equal(normal.system, coachSystemPrompt(today));
    assert.equal(normal.read.messages.length, 2);
    assert.ok("createTask" in normal.tools);
    assert.ok(normal.activeTools.includes("createTask"));
    assert.ok(!("finishDailyClose" in normal.tools));
    assert.ok(!normal.activeTools.includes("finishDailyClose"));
    const restarted = await prepare(owner, message("Daily close"), { closeDay: day });
    assertCloseTools(restarted);
    assert.equal(await dailyCloseDay(owner.userId, owner.threadId, db), day);
  });

  test("only a successful finish for the bound day ends the close; prose and failures do not", async () => {
    const owner = await account();
    const opening = message("Daily close");
    await prepare(owner, opening, { closeDay: day });
    await reply(owner, opening, [{ type: "text", text: "That completes today's Daily close." }]);
    assert.equal(await dailyCloseDay(owner.userId, owner.threadId, db), day);
    for (const parts of [
      [{ type: "tool-finishDailyClose" as const, toolCallId: randomUUID(), state: "output-error" as const, input: {}, errorText: "Failed" }],
      [{ type: "tool-finishDailyClose" as const, toolCallId: randomUUID(), state: "output-available" as const, input: {}, output: { finished: false, day } }],
      [{ type: "tool-finishDailyClose" as const, toolCallId: randomUUID(), state: "output-available" as const, input: {}, output: { finished: true, day: today } }],
    ]) {
      const incoming = message("skip");
      assertCloseTools(await prepare(owner, incoming));
      assert.deepEqual(shownParts(parts), []);
      await reply(owner, incoming, parts);
      assert.equal(await dailyCloseDay(owner.userId, owner.threadId, db), day);
    }
    assertCloseTools(await prepare(owner, message("Continue")));
  });

  test("a late finish for an older turn cannot end a newer close turn", async () => {
    const owner = await account();
    const opening = message("Daily close");
    const old = await prepare(owner, opening, { closeDay: day });
    const output = await old.tools.finishDailyClose.execute!({}, call(old, "finishDailyClose"));
    const newer = message("skip");
    await prepare(owner, newer);
    await reply(owner, opening, [{ type: "tool-finishDailyClose", toolCallId: randomUUID(), state: "output-available", input: {}, output }]);
    assert.equal(await dailyCloseDay(owner.userId, owner.threadId, db), day);
    assertCloseTools(await prepare(owner, message("What's left?")));
  });

  test("explicit Mood, clear and replay read through the injected data adapter", async () => {
    const owner = await account();
    const reads: unknown[] = [];
    let writes = 0;
    const base = coachData(db, today);
    const data: CoachData = {
      ...base,
      async getMood(userId, selectedDay) { reads.push({ userId, day: selectedDay }); return base.getMood!(userId, selectedDay); },
      async setMood(userId, input) { writes++; return base.setMood!(userId, input); },
    };
    await prepare(owner, message("Daily close"), { closeDay: day, data });
    assert.equal(reads.length, 1);
    const explicit = await prepare(owner, message("Mood: Good"), { data });
    assert.deepEqual(await mood(explicit, "Good"), { day, mood: "Good", href: `/journal/${day}` });
    assert.equal(reads.length, 3); // Opening progress, answer progress, guard read.
    assert.equal(writes, 1);
    const [score] = await db.select().from(dayScores).where(eq(dayScores.userId, owner.userId));
    const again = await prepare(owner, message("What's left?"), { data });
    assert.match(again.system, /Mood: Good \(recorded\)/);
    assert.deepEqual(await mood(again, "Good"), { day, mood: "Good", href: `/journal/${day}` });
    assert.equal(writes, 1);
    const [unchanged] = await db.select().from(dayScores).where(eq(dayScores.userId, owner.userId));
    assert.deepEqual(unchanged, score);
    for (const text of ["Not Very good", "Good? No, Very good", "Don't set my mood to Very good", "It was a wonderful day"]) {
      const denied = await prepare(owner, message(text), { data });
      await assert.rejects(() => mood(denied, "Very good"), refused("no explicit mood"));
      assert.equal(await getMood(owner.userId, day, db), "Good");
    }
    const negativeClear = await prepare(owner, message("Do not clear my mood"), { data });
    await assert.rejects(() => mood(negativeClear, null), refused("no explicit mood"));
    const clear = await prepare(owner, message("clear my mood"), { data });
    assert.deepEqual(await mood(clear, null), { day, mood: null, href: `/journal/${day}` });
    assert.equal(await getMood(owner.userId, day, db), null);
    assert.equal(writes, 2);
    assert.ok(reads.every((read) => JSON.stringify(read) === JSON.stringify({ userId: owner.userId, day })));

    // The supplied reader, rather than a direct DB query, decides equality.
    const supplied = await prepare(owner, message("What's saved?"), {
      data: { ...base, async getMood() { return "Okay"; }, async setMood() { assert.fail("A recorded Mood needs no write"); } },
    });
    assert.match(supplied.system, /Mood: Okay \(recorded\)/);
    assert.deepEqual(await mood(supplied, "Okay"), { day, mood: "Okay", href: `/journal/${day}` });
    assert.equal(await getMood(owner.userId, day, db), null);
  });

  test("one offered Draft requires consent, commits once and replays after archival", async () => {
    const owner = await account();
    await captureDraft(owner.userId, "A walk with Sam", db);
    await captureDraft(owner.userId, "Leave this in Inbox", db);
    const rows = await inboxDrafts(owner.userId, db);
    const offered = rows.find((draft) => draft.body === "A walk with Sam")!;
    const other = rows.find((draft) => draft.id !== offered.id)!;
    const opening = message("Daily close");
    const start = await prepare(owner, opening, { closeDay: day });
    const listed = await start.tools.listInboxDrafts.execute!({}, call(start, "listInboxDrafts"));
    const offer = { type: "text" as const, text: `File "A walk with Sam" in the Journal for ${day}?` };
    await reply(owner, opening, [
      { type: "tool-listInboxDrafts", toolCallId: randomUUID(), state: "output-available", input: {}, output: listed }, offer,
    ]);
    for (const text of ["No", "Yes, don't file it", "Yes, but as a Task instead", "File A walk with Sam"]) {
      const incoming = message(text);
      const denied = await prepare(owner, incoming);
      await assert.rejects(() => file(denied, offered.id), refused("no agreement to one named draft and destination"));
      assert.equal((await inboxDrafts(owner.userId, db)).length, 2);
      assert.equal(await getJournalDay(owner.userId, day, db), null);
      await reply(owner, incoming, [offer]);
    }
    const incoming = message("Yes, file it");
    const agreed = await prepare(owner, incoming);
    await assert.rejects(() => file(agreed, other.id), refused("no agreement to one named draft and destination"));
    const saved = await file(agreed, offered.id);
    assert.deepEqual(await file(agreed, other.id), saved);
    assert.deepEqual((await inboxDrafts(owner.userId, db)).map((draft) => draft.id), [other.id]);
    assert.equal((await getJournalDay(owner.userId, day, db))!.body, offered.body);
    const replay = await prepare(owner, incoming, { today: "2026-10-10", closeDay: null });
    assert.ok(replay.system.includes(`Drafts filed: ${JSON.stringify([{ draftId: offered.id, kind: "journal", day }])}.`));
    assert.deepEqual(await file(replay, offered.id), saved);
    assert.equal((await getJournalDay(owner.userId, day, db))!.body, offered.body);
    assert.deepEqual(shownParts([{ type: "tool-fileDraft", state: "output-available", output: saved }]), [
      { key: "part-0", receipt: `Appended draft to journal for ${day}`, calls: 1, href: `/journal/${day}` },
    ]);
  });

  test("day validation and failed pre-save reads leave the message and reload mode untouched", async () => {
    const owner = await account();
    for (const closeDay of ["2026-02-30", "2026-10-10", "today", ""]) {
      assert.deepEqual(await prepareDailyCloseTurn({ ...owner, message: message("Daily close"), prior: [], resend: false, today, closeDay, db }), { refused: 400 });
      assert.deepEqual(await threadMessages(owner.userId, owner.threadId, db), []);
    }
    const base = coachData(db, today);
    await assert.rejects(() => prepareDailyCloseTurn({
      ...owner, message: message("Daily close"), prior: [], resend: false, today, closeDay: day, db,
      data: { ...base, async getMood() { throw new Error("Mood read failed"); } },
    }), /Mood read failed/);
    assert.deepEqual(await threadMessages(owner.userId, owner.threadId, db), []);
    assert.equal(await dailyCloseDay(owner.userId, owner.threadId, db), null);
    const other = await account();
    await prepare(owner, message("Daily close"), { closeDay: day });
    assert.equal(await dailyCloseDay(other.userId, owner.threadId, db), null);
  });
});
