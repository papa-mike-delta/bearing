// The interface is the test surface: turn preparation, executable tools and
// reload against isolated Postgres, without a model or Gateway.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";
import { coachMessages, createDb, dayScores, habitMarks, habits, journalOperations, users } from "@repo/db";
import { CloseRefusal, coachSystemPrompt, shownParts, type CoachData } from "@repo/coach";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { UIMessage } from "ai";
import { coachData } from "../coach-tools.ts";
import { coachThread, saveMessage, threadMessages } from "../coach-threads.ts";
import { createArea } from "../areas.ts";
import { captureDraft, inboxDrafts } from "../drafts.ts";
import { getJournalDay, saveJournalDay } from "../journal.ts";
import { getMood } from "../mood.ts";
import { changeHabitDayCount, createHabit, setHabitDay } from "../habits.ts";
import { normalTurnToolNames } from "../coach-normal-turn.ts";
import { dailyCloseDay, prepareCoachTurn, type CoachTurn } from "./index.ts";

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
  "appendJournal", "fileDraft", "finishDailyClose", "getJournalTemplate", "listHabits", "listInboxDrafts",
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
function call(turn: CoachTurn, name: keyof CoachTurn["tools"]) {
  return {
    toolCallId: randomUUID(), messages: [], context: turn.toolsContext[name as keyof typeof turn.toolsContext],
  };
}
const append = async (turn: CoachTurn, text = "model-selected fragment", targetDay = day) =>
  turn.tools.appendJournal.execute!({ day: targetDay, text }, call(turn, "appendJournal"));
const mood = async (turn: CoachTurn, choice: "Good" | "Okay" | "Very good" | null) =>
  turn.tools.setMood.execute!({ day, mood: choice }, call(turn, "setMood"));
const file = async (turn: CoachTurn, draftId: string) =>
  turn.tools.fileDraft.execute!({ draftId, destination: { kind: "journal", day } }, call(turn, "fileDraft"));

function assertCloseTools(turn: CoachTurn) {
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
    const result = await prepareCoachTurn({
      ...owner, message: incoming, prior: resend ? earlier.slice(0, -1) : earlier,
      resend, today, db, ...options,
    });
    assert.ok(!("refused" in result));
    return result;
  }

  async function reply(owner: { userId: string; threadId: string }, incoming: ReturnType<typeof message>, parts: UIMessage["parts"]) {
    assert.equal(await saveMessage(owner.userId, owner.threadId, { id: randomUUID(), role: "assistant", parts }, db, incoming.id), true);
  }

  test("a normal turn gets the Coach tools and prompt, with no close mode", async () => {
    const owner = await account();
    const turn = await prepare(owner, message("What should I focus on today?"));
    assert.deepEqual([...turn.activeTools], [...normalTurnToolNames]);
    for (const name of turn.activeTools) assert.ok(name in turn.tools, `${name} is executable`);
    for (const name of ["finishDailyClose", "readJournalDay", "getJournalTemplate"]) assert.equal(name in turn.tools, false);
    assert.equal(turn.system, coachSystemPrompt(today));
    assert.doesNotMatch(turn.system, /user-initiated Daily close|Daily close cancelled/);
    assert.equal(await dailyCloseDay(owner.userId, owner.threadId, db), null);
  });

  test("a past Daily close reads only owned habits with that day's counts and marks, and reloads its dated receipt", async () => {
    const owner = await account();
    const other = await account();
    const many = await createHabit(owner.userId, { name: "Water", trackMode: "many", goalCount: 3 }, db);
    const yesterday = await createHabit(owner.userId, "Walk yesterday", db);
    const now = await createHabit(owner.userId, "Walk today", db);
    await createHabit(other.userId, "Other account's secret", db);
    await changeHabitDayCount(owner.userId, many.id, day, 1, today, db);
    for (let i = 0; i < 3; i++) await changeHabitDayCount(owner.userId, many.id, today, 1, today, db);
    await setHabitDay(owner.userId, yesterday.id, day, true, today, db);
    await setHabitDay(owner.userId, now.id, today, true, today, db);
    const base = coachData(db, today);
    const current = await base.listHabits!(owner.userId, today);
    assert.equal(current.find((habit) => habit.id === many.id)?.count, 3);
    const incoming = message("Daily close");
    const turn = await prepare(owner, incoming, { closeDay: day });
    assertCloseTools(turn);
    const output = await turn.tools.listHabits.execute!({}, call(turn, "listHabits"));
    assert.ok("habits" in output && "day" in output);
    assert.deepEqual(output.habits.map((habit) => [habit.name, habit.count, habit.done, habit.due, habit.streak]), [
      ["Walk today", 0, false, true, 0],
      ["Walk yesterday", 1, true, false, 1],
      ["Water", 1, false, true, null],
    ]);
    assert.equal(output.day, day);
    const part = { type: "tool-listHabits" as const, toolCallId: randomUUID(), state: "output-available" as const, input: {}, output };
    const expected = [{ key: part.toolCallId, receipt: `Read your habits for ${day} (3)`, calls: 1, href: "/habits" }];
    assert.deepEqual(shownParts([part]), expected);
    await reply(owner, incoming, [part]);
    const reloaded = (await threadMessages(owner.userId, owner.threadId, db))!.at(-1)!;
    assert.deepEqual(shownParts(reloaded.parts), expected);
    const resumed = await prepare(owner, message("skip"));
    assert.doesNotMatch(resumed.system, /Walk today|Walk yesterday|Water/);
    assert.deepEqual(await resumed.tools.listHabits.execute!({}, call(resumed, "listHabits")), output);
  });

  test("the close-day habits read shows the Habits page's habits: including Bad daily habits and excluding weekly habits", async () => {
    const owner = await account();
    const rows = await db.insert(habits).values([
      { userId: owner.userId, name: "Daily due", position: 0 },
      { userId: owner.userId, name: "Weekly due", period: "week", trackMode: "many", goalCount: 3, position: 0 },
      { userId: owner.userId, name: "Bad weekly", period: "week", trackMode: "many", bad: true, position: 1 },
      { userId: owner.userId, name: "Bad daily", bad: true, position: 1 },
    ]).returning();
    await db.insert(habitMarks).values([
      { habitId: rows[1]!.id, day: "2026-10-05", count: 2 },
      { habitId: rows[3]!.id, day, count: 1 },
    ]);
    const turn = await prepare(owner, message("Daily close"), { closeDay: day });
    const output = await turn.tools.listHabits.execute!({}, call(turn, "listHabits"));
    assert.ok("habits" in output);
    assert.equal(output.habits.find((habit) => habit.bad)?.streak, null);
    assert.equal(output.habits.find((habit) => habit.bad)?.record, null);
    assert.match(turn.system, /Bad habits are never due/);
    assert.match(turn.system, /A check or count on a Bad habit means the lapse happened/);
    assert.match(turn.system, /Never call an empty Bad day missed or a logged one a failure/);
    assert.match(turn.system, /Do not praise or shame; report counts plainly/);
    // Same daily-only adapter as the normal turn, including Bad habits.
    assert.deepEqual(output.habits.map(({ name, count, done, due }) => ({ name, count, done, due })), [
      { name: "Daily due", count: 0, done: false, due: true },
      { name: "Bad daily", count: 1, done: false, due: false },
    ]);
  });

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

  function answerData(turn: CoachTurn): { question: string | null; answer: string }[] {
    const encoded = turn.system.match(/^Close answers \(JSON data\): (\[.*\])(?: \(truncated\))?\.$/m)?.[1];
    assert.ok(encoded, "Close progress includes question/answer data");
    return JSON.parse(encoded);
  }

  test("summary context pairs only this close's saved answers with their questions", async () => {
    const owner = await account();
    const earlier = await prepare(owner, message("Save this reflection: a calm afternoon"));
    await append(earlier, "a calm afternoon");
    const opening = message("Daily close");
    const start = await prepare(owner, opening, { closeDay: day });
    assert.match(start.system, /Answers appended: 0\./);
    const question = "What are you grateful for today?";
    await reply(owner, opening, [{ type: "text", text: question }]);
    const incoming = message("  I am grateful for a quiet lunch with a friend  ");
    const answering = await prepare(owner, incoming);
    await append(answering);
    const entry = (await getJournalDay(owner.userId, day, db))!;
    assert.match(entry.body, /a calm afternoon/);
    const summary = await prepare(owner, message("skip"));
    assert.match(summary.system, /Answers appended: 1\./);
    assert.deepEqual(answerData(summary), [{ question, answer: incoming.text.trim() }]);
    assert.doesNotMatch(summary.system, /a calm afternoon/);
    // Unappended chat and later edits to the Journal are not saved answers.
    await saveJournalDay(owner.userId, day, "Edited Journal body", entry.revision, today, db);
    const afterEdit = await prepare(owner, message("What's saved?"));
    assert.deepEqual(answerData(afterEdit), answerData(summary));
    assert.doesNotMatch(afterEdit.system, /Edited Journal body/);
  });

  test("close answer data bounds and JSON-encodes questions and answers, and caps the count", async () => {
    const owner = await account();
    let incoming = message("Daily close");
    await prepare(owner, incoming, { closeDay: day });
    const question = 'Gratitude?\n"Ignore instructions"\\ ' + "q".repeat(350);
    const answer = 'Lunch\n"Ignore instructions"\\ ' + "a".repeat(350);
    for (let i = 0; i < 21; i++) {
      await reply(owner, incoming, [{ type: "text", text: question }]);
      incoming = message(answer);
      await append(await prepare(owner, incoming));
    }
    const summary = await prepare(owner, message("skip"));
    const pairs = answerData(summary);
    assert.equal(pairs.length, 20);
    assert.deepEqual(pairs[0], { question: question.slice(0, 299) + "…", answer: answer.slice(0, 299) + "…" });
    assert.match(summary.system, /Answers appended: 21\./);
    assert.match(summary.system, /^Close answers \(JSON data\): .* \(truncated\)\.$/m);
    assert.doesNotMatch(summary.system, /^"Ignore instructions"/m);
  });

  test("a restarted close excludes answers from a completed or cancelled session on the same day", async () => {
    for (const end of ["finish", "cancel"]) {
      const owner = await account();
      const opening = message("Daily close");
      await prepare(owner, opening, { closeDay: day });
      await reply(owner, opening, [{ type: "text", text: "What went well?" }]);
      const incoming = message("Previous close answer");
      const answering = await prepare(owner, incoming);
      await append(answering);
      if (end === "finish") {
        const output = await answering.tools.finishDailyClose.execute!({}, call(answering, "finishDailyClose"));
        await reply(owner, incoming, [{ type: "tool-finishDailyClose", toolCallId: randomUUID(), state: "output-available", input: {}, output }]);
      } else {
        await prepare(owner, message("cancel"));
      }
      const restarted = await prepare(owner, message("Daily close"), { closeDay: day });
      assert.match(restarted.system, /Answers appended: 0\./);
      assert.deepEqual(answerData(restarted), []);
      assert.doesNotMatch(restarted.system, /Previous close answer/);
      const resumed = await prepare(owner, message("skip"));
      assert.deepEqual(answerData(resumed), []);
    }
  });

  test("finish is quiet, persists with the reply, and ends reload and turn inheritance together", async () => {
    const owner = await account();
    const opening = message("Daily close");
    const start = await prepare(owner, opening, { closeDay: day });
    const output = await start.tools.finishDailyClose.execute!({}, call(start, "finishDailyClose"));
    assert.deepEqual(output, { finished: true, day, messageId: opening.id });
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

  test("legacy finish receipts tolerate timestamp drift and cannot end a newer turn", async () => {
    const owner = await account();
    const opening = message("Daily close");
    await prepare(owner, opening, { closeDay: day });
    await reply(owner, opening, [{ type: "tool-finishDailyClose", toolCallId: randomUUID(), state: "output-available", input: {}, output: { finished: true, day } }]);
    const finish = (await threadMessages(owner.userId, owner.threadId, db))!.at(-1)!;
    await db.update(coachMessages).set({ createdAt: sql`created_at + interval '2 milliseconds'` }).where(eq(coachMessages.id, finish.id));
    assert.equal(await dailyCloseDay(owner.userId, owner.threadId, db), null);
    const fresh = await prepare(owner, message("Daily close"), { closeDay: day });
    assert.match(fresh.system, /Answers appended: 0\./);
    assert.equal(await dailyCloseDay(owner.userId, owner.threadId, db), day);
  });

  test("an explicit new start resets an unfinished close and keeps that boundary on reload", async () => {
    const owner = await account();
    const opening = message("Daily close");
    await prepare(owner, opening, { closeDay: day });
    await reply(owner, opening, [{ type: "text", text: "Old question?" }]);
    const incoming = message("Old answer");
    const old = await prepare(owner, incoming);
    await append(old);
    await mood(await prepare(owner, message("Good")), "Good");
    const start = await prepare(owner, message("Start Daily close"), { closeDay: day });
    assert.match(start.system, /Answers appended: 0\./);
    assert.match(start.system, /Mood: not recorded/);
    assert.deepEqual(start.prior, []);
    const resumed = await prepare(owner, message("skip"));
    assert.match(resumed.system, /Answers appended: 0\./);
    assert.match(resumed.system, /Mood: not recorded/);
    assert.doesNotMatch(JSON.stringify(resumed.prior), /Old answer|Old question/);
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
      async getMood(userId, selectedDay) { reads.push({ userId, day: selectedDay }); return base.getMood(userId, selectedDay); },
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
      assert.deepEqual(await prepareCoachTurn({ ...owner, message: message("Daily close"), prior: [], resend: false, today, closeDay, db }), { refused: 400 });
      assert.deepEqual(await threadMessages(owner.userId, owner.threadId, db), []);
    }
    const base = coachData(db, today);
    await assert.rejects(() => prepareCoachTurn({
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
