import { createPerson, getPerson, savePerson } from "./people.ts";
import { searchKnowledge } from "@repo/coach/knowledge";
import { access } from "node:fs/promises";
import { dailyCloseDay as coachCloseDay } from "./daily-close/index.ts";
// Coach turns against a real Postgres with a scripted model: no Gateway, no
// key. Same guard as the isolation suite: needs TEST_POSTGRES_URL, fails in CI
// without it, and is skipped with a warning everywhere else.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getMood, setMood } from "./mood.ts";
import { getJournalDay, saveJournalDay, saveJournalTemplate } from "./journal.ts";
import { after, before, describe, mock, test } from "node:test";
import {
  coachMessages,
  drafts,
  habitMarks,
  habitOperations,
  habits,
  createDb,
  notebooks,
  noteOperations,
  notes,
  tasks,
  users,
} from "@repo/db";
import {
  APICallError,
  convertToModelMessages,
  simulateReadableStream,
  type UIMessage,
} from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { eq, inArray, sql } from "drizzle-orm";
import {
  coachCreateSourceId,
  maxCoachMessageLength,
  receipt,
  shownParts,
} from "@repo/coach";
import { captureDraft, fileDraft, fileDraftAsTask, fileDraftAsJournal, inboxDrafts } from "./drafts.ts";
import { noteHref, taskHref } from "@repo/domain";
import { coachThread, saveMessage, threadMessages } from "./coach-threads.ts";
import { createArea } from "./areas.ts";
import {
  coachModel,
  coachTurn,
  historyWindow,
  maxReplyTokens,
  appliedWritesBlock,
  checkedResultsBlock,
} from "./coach-turn.ts";
import { HabitError, createHabit, editHabit, deleteHabit, listHabits, changeHabitDayCount, setHabitCount, setHabitDay } from "./habits.ts";
import { coachData, coachTools } from "./coach-tools.ts";
import { createNotebook, fileDraftAsNote, getNote, listNotes, saveNote } from "./notes.ts";
import {
  addTask,
  changePriority,
  completeTask,
  openTasks,
} from "./tasks.ts";

function writeToolsOffered(
  call: {
    tools?: { name?: string }[];
    toolChoice?: unknown;
  },
  { last = false }: { last?: boolean } = {},
) {
  if (last) {
    assert.deepEqual(call.toolChoice, { type: "none" });
    return;
  }
  const names = (call.tools ?? []).map((t) => t.name);
  for (const name of [
    "createTask",
    "completeTask",
    "listArea",
    "listHabits",
    "createHabit",
    "trackHabit",
    "listNotebooks",
    "createNote",
    "appendJournal",
    "setMood",
    "fileDraft",
    "listInboxDrafts",
    "scheduleTask",
    "updateTask",
    "listPeople", "readPerson", "setPersonLastConnected", "setPersonAgreedDay",
  ]) {
    assert.ok(names.includes(name), name);
  }
  assert.deepEqual(call.toolChoice, { type: "auto" });
}

const unusedWrites = {
  // No Mood recorded; required by CoachData.
  async getMood() {
    return null;
  },
  async createTask() {
    throw new Error("createTask should not run");
  },
  async completeTask() {
    throw new Error("completeTask should not run");
  },
  async scheduleTask() {
    throw new Error("scheduleTask should not run");
  },
  async updateTask() {
    throw new Error("updateTask should not run");
  },
};

const url = process.env.TEST_POSTGRES_URL;

test("the model comes from COACH_MODEL, defaulting to anthropic/claude-haiku-5.5", () => {
  const before = process.env.COACH_MODEL;
  try {
    delete process.env.COACH_MODEL;
    assert.equal(coachModel(), "anthropic/claude-haiku-5.5");
    process.env.COACH_MODEL = "openai/gpt-6-luna";
    assert.equal(coachModel(), "openai/gpt-6-luna");
  } finally {
    if (before === undefined) delete process.env.COACH_MODEL;
    else process.env.COACH_MODEL = before;
  }
});

if (!url && process.env.CI) {
  test("Coach turns run in CI", () => {
    assert.fail(
      "TEST_POSTGRES_URL is not set, so the Coach turn suite can't run",
    );
  });
} else if (!url) {
  console.warn(
    "\n!!! WARNING: Coach turn tests SKIPPED. Set TEST_POSTGRES_URL to run them (see README). !!!\n",
  );
}

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

// A model that streams `reply` in words, slowly enough to stop mid-reply.
function replying(reply: string, chunkDelayInMs = 5) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunkDelayInMs,
        chunks: [
          { type: "text-start", id: "t" },
          ...reply.split(/(?= )/).map((delta) => ({
            type: "text-delta" as const,
            id: "t",
            delta,
          })),
          { type: "text-end", id: "t" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: undefined },
            usage,
          },
        ],
      }),
    }),
  });
}

const finish = {
  type: "finish" as const,
  finishReason: { unified: "stop" as const, raw: undefined },
  usage,
};

// A model that streams some text and then fails, either with an error part
// (the provider reports it) or with the stream itself erroring (a dropped
// connection).
function failingMidway(how: "error part" | "stream error") {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "text-start", id: "t" });
          controller.enqueue({ type: "text-delta", id: "t", delta: "Half a" });
          if (how === "stream error") {
            controller.error(new Error("Connection dropped"));
            return;
          }
          controller.enqueue({ type: "error", error: new Error("Failed") });
          controller.enqueue({ type: "text-end", id: "t" });
          controller.enqueue(finish);
          controller.close();
        },
      }),
    }),
  });
}

// A reasoning model that hits the token cap: some reasoning and maybe some
// text, then finishReason "length".
function cutOff(text?: string) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "reasoning-start", id: "r" },
          { type: "reasoning-delta", id: "r", delta: "Thinking it over" },
          { type: "reasoning-end", id: "r" },
          ...(text
            ? [
                { type: "text-start" as const, id: "t" },
                { type: "text-delta" as const, id: "t", delta: text },
                { type: "text-end" as const, id: "t" },
              ]
            : []),
          {
            type: "finish",
            finishReason: { unified: "length", raw: undefined },
            usage,
          },
        ],
      }),
    }),
  });
}

// Everything the model was sent on its first step, as text: the
// instructions as they are, every other message as JSON.
const promptText = (model: MockLanguageModelV4) =>
  model.doStreamCalls[0]!.prompt.map((m) =>
    typeof m.content === "string" ? m.content : JSON.stringify(m.content),
  ).join("\n");

// How many times the prompt holds the person's messages.
const userTurnsIn = (model: MockLanguageModelV4) =>
  model.doStreamCalls[0]!.prompt.filter((m) => m.role === "user").length;

// A model that runs one scripted step per call: a tool call with `input`,
// or a text reply. Past the end of the script it repeats the last step.
type Step =
  | { listPeople: string; toolCallId?: string }
  | { readPerson: string; toolCallId?: string }
  | { setPersonLastConnected: string; toolCallId?: string }
  | { setPersonAgreedDay: string; toolCallId?: string }
  | { listArea: string; toolCallId?: string }
  | { listHabits: string; toolCallId?: string }
  | { createHabit: string; toolCallId?: string }
  | { trackHabit: string; toolCallId?: string }
  | { listNotebooks: string; toolCallId?: string }
  | { createTask: string; toolCallId?: string }
  | { createNote: string; toolCallId?: string }
  | { appendJournal: string; toolCallId?: string }
  | { fileDraft: string; toolCallId?: string }
  | { listInboxDrafts: string; toolCallId?: string }
  | { setMood: string; toolCallId?: string }
  | { readJournalingArticle: string; toolCallId?: string }
  | { readJournalDay: string; toolCallId?: string }
  | { getJournalTemplate: string; toolCallId?: string }
  | { finishDailyClose: string; toolCallId?: string }
  | { searchKnowledge: string; toolCallId?: string }
  | { completeTask: string; toolCallId?: string }
  | { text: string };
function scripted(...steps: Step[]) {
  let calls = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const step = steps[Math.min(calls++, steps.length - 1)]!;
      const tool =
        "listPeople" in step ? {name:"listPeople" as const,input:step.listPeople,id:step.toolCallId} :
        "readPerson" in step ? {name:"readPerson" as const,input:step.readPerson,id:step.toolCallId} :
        "setPersonLastConnected" in step ? {name:"setPersonLastConnected" as const,input:step.setPersonLastConnected,id:step.toolCallId} :
        "setPersonAgreedDay" in step ? {name:"setPersonAgreedDay" as const,input:step.setPersonAgreedDay,id:step.toolCallId} :
        "listArea" in step
          ? {
              name: "listArea" as const,
              input: step.listArea,
              id: step.toolCallId,
            }
          : "listHabits" in step
            ? { name: "listHabits" as const, input: step.listHabits, id: step.toolCallId }
          : "createHabit" in step
            ? { name: "createHabit" as const, input: step.createHabit, id: step.toolCallId }
          : "trackHabit" in step
            ? { name: "trackHabit" as const, input: step.trackHabit, id: step.toolCallId }
          : "listNotebooks" in step
            ? {
                name: "listNotebooks" as const,
                input: step.listNotebooks,
                id: step.toolCallId,
              }
            : "createTask" in step
              ? {
                  name: "createTask" as const,
                  input: step.createTask,
                  id: step.toolCallId,
                }
              : "createNote" in step
                ? {
                    name: "createNote" as const,
                    input: step.createNote,
                    id: step.toolCallId,
                  }
                : "completeTask" in step
                  ? {
                      name: "completeTask" as const,
                      input: step.completeTask,
                      id: step.toolCallId,
                    }
                  : "appendJournal" in step
                    ? { name: "appendJournal" as const, input: step.appendJournal, id: step.toolCallId }
                    : "setMood" in step
                      ? { name: "setMood" as const, input: step.setMood, id: step.toolCallId }
                      : "fileDraft" in step
                        ? { name: "fileDraft" as const, input: step.fileDraft, id: step.toolCallId }
                        : "listInboxDrafts" in step
                          ? { name: "listInboxDrafts" as const, input: step.listInboxDrafts, id: step.toolCallId }
                          : "readJournalingArticle" in step
                            ? { name: "readJournalingArticle" as const, input: step.readJournalingArticle, id: step.toolCallId }
                            : "readJournalDay" in step
                              ? { name: "readJournalDay" as const, input: step.readJournalDay, id: step.toolCallId }
                              : "getJournalTemplate" in step
                                ? { name: "getJournalTemplate" as const, input: step.getJournalTemplate, id: step.toolCallId }
                                : "searchKnowledge" in step
                                  ? { name: "searchKnowledge" as const, input: step.searchKnowledge, id: step.toolCallId }
                                  : "finishDailyClose" in step
                                    ? { name: "finishDailyClose" as const, input: step.finishDailyClose, id: step.toolCallId }
                                    : null;
      const chunks = [
        ...(tool
          ? [
              {
                type: "tool-call" as const,
                toolCallId: tool.id ?? `call_${calls}`,
                toolName: tool.name,
                input: tool.input,
              },
            ]
          : [
              { type: "text-start" as const, id: "t" },
              {
                type: "text-delta" as const,
                id: "t",
                delta: (step as { text: string }).text,
              },
              { type: "text-end" as const, id: "t" },
            ]),
        {
          type: "finish" as const,
          finishReason: {
            unified: (tool ? "tool-calls" : "stop") as "tool-calls" | "stop",
            raw: undefined,
          },
          usage,
        },
      ];
      return { stream: simulateReadableStream({ chunks }) };
    },
  });
}

// The receipts a reloaded thread shows, in order.
const receiptsOf = (messages: UIMessage[] | null) =>
  messages?.flatMap((m) => m.parts.flatMap((p) => receipt(p) ?? []));

// The first listArea part saved on a reloaded thread: its turn's read.
const readIn = (messages: UIMessage[] | null) =>
  messages?.flatMap((m) => m.parts).find((p) => p.type === "tool-listArea") as
    | {
        toolCallId: string;
        output?: { open: number; tasks: { name: string; isNext: boolean }[] };
      }
    | undefined;
const listedIn = (messages: UIMessage[] | null) => readIn(messages)?.output;

const failing = () =>
  new MockLanguageModelV4({
    doStream: async () => {
      throw new Error("Gateway unavailable");
    },
  });

function failingAfterWrite(toolName: string, input: unknown) {
  let step = 0;
  return new MockLanguageModelV4({ doStream: async () => {
    if (step++ > 0) throw new Error("Gateway unavailable after write");
    return { stream: simulateReadableStream({ chunks: [
      { type: "tool-call", toolCallId: "call_committed", toolName, input: JSON.stringify(input) },
      { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
    ] }) };
  } });
}

function failingAfterWrites(...writes: { toolName: string; input: unknown }[]) {
  let step = 0;
  return new MockLanguageModelV4({ doStream: async () => {
    const write = writes[step++];
    if (!write) throw new Error("Gateway unavailable after writes");
    return { stream: simulateReadableStream({ chunks: [
      { type: "tool-call", toolCallId: `committed_${step}`, toolName: write.toolName, input: JSON.stringify(write.input) },
      { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
    ] }) };
  } });
}

const userMessage = (text: string, id: string = randomUUID()): UIMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
});

const textOf = (messages: UIMessage[] | null) =>
  messages?.map((m) => [
    m.role,
    m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join(""),
  ]);

describe("Coach turns", { skip: !url && "TEST_POSTGRES_URL not set" }, () => {
  const admin = createDb(url!).$client;
  const database = `bearing_coach_${randomUUID().replaceAll("-", "")}`;
  const connection = new URL(url ?? "postgres://localhost/test");
  connection.pathname = `/${database}`;
  const db = createDb(connection.toString());
  const ids: string[] = [];
  let a = "";
  let b = "";

  async function account() {
    const [user] = await db
      .insert(users)
      .values({ email: `${randomUUID()}@test.invalid`, passwordHash: "-" })
      .returning({ id: users.id });
    ids.push(user!.id);
    await createArea(user!.id, "Tasks", db);
    return user!.id;
  }

  test("People reads stay out of automatic context and applied writes; saved date receipts and content-matched resends survive newer edits", async () => {
    const c = await account();
    const p = await createPerson(c,{name:"Ada",group:"Family"},db);
    await savePerson(c,p.id,{...p,rule:{every:1,unit:"months"},lastConnected:"2026-09-01"},"2026-10-09",db);
    const thread = await coachThread(c,db);
    const automatic = scripted({text:"Hello."});
    await turn(c,thread,userMessage("Hello"),automatic);
    assert.ok(!promptText(automatic).includes('"name":"Ada"'));
    await turn(c,thread,userMessage("Read Ada"),scripted({listPeople:"{}"},{readPerson:JSON.stringify({name:"ADA"})},{text:"Ada is due."}));
    let messages = (await threadMessages(c,thread,db))!;
    const lines = messages.at(-1)!.parts.flatMap(part => receipt(part) ?? []);
    assert.ok(lines.includes("Read your people (1)"));assert.ok(lines.includes("Read 'Ada'"));
    assert.equal(appliedWritesBlock(messages),"");
    const message = userMessage("Connected with Ada today");
    await turn(c,thread,message,failingAfterWrite("setPersonLastConnected",{name:" Ada "}));
    assert.equal((await getPerson(c,p.id,db))?.lastConnected,"2026-10-09");
    await savePerson(c,p.id,{...p,rule:{every:1,unit:"months"},lastConnected:"2026-10-08"},"2026-10-09",db);
    await turn(c,thread,message,scripted({setPersonLastConnected:JSON.stringify({name:"ADA",day:"2026-10-09"}),toolCallId:"changed_provider_id"},{text:"Recorded."}),"2026-10-10");
    assert.equal((await getPerson(c,p.id,db))?.lastConnected,"2026-10-08");
    messages = (await threadMessages(c,thread,db))!;
    const shown = shownParts(messages.at(-1)!.parts,"2026-10-09");
    assert.ok(shown.some(part => "receipt" in part && part.receipt === "Connected with 'Ada' today" && part.href === `/people/${p.id}`));
    assert.match(appliedWritesBlock(messages),/Connected with 'Ada' on Fri, Oct 9/);
    assert.doesNotMatch(appliedWritesBlock(messages),/Read your people|Read 'Ada'/);
    await turn(c,thread,userMessage("Agreed to see Ada on November 3"),scripted({setPersonAgreedDay:JSON.stringify({name:"Ada",day:"2026-11-03"})},{text:"Agreed."}));
    assert.equal((await getPerson(c,p.id,db))?.agreedDay,"2026-11-03");
    await turn(c,thread,userMessage("Clear Ada's agreed day"),scripted({setPersonAgreedDay:JSON.stringify({name:"Ada",day:null})},{text:"Cleared."}));
    messages = (await threadMessages(c,thread,db))!;
    assert.equal((await getPerson(c,p.id,db))?.agreedDay,null);
    assert.ok(messages.at(-1)!.parts.some(part => receipt(part) === "Cleared the agreed day for 'Ada'"));
  });

  test("'I saw Ada today' writes last connected directly; an unknown name gets a refused result and a neutral receipt", async () => {
    const c = await account();
    const p = await createPerson(c,{name:"Ada",group:"Family"},db);
    const thread = await coachThread(c,db);
    await turn(c,thread,userMessage("I saw Ada today"),scripted({setPersonLastConnected:JSON.stringify({name:"Ada"})},{text:"Noted."}));
    assert.equal((await getPerson(c,p.id,db))?.lastConnected,"2026-10-09");
    let messages = (await threadMessages(c,thread,db))!;
    let last = messages.at(-1)!;
    assert.ok(last.parts.some(part => part.type === "tool-setPersonLastConnected"));
    assert.ok(shownParts(last.parts,"2026-10-09").some(part => "receipt" in part && part.receipt === "Connected with 'Ada' today"));
    await turn(c,thread,userMessage("I saw Zed"),scripted({setPersonLastConnected:JSON.stringify({name:"Zed"})},{text:"No person matches Zed. Which one did you mean?"}));
    messages = (await threadMessages(c,thread,db))!;
    last = messages.at(-1)!;
    const call = last.parts.find(part => part.type === "tool-setPersonLastConnected") as { output?: { refused?: boolean; name?: string } } | undefined;
    assert.equal(call?.output?.refused,true);
    assert.equal(call?.output?.name,"Zed");
    assert.ok(last.parts.some(part => receipt(part) === "No change: asked about 'Zed'"));
    assert.ok(!last.parts.some(part => /Couldn't update/.test(receipt(part) ?? "")));
    assert.equal((await getPerson(c,p.id,db))?.lastConnected,"2026-10-09");
  });

  test("Bad many-times asks without tools, then records stated total, additions, or none", async () => {
    for (const goalCount of [5, null]) for (const answer of ["4", "2 more", "none"]) {
      const c = await account();
      const habit = await createHabit(c, { name: "Cigarettes", trackMode: "many", bad: true, goalCount }, db);
      await setHabitCount(c, habit.id, "2026-10-09", 2, "2026-10-09", db);
      const thread = await coachThread(c, db);
      await turn(c, thread, userMessage("Show Cigarettes"), scripted({ listHabits: "{}" }, { text: "Cigarettes: 2 recorded today." }));
      const question = `Cigarettes has 2 recorded today${goalCount ? `, with a limit of ${goalCount}` : ""}; marking it done would log unreported lapses. How many times were there in total?`;
      await turn(c, thread, userMessage("Mark Cigarettes done"), scripted({ text: question }));
      let messages = (await threadMessages(c, thread, db))!;
      const ask = messages.at(-1)!;
      // Normal turns always inject freshRead; the scripted asking reply calls no tools.
      assert.ok(ask.parts.filter((p) => p.type.startsWith("tool-")).every((p) => p.type === "tool-listArea"));
      assert.equal(ask.parts.filter((p) => p.type === "text").map((p) => p.text).join(""), question);
      assert.equal((await db.select().from(habitOperations).where(eq(habitOperations.userId, c))).length, 0);
      const message = userMessage(answer);
      if (answer === "none") await turn(c, thread, message, scripted({ text: "No changes." }));
      else {
        const input = { habitId: habit.id, action: "setCount", count: 4 };
        await turn(c, thread, message, failingAfterWrite("trackHabit", input));
        await turn(c, thread, message, scripted({ trackHabit: JSON.stringify(input) }, { text: "Recorded 4 in total today." }));
      }
      messages = (await threadMessages(c, thread, db))!;
      assert.equal((await listHabits(c, "2026-10-09", ["2026-10-09"], db))[0]!.count, answer === "none" ? 2 : 4);
      assert.equal((await db.select().from(habitOperations).where(eq(habitOperations.userId, c))).length, answer === "none" ? 0 : 1);
      const receipts = messages.flatMap((m) => m.parts.flatMap((p) => receipt(p, "2026-10-09") ?? []));
      assert.equal(receipts.includes("Set 'Cigarettes' to 4 for today"), answer !== "none");
    }
  });

  test("stated daily and weekly totals use one setCount without a question and leave two shared slots", async () => {
    for (const period of ["day", "week"] as const) {
      const c = await account();
      const name = period === "day" ? "Water" : "Pages";
      const count = period === "day" ? 8 : 120;
      const habit = await createHabit(c, { name, period, trackMode: "many", goalCount: 3 }, db);
      const thread = await coachThread(c, db);
      await turn(c, thread, userMessage(period === "day" ? "log 8 glasses" : "I've read 120 pages this week"), scripted(
        { listHabits: "{}" },
        { trackHabit: JSON.stringify({ habitId: habit.id, action: "setCount", count }) },
        { createTask: JSON.stringify({ name: "First" }) },
        { createTask: JSON.stringify({ name: "Second" }) },
        { createTask: JSON.stringify({ name: "Fourth write" }) },
        { text: `Recorded ${count}. Made 3 writes.` },
      ));
      assert.equal((await listHabits(c, "2026-10-09", ["2026-10-09"], db))[0]!.count, count);
      assert.equal((await openTasks(c, db)).length, 2);
      assert.equal((await db.select().from(habitOperations).where(eq(habitOperations.userId, c))).length, 1);
      const messages = (await threadMessages(c, thread, db))!;
      assert.equal(messages.flatMap((m) => m.parts).filter((p) => p.type === "tool-trackHabit").length, 1);
      assert.ok(messages.flatMap((m) => m.parts).some((p) => receipt(p, "2026-10-09") === `Set '${name}' to ${count} for ${period === "day" ? "today" : "this week"}`));
    }
  });

  test("an applied past-day setCount stays visible to the model on the next turn", async () => {
    const c = await account();
    const water = await createHabit(c, { name: "Water", period: "day", trackMode: "many", goalCount: 8 }, db);
    const thread = await coachThread(c, db);
    await turn(c, thread, userMessage("I drank 3 glasses of water yesterday"), scripted(
      { trackHabit: JSON.stringify({ habitId: water.id, action: "setCount", count: 3, day: "2026-10-08" }) },
      { text: "Recorded 3 for yesterday." },
    ));
    // The persisted shape textOnly reads on the next turn.
    const stored = (await threadMessages(c, thread, db))!.flatMap((m) => m.parts).find((p) => p.type === "tool-trackHabit") as { state?: string; output?: { changed?: boolean } } | undefined;
    assert.equal(stored?.state, "output-available");
    assert.notEqual(stored?.output?.changed, false);
    const next = scripted({ listHabits: JSON.stringify({ day: "2026-10-08" }) }, { text: "Yes, 3 is recorded." });
    await turn(c, thread, userMessage("thanks"), next);
    const seen = promptText(next);
    assert.match(seen, /Set 'Water' to 3 for/);
    const system = next.doStreamCalls[0]!.prompt.find((m) => m.role === "system")!.content as string;
    assert.ok(system.includes("Applied writes in this thread (saved receipts; these happened):\n- Set 'Water' to 3 for Thu, Oct 8"));
    assert.ok(system.includes("never retract an earlier receipt; only a later write receipt changes it"));
    assert.ok(seen.includes("Earlier receipts in this thread are real writes"));
    const read = (await threadMessages(c, thread, db))!.at(-1)!.parts.find((p) => p.type === "tool-listHabits") as { output?: { day?: string; habits?: { name: string; count: number }[] } };
    assert.equal(read.output?.day, "2026-10-08");
    assert.equal(read.output?.habits?.find((h) => h.name === "Water")?.count, 3);
    assert.equal(receipt(read as never, "2026-10-09"), "Read your habits for yesterday (1)");
  });

  test("an undo refusal is a checked result the next turn keeps, not an applied write", async () => {
    const c = await account();
    const water = await createHabit(c, { name: "Water", period: "day", trackMode: "many", goalCount: 8 }, db);
    const thread = await coachThread(c, db);
    const before = (await db.select().from(habitOperations).where(eq(habitOperations.userId, c))).length;
    await turn(c, thread, userMessage("undo water"), scripted(
      { trackHabit: JSON.stringify({ habitId: water.id, action: "undo" }) },
      { text: "I have no recent Water update to undo. What should the total be?" },
    ));
    assert.equal((await db.select().from(habitOperations).where(eq(habitOperations.userId, c))).length, before);
    assert.equal((await listHabits(c, "2026-10-09", ["2026-10-09"], db))[0]!.count, 0);
    const stored = (await threadMessages(c, thread, db))!.flatMap((m) => m.parts).find((p) => p.type === "tool-trackHabit");
    assert.equal(receipt(stored as never, "2026-10-09"), "Nothing to undo for 'Water' for today");
    const next = scripted({ text: "You're welcome." });
    await turn(c, thread, userMessage("thanks"), next);
    const system = next.doStreamCalls[0]!.prompt.find((m) => m.role === "system")!.content as string;
    assert.ok(system.includes("Checked results in this thread (nothing written):\n- Nothing to undo for 'Water' for Fri, Oct 9"));
    assert.ok(!system.includes("Applied writes in this thread"));
    assert.ok(system.includes("never call them guesses or retract them"));
  });

  test("content replay survives reordered Journal/habit writes, inserted reads and a new write", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const message = userMessage("Create Walk and save reflection");
    await turn(c, thread, message, failingAfterWrites(
      { toolName: "createHabit", input: { name: "Walk" } },
      { toolName: "appendJournal", input: { text: "Reflection" } },
    ));
    const before = (await getJournalDay(c, "2026-10-09", db))!;
    await turn(c, thread, message, scripted(
      { listHabits: "{}" },
      { createHabit: JSON.stringify({ name: "Inserted" }) },
      { appendJournal: JSON.stringify({ day: "2026-10-09", text: "Reflection" }) },
      { createHabit: JSON.stringify({ name: " Walk ", period: "day", trackMode: "once", bad: false }) },
      { text: "Saved." },
    ));
    assert.equal((await getJournalDay(c, "2026-10-09", db))!.revision, before.revision);
    assert.equal((await getJournalDay(c, "2026-10-09", db))!.body, "Reflection");
    assert.deepEqual((await listHabits(c, "2026-10-09", [], db)).map(h => h.name).sort(), ["Inserted", "Walk"]);
    assert.equal((await db.select().from(habitOperations).where(eq(habitOperations.userId, c))).length, 2);
    const parts = (await threadMessages(c, thread, db))!.at(-1)!.parts;
    assert.equal(parts.filter(p => p.type === "tool-appendJournal" || p.type === "tool-createHabit").length, 3);
    assert.ok(!parts.some(p => "state" in p && p.state === "output-error"));
  });

  test("two identical did calls in a turn both apply and replay after another write moves before them", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const habit = await createHabit(c, "Water", db);
    await editHabit(c, habit.id, { trackMode: "many", goalCount: 8 }, undefined, db);
    const message = userMessage("I had water, and again. Create Walk.");
    const did = { habitId: habit.id, action: "did" };
    await turn(c, thread, message, failingAfterWrites(
      { toolName: "trackHabit", input: did }, { toolName: "trackHabit", input: did },
      { toolName: "createHabit", input: { name: "Walk" } },
    ));
    await turn(c, thread, message, scripted(
      { listHabits: "{}" }, { createHabit: JSON.stringify({ name: "Walk" }) },
      { trackHabit: JSON.stringify({ ...did, day: "2026-10-09" }) },
      { trackHabit: JSON.stringify({ ...did, day: "today" }) }, { text: "Recorded twice." },
    ));
    assert.equal((await listHabits(c, "2026-10-09", [], db)).find(h => h.id === habit.id)!.count, 2);
    assert.equal((await db.select().from(habitOperations).where(eq(habitOperations.userId, c))).length, 3);
    const parts = (await threadMessages(c, thread, db))!.at(-1)!.parts;
    const results = parts.filter(p => p.type === "tool-trackHabit") as { output: { count: number } }[];
    assert.deepEqual(results.map(p => p.output.count), [1, 2]);
  });

  test("explicit habit creation and track receipts survive failed-turn resend, edits, deletion and reload", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const message = userMessage("Create a habit Walk");
    const input = { name: "Walk" };
    await turn(c, thread, message, failingAfterWrite("createHabit", input));
    await turn(c, thread, message, scripted({ createHabit: JSON.stringify(input), toolCallId: "different_provider_id" }, { text: "Created Walk." }), "2026-10-10");
    const rows = await listHabits(c, "2026-10-09", [], db);
    assert.equal(rows.length, 1);
    const habit = rows[0]!;
    assert.deepEqual(shownParts((await threadMessages(c, thread, db))!.at(-1)!.parts).filter((part) => "receipt" in part && part.href === "/habits").map((part) => "receipt" in part ? part.receipt : ""), ["Created habit 'Walk'"]);
    await editHabit(c, habit.id, { trackMode: "many", goalCount: 3 }, undefined, db);
    const tracking = userMessage("I did Walk");
    const track = { habitId: habit.id, action: "did" };
    await turn(c, thread, tracking, failingAfterWrite("trackHabit", track));
    await editHabit(c, habit.id, { name: "Walk outdoors", goalCount: 1 }, undefined, db);
    await turn(c, thread, tracking, scripted({ trackHabit: JSON.stringify(track), toolCallId: "changed_track_id" }, { text: "Recorded." }), "2026-10-10");
    assert.equal((await listHabits(c, "2026-10-09", [], db))[0]!.count, 1);
    assert.equal((await db.select().from(habitOperations).where(eq(habitOperations.userId, c))).length, 2);
    const reloaded = shownParts((await threadMessages(c, thread, db))!.at(-1)!.parts);
    assert.ok(reloaded.some((part) => "receipt" in part && part.receipt === "Tracked 'Walk' for Fri, Oct 9" && part.href === "/habits"));
    const undoMessage = userMessage("Undo Walk outdoors");
    await turn(c, thread, undoMessage, failingAfterWrite("trackHabit", { ...track, action: "undo" }));
    await deleteHabit(c, habit.id, db);
    const replay = await turn(c, thread, undoMessage, scripted({ trackHabit: JSON.stringify({ ...track, action: "undo" }), toolCallId: "deleted_replay" }, { text: "Already undone." }));
    assert.ok(!("refused" in replay));
    assert.ok(shownParts((await threadMessages(c, thread, db))!.at(-1)!.parts).some((part) => "receipt" in part && part.receipt === "Undid 'Walk outdoors' for Fri, Oct 9" && part.href === "/habits"));
    assert.deepEqual(await listHabits(c, "2026-10-09", [], db), []);
  });

  test("a fourth habit create or track is refused while earlier mixed writes remain", async () => {
    for (const fourth of ["createHabit", "trackHabit"] as const) {
      const c = await account();
      const thread = await coachThread(c, db);
      const habit = await createHabit(c, "Existing", db);
      if (fourth === "createHabit") await createNotebook(c, "Book", db);
      const model = fourth === "trackHabit" ? scripted(
        { createTask: JSON.stringify({ name: "Task" }) },
        { createHabit: JSON.stringify({ name: "New" }) },
        { appendJournal: JSON.stringify({ text: "Reflection" }) },
        { trackHabit: JSON.stringify({ habitId: habit.id, action: "did" }) },
        { text: "I made three writes; the fourth was not done." },
      ) : scripted(
        { trackHabit: JSON.stringify({ habitId: habit.id, action: "did" }) },
        { createNote: JSON.stringify({ notebook: "Book", title: "Note", body: "Text" }) },
        { setMood: JSON.stringify({ mood: "Good" }) },
        { createHabit: JSON.stringify({ name: "Fourth" }) },
        { text: "I made three writes; the fourth was not done." },
      );
      await turn(c, thread, userMessage("Create and track these habits and save the requested Task, Note, reflection and Mood"), model);
      const rows = await listHabits(c, "2026-10-09", [], db);
      const parts = shownParts((await threadMessages(c, thread, db))!.at(-1)!.parts);
      assert.ok(parts.some((part) => "receipt" in part && part.receipt === (fourth === "createHabit" ? "Couldn't create that habit" : "Couldn't track that habit") && !part.href));
      assert.match(JSON.stringify(model.doStreamCalls.at(-1)!.prompt), /only 3 .*Person writes/);
      assert.equal(rows.find((row) => row.id === habit.id)!.count, fourth === "createHabit" ? 1 : 0);
      assert.equal(rows.length, fourth === "createHabit" ? 1 : 2);
      assert.equal((await db.select().from(habitOperations).where(eq(habitOperations.userId, c))).length, 1);
      if (fourth === "trackHabit") {
        assert.deepEqual((await openTasks(c, db)).map((row) => row.name), ["Task"]);
        assert.equal((await getJournalDay(c, "2026-10-09", db))!.body, "Reflection");
      } else {
        assert.equal((await db.select().from(notes).where(eq(notes.userId, c))).length, 1);
        assert.equal(await getMood(c, "2026-10-09", db), "Good");
      }
    }
  });

  test("Quit smoking and count my cigarettes create Bad habits through inferred inputs without another question", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    for (const [ask, input] of [
      ["Create a habit: Quit smoking", { name: "Smoking", bad: true }],
      ["Count my cigarettes", { name: "Cigarettes", bad: true, trackMode: "many" }],
    ] as const) {
      await turn(c, thread, userMessage(ask), scripted({ createHabit: JSON.stringify(input) }, { text: `Created ${input.name} and marked it Bad to record lapses.` }));
    }
    const rows = await listHabits(c, "2026-10-09", [], db);
    assert.deepEqual(rows.map(({ name, period, trackMode, goalCount, bad }) => ({ name, period, trackMode, goalCount, bad })), [
      { name: "Cigarettes", period: "day", trackMode: "many", goalCount: null, bad: true },
      { name: "Smoking", period: "day", trackMode: "once", goalCount: null, bad: true },
    ]);
    assert.ok(textOf(await threadMessages(c, thread, db))!.at(-1)![1]!.includes("marked it Bad"));
  });

  test("habit refusals never get a success receipt and ambiguous names wait for an id", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    await createHabit(c, "Water", db);
    await createHabit(c, "Water", db);
    await turn(c, thread, userMessage("I did Water"), scripted({ listHabits: "{}" }, { text: "Which Water habit do you mean?" }));
    assert.deepEqual(await db.select().from(habitOperations).where(eq(habitOperations.userId, c)), []);
    for (const input of [{ name: "Pages", goalCount: 200 }, { name: "Pages", period: "day", goalCount: 100 }, { name: "Pages", period: "week", goalCount: 1000 }, { name: "Water", trackMode: "many" }]) {
      await turn(c, thread, userMessage("Create this habit"), scripted({ createHabit: JSON.stringify(input) }, { text: "Please clarify the goal or period." }));
      const parts = shownParts((await threadMessages(c, thread, db))!.at(-1)!.parts);
      assert.ok(parts.some((part) => "receipt" in part && part.receipt === "Couldn't create that habit" && !part.href));
    }
    const habit = (await listHabits(c, "2026-10-09", [], db))[0]!;
    await turn(c, thread, userMessage("Track Water tomorrow"), scripted({ trackHabit: JSON.stringify({ habitId: habit.id, action: "did", day: "2026-10-10" }) }, { text: "That period is not open yet." }));
    assert.ok(shownParts((await threadMessages(c, thread, db))!.at(-1)!.parts).some((part) => "receipt" in part && part.receipt === "Couldn't track that habit" && !part.href));
    assert.deepEqual(await db.select().from(habitOperations).where(eq(habitOperations.userId, c)), []);
    assert.equal((await listHabits(c, "2026-10-09", [], db)).length, 2);
  });

  test("searchKnowledge quotes the section and its limits, proposes one habit, then waits for yes", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const article = await searchKnowledge("21 days");
    assert.ok(article.match);
    if (!article.match) return;
    const proposal = `${article.section}\nI propose Water: daily once, not Bad. Shall I create it?`;
    const model = scripted(
      { searchKnowledge: JSON.stringify({ query: "21 days" }) },
      { text: proposal },
    );
    await turn(c, thread, userMessage("how long does a habit take?"), model);
    const names = model.doStreamCalls[0]!.tools?.map((tool) => tool.name) ?? [];
    assert.ok(names.includes("searchKnowledge"));
    assert.equal(names.includes("createHabit"), true);
    assert.ok(promptText(model).includes("Knowledge article titles: Habits. Journaling: evidence and limits."));
    assert.equal(promptText(model).includes("median of 66 days"), false);
    assert.ok(promptText(model).includes("Bearing has daily and weekly Habits on the Habits page"));
    const saved = (await threadMessages(c, thread, db))!.flatMap((m) => m.parts);
    const looked = saved.find((p) => p.type === "tool-searchKnowledge" && "output" in p) as { output?: { match?: boolean; heading?: string; section?: string; title?: string } } | undefined;
    assert.equal(looked?.output?.match, true);
    assert.equal(looked?.output?.title, "Habits");
    assert.equal(looked?.output?.heading, "How long does a habit take? Not 21 days");
    assert.ok(looked?.output?.section?.includes("Source:"));
    assert.ok(looked?.output?.section?.includes("What this does not mean"));
    assert.deepEqual(receiptsOf(await threadMessages(c, thread, db)), [
      "Read your list (0 open)",
      "Looked up 'How long does a habit take? Not 21 days' in Habits",
    ]);
    assert.ok(JSON.stringify(model.doStreamCalls[1]!.prompt).includes("What this does not mean"));
    assert.equal(textOf(await threadMessages(c, thread, db))!.at(-1)![1], proposal);
    assert.deepEqual(await db.select().from(habits).where(eq(habits.userId, c)), []);
    assert.deepEqual(await db.select().from(habitOperations).where(eq(habitOperations.userId, c)), []);
    assert.deepEqual(await openTasks(c, db), []);
    assert.ok(promptText(model).includes("Wait for the person to say yes"));
    assert.ok(names.includes("readSkill"));
    await access(new URL("../../../packages/coach/skills/habit-design.md", import.meta.url));
    await turn(c, thread, userMessage("Yes"), scripted({ createHabit: JSON.stringify({ name: "Water" }) }, { text: "Created." }));
    assert.equal((await listHabits(c, "2026-10-09", [], db)).length, 1);
    assert.deepEqual(await openTasks(c, db), []);
  });

  test("Daily close normalizes mood labels before executing a single successful call", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    await turn(c, thread, userMessage("Daily close"), replying("What mood?"));
    const model = scripted({ setMood: JSON.stringify({ day: "2026-10-09", mood: "good" }) }, { text: "Saved as Good." });
    await turn(c, thread, userMessage("Good"), model);
    assert.equal(await getMood(c, "2026-10-09", db), "Good");
    const last = (await threadMessages(c, thread, db))!.at(-1)!;
    assert.deepEqual(shownParts(last.parts).flatMap((p) => "receipt" in p ? [p.receipt] : []), ["Set mood Good for 2026-10-09"]);
  });

  test("two closes on one day ask afresh, exclude previous progress, and both finish despite timestamp drift", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const day = "2026-10-09";
    await captureDraft(c, "First close draft", db);
    const [draft] = await inboxDrafts(c, db);
    await turn(c, thread, userMessage("Daily close"), replying("First close question?"));
    await turn(c, thread, userMessage("First close answer"), scripted(
      { appendJournal: JSON.stringify({ text: "First close answer" }) }, { text: "What mood?" },
    ));
    await turn(c, thread, userMessage("Good"), scripted(
      { setMood: JSON.stringify({ mood: "Good" }) }, { listInboxDrafts: "{}" },
      { text: 'File "First close draft" in the Journal for 2026-10-09?' },
    ));
    await turn(c, thread, userMessage("Yes"), scripted(
      { fileDraft: JSON.stringify({ draftId: draft!.id, destination: { kind: "journal", day } }) },
      { finishDailyClose: "{}" }, { text: "First close finished." },
    ));
    const finished = (await threadMessages(c, thread, db))!.at(-1)!;
    await db.update(coachMessages).set({ createdAt: sql`created_at + interval '2 milliseconds'` }).where(eq(coachMessages.id, finished.id));
    assert.equal(await coachCloseDay(c, thread, db), null);
    const second = replying("What went well this time?");
    await turn(c, thread, userMessage("Start Daily close"), second);
    const prompt = promptText(second);
    assert.match(prompt, /Answers appended: 0\./);
    assert.match(prompt, /Mood: not recorded/);
    assert.match(prompt, /Drafts filed: \[\]/);
    assert.doesNotMatch(prompt, /First close answer|First close question|First close draft|First close finished/);
    await turn(c, thread, userMessage("Second close answer"), scripted(
      { appendJournal: JSON.stringify({ text: "Second close answer" }) }, { text: "Anything else?" },
    ));
    const finish = scripted({ listInboxDrafts: "{}" }, { finishDailyClose: "{}" }, { text: "Second close finished." });
    await turn(c, thread, userMessage("Skip the rest"), finish);
    assert.match(promptText(finish), /Answers appended: 1\./);
    assert.doesNotMatch(promptText(finish), /First close answer/);
    assert.equal(await coachCloseDay(c, thread, db), null);
  });

  test("journal filing confirmation streams and ends while reply persistence is waiting", { timeout: 5000 }, async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    await captureDraft(c, "Draft call dentist", db);
    const [draft] = await inboxDrafts(c, db);
    await turn(c, thread, userMessage("Daily close"), scripted({ listInboxDrafts: "{}" }, { text: "Which draft?" }));
    const confirmation = 'File "Draft call dentist" in the Journal for 2026-10-09?';
    let release!: () => void;
    let saving!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const entered = new Promise<void>((resolve) => { saving = resolve; });
    const insert = db.insert.bind(db);
    const stub = mock.method(db, "insert", ((table: Parameters<typeof db.insert>[0]) => {
      const builder = insert(table);
      if (table !== coachMessages) return builder;
      const values = builder.values.bind(builder);
      builder.values = ((input: { role?: string }) => {
        const query = values(input as Parameters<typeof values>[0]);
        if (input.role !== "assistant") return query;
        const returning = query.returning.bind(query);
        query.returning = (() => {
          saving();
          return blocked.then(() => returning());
        }) as typeof query.returning;
        return query;
      }) as typeof builder.values;
      return builder;
    }) as typeof db.insert);
    try {
      const result = await coachTurn({ userId: c, threadId: thread, message: userMessage('File "Draft call dentist" to the journal'), model: scripted(
        { fileDraft: JSON.stringify({ draftId: draft!.id, destination: { kind: "journal", day: "2026-10-09" } }) },
        { text: confirmation },
      ), db, today: "2026-10-09" });
      assert.ok(!("refused" in result));
      const read = (async () => {
        const chunks = [];
        for await (const chunk of result.stream) chunks.push(chunk);
        return chunks;
      })();
      await entered;
      const completed = await Promise.race([read, new Promise<null>((resolve) => setTimeout(() => resolve(null), 200))]);
      release();
      await read;
      await result.saved;
      assert.ok(completed, "browser stream must close without waiting for the assistant DB write");
      assert.equal(completed.filter((c) => c.type === "text-delta").map((c) => c.delta).join(""), confirmation);
      assert.ok(completed.some((c) => c.type === "finish"));
      assert.equal((await inboxDrafts(c, db)).length, 1);
    } finally {
      release();
      stub.mock.restore();
    }
  });

  test("a normal turn reads today's owned habits and saves a linked read receipt", async () => {
    const c = await account();
    const other = await account();
    const thread = await coachThread(c, db);
    const day = "2026-10-08";
    const many = await createHabit(c, { name: "Water", trackMode: "many", goalCount: 3 }, db);
    const once = await createHabit(c, "Walk", db);
    await createHabit(other, "Someone else's habit", db);
    await changeHabitDayCount(c, many.id, day, 1, day, db);
    await setHabitDay(c, once.id, day, true, day, db);
    const model = scripted({ listHabits: JSON.stringify({ userId: other, today: "2026-10-09" }) }, { text: "Water is at one of three." });
    await turn(c, thread, userMessage("How are my habits?"), model, day);
    assert.ok(model.doStreamCalls[0]!.tools?.some((tool) => tool.name === "listHabits"));
    const parts = (await threadMessages(c, thread, db))!.flatMap((message) => message.parts);
    const read = parts.find((part) => part.type === "tool-listHabits" && "output" in part);
    assert.ok(read && "output" in read);
    const rows = (read.output as { habits: { id: string; count: number; done: boolean; streak: number | null }[] }).habits;
    assert.equal(rows.length, 2);
    assert.equal(rows.find((row) => row.id === many.id)?.count, 1);
    assert.equal(rows.find((row) => row.id === many.id)?.done, false);
    assert.equal(rows.find((row) => row.id === once.id)?.done, true);
    assert.equal(rows.find((row) => row.id === once.id)?.streak, 1);
    assert.ok(shownParts([read]).some((part) => "receipt" in part && part.receipt === "Read your habits (2)" && part.href === "/habits"));
  });

  test("finishing Daily close hides the banner mode and restores normal tools on the next turn", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const day = "2026-10-08";
    await turn(c, thread, userMessage("Daily close"), replying("What went well?"), "2026-10-09", undefined, day);
    assert.equal(await coachCloseDay(c, thread, db), day);
    await turn(c, thread, userMessage("Skip the rest"), scripted(
      { listInboxDrafts: "{}" },
      { finishDailyClose: "{}" },
      { text: "That completes today's Daily close." },
    ));
    const saved = (await threadMessages(c, thread, db))!;
    const finish = saved.at(-1)!.parts.find((part) => part.type === "tool-finishDailyClose");
    assert.ok(finish && "output" in finish);
    assert.deepEqual(finish.output, { finished: true, day, messageId: saved.at(-2)!.id });
    assert.deepEqual(shownParts([finish]), []);
    assert.equal(await coachCloseDay(c, thread, db), null);
    assert.equal(await getJournalDay(c, day, db), null);
    assert.equal(await getMood(c, day, db), null);

    const normal = scripted({ createTask: JSON.stringify({ name: "Call the plumber" }) }, { text: "Added." });
    await turn(c, thread, userMessage("Add Call the plumber"), normal);
    writeToolsOffered(normal.doStreamCalls[0]!);
    assert.ok(!normal.doStreamCalls[0]!.tools?.some((tool) => tool.name === "finishDailyClose"));
    assert.equal((await openTasks(c, db))[0]?.name, "Call the plumber");
    assert.equal(await coachCloseDay(c, thread, db), null);
  });

  test("a failed reply after finish retains the close and resends with the original day", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const day = "2026-10-08";
    await turn(c, thread, userMessage("Daily close"), replying("Any drafts?"), "2026-10-09", undefined, day);
    const incoming = userMessage("skip");
    await turn(c, thread, incoming, failingAfterWrite("finishDailyClose", {}));
    assert.equal(await coachCloseDay(c, thread, db), day);
    assert.equal((await threadMessages(c, thread, db))!.at(-1)!.id, incoming.id);
    const retry = scripted({ finishDailyClose: "{}" }, { text: "Daily close complete." });
    await turn(c, thread, incoming, retry, "2026-10-10", undefined, null);
    assert.match(promptText(retry), /Daily close for 2026-10-08.*Today is 2026-10-09/);
    assert.equal(await coachCloseDay(c, thread, db), null);
    // A new close on the same day is not ended by the earlier finish marker.
    await turn(c, thread, userMessage("Daily close"), replying("What went well?"), "2026-10-09", undefined, day);
    assert.equal(await coachCloseDay(c, thread, db), day);
  });

  test("Daily close rejects an out-of-list tool even when the model emits it", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const model = scripted({ createTask: JSON.stringify({ name: "Unwanted" }) }, { text: "Let's close the day." });
    await turn(c, thread, userMessage("Daily close"), model);
    assert.equal((await openTasks(c, db)).length, 0);
    assert.equal(await getJournalDay(c, "2026-10-09", db), null);
    assert.equal(await getMood(c, "2026-10-09", db), null);
    assert.deepEqual(model.doStreamCalls[0]!.tools?.map((tool) => tool.name).sort(), [
      "appendJournal", "fileDraft", "finishDailyClose", "getJournalTemplate", "listHabits", "listInboxDrafts", "listNotebooks", "readJournalDay", "readJournalingArticle", "setMood",
    ]);
    assert.equal(readIn(await threadMessages(c, thread, db)), undefined);
  });

  test("Daily close has no handler for emitted habit writes", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const habit = await createHabit(c, "Walk", db);
    const before = await db.select().from(habits).where(eq(habits.userId, c));
    for (const emitted of [
      { createHabit: JSON.stringify({ name: "Unwanted" }) },
      { trackHabit: JSON.stringify({ habitId: habit.id, day: "2026-10-09", count: 1 }) },
    ]) {
      const model = scripted(emitted, { text: "You can mark habits on the Habits page." });
      await turn(c, thread, userMessage("Daily close"), model);
      const names = model.doStreamCalls[0]!.tools?.map((tool) => tool.name);
      assert.ok(!names?.includes("createHabit"));
      assert.ok(!names?.includes("trackHabit"));
      // The SDK reports an absent handler, rather than executing a hidden write.
      assert.match(JSON.stringify(model.doStreamCalls[1]!.prompt), /(?:not available|NoSuchToolError)/i);
      assert.deepEqual(await db.select().from(habits).where(eq(habits.userId, c)), before);
      assert.deepEqual(await db.select().from(habitMarks).where(eq(habitMarks.habitId, habit.id)), []);
    }
  });

  test("Daily close orders mood, habits, then drafts; skipping habits writes nothing and filing and finish still work", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const day = "2026-10-08";
    const habit = await createHabit(c, "Walk", db);
    await captureDraft(c, "A quiet evening", db);
    const [draft] = await inboxDrafts(c, db);
    await turn(c, thread, userMessage("Daily close"), replying("What went well?"), "2026-10-09", undefined, day);
    await turn(c, thread, userMessage("skip"), replying("What mood would you choose?"));
    const review = scripted(
      { setMood: JSON.stringify({ day, mood: "Good" }) },
      { listHabits: "{}" },
      { text: "Walk is still due. You can mark it in [Habits](/habits), or skip." },
    );
    await turn(c, thread, userMessage("Good"), review);
    assert.match(promptText(review), /reflection questions, mood, habits, Inbox drafts, then finishDailyClose/);
    const reviewed = (await threadMessages(c, thread, db))!.at(-1)!;
    assert.deepEqual(reviewed.parts.filter((part) => part.type.startsWith("tool-")).map((part) => part.type), ["tool-setMood", "tool-listHabits"]);
    assert.ok(shownParts(reviewed.parts, day).some((part) => "receipt" in part && part.receipt === "Read your habits for today (1)" && part.href === "/habits"));
    const habitBefore = await db.select().from(habits).where(eq(habits.userId, c));
    const skip = scripted(
      { appendJournal: JSON.stringify({ day, text: "skip" }) },
      { setMood: JSON.stringify({ day, mood: "Okay" }) },
      { fileDraft: JSON.stringify({ draftId: draft!.id, destination: { kind: "journal", day } }) },
      { listInboxDrafts: "{}" },
      { text: `File "A quiet evening" in the Journal for ${day}?` },
    );
    await turn(c, thread, userMessage("skip"), skip);
    assert.equal(await getJournalDay(c, day, db), null);
    assert.equal(await getMood(c, day, db), "Good");
    assert.equal((await inboxDrafts(c, db)).length, 1);
    assert.deepEqual(await db.select().from(habits).where(eq(habits.userId, c)), habitBefore);
    assert.deepEqual(await db.select().from(habitMarks).where(eq(habitMarks.habitId, habit.id)), []);
    const complete = scripted(
      { fileDraft: JSON.stringify({ draftId: draft!.id, destination: { kind: "journal", day } }) },
      { finishDailyClose: "{}" },
      { text: "Mood Good was saved, and your draft was filed." },
    );
    await turn(c, thread, userMessage("Yes"), complete);
    assert.equal((await inboxDrafts(c, db)).length, 0);
    assert.equal((await getJournalDay(c, day, db))!.body, "A quiet evening");
    assert.equal(await coachCloseDay(c, thread, db), null);
    const progress = promptText(complete).split("Close progress (data)")[1]!.split("Template data")[0]!;
    assert.doesNotMatch(progress, /Walk/);
    const reloaded = (await threadMessages(c, thread, db))!;
    const successful = reloaded.flatMap((message) => message.parts).filter((part) => "state" in part && part.state === "output-available").map((part) => part.type);
    assert.deepEqual(successful, ["tool-setMood", "tool-listHabits", "tool-listInboxDrafts", "tool-fileDraft", "tool-finishDailyClose"]);
  });

  test("Daily close start, skip and cancel reject writes; answers and explicit mood stay on the selected day", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const day = "2026-10-08";
    for (const text of ["Start Daily close", "skip", "cancel daily close"]) {
      await turn(c, thread, userMessage(text), scripted(
        { appendJournal: JSON.stringify({ day, text: "Invented" }) },
        { setMood: JSON.stringify({ day, mood: "Good" }) },
        { text: "Okay." },
      ), "2026-10-09", undefined, day);
      assert.equal(await getJournalDay(c, day, db), null);
      assert.equal(await getMood(c, day, db), null);
    }
    await turn(c, thread, userMessage("Tea with my friend. Mood: Good."), scripted(
      { appendJournal: JSON.stringify({ day: "2026-10-09", text: "Tea with my friend." }) },
      { setMood: JSON.stringify({ day, mood: "Very good" }) },
      { text: "Try again." },
    ), "2026-10-09", undefined, day);
    await turn(c, thread, userMessage("Tea with my friend. Mood: Good."), scripted(
      { appendJournal: JSON.stringify({ day, text: "Tea with my friend." }) },
      { setMood: JSON.stringify({ day, mood: "Good" }) },
      { text: "Saved." },
    ), "2026-10-09", undefined, day);
    assert.equal((await getJournalDay(c, day, db))?.body, "Tea with my friend. Mood: Good.");
    assert.equal(await getJournalDay(c, "2026-10-09", db), null);
    assert.equal(await getMood(c, day, db), "Good");
  });

  test("Daily close appends whole reflections mentioning close or skipping, preserving its selected day", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const day = "2026-10-08";
    await turn(c, thread, userMessage("Daily close"), replying("What was hard?"), "2026-10-09", undefined, day);
    for (const text of ["This daily close helped me reflect.", "Skipping lunch was hard."]) {
      await turn(c, thread, userMessage(`  ${text}  `), scripted(
        { appendJournal: JSON.stringify({ day, text: "model-selected fragment" }) }, { text: "Saved." },
      ));
      assert.equal(await coachCloseDay(c, thread, db), day);
    }
    assert.equal((await getJournalDay(c, day, db))!.body, "This daily close helped me reflect.\n\nSkipping lunch was hard.");
    assert.equal(await getJournalDay(c, "2026-10-09", db), null);
    const next = replying("Anything else?");
    await turn(c, thread, userMessage("What's saved?"), next);
    assert.match(promptText(next), /Answers appended: 2\./);
  });

  test("Daily close bare commands block writes, while opening turns stay blocked on resend", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const day = "2026-10-09";
    const message = userMessage("Daily close");
    await turn(c, thread, message, failingAfterWrite("appendJournal", { text: "Daily close" }));
    await turn(c, thread, message, scripted({ appendJournal: JSON.stringify({ text: "close" }) }, { text: "What went well?" }));
    for (const text of ["skip", "skip this!", "next.", "cancel?", "stop", "end daily close."]) {
      await turn(c, thread, userMessage(text), scripted(
        { appendJournal: JSON.stringify({ text }) }, { setMood: JSON.stringify({ mood: "Good" }) }, { text: "Okay." },
      ), day, undefined, day);
      assert.equal(await getJournalDay(c, day, db), null);
      assert.equal(await getMood(c, day, db), null);
    }
  });

  test("Daily close resends with a different model substring append the whole message only once", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    await turn(c, thread, userMessage("Daily close"), replying("What went well?"));
    const message = userMessage("  Tea with Sam. Then a walk.  ");
    await turn(c, thread, message, failingAfterWrite("appendJournal", { text: "Tea with Sam." }));
    assert.equal((await getJournalDay(c, "2026-10-09", db))!.body, "Tea with Sam. Then a walk.");
    await turn(c, thread, message, scripted(
      { appendJournal: JSON.stringify({ text: "Then a walk." }), toolCallId: "changed_substring" }, { text: "Already saved." },
    ));
    assert.equal((await getJournalDay(c, "2026-10-09", db))!.body, "Tea with Sam. Then a walk.");
  });

  test("Daily close accepts one explicit mood word and refuses corrections, mismatches and negation", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    await turn(c, thread, userMessage("Daily close"), replying("What mood?"));
    for (const [text, mood] of [
      ["Set Good as my mood", "Good"], ["I'd say good", "Good"],
      ["Very good!", "Very good"], ["VERY LOW", "Very low"], ["Low", "Low"], ["Okay", "Okay"],
      ["No lunch today. I'd say Good.", "Good"], ["Okay", "Okay"],
    ]) {
      await turn(c, thread, userMessage(text!), scripted({ setMood: JSON.stringify({ mood }) }, { text: "Saved." }));
      assert.equal(await getMood(c, "2026-10-09", db), mood);
    }
    for (const [text, mood] of [
      ["Mood: Good? No, Very low", "Good"], ["Mood: Good? No, Very low", "Very low"],
      ["leave it unset", null], ["Mood: Good, leave it unset", "Good"],
      ["Not good", "Good"], ["Don't set Good", "Good"], ["Good? No.", "Good"],
      ["Don't set my mood to Good", "Good"], ["Good, do not set my mood", "Good"],
      ["Very good", "Good"], ["goodness", "Good"], ["Do not clear my mood", null],
    ]) {
      await turn(c, thread, userMessage(text!), scripted({ setMood: JSON.stringify({ mood }) }, { text: "Please choose." }));
      assert.equal(await getMood(c, "2026-10-09", db), "Okay", text!);
    }
    for (const text of ["clear my mood", "remove my mood", "unset my mood"]) {
      await turn(c, thread, userMessage("Good"), scripted({ setMood: JSON.stringify({ mood: "Good" }) }, { text: "Saved." }));
      await turn(c, thread, userMessage(text), scripted({ setMood: JSON.stringify({ mood: null }) }, { text: "Cleared." }));
      assert.equal(await getMood(c, "2026-10-09", db), null);
    }
  });

  test("Daily close files Rest and recovery on affirmative consent but refuses negation and destination changes", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    await captureDraft(c, "Rest and recovery", db);
    const [draft] = await inboxDrafts(c, db);
    const offer = 'File "Rest and recovery" in the Journal for 2026-10-09?';
    const file = (kind = "journal") => JSON.stringify({ draftId: draft!.id, destination: kind === "journal" ? { kind, day: "2026-10-09" } : { kind } });
    await turn(c, thread, userMessage("Daily close"), scripted({ listInboxDrafts: "{}" }, { text: offer }));
    for (const [text, kind] of [
      ["Yes, but as a Task instead", "journal"], ["Yes, but as a Task instead", "task"],
      ["Yes, do not file it", "journal"], ["Yes, don't file it", "journal"],
      ["Yes, as a task", "journal"], ["No", "journal"],
      ['File "Rest and recovery" in the Journal for 2026-10-09', "journal"],
    ]) {
      await turn(c, thread, userMessage(text!), scripted({ fileDraft: file(kind) }, { text: offer }));
      assert.equal((await inboxDrafts(c, db)).length, 1, text!);
      assert.equal(await getJournalDay(c, "2026-10-09", db), null);
      assert.equal((await openTasks(c, db)).length, 0);
    }
    await turn(c, thread, userMessage("Yes, file Rest and recovery"), scripted({ fileDraft: file() }, { text: "Filed." }));
    assert.equal((await inboxDrafts(c, db)).length, 0);
    assert.equal((await getJournalDay(c, "2026-10-09", db))!.body, "Rest and recovery");
  });

  test("Daily close offers the existing owned listNotebooks tool for destination discovery", async () => {
    const c = await account();
    const other = await account();
    const thread = await coachThread(c, db);
    const book = await createNotebook(c, "Reflections", db);
    await createNotebook(other, "Private notebook", db);
    await captureDraft(c, "A quiet evening", db);
    const [draft] = await inboxDrafts(c, db);
    const model = scripted({ listNotebooks: "{}" }, { listInboxDrafts: "{}" }, { text: 'File "A quiet evening" as a Note in Reflections?' });
    await turn(c, thread, userMessage("Daily close"), model);
    assert.ok(model.doStreamCalls[0]!.tools?.some((tool) => tool.name === "listNotebooks"));
    const part = (await threadMessages(c, thread, db))!.flatMap((m) => m.parts).find((p) => p.type === "tool-listNotebooks" && "output" in p);
    assert.ok(part && "output" in part);
    const output = JSON.stringify(part.output);
    assert.ok(output.includes(book.id));
    assert.ok(output.includes("Reflections"));
    assert.ok(!output.includes("Private notebook"));
    await turn(c, thread, userMessage("Yes"), scripted({ fileDraft: JSON.stringify({ draftId: draft!.id, destination: { kind: "note", notebook: "Reflections" } }) }, { text: "Filed." }));
    const progress = replying("Anything else?");
    await turn(c, thread, userMessage("What's saved?"), progress);
    assert.ok(promptText(progress).includes(`Drafts filed: ${JSON.stringify([{ draftId: draft!.id, kind: "note", notebookId: book.id }])}.`));
  });

  test("Daily close files only the particular offered draft after agreement, and refuses mass filing", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    await captureDraft(c, "A walk with Sam", db);
    await captureDraft(c, "Buy a notebook", db);
    const rows = await inboxDrafts(c, db);
    const one = rows.find((draft) => draft.body === "A walk with Sam")!;
    const two = rows.find((draft) => draft.body === "Buy a notebook")!;
    const file = (id: string) => JSON.stringify({ draftId: id, destination: { kind: "journal", day: "2026-10-09" } });
    await turn(c, thread, userMessage("Daily close"), scripted(
      { listInboxDrafts: "{}" },
      { text: 'Would you like to file "A walk with Sam" in the Journal for 2026-10-09?' },
    ));
    await turn(c, thread, userMessage("File everything"), scripted(
      { fileDraft: file(one.id) }, { fileDraft: file(two.id) }, { text: "Choose just one." },
    ));
    assert.equal((await inboxDrafts(c, db)).length, 2);
    assert.equal(await getJournalDay(c, "2026-10-09", db), null);
    await turn(c, thread, userMessage("Offer one"), replying('Would you like to file "A walk with Sam" in the Journal for 2026-10-09?'));
    await turn(c, thread, userMessage("Yes"), scripted(
      { fileDraft: file(two.id) }, { fileDraft: file(one.id) }, { fileDraft: file(two.id) }, { text: "Filed that one." },
    ));
    assert.deepEqual((await inboxDrafts(c, db)).map((draft) => draft.id), [two.id]);
    assert.equal((await getJournalDay(c, "2026-10-09", db))?.body, "A walk with Sam");
    const finalReceipts = receiptsOf([(await threadMessages(c, thread, db))!.at(-1)!])!;
    assert.ok(finalReceipts.includes("Appended draft to journal for 2026-10-09"));
    assert.ok(!finalReceipts.includes("Couldn't file that draft"));
  });

  test("Daily close supplies the saved template or starter and a citable knowledge article", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const starter = replying("What are you grateful for?");
    await turn(c, thread, userMessage("Daily close"), starter);
    assert.match(promptText(starter), /Gratitude.*Best thing.*Hard part/s);
    await saveJournalTemplate(c, "## Connection\nWho did you spend time with?\n\n## Tomorrow\nWhat can wait?", db);
    const model = scripted({ readJournalingArticle: "{}" }, { text: "Who did you spend time with?" });
    await turn(c, thread, userMessage("Start Daily close"), model);
    assert.match(promptText(model), /Connection.*Who did you spend time with\?.*Tomorrow/s);
    assert.match(promptText(model), /one question at a time/i);
    assert.doesNotMatch(promptText(model), /## Gratitude/);
    const output = (await threadMessages(c, thread, db))!.flatMap((m) => m.parts).find((p) => p.type === "tool-readJournalingArticle" && "output" in p);
    assert.ok(output && "output" in output);
    const article = JSON.stringify(output.output);
    for (const citation of ["Pennebaker", "Beall", "1986", "Frattaroli", "2006", "Emmons", "McCullough", "2003", "Davis", "2016", "https://doi.org/"]) assert.ok(article.includes(citation), citation);
    assert.match(article, /no.*(?:guarantee|promise)|does not promise/i);
    assert.match(article, /clinical|diagnos/i);
    assert.equal(await getJournalDay(c, "2026-10-09", db), null);
  });

  test("Daily close retains its allow-list and day after reload and failed-turn resend, then cancels without writes", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const day = "2026-10-08";
    await turn(c, thread, userMessage("Close the day"), replying("What went well?"), "2026-10-09", undefined, day);
    assert.equal(await coachCloseDay(c, thread, db), day);
    const message = userMessage("Nothing yet");
    await turn(c, thread, message, failing());
    assert.equal((await threadMessages(c, thread, db))!.at(-1)!.id, message.id);
    const retry = scripted({ createTask: JSON.stringify({ name: "Escaped" }) }, { text: "You can skip." });
    await turn(c, thread, message, retry, "2026-10-10", undefined, null);
    assert.equal((await openTasks(c, db)).length, 0);
    assert.match(promptText(retry), /Daily close for 2026-10-08/);
    assert.match(promptText(retry), /Today is 2026-10-09/);
    assert.ok(!retry.doStreamCalls[0]!.tools?.some((tool) => tool.name === "createTask"));
    await turn(c, thread, userMessage("cancel daily close"), replying("Stopped."));
    assert.equal(await coachCloseDay(c, thread, db), null);
    assert.equal(await getJournalDay(c, day, db), null);
    assert.equal(await getMood(c, day, db), null);
  });

  test("Daily close reads only one owned bounded day and refuses alternate day inputs", async () => {
    const c = await account();
    const other = await account();
    const thread = await coachThread(c, db);
    const day = "2026-10-08";
    await saveJournalDay(c, day, "A".repeat(5_000), 0, "2026-10-09", db);
    await saveJournalDay(c, "2026-10-09", "Another day secret", 0, "2026-10-09", db);
    await saveJournalDay(other, day, "Another person's secret", 0, "2026-10-09", db);
    const model = scripted({ readJournalDay: "{}" }, { readJournalDay: JSON.stringify({ day: "2026-10-09", userId: other }) }, { getJournalTemplate: "{}" }, { text: "What went well?" });
    await turn(c, thread, userMessage("Daily close"), model, "2026-10-09", undefined, day);
    const read = (await threadMessages(c, thread, db))!.flatMap((m) => m.parts).find((part) => part.type === "tool-readJournalDay" && "output" in part);
    assert.ok(read && "output" in read);
    assert.deepEqual(read.output, { day, body: "A".repeat(4_000), truncated: true });
    const allPrompts = JSON.stringify(model.doStreamCalls);
    assert.ok(!allPrompts.includes("Another day secret"));
    assert.ok(!allPrompts.includes("Another person's secret"));
    assert.ok(!allPrompts.includes("A".repeat(4_001)));
    assert.equal((await getJournalDay(c, day, db))!.body.length, 5_000);
    assert.deepEqual(await turn(other, thread, userMessage("Daily close"), replying("No")), { refused: 404 });
    for (const invalid of ["2026-02-30", "2026-10-10", "today", "", null]) {
      if (invalid === null) continue;
      assert.deepEqual(await turn(c, thread, userMessage("Daily close"), replying("No"), "2026-10-09", undefined, invalid), { refused: 400 });
    }
  });

  test("Daily close refuses a reflection without a named mood", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    await turn(c, thread, userMessage("Daily close"), replying("What mood?"));
    await turn(c, thread, userMessage("News from my friend."), scripted({ setMood: JSON.stringify({ mood: "Good" }) }, { text: "What mood would you choose?" }), "2026-10-09", undefined, "2026-10-09");
    assert.equal(await getMood(c, "2026-10-09", db), null);
  });

  test("Daily close keeps a committed filing across failure and replays its own linked receipt once", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    await captureDraft(c, "A quiet evening", db);
    const [draft] = await inboxDrafts(c, db);
    await turn(c, thread, userMessage("Daily close"), scripted({ listInboxDrafts: "{}" }, { text: 'File "A quiet evening" in the Journal for 2026-10-09?' }));
    const message = userMessage("Yes");
    const input = { draftId: draft!.id, destination: { kind: "journal", day: "2026-10-09" } };
    await turn(c, thread, message, failingAfterWrite("fileDraft", input));
    assert.equal((await inboxDrafts(c, db)).length, 0);
    assert.equal((await getJournalDay(c, "2026-10-09", db))!.body, "A quiet evening");
    const retry = scripted({ fileDraft: JSON.stringify(input), toolCallId: "changed_retry_call" }, { text: "Already filed." });
    await turn(c, thread, message, retry, "2026-10-10", undefined, null);
    assert.ok(promptText(retry).includes(`Drafts filed: ${JSON.stringify([{ draftId: draft!.id, kind: "journal", day: "2026-10-09" }])}.`));
    assert.equal((await getJournalDay(c, "2026-10-09", db))!.body, "A quiet evening");
    const parts = (await threadMessages(c, thread, db))!.flatMap((m) => shownParts(m.parts));
    assert.ok(parts.some((p) => "receipt" in p && p.receipt === "Appended draft to journal for 2026-10-09" && p.href === "/journal/2026-10-09"));
    const cancelMessage = userMessage("cancel daily close");
    await turn(c, thread, cancelMessage, failing());
    const cancelRetry = replying("Stopped; your draft is saved.");
    await turn(c, thread, cancelMessage, cancelRetry);
    assert.ok(promptText(cancelRetry).includes(`Drafts filed: ${JSON.stringify([{ draftId: draft!.id, kind: "journal", day: "2026-10-09" }])}.`));
  });

  // #85 D4 repro (failing until fixed). a/d: the model must see committed close
  // state on later turns, from the database, not from its own memory.
  test("D4a/d: after Set mood, the next close turn and the cancel turn know the mood is recorded", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const day = "2026-10-08";
    await turn(c, thread, userMessage("Close the day"), replying("How was your mood?"), "2026-10-09", undefined, day);
    await turn(c, thread, userMessage("Good"), scripted({ setMood: JSON.stringify({ day, mood: "Good" }) }, { text: "Thanks." }), "2026-10-09", undefined, day);
    assert.equal(await getMood(c, day, db), "Good");
    const next = scripted({ setMood: JSON.stringify({ day, mood: "Good" }) }, { text: "Anything else?" });
    await turn(c, thread, userMessage("What's left?"), next, "2026-10-09", {
      ...coachData(db, "2026-10-09"),
      async setMood() { throw new Error("An already recorded mood needs no write."); },
    }, day);
    assert.match(promptText(next), /Close progress \(data\) for 2026-10-08:\nMood: Good \(recorded\)\./);
    assert.ok(receiptsOf([(await threadMessages(c, thread, db))!.at(-1)!])!.includes("Set mood Good for 2026-10-08"));
    const cancel = replying("Stopped.");
    await turn(c, thread, userMessage("cancel daily close"), cancel);
    assert.match(promptText(cancel), /Close progress \(data\) for 2026-10-08:\nMood: Good \(recorded\)\./);
  });

  // b: a refused write must be visible to the model on the next turn, so it can't deny it.
  test("D4b: a refused setMood is visible to the model on the next turn", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const day = "2026-10-08";
    await turn(c, thread, userMessage("Close the day"), replying("How was your mood?"), "2026-10-09", undefined, day);
    await turn(c, thread, userMessage("Pretty great day honestly"), scripted({ setMood: JSON.stringify({ day, mood: "Good" }) }, { text: "Which mood?" }), "2026-10-09", undefined, day);
    assert.equal(await getMood(c, day, db), null);
    const refused = (await threadMessages(c, thread, db))!.at(-1)!;
    assert.ok(refused.parts.some((part) => part.type === "tool-setMood" && part.state === "output-error"));
    assert.ok(!receiptsOf([refused])!.includes("Couldn't set that mood"));
    const next = replying("Okay.");
    await turn(c, thread, userMessage("Did you set it?"), next, "2026-10-09", undefined, day);
    assert.match(promptText(next), /Mood: not recorded\.\nAnswers appended: 0\.\nClose answers \(JSON data\): \[\]\.\nDrafts filed: \[\]\.\nRefused last turn: setMood \(no explicit mood\)\./);
  });

  // A Note filing that names its Notebook by both name and id (as listNotebooks returns it) must file once, cleanly.
  test("Coach Note filing with a Notebook name and id files without a failure receipt", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const ideas = await createNotebook(c, "Ideas", db);
    await captureDraft(c, "Draft E note", db);
    const [draft] = await inboxDrafts(c, db);
    const both = JSON.stringify({ draftId: draft!.id, destination: { kind: "note", notebook: "Ideas", notebookId: ideas.id } });
    await turn(c, thread, userMessage("Please file my Inbox draft 'Draft E note' as a Note in my Ideas notebook."),
      scripted({ listNotebooks: "{}" }, { fileDraft: both }, { text: "Filed." }));
    const last = (await threadMessages(c, thread, db))!.at(-1)!;
    const receipts = receiptsOf([last])!;
    assert.ok(receipts.includes("Filed draft as Note 'Draft E note'"), receipts.join(" | "));
    assert.ok(!receipts.includes("Couldn't file that draft"), receipts.join(" | "));
    assert.equal((await listNotes(c, ideas.id, db)).length, 1);
    await captureDraft(c, "Draft F note", db);
    const [other] = await inboxDrafts(c, db);
    const mismatch = JSON.stringify({ draftId: other!.id, destination: { kind: "note", notebook: "Recipes", notebookId: ideas.id } });
    await turn(c, thread, userMessage("File 'Draft F note' in Recipes."), scripted({ fileDraft: mismatch }, { text: "Which Notebook?" }));
    const refused = (await threadMessages(c, thread, db))!.at(-1)!;
    assert.ok(refused.parts.some((part) => part.type === "tool-fileDraft" && part.state === "output-error"), JSON.stringify(refused.parts));
    assert.deepEqual((await inboxDrafts(c, db)).map((row) => row.id), [other!.id]);
  });

  // c: a reply whose filing committed must not also carry a failure receipt for that same filing.
  test("D4c: a refused fileDraft call followed by the committed one shows only the success receipt", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    await captureDraft(c, "A walk with Sam", db);
    await captureDraft(c, "Buy a notebook", db);
    const rows = await inboxDrafts(c, db);
    const one = rows.find((draft) => draft.body === "A walk with Sam")!;
    const two = rows.find((draft) => draft.body === "Buy a notebook")!;
    const file = (id: string) => JSON.stringify({ draftId: id, destination: { kind: "journal", day: "2026-10-09" } });
    await turn(c, thread, userMessage("Daily close"), scripted({ listInboxDrafts: "{}" }, { text: 'Would you like to file "A walk with Sam" in the Journal for 2026-10-09?' }));
    await turn(c, thread, userMessage("Yes"), scripted({ fileDraft: file(two.id) }, { fileDraft: file(one.id) }, { text: "Filed." }));
    const last = (await threadMessages(c, thread, db))!.at(-1)!;
    const receipts = shownParts(last.parts).flatMap((part) => "receipt" in part ? [part.receipt] : []);
    assert.ok(receipts.includes("Appended draft to journal for 2026-10-09"));
    assert.ok(!receipts.includes("Couldn't file that draft"), receipts.join(" | "));
  });

  // e: the close prompt must offer only what closeTools can do.
  test("D4e: the Daily close prompt does not offer Task filing, and a Task filing is refused", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    await captureDraft(c, "Buy a notebook", db);
    const [draft] = await inboxDrafts(c, db);
    const model = replying("What are you grateful for?");
    await turn(c, thread, userMessage("Daily close"), model);
    assert.match(promptText(model), /Offer only Note in an existing named Notebook, or this Journal day\./);
    assert.doesNotMatch(promptText(model), /Offer Task/);
    await turn(c, thread, userMessage("Show my draft"), scripted({ listInboxDrafts: "{}" }, { text: 'File "Buy a notebook" as a Task?' }));
    await turn(c, thread, userMessage("Yes"), scripted({ fileDraft: JSON.stringify({ draftId: draft!.id, destination: { kind: "task" } }) }, { text: "Choose Note or Journal." }));
    assert.deepEqual((await inboxDrafts(c, db)).map((row) => row.id), [draft!.id]);
    assert.deepEqual(await openTasks(c, db), []);
    const last = (await threadMessages(c, thread, db))!.at(-1)!;
    assert.ok(last.parts.some((part) => part.type === "tool-fileDraft" && part.state === "output-error" && part.errorText === "Daily close refused: choose Note or this Journal day"));
    assert.ok(!receiptsOf([last])!.includes("Couldn't file that draft"));
  });

  test("Daily close retains the shared write cap, separate receipts, and model step cap", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    await turn(c, thread, userMessage("Daily close"), replying("What went well?"));
    await turn(c, thread, userMessage("One\nTwo\nThree\nMood: Good"), scripted(
      { appendJournal: JSON.stringify({ text: "One" }) },
      { setMood: JSON.stringify({ mood: "Good" }) },
      { appendJournal: JSON.stringify({ text: "Two" }) },
      { appendJournal: JSON.stringify({ text: "Three" }) },
      { text: "Saved what I could." },
    ), "2026-10-09", undefined, "2026-10-09");
    assert.equal((await getJournalDay(c, "2026-10-09", db))!.body, "One\nTwo\nThree\nMood: Good");
    assert.equal(await getMood(c, "2026-10-09", db), "Good");
    const parts = (await threadMessages(c, thread, db))!.flatMap((m) => shownParts(m.parts));
    assert.equal(parts.filter((p) => "receipt" in p && p.href === "/journal/2026-10-09").length, 3);
    const model = scripted({ readJournalDay: "{}" });
    await turn(c, thread, userMessage("Read this day"), model);
    assert.equal(model.doStreamCalls.length, 8);
    assert.deepEqual(model.doStreamCalls.at(-1)!.toolChoice, { type: "none" });
  });

  // Runs a turn the way the route does and reads the whole stream, like a
  // browser that stays open. Returns the chunks the browser got, and whether
  // the stream broke off with an error instead of ending.
  async function turn(
    userId: string,
    threadId: unknown,
    message: unknown,
    model: MockLanguageModelV4,
    today = "2026-10-09",
    data?: ReturnType<typeof coachData>,
    closeDay?: string | null,
  ) {
    const result = await coachTurn({
      userId,
      threadId,
      message,
      model,
      db,
      today,
      data,
      closeDay,
    });
    if ("refused" in result) return result;
    const chunks: { type: string }[] = [];
    const reader = result.stream.getReader();
    let broke = false;
    try {
      for (let r = await reader.read(); !r.done; r = await reader.read()) {
        chunks.push(r.value);
      }
    } catch {
      broke = true;
    }
    // The route hands this to after(), which logs a rejection.
    if (broke) await result.saved.catch(() => {});
    else await result.saved;
    return { chunks, broke };
  }

  // Adds Tasks as [name, priority] pairs, oldest first, the way the list
  // does, and returns their ids by name.
  async function addTasks(userId: string, list: [string, number][]) {
    const ids: Record<string, string> = {};
    for (const [name, priority] of list) {
      const { id } = (await addTask(userId, { name, today: "2026-10-09" }, db))!;
      for (let i = 0; i < Math.abs(priority); i++) {
        await changePriority(userId, id, priority > 0 ? 1 : -1, db);
      }
      ids[name] = id;
    }
    return ids;
  }

  const rowOf = async (id: string) =>
    (await db.select().from(coachMessages).where(eq(coachMessages.id, id)))[0];

  before(async () => {
    await admin.query(`create database "${database}"`);
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url)) });
    a = await account();
    b = await account();
  });
  after(async () => {
    if (ids.length) {
      await db.delete(notes).where(inArray(notes.userId, ids));
      await db.delete(noteOperations).where(inArray(noteOperations.userId, ids));
      await db.delete(notebooks).where(inArray(notebooks.userId, ids));
      await db.delete(users).where(inArray(users.id, ids));
    }
    await db.$client.end();
    await admin.query(`drop database if exists "${database}"`);
    await admin.end();
  });

  test("filing one Inbox draft as a Task archives only it and reloads its receipt", async () => {
    const c = await account();
    await captureDraft(c, "Call dentist\nAsk about appointment", db);
    await captureDraft(c, "Leave this in Inbox", db);
    const draft = (await inboxDrafts(c, db)).find((row) => row.body.startsWith("Call dentist"))!;
    const thread = await coachThread(c, db);
    await turn(c, thread, userMessage("File Call dentist as a task"), scripted(
      { fileDraft: JSON.stringify({ draftId: draft.id, destination: { kind: "task" } }) },
      { text: "Filed." },
    ));
    const open = await openTasks(c, db);
    assert.deepEqual(open.map((row) => row.name), ["Call dentist"]);
    assert.deepEqual((await inboxDrafts(c, db)).map((row) => row.body), ["Leave this in Inbox"]);
    const messages = (await threadMessages(c, thread, db))!;
    const filingOutput = messages.flatMap((m) => m.parts).find((part) => part.type === "tool-fileDraft" && "output" in part);
    assert.ok(filingOutput && "output" in filingOutput);
    assert.equal((filingOutput.output as { isNext?: boolean }).isNext, true);
    const saved = messages.flatMap((m) => shownParts(m.parts));
    const filed = saved.find((p) => "receipt" in p && p.receipt === "Filed draft as Task 'Call dentist'");
    assert.ok(filed && "href" in filed);
    assert.equal(filed.href, taskHref(open[0]!.id));
  });

  test("filing a draft as a Note preserves its body and reloads the Note link", async () => {
    const c = await account();
    const book = await createNotebook(c, "Reflections", db);
    const body = "Meeting\n\n**Keep this markdown**\n";
    await captureDraft(c, body, db);
    const [draft] = await inboxDrafts(c, db);
    const thread = await coachThread(c, db);
    await turn(c, thread, userMessage("File Meeting as a note in Reflections"), scripted(
      { fileDraft: JSON.stringify({ draftId: draft!.id, destination: { kind: "note", notebook: "reflections" } }) },
      { text: "Filed." },
    ));
    const [note] = await listNotes(c, book.id, db);
    assert.ok(note);
    assert.equal((await db.select().from(notes).where(eq(notes.id, note.id)))[0]!.body, body);
    assert.deepEqual(await inboxDrafts(c, db), []);
    const filed = (await threadMessages(c, thread, db))!.flatMap((m) => shownParts(m.parts)).find((p) => "receipt" in p && p.receipt === "Filed draft as Note 'Meeting'");
    assert.ok(filed && "href" in filed);
    assert.equal(filed.href, noteHref(book.id, note.id));
  });

  test("filing a draft to today's Journal appends its entire body and reloads the day link", async () => {
    const c = await account();
    const body = "My reflection\n\n**Whole text**\n";
    await captureDraft(c, body, db);
    const [draft] = await inboxDrafts(c, db);
    const thread = await coachThread(c, db);
    await turn(c, thread, userMessage("Append this draft to today's Journal"), scripted(
      { fileDraft: JSON.stringify({ draftId: draft!.id, destination: { kind: "journal", day: "today" } }) },
      { text: "Filed." },
    ));
    assert.equal((await getJournalDay(c, "2026-10-09", db))!.body, body);
    assert.deepEqual(await inboxDrafts(c, db), []);
    const filed = (await threadMessages(c, thread, db))!.flatMap((m) => shownParts(m.parts)).find((p) => "receipt" in p && p.receipt === "Appended draft to journal for 2026-10-09");
    assert.ok(filed && "href" in filed);
    assert.equal(filed.href, "/journal/2026-10-09");
  });

  test("listInboxDrafts exposes at most twenty owned Inbox excerpts, never bodies", async () => {
    const c = await account();
    const d = await account();
    await db.insert(drafts).values([
      ...Array.from({ length: 25 }, (_, i) => ({ userId: c, body: `Draft ${i} ` + "x".repeat(300) })),
      { userId: c, body: "ARCHIVED SECRET", workspace: "archive" },
      { userId: d, body: "FOREIGN SECRET" },
    ]);
    const info = mock.method(console, "info", () => {});
    const thread = await coachThread(c, db);
    await turn(c, thread, userMessage("Show my Inbox choices"), scripted({ listInboxDrafts: "{}" }, { text: "Choose one." }));
    const part = (await threadMessages(c, thread, db))!.flatMap((m) => m.parts).find((p) => p.type === "tool-listInboxDrafts") as unknown as { output: { drafts: { id: string; excerpt: string; createdAt: string }[] } };
    assert.ok(part?.output);
    assert.equal(part.output.drafts.length, 20);
    const owned = new Set((await inboxDrafts(c, db)).map((row) => row.id));
    for (const row of part.output.drafts) {
      assert.ok(owned.has(row.id));
      assert.deepEqual(Object.keys(row).sort(), ["createdAt", "excerpt", "id"]);
      assert.ok(row.excerpt.length <= 200);
      assert.ok(!Number.isNaN(Date.parse(row.createdAt)));
    }
    assert.ok(!JSON.stringify(part.output).includes("SECRET"));
    const log = JSON.parse(String([...info.mock.calls].reverse().find((call) => String(call.arguments[0]).includes("coach.turn"))!.arguments[0]));
    assert.equal(log.toolCalls.listInboxDrafts, 1);
    info.mock.restore();
  });

  test("mass-file and vague requests refuse missing, all, arrays, and multiple destinations without filing anything", async () => {
    const c = await account();
    await captureDraft(c, "Keep this draft", db);
    const [draft] = await inboxDrafts(c, db);
    const thread = await coachThread(c, db);
    const invalid = [
      {}, { destination: { kind: "task" } }, { draftId: "all", destination: { kind: "task" } },
      { draftId: [draft!.id], destination: { kind: "task" } },
      { draftIds: [draft!.id], destination: { kind: "task" } },
      { draftId: draft!.id }, { draftId: draft!.id, destination: [{ kind: "task" }] },
      { draftId: draft!.id, destination: { kind: "task", notebook: "Extra destination" } },
      { draftId: draft!.id, destination: { kind: "task" }, draftIds: [draft!.id] },
    ];
    for (const input of invalid) {
      await turn(c, thread, userMessage("File everything and close my day"), scripted({ fileDraft: JSON.stringify(input) }, { text: "Choose one draft and destination." }));
      await assert.rejects(fileDraft(c, { ...input, today: "2026-10-09" } as never, db));
    }
    assert.deepEqual((await inboxDrafts(c, db)).map((row) => row.id), [draft!.id]);
    assert.deepEqual(await openTasks(c, db), []);
    assert.equal(await getJournalDay(c, "2026-10-09", db), null);
    assert.ok(!receiptsOf(await threadMessages(c, thread, db))!.some((line) => line.startsWith("Filed draft") || line.startsWith("Appended draft")));
  });

  test("committed Task, Note and Journal filings replay their original result after edits, with no second write", async () => {
    for (const kind of ["task", "note", "journal"] as const) {
      const c = await account();
      const book = await createNotebook(c, "Reflections", db);
      await captureDraft(c, "Original title\nOriginal draft body", db);
      const [draft] = await inboxDrafts(c, db);
      const destination = kind === "note" ? { kind, notebookId: book.id } : kind === "journal" ? { kind, day: "2026-10-08" } : { kind };
      const input = { draftId: draft!.id, destination, today: "2026-10-09" };
      const data = coachData(db, "2026-10-09");
      const original = await data.fileDraft!(c, input);
      if (original.kind === "note") {
        const note = (await getNote(c, original.id, db))!;
        await saveNote(c, original.id, { title: "Edited title", body: "Edited body", pinned: false, revision: note.revision }, db);
      } else if (original.kind === "journal") {
        const entry = (await getJournalDay(c, original.day, db))!;
        await saveJournalDay(c, original.day, "Edited Journal body", entry.revision, input.today, db);
      } else {
        await db.update(tasks).set({ name: "Edited task title" }).where(eq(tasks.id, original.id));
      }
      const results = await Promise.all([data.fileDraft!(c, input), data.fileDraft!(c, input)]);
      assert.deepEqual(results, [original, original]);
      assert.equal((await openTasks(c, db)).length, kind === "task" ? 1 : 0);
      assert.equal((await listNotes(c, book.id, db)).length, kind === "note" ? 1 : 0);
      assert.deepEqual(await inboxDrafts(c, db), []);
      if (kind === "journal") assert.equal((await getJournalDay(c, "2026-10-08", db))!.body, "Edited Journal body");
      const thread = await coachThread(c, db);
      await turn(c, thread, userMessage("Retry that filing"), scripted({ fileDraft: JSON.stringify({ draftId: draft!.id, destination }) }, { text: "Already filed." }));
      const saved = (await threadMessages(c, thread, db))!.flatMap((m) => shownParts(m.parts));
      assert.ok(saved.some((part) => "receipt" in part && (kind === "journal" ? part.receipt === "Appended draft to journal for 2026-10-08" : part.receipt === `Filed draft as ${kind === "task" ? "Task" : "Note"} 'Original title'`) && Boolean(part.href)));
    }
  });

  test("already-filed drafts refuse every different destination, including another Notebook or Journal day", async () => {
    const c = await account();
    const book = await createNotebook(c, "Reflections", db);
    const otherBook = await createNotebook(c, "Other", db);
    for (const destination of [{ kind: "task" }, { kind: "note", notebookId: book.id }, { kind: "journal", day: "2026-10-08" }] as const) {
      await captureDraft(c, "Chosen draft", db);
      const [draft] = await inboxDrafts(c, db);
      await fileDraft(c, { draftId: draft!.id, destination, today: "2026-10-09" }, db);
      for (const other of [{ kind: "task", name: "Different task" }, { kind: "note", notebookId: otherBook.id }, { kind: "journal", day: "2026-10-07" }] as const) {
        await assert.rejects(fileDraft(c, { draftId: draft!.id, destination: other, today: "2026-10-09" }, db), /different destination|different day/);
      }
    }
    assert.equal((await openTasks(c, db)).length, 1);
    assert.equal((await listNotes(c, book.id, db)).length, 1);
    assert.deepEqual(await listNotes(c, otherBook.id, db), []);
    assert.equal((await getJournalDay(c, "2026-10-08", db))!.body, "Chosen draft");
    assert.equal(await getJournalDay(c, "2026-10-07", db), null);
  });

  test("screen filings replay through the Coach without creating another destination", async () => {
    const c = await account();
    const book = await createNotebook(c, "Reflections", db);
    for (const kind of ["task", "note", "journal"] as const) {
      await captureDraft(c, "Screen filing", db);
      const [draft] = await inboxDrafts(c, db);
      if (kind === "task") assert.ok(await fileDraftAsTask(c, draft!.id, db, { today: "2026-10-09" }));
      else if (kind === "note") await fileDraftAsNote(c, draft!.id, { notebookId: book.id, title: "Screen title" }, db);
      else await fileDraftAsJournal(c, draft!.id, { day: "2026-10-08", today: "2026-10-09" }, db);
      const destination = kind === "note" ? { kind, notebookId: book.id } : kind === "journal" ? { kind, day: "2026-10-08" } : { kind };
      const result = await fileDraft(c, { draftId: draft!.id, destination, today: "2026-10-09" }, db);
      assert.equal(result.kind, kind);
      if (result.kind === "note") assert.equal(result.name, "Screen title");
    }
    assert.equal((await openTasks(c, db)).length, 1);
    assert.equal((await listNotes(c, book.id, db)).length, 1);
    assert.equal((await getJournalDay(c, "2026-10-08", db))!.body, "Screen filing");
  });

  test("future days, invalid browser days, foreign drafts and foreign Notebooks refuse without archiving", async () => {
    const c = await account();
    const d = await account();
    const foreignBook = await createNotebook(d, "Private", db);
    await captureDraft(c, "My draft", db);
    await captureDraft(d, "Foreign draft", db);
    const [mine] = await inboxDrafts(c, db);
    const [foreign] = await inboxDrafts(d, db);
    const thread = await coachThread(c, db);
    for (const [draftId, destination, today] of [
      [mine!.id, { kind: "journal", day: "2026-10-10" }, "2026-10-09"],
      [mine!.id, { kind: "journal" }, ""],
      [mine!.id, { kind: "journal" }, "2026-02-31"],
      [mine!.id, { kind: "note", notebookId: foreignBook.id }, "2026-10-09"],
      ...["task", "note", "journal"].map((kind) => [foreign!.id, kind === "note" ? { kind, notebookId: foreignBook.id } : { kind }, "2026-10-09"]),
    ] as [string, unknown, string][]) {
      await turn(c, thread, userMessage("File this draft"), scripted({ fileDraft: JSON.stringify({ draftId, destination }) }, { text: "Refused." }), today);
    }
    await assert.rejects(fileDraft(c, { draftId: foreign!.id, destination: { kind: "task" }, today: "2026-10-09" }, db), /Draft not found/);
    assert.equal((await inboxDrafts(c, db)).length, 1);
    assert.equal((await inboxDrafts(d, db)).length, 1);
    assert.deepEqual(await openTasks(c, db), []);
    assert.deepEqual(await listNotes(d, foreignBook.id, db), []);
    assert.equal(await getJournalDay(c, "2026-10-10", db), null);
    assert.ok(!receiptsOf(await threadMessages(c, thread, db))!.some((line) => line.startsWith("Filed draft") || line.startsWith("Appended draft")));
  });

  test("a lost filing response resends to the original browser day after midnight", async () => {
    const c = await account();
    await captureDraft(c, "Before midnight", db);
    const [draft] = await inboxDrafts(c, db);
    const input = { draftId: draft!.id, destination: { kind: "journal", day: "today" } };
    const message = userMessage("Append Before midnight to today's Journal");
    const thread = await coachThread(c, db);
    await turn(c, thread, message, failingAfterWrite("fileDraft", input));
    await turn(c, thread, message, scripted({ fileDraft: JSON.stringify(input), toolCallId: "resent" }, { text: "Already saved." }), "2026-10-10");
    assert.equal((await getJournalDay(c, "2026-10-09", db))!.body, "Before midnight");
    assert.equal(await getJournalDay(c, "2026-10-10", db), null);
    assert.ok(receiptsOf(await threadMessages(c, thread, db))!.includes("Appended draft to journal for 2026-10-09"));
  });

  test("parallel fileDraft calls share the cap with Task, Note, Journal and Mood writes before awaiting", async () => {
    for (const fileFirst of [false, true]) {
      const c = await account();
      const book = await createNotebook(c, "Reflections", db);
      await captureDraft(c, "Chosen draft", db);
      const [draft] = await inboxDrafts(c, db);
      const thread = await coachThread(c, db);
      const file = ["fileDraft", { draftId: draft!.id, destination: { kind: "task" } }] as const;
      const calls = fileFirst ? [
        file,
        ["createNote", { notebook: "Reflections", title: "Note", body: "Note body" }],
        ["setMood", { mood: "Good" }],
        ["createTask", { name: "Fourth task" }],
      ] : [
        ["createTask", { name: "One" }],
        ["appendJournal", { text: "Reflection" }],
        ["setMood", { mood: "Good" }],
        file,
      ];
      let step = 0;
      const model = new MockLanguageModelV4({ doStream: async () => {
        if (step++ > 0) return { stream: simulateReadableStream({ chunks: [
          { type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "Capped." }, { type: "text-end", id: "t" }, finish,
        ] }) };
        return { stream: simulateReadableStream({ chunks: [
          ...calls.map(([toolName, input], i) => ({ type: "tool-call" as const, toolCallId: `parallel_${i}`, toolName: toolName as string, input: JSON.stringify(input) })),
          { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
        ] }) };
      } });
      const info = mock.method(console, "info", () => {});
      try { await turn(c, thread, userMessage("File the chosen draft and save these other things"), model); }
      finally { info.mock.restore(); }
      assert.deepEqual((await openTasks(c, db)).map((row) => row.name), [fileFirst ? "Chosen draft" : "One"]);
      assert.equal((await inboxDrafts(c, db)).length, fileFirst ? 0 : 1);
      assert.equal((await listNotes(c, book.id, db)).length, fileFirst ? 1 : 0);
      assert.equal((await getJournalDay(c, "2026-10-09", db))?.body ?? null, fileFirst ? null : "Reflection");
      assert.equal(await getMood(c, "2026-10-09", db), "Good");
      assert.ok(receiptsOf(await threadMessages(c, thread, db))!.includes(fileFirst ? "Couldn't create that task" : "Couldn't file that draft"));
      const log = JSON.parse(String(info.mock.calls.find((call) => String(call.arguments[0]).includes("coach.turn"))!.arguments[0]));
      assert.equal(log.toolCalls.fileDraft, 1);
    }
  });

  test("concurrent initial filings to different destinations commit exactly one result", async () => {
    const c = await account();
    const book = await createNotebook(c, "Reflections", db);
    await captureDraft(c, "Race draft", db);
    const [draft] = await inboxDrafts(c, db);
    const results = await Promise.allSettled([
      fileDraft(c, { draftId: draft!.id, destination: { kind: "task" }, today: "2026-10-09" }, db),
      fileDraft(c, { draftId: draft!.id, destination: { kind: "note", notebookId: book.id }, today: "2026-10-09" }, db),
      fileDraft(c, { draftId: draft!.id, destination: { kind: "journal" }, today: "2026-10-09" }, db),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal((await openTasks(c, db)).length + (await listNotes(c, book.id, db)).length + Number(Boolean(await getJournalDay(c, "2026-10-09", db))), 1);
    assert.deepEqual(await inboxDrafts(c, db), []);
  });

  test("failed Task conversion and an oversized Journal append keep the chosen draft in Inbox", async () => {
    const c = await account();
    await captureDraft(c, "x".repeat(501), db);
    const [taskDraft] = await inboxDrafts(c, db);
    const data = coachData(db, "2026-10-09");
    await assert.rejects(data.fileDraft!(c, { draftId: taskDraft!.id, destination: { kind: "task" }, today: "2026-10-09" }));
    assert.deepEqual((await inboxDrafts(c, db)).map((row) => row.id), [taskDraft!.id]);
    // A person-provided name can correct the refused Task conversion.
    const task = await data.fileDraft!(c, { draftId: taskDraft!.id, destination: { kind: "task", name: "Short name" }, today: "2026-10-09" });
    assert.ok(task.kind === "task");
    assert.equal(task.name, "Short name");
    await saveJournalDay(c, "2026-10-09", "x".repeat(100_000), 0, "2026-10-09", db);
    await captureDraft(c, "Too much for the existing Journal", db);
    const [journalDraft] = await inboxDrafts(c, db);
    await assert.rejects(data.fileDraft!(c, { draftId: journalDraft!.id, destination: { kind: "journal" }, today: "2026-10-09" }));
    assert.deepEqual((await inboxDrafts(c, db)).map((row) => row.id), [journalDraft!.id]);
    assert.equal((await getJournalDay(c, "2026-10-09", db))!.body.length, 100_000);
  });

  test("an explicit append preserves the text and reloads a linked Journal receipt", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    await saveJournalDay(c, "2026-10-09", "Earlier", 0, "2026-10-09", db);
    await turn(c, thread, userMessage("Append this: My **reflection**\n"), scripted(
      { appendJournal: JSON.stringify({ text: "My **reflection**\n" }) },
      { text: "Saved." },
    ));
    assert.equal((await getJournalDay(c, "2026-10-09", db))?.body, "Earlier\n\nMy **reflection**\n");
    const saved = (await threadMessages(c, thread, db))!.flatMap((m) => shownParts(m.parts));
    const appended = saved.find((p) => "receipt" in p && p.receipt === "Appended to journal for 2026-10-09");
    assert.equal(appended && "href" in appended ? appended.href : undefined, "/journal/2026-10-09");
  });

  test("explicit mood set and clear reload linked receipts without creating a Journal document", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    await turn(c, thread, userMessage("My mood is Good; save it for yesterday"), scripted(
      { setMood: JSON.stringify({ day: "2026-10-08", mood: "Good" }) }, { text: "Saved." },
    ));
    assert.equal(await getMood(c, "2026-10-08", db), "Good");
    await turn(c, thread, userMessage("Clear yesterday's mood"), scripted(
      { setMood: JSON.stringify({ day: "2026-10-08", mood: null }) }, { text: "Cleared." },
    ));
    assert.equal(await getMood(c, "2026-10-08", db), null);
    assert.equal(await getJournalDay(c, "2026-10-08", db), null);
    const receipts = (await threadMessages(c, thread, db))!.flatMap((m) => shownParts(m.parts)).filter((p) => "receipt" in p && /mood/.test(p.receipt));
    assert.deepEqual(receipts.map((p) => "receipt" in p ? [p.receipt, p.href] : []), [
      ["Set mood Good for 2026-10-08", "/journal/2026-10-08"],
      ["Cleared mood for 2026-10-08", "/journal/2026-10-08"],
    ]);
  });

  test("a resend cannot change the text under the triggering message identity", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const message = userMessage("Append Original");
    await turn(c, thread, message, failingAfterWrite("appendJournal", { text: "Original" }));
    const retried = await turn(c, thread, userMessage("Append Changed", message.id), scripted(
      { appendJournal: JSON.stringify({ text: "Changed" }) }, { text: "Saved." },
    ));
    assert.deepEqual(retried, { refused: 409 });
    assert.equal((await getJournalDay(c, "2026-10-09", db))?.body, "Original");
  });

  test("a committed append resend keeps the original browser day across midnight and appends once", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const message = userMessage("Append My reflection today");
    await turn(c, thread, message, failingAfterWrite("appendJournal", { day: "today", text: "My reflection" }));
    const entry = (await getJournalDay(c, "2026-10-09", db))!;
    await saveJournalDay(c, entry.day, "Edited later", entry.revision, "2026-10-10", db);
    await turn(c, thread, message, scripted(
      { appendJournal: JSON.stringify({ text: "My reflection" }), toolCallId: "new_call_on_resend" }, { text: "Already saved." },
    ), "2026-10-10");
    assert.equal((await getJournalDay(c, "2026-10-09", db))?.body, "Edited later");
    assert.equal(await getJournalDay(c, "2026-10-10", db), null);
    assert.ok(receiptsOf(await threadMessages(c, thread, db))!.includes("Appended to journal for 2026-10-09"));
  });

  test("different reflection content on resend has its own identity", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const message = userMessage("Append: Long walk, felt calmer.");
    await turn(c, thread, message, failingAfterWrite("appendJournal", { day: "today", text: "Long walk, felt calmer." }));
    assert.equal((await getJournalDay(c, "2026-10-09", db))?.body, "Long walk, felt calmer.");
    await turn(c, thread, message, scripted(
      { appendJournal: JSON.stringify({ text: "Long walk, felt calmer" }), toolCallId: "changed_one_character" },
      { text: "Saved." },
    ));
    assert.equal((await getJournalDay(c, "2026-10-09", db))?.body, "Long walk, felt calmer.\n\nLong walk, felt calmer");
    assert.equal(receiptsOf(await threadMessages(c, thread, db))!.includes("Appended to journal for 2026-10-09"), true);
  });

  test("two different appendJournal calls in one turn both save", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    await turn(c, thread, userMessage("Save both reflections"), scripted(
      { appendJournal: JSON.stringify({ text: "First reflection" }) },
      { appendJournal: JSON.stringify({ text: "Second reflection" }) },
      { text: "Saved both." },
    ));
    assert.equal((await getJournalDay(c, "2026-10-09", db))?.body, "First reflection\n\nSecond reflection");
  });

  test("an older Mood resend cannot overwrite a newer choice or clear and keeps its day", async () => {
    for (const newerMood of ["Very good", null] as const) {
      const c = await account();
      const thread = await coachThread(c, db);
      const message = userMessage("Set my mood to Low today");
      await turn(c, thread, message, failingAfterWrite("setMood", { mood: "Low" }));
      assert.equal(await getMood(c, "2026-10-09", db), "Low");
      await setMood(c, { day: "2026-10-09", today: "2026-10-10", mood: newerMood, setAt: Date.now() + 10_000 }, db);
      await turn(c, thread, message, scripted(
        { setMood: JSON.stringify({ day: "today", mood: "Low" }) }, { text: "The newer choice is kept." },
      ), "2026-10-10");
      assert.equal(await getMood(c, "2026-10-09", db), newerMood);
      assert.equal(await getMood(c, "2026-10-10", db), null);
    }
  });

  test("future or invalid target days and missing or invalid browser days fail recoverably with no success links", async () => {
    for (const [today, day] of [
      ["2026-10-09", "2026-10-10"], ["2026-10-09", "2026-02-30"],
      ["", undefined], ["2026-02-29", undefined], ["", "2026-10-08"],
    ]) {
      const c = await account();
      const thread = await coachThread(c, db);
      const model = scripted(
        { appendJournal: JSON.stringify({ day, text: "Refused reflection" }) },
        { setMood: JSON.stringify({ day, mood: "Good" }) }, { text: "Please correct the day." },
      );
      await turn(c, thread, userMessage("Save reflection and mood"), model, today);
      for (const target of ["2026-10-08", "2026-10-09", "2026-10-10"]) {
        assert.equal(await getJournalDay(c, target, db), null);
        assert.equal(await getMood(c, target, db), null);
      }
      const failed = (await threadMessages(c, thread, db))!.flatMap((m) => shownParts(m.parts)).filter((p) => "receipt" in p && p.receipt.startsWith("Couldn't"));
      assert.equal(failed.length, 2);
      for (const part of failed) assert.equal("href" in part, false);
      const toolResults = JSON.stringify(model.doStreamCalls[2]!.prompt);
      assert.match(toolResults, /error-text/);
      if (!today || today === "2026-02-29") assert.match(toolResults, /browser's Today/);
    }
  });

  test("Coach append operation conflicts on changed payload and stays scoped to its session owner", async () => {
    const c = await account(), d = await account();
    const data = coachData(db, "2026-10-09");
    const input = { day: "2026-10-09", today: "2026-10-09", text: "Original", source: "coach" as const, operationId: randomUUID() };
    const result = await data.appendJournal!(c, input);
    await assert.rejects(data.appendJournal!(c, { ...input, text: "Changed" }), /Conflict/);
    await assert.rejects(data.appendJournal!(c, { ...input, day: "2026-10-08" }), /Conflict/);
    assert.deepEqual(await data.appendJournal!(c, input), result);
    assert.equal((await getJournalDay(c, input.day, db))?.body, "Original");
    assert.equal(await getJournalDay(d, input.day, db), null);
    await data.appendJournal!(d, { ...input, text: "Other person's reflection" });
    assert.equal((await getJournalDay(c, input.day, db))?.body, "Original");
  });

  test("Journal and Mood writes ignore model identity and cannot reach another person's day", async () => {
    const c = await account(), d = await account();
    const thread = await coachThread(c, db);
    await saveJournalDay(d, "2026-10-09", "Private reflection", 0, "2026-10-09", db);
    await setMood(d, { day: "2026-10-09", today: "2026-10-09", mood: "Low", setAt: 1 }, db);
    const model = scripted(
      { appendJournal: JSON.stringify({ text: "Mine", userId: d, messageId: randomUUID(), operationId: "forged", today: "2026-10-10" }) },
      { setMood: JSON.stringify({ mood: "Good", userId: d, setAt: 253_402_300_799_999 }) }, { text: "Saved." },
    );
    await turn(c, thread, userMessage("Append Mine and set mood Good"), model);
    assert.equal((await getJournalDay(c, "2026-10-09", db))?.body, "Mine");
    assert.equal(await getMood(c, "2026-10-09", db), "Good");
    assert.equal((await getJournalDay(d, "2026-10-09", db))?.body, "Private reflection");
    assert.equal(await getMood(d, "2026-10-09", db), "Low");
    assert.ok(!promptText(model).includes("Private reflection"));
    assert.deepEqual(await turn(d, thread, userMessage("Append"), model), { refused: 404 });
  });

  test("parallel Task, Journal and Mood calls share the three-write cap before awaiting", async () => {
    for (const fourthTool of ["appendJournal", "setMood"]) {
      const c = await account();
      const thread = await coachThread(c, db);
      let step = 0;
      const calls = [
        ["createTask", { name: "One" }],
        ["appendJournal", { text: "Accepted reflection" }],
        ["setMood", { mood: "Good" }],
        [fourthTool, fourthTool === "appendJournal" ? { text: "Fourth reflection" } : { mood: "Low" }],
      ] as const;
      const model = new MockLanguageModelV4({ doStream: async () => {
        if (step++ > 0) return { stream: simulateReadableStream({ chunks: [
          { type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "Capped." }, { type: "text-end", id: "t" }, finish,
        ] }) };
        return { stream: simulateReadableStream({ chunks: [
          ...calls.map(([toolName, input], i) => ({ type: "tool-call" as const, toolCallId: `parallel_${i}`, toolName, input: JSON.stringify(input) })),
          { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
        ] }) };
      } });
      const info = mock.method(console, "info", () => {});
      try { await turn(c, thread, userMessage("Save these four things"), model); }
      finally { info.mock.restore(); }
      assert.equal((await openTasks(c, db)).length, 1);
      assert.equal((await getJournalDay(c, "2026-10-09", db))?.body, "Accepted reflection");
      assert.equal(await getMood(c, "2026-10-09", db), "Good");
      assert.ok(receiptsOf(await threadMessages(c, thread, db))!.includes(fourthTool === "appendJournal" ? "Couldn't append to that Journal day" : "Couldn't set that mood"));
      const log = JSON.parse(String(info.mock.calls.find((call) => String(call.arguments[0]).includes("coach.turn"))!.arguments[0]));
      assert.equal(log.toolCalls.createTask, 1);
      assert.equal(log.toolCalls.appendJournal, fourthTool === "appendJournal" ? 2 : 1);
      assert.equal(log.toolCalls.setMood, fourthTool === "setMood" ? 2 : 1);
    }
  });

  test("concurrent changed-message resends cannot reuse one identity for two reflections", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const id = randomUUID();
    let reads = 0;
    let release!: () => void;
    const bothRead = new Promise<void>((resolve) => { release = resolve; });
    const data = { ...coachData(db, "2026-10-09"), listOpenTasks: async () => {
      if (++reads === 2) release();
      await bothRead;
      return [];
    } };
    const results = await Promise.all(["First", "Changed"].map((text) => turn(c, thread, userMessage(`Append ${text}`, id), scripted(
      { appendJournal: JSON.stringify({ text }) }, { text: "Saved." },
    ), "2026-10-09", data)));
    assert.equal(results.filter((result) => "refused" in result && result.refused === 409).length, 1);
    assert.ok(["First", "Changed"].includes((await getJournalDay(c, "2026-10-09", db))!.body));
  });

  test("a saved turn reloads, and the next turn sees the earlier ones", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    assert.deepEqual(await threadMessages(c, thread, db), []);
    await turn(c, thread, userMessage("Hi"), replying("Hello there."));
    assert.equal(await coachThread(c, db), thread);
    assert.deepEqual(textOf(await threadMessages(c, thread, db)), [
      ["user", "Hi"],
      ["assistant", "Hello there."],
    ]);
    const model = replying("Try the dentist first.");
    await turn(c, thread, userMessage("What next?"), model);
    assert.deepEqual(textOf(await threadMessages(c, thread, db)), [
      ["user", "Hi"],
      ["assistant", "Hello there."],
      ["user", "What next?"],
      ["assistant", "Try the dentist first."],
    ]);
    const prompt = JSON.stringify(model.doStreamCalls[0]!.prompt);
    assert.ok(prompt.includes("Hi") && prompt.includes("Hello there."));
  });

  test("the reply is saved even when the browser stops reading", async () => {
    const thread = await coachThread(a, db);
    const before = (await threadMessages(a, thread, db))!.length;
    const result = await coachTurn({
      userId: a,
      threadId: thread,
      message: userMessage("Closing the tab"),
      model: replying("This reply keeps going after the tab closes."),
      db,
    });
    assert.ok(!("refused" in result));
    const reader = result.stream.getReader();
    await reader.read();
    await reader.cancel();
    await result.saved;
    const saved = textOf(await threadMessages(a, thread, db))!.slice(before);
    assert.deepEqual(saved, [
      ["user", "Closing the tab"],
      ["assistant", "This reply keeps going after the tab closes."],
    ]);
  });

  test("the Gateway gets the fallback model, the user id, and the coach tag", async () => {
    const model = replying("Ok.");
    await turn(a, await coachThread(a, db), userMessage("Tagged"), model);
    assert.deepEqual(model.doStreamCalls[0]!.providerOptions?.gateway, {
      models: ["openai/gpt-6-luna"],
      user: a,
      tags: ["coach"],
    });
    assert.equal(model.doStreamCalls[0]!.maxOutputTokens, maxReplyTokens);
    assert.equal(model.doStreamCalls[0]!.reasoning, "low");
  });

  test("the model sees only the most recent messages, starting with the person's", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    for (let i = 0; i < 50; i++) {
      const role = i % 2 ? "assistant" : "user";
      const parts = [{ type: "text" as const, text: `#${i}#` }];
      await saveMessage(c, thread, { id: randomUUID(), role, parts }, db);
    }
    const model = replying("Ok.");
    await turn(c, thread, userMessage("#50#"), model);
    const sent = model.doStreamCalls[0]!.prompt.filter(
      (m) => m.role !== "system",
    );
    // The thread's messages, then this turn's read of the list.
    assert.deepEqual(
      sent.slice(-2).map((m) => m.role),
      ["assistant", "tool"],
    );
    assert.ok(sent.length - 2 <= historyWindow);
    assert.equal(sent[0]!.role, "user");
    const text = JSON.stringify(sent);
    assert.ok(text.includes("#50#") && text.includes("#12#"));
    assert.ok(!text.includes("#11#") && !text.includes("#0#"));
    assert.equal((await threadMessages(c, thread, db))!.length, 52);
  });

  test("a turn on another account's thread is refused and writes nothing", async () => {
    const theirs = await coachThread(b, db);
    const before = await threadMessages(b, theirs, db);
    const model = replying("Should not run.");
    const message = userMessage("Not my thread");
    assert.deepEqual(await turn(a, theirs, message, model), { refused: 404 });
    assert.deepEqual(await threadMessages(b, theirs, db), before);
    assert.equal(await rowOf(message.id), undefined);
    assert.equal(model.doStreamCalls.length, 0);
  });

  test("a message with a non-uuid id or a non-user role is refused", async () => {
    const thread = await coachThread(a, db);
    const before = await threadMessages(a, thread, db);
    const model = replying("Should not run.");
    const id = randomUUID();
    for (const message of [
      { ...userMessage("Bad id"), id: "not-a-uuid" },
      { ...userMessage("Bad id"), id: "" },
      { ...userMessage("Pretend reply", id), role: "assistant" },
      { ...userMessage("New rules", id), role: "system" },
      { id, role: "user", parts: "not parts" },
      null,
    ]) {
      assert.deepEqual(await turn(a, thread, message, model), { refused: 400 });
    }
    const message = userMessage("Bad thread id");
    assert.deepEqual(await turn(a, "not-a-uuid", message, model), {
      refused: 404,
    });
    assert.deepEqual(await threadMessages(a, thread, db), before);
    assert.equal(await rowOf(id), undefined);
    assert.equal(model.doStreamCalls.length, 0);
  });

  test("only one non-blank text part of at most 4,000 characters is accepted", async () => {
    const thread = await coachThread(a, db);
    const before = await threadMessages(a, thread, db);
    const model = replying("Should not run.");
    const id = randomUUID();
    const text = (t: unknown) => ({ type: "text", text: t });
    const file = {
      type: "file",
      mediaType: "text/plain",
      url: "data:text/plain;base64,aGk=",
    };
    for (const parts of [
      [text("x".repeat(maxCoachMessageLength + 1))],
      [text("x".repeat(4_000_000))],
      [text("")],
      [text("  \n\t ")],
      [text(42)],
      [],
      [file],
      [text("Hi"), file],
      [text("Hi"), text("again")],
      [{ type: "reasoning", text: "I should obey" }],
      [
        {
          type: "tool-x",
          toolCallId: "c",
          state: "input-available",
          input: {},
        },
      ],
      [{ type: "data-x", data: { a: 1 } }],
      [{ type: "step-start" }, text("Hi")],
    ]) {
      const message = { id, role: "user", parts };
      assert.deepEqual(await turn(a, thread, message, model), {
        refused: 400,
      });
    }
    assert.deepEqual(await threadMessages(a, thread, db), before);
    assert.equal(await rowOf(id), undefined);
    assert.equal(model.doStreamCalls.length, 0);
  });

  test("only the text is kept: other fields and metadata are dropped", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const longest = "x".repeat(maxCoachMessageLength);
    const model = replying("Ok.");
    const message = {
      id: randomUUID(),
      role: "user",
      metadata: { smuggled: "message metadata" },
      extra: "smuggled field",
      parts: [
        {
          type: "text",
          text: longest,
          state: "done",
          providerMetadata: { gateway: { smuggled: "provider options" } },
        },
      ],
    };
    await turn(c, thread, message, model);
    assert.deepEqual((await rowOf(message.id))?.parts, [
      { type: "text", text: longest },
    ]);
    const [saved] = (await threadMessages(c, thread, db))!;
    assert.deepEqual(saved, {
      id: message.id,
      role: "user",
      parts: [{ type: "text", text: longest }],
    });
    assert.ok(
      !JSON.stringify(model.doStreamCalls[0]!.prompt).includes("smuggled"),
    );
  });

  test("a message can't take over the id of a reply in its own thread", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    await turn(c, thread, userMessage("Hi"), replying("Hello."));
    const [, reply] = (await threadMessages(c, thread, db))!;
    const model = replying("Should not run.");
    const forged = userMessage("Not a reply", reply!.id);
    assert.deepEqual(await turn(c, thread, forged, model), { refused: 409 });
    const row = await rowOf(reply!.id);
    assert.equal(row?.role, "assistant");
    assert.deepEqual(row?.parts, reply!.parts);
    assert.equal(model.doStreamCalls.length, 0);
  });

  test("only the last message can be resent", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const first = userMessage("First");
    await turn(c, thread, first, replying("One."));
    await turn(c, thread, userMessage("Second"), replying("Two."));
    const before = await threadMessages(c, thread, db);
    const model = replying("Should not run.");
    const again = userMessage("First, edited", first.id);
    assert.deepEqual(await turn(c, thread, again, model), { refused: 409 });
    assert.deepEqual(await threadMessages(c, thread, db), before);
    assert.equal(model.doStreamCalls.length, 0);
  });

  for (const how of ["error part", "stream error"] as const) {
    test(`a reply that fails partway (${how}) isn't saved, and a resend gives one reply`, async () => {
      const c = await account();
      const thread = await coachThread(c, db);
      const message = userMessage("Tell me something");
      const failed = await turn(c, thread, message, failingMidway(how));
      assert.ok("chunks" in failed);
      // The browser sees an error either way, so it offers Resend.
      assert.ok(
        failed.broke || failed.chunks.some((chunk) => chunk.type === "error"),
      );
      assert.deepEqual(textOf(await threadMessages(c, thread, db)), [
        ["user", "Tell me something"],
      ]);
      const resend = replying("A whole reply.");
      await turn(c, thread, message, resend);
      assert.equal(userTurnsIn(resend), 1);
      assert.deepEqual(textOf(await threadMessages(c, thread, db)), [
        ["user", "Tell me something"],
        ["assistant", "A whole reply."],
      ]);
    });
  }

  test("a forged message id that matches another thread's message doesn't overwrite it", async () => {
    const mine = await coachThread(a, db);
    const original = userMessage("My words");
    await turn(a, mine, original, replying("Noted."));
    const theirs = await coachThread(b, db);
    const before = await threadMessages(b, theirs, db);
    const model = replying("Should not run.");
    const forged = userMessage("Overwritten", original.id);
    assert.deepEqual(await turn(b, theirs, forged, model), { refused: 409 });
    assert.deepEqual((await rowOf(original.id))?.parts, original.parts);
    assert.equal((await rowOf(original.id))?.threadId, mine);
    assert.deepEqual(await threadMessages(b, theirs, db), before);
    assert.equal(model.doStreamCalls.length, 0);
  });

  test("a failed turn keeps the message, saves no reply, and can be resent", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const message = userMessage("Are you there?");
    const failed = await turn(c, thread, message, failing());
    assert.ok("chunks" in failed);
    assert.ok(failed.chunks.some((chunk) => chunk.type === "error"));
    assert.deepEqual(textOf(await threadMessages(c, thread, db)), [
      ["user", "Are you there?"],
    ]);
    const resend = replying("Yes.");
    await turn(c, thread, message, resend);
    assert.equal(userTurnsIn(resend), 1);
    assert.deepEqual(textOf(await threadMessages(c, thread, db)), [
      ["user", "Are you there?"],
      ["assistant", "Yes."],
    ]);
  });

  test("a reply stopped before the first token is still saved in full", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const result = await coachTurn({
      userId: c,
      threadId: thread,
      message: userMessage("Stop now"),
      model: replying("The whole reply, written after Stop."),
      db,
    });
    assert.ok(!("refused" in result));
    const reader = result.stream.getReader();
    // Before any token. Not awaited: a tee branch's cancel waits for the
    // source to end, and the other branch is what saves the reply.
    void reader.cancel();
    await result.saved;
    assert.deepEqual(textOf(await threadMessages(c, thread, db)), [
      ["user", "Stop now"],
      ["assistant", "The whole reply, written after Stop."],
    ]);
  });

  test("a reply stopped in the browser still reloads before the next message", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const first = await coachTurn({
      userId: c,
      threadId: thread,
      message: userMessage("First"),
      model: replying("Slow first answer that keeps going", 60),
      db,
    });
    assert.ok(!("refused" in first));
    const reader = first.stream.getReader();
    await reader.read();
    // Stop. Not awaited: a tee branch's cancel waits for the source to end.
    void reader.cancel();
    await turn(c, thread, userMessage("Second"), replying("Second answer."));
    await first.saved;
    assert.deepEqual(textOf(await threadMessages(c, thread, db)), [
      ["user", "First"],
      ["assistant", "Slow first answer that keeps going"],
      ["user", "Second"],
      ["assistant", "Second answer."],
    ]);
  });

  test("a reply can't borrow the place of a message in another thread", async () => {
    const theirs = await coachThread(b, db);
    const early = userMessage("Their early message");
    await saveMessage(b, theirs, early, db);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const c = await account();
    const mine = await coachThread(c, db);
    await turn(c, mine, userMessage("Mine"), replying("Reply."));
    const reply = { id: randomUUID(), role: "assistant" as const, parts: [] };
    await saveMessage(c, mine, reply, db, early.id);
    // Saved at now(), not just after their message.
    assert.deepEqual(textOf(await threadMessages(c, mine, db)), [
      ["user", "Mine"],
      ["assistant", "Reply."],
      ["assistant", ""],
    ]);
  });

  test("a reply cut off by the token cap before any text isn't saved, and can be resent", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const message = userMessage("Plan my week");
    const failed = await turn(c, thread, message, cutOff());
    assert.ok("chunks" in failed);
    assert.ok(failed.chunks.some((chunk) => chunk.type === "error"));
    assert.ok(
      !failed.chunks.some((chunk) => chunk.type.startsWith("reasoning")),
    );
    assert.deepEqual(textOf(await threadMessages(c, thread, db)), [
      ["user", "Plan my week"],
    ]);
    const resend = replying("Start with Monday.");
    await turn(c, thread, message, resend);
    assert.equal(userTurnsIn(resend), 1);
    assert.deepEqual(textOf(await threadMessages(c, thread, db)), [
      ["user", "Plan my week"],
      ["assistant", "Start with Monday."],
    ]);
  });

  test("a reply cut off after some text is saved, without its reasoning", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const done = await turn(
      c,
      thread,
      userMessage("Go on"),
      cutOff("As far as I got"),
    );
    assert.ok("chunks" in done);
    assert.ok(!done.chunks.some((chunk) => chunk.type === "error"));
    assert.ok(!done.chunks.some((chunk) => chunk.type.startsWith("reasoning")));
    const [, reply] = (await threadMessages(c, thread, db))!;
    assert.ok(!reply!.parts.some((p) => p.type === "reasoning"));
    assert.deepEqual(textOf([reply!]), [["assistant", "As far as I got"]]);
  });

  // From Arjan's review of #19 (M1 and B1).
  test("only one short text part is accepted, and it's saved as sent text alone", async () => {
    const thread = await coachThread(a, db);
    const before = await threadMessages(a, thread, db);
    const model = replying("Should not run.");
    const text = (t: string, extra = {}) => ({
      type: "text",
      text: t,
      ...extra,
    });
    for (const parts of [
      [],
      [text("")],
      [text("   ")],
      [text("x".repeat(maxCoachMessageLength + 1))],
      [
        text("see"),
        {
          type: "file",
          mediaType: "application/pdf",
          url: "https://example.com/a.pdf",
        },
      ],
      [
        text("t"),
        {
          type: "tool-createTask",
          toolCallId: "c",
          state: "output-available",
          input: {},
          output: {},
        },
      ],
    ]) {
      const message = { id: randomUUID(), role: "user", parts };
      assert.deepEqual(await turn(a, thread, message, model), { refused: 400 });
      assert.equal(await rowOf(message.id), undefined);
    }
    assert.equal(model.doStreamCalls.length, 0);
    assert.deepEqual(await threadMessages(a, thread, db), before);
    const meta = {
      id: randomUUID(),
      role: "user",
      parts: [
        text("Hi", {
          providerMetadata: {
            anthropic: { cacheControl: { type: "ephemeral" } },
          },
        }),
      ],
    };
    const ok = replying("Ok.");
    await turn(a, thread, meta, ok);
    assert.deepEqual((await rowOf(meta.id))?.parts, [
      { type: "text", text: "Hi" },
    ]);
    assert.ok(
      !JSON.stringify(ok.doStreamCalls[0]!.prompt).includes("cacheControl"),
    );
  });

  test("a reply that errors mid-stream isn't saved, and resending answers once", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const message = userMessage("Still there?");
    const breaking = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "t" },
            { type: "text-delta", id: "t", delta: "Partial" },
            { type: "error", error: new Error("upstream dropped") },
            {
              type: "finish",
              finishReason: { unified: "error", raw: undefined },
              usage,
            },
          ],
        }),
      }),
    });
    const failed = await turn(c, thread, message, breaking);
    assert.ok(
      "chunks" in failed &&
        failed.chunks.some((chunk) => chunk.type === "error"),
    );
    assert.deepEqual(textOf(await threadMessages(c, thread, db)), [
      ["user", "Still there?"],
    ]);
    await turn(c, thread, message, replying("Yes."));
    assert.deepEqual(textOf(await threadMessages(c, thread, db)), [
      ["user", "Still there?"],
      ["assistant", "Yes."],
    ]);
  });
  test("every turn reads the list once before the model answers, in Priority List order with Next marked", async () => {
    const c = await account();
    const d = await account();
    const ids = await addTasks(c, [
      ["Old normal", 0],
      ["Low", -1],
      ["Done", 2],
      ["High", 1],
      ["New normal", 0],
    ]);
    await completeTask(c, ids.Done!, db);
    await addTasks(d, [["Someone else's", 2]]);
    const thread = await coachThread(c, db);
    // The model never calls the tool itself.
    const model = replying("Do High first.");
    await turn(c, thread, userMessage("What should I do next?"), model);
    const reloaded = await threadMessages(c, thread, db);
    assert.deepEqual(
      listedIn(reloaded)?.tasks.map((t) => [t.name, t.isNext]),
      [
        ["High", true],
        ["Old normal", false],
        ["New normal", false],
        ["Low", false],
      ],
    );
    assert.deepEqual(receiptsOf(reloaded), ["Read your list (4 open)"]);
    // OpenAI (the fallback) refuses tool-call ids over 40 characters.
    const { toolCallId } = readIn(reloaded)!;
    assert.ok(toolCallId.length <= 40, toolCallId);
    assert.deepEqual(textOf(reloaded), [
      ["user", "What should I do next?"],
      ["assistant", "Do High first."],
    ]);
    // The model's one step already had the list, and nothing of d's.
    assert.equal(model.doStreamCalls.length, 1);
    const prompt = promptText(model);
    assert.ok(prompt.includes('"open":4') && prompt.includes("High"));
    assert.ok(prompt.includes("Today is 2026-10-09."));
    assert.ok(!prompt.includes("Someone else"));
  });

  test("an old thread reaches the model as alternating text, then this turn's read", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const listed = (open: number) => ({
      open,
      tasks: open
        ? [{ id: randomUUID(), name: "Alpha", priority: 0, isNext: true }]
        : [],
    });
    const read = (toolCallId: string, open: number) => ({
      type: "tool-listArea" as const,
      toolCallId,
      state: "output-available" as const,
      input: {},
      output: listed(open),
    });
    const step = { type: "step-start" as const };
    const text = (t: string) => ({
      type: "text" as const,
      text: t,
      state: "done" as const,
    });
    // Saved as earlier heads saved them.
    const old: UIMessage["parts"][] = [
      // Before #20: text only.
      [text("Hi")],
      [step, text("Hello. What's on your mind?")],
      // 80210aa: the model read the list, then answered.
      [text("What should I do next?")],
      [step, read("toolu_a", 1), step, text("Do Alpha first.")],
      // 7caee41: two reads in one reply, and an empty text part.
      [text("What's on my list?")],
      [step, read("toolu_b", 1), step, read("toolu_c", 1), step, text("")],
      // Receipts only: a refused read.
      [text("Again?")],
      [
        step,
        {
          type: "tool-listArea",
          toolCallId: "toolu_d",
          state: "output-error",
          input: ["not", "an", "object"],
          errorText: "Invalid input",
        },
      ],
      // Text around a read in one reply.
      [text("And then?")],
      [step, text("Let me look."), read("toolu_e", 1), step, text("Alpha.")],
      // Two assistant replies in a row (the user message between them never
      // saved): textOnly must join them, not leave consecutive assistants.
      [text("Say more")],
      [step, text("First answer.")],
      [step, text("Second answer.")],
      // A message whose reply failed, so the next one follows it.
      [text("Lost reply")],
    ];
    for (const parts of old) {
      const role = parts.some((p) => p.type === "step-start")
        ? "assistant"
        : "user";
      await saveMessage(c, thread, { id: randomUUID(), role, parts }, db);
    }
    const model = replying("Your list is empty.");
    const done = await turn(
      c,
      thread,
      userMessage("What's on my list now?"),
      model,
    );
    assert.ok("chunks" in done && !done.broke);

    const sent = model.doStreamCalls[0]!.prompt.filter(
      (m) => m.role !== "system",
    );
    const history = sent.slice(0, -2);
    // Alternating, from the person, ending with the person.
    assert.deepEqual(
      history.map((m) => m.role),
      [
        "user",
        "assistant",
        "user",
        "assistant",
        "user",
        "assistant",
        "user",
        "assistant",
        "user",
      ],
    );
    for (const m of history) {
      assert.ok(
        Array.isArray(m.content) && m.content.length,
        JSON.stringify(m),
      );
      for (const part of m.content as { type: string; text?: string }[]) {
        assert.equal(part.type, "text", JSON.stringify(m));
        assert.ok(part.text?.trim(), JSON.stringify(m));
      }
    }
    // Consecutive assistant replies were joined into one turn.
    assert.deepEqual(
      (history.at(-2)!.content as { text: string }[]).map((p) => p.text),
      ["First answer.", "Second answer."],
    );
    // The failed reply's message and the new one are one turn of the person's.
    assert.deepEqual(
      (history.at(-1)!.content as { text: string }[]).map((p) => p.text),
      ["Lost reply", "What's on my list now?"],
    );
    // Then this turn's read: one listArea call and its result, nothing older.
    const [call, result] = sent.slice(-2);
    assert.equal(call!.role, "assistant");
    assert.equal(result!.role, "tool");
    const tail = JSON.stringify([call, result]);
    // The model is told what the read is; the saved receipt isn't (see "an
    // empty list is read as empty").
    assert.ok(tail.includes(`"note":"The person's list right now."`), tail);
    assert.ok(
      tail.includes('"toolCallId":"read_') && tail.includes('"open":0'),
    );
    assert.ok(!JSON.stringify(history).includes("toolu_"));
    writeToolsOffered(model.doStreamCalls[0]!);
  });

  test("a failed turn logs one coach.turn.error line with safe metadata and status, and nothing private", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw new APICallError({
          message: `${"x".repeat(350)}: Expected thinking`,
          url: "https://ai-gateway.vercel.sh/v3/ai/language-model",
          requestBodyValues: { secret: "What's on my list?" },
          statusCode: 400,
          isRetryable: false,
        });
      },
    });
    const error = mock.method(console, "error", () => {});
    try {
      await turn(c, thread, userMessage("What's on my list?"), model);
    } finally {
      error.mock.restore();
    }
    const lines = error.mock.calls.map((call) =>
      call.arguments.map(String).join(" "),
    );
    assert.deepEqual(
      lines.map((line) => JSON.parse(line)),
      [
        {
          event: "coach.turn.error",
          threadId: thread,
          model: "mock-model-id",
          error: "AI_APICallError",
          status: 400,
        },
      ],
    );
    assert.equal(JSON.parse(lines[0]!).message, undefined);
    assert.ok(!lines[0]!.includes("Expected thinking"));
    for (const secret of [c, "What's on my list?"]) {
      assert.ok(!lines[0]!.includes(secret), secret);
    }
  });

  test("a failed read writes nothing and doesn't run the model", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const model = replying("Should not run.");
    const message = userMessage("What's on my list?");
    const data = {
      listOpenTasks: () => Promise.reject(new Error("database down")),
      ...unusedWrites,
    };
    const error = mock.method(console, "error", () => {});
    try {
      await assert.rejects(
        coachTurn({ userId: c, threadId: thread, message, model, db, data }),
        /The list couldn't be read\./,
      );
    } finally {
      error.mock.restore();
    }
    const logged = error.mock.calls.map((call) =>
      call.arguments.map(String).join(" "),
    );
    assert.ok(
      logged.some((line) => {
        try {
          const entry = JSON.parse(line);
          return entry.event === "coach.tool.error" && entry.error === "Error";
        } catch {
          return false;
        }
      }),
      logged.join("\n"),
    );
    assert.ok(!logged.join("\n").includes("database down"));
    assert.equal(model.doStreamCalls.length, 0);
    assert.equal(await rowOf(message.id), undefined);
  });

  test("an empty list is read as empty", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    await turn(
      c,
      thread,
      userMessage("What's on my list?"),
      replying("Your list is empty."),
    );
    const reloaded = await threadMessages(c, thread, db);
    assert.deepEqual(listedIn(reloaded), { open: 0, tasks: [] });
    assert.deepEqual(receiptsOf(reloaded), ["Read your list (0 open)"]);
  });

  test("after the list is emptied, the next turn answers from a fresh read, not the earlier one", async () => {
    const c = await account();
    const ids = await addTasks(c, [
      ["Alpha", 0],
      ["Beta", 0],
      ["Gamma", 0],
    ]);
    const thread = await coachThread(c, db);
    await turn(
      c,
      thread,
      userMessage("What's on my list?"),
      replying("Three."),
    );
    for (const id of Object.values(ids)) await completeTask(c, id, db);
    for (let i = 0; i < 3; i++) {
      const model = replying("It's empty.");
      await turn(c, thread, userMessage("What's on my list?"), model);
      const prompt = promptText(model);
      assert.ok(prompt.includes('"open":0'), "the fresh read");
      assert.ok(!prompt.includes('"open":3'), "no earlier read");
      assert.ok(!prompt.includes("Alpha"), "no completed Task");
    }
    assert.deepEqual(receiptsOf(await threadMessages(c, thread, db)), [
      "Read your list (3 open)",
      "Read your list (0 open)",
      "Read your list (0 open)",
      "Read your list (0 open)",
    ]);
  });

  test("write tools stay offered, and the loop still stops after 8 model steps", async () => {
    const c = await account();
    await addTasks(c, [["One", 0]]);
    const thread = await coachThread(c, db);
    // A model that calls the tool anyway, every step.
    const model = scripted({ listArea: "{}" });
    await turn(c, thread, userMessage("Keep reading my list"), model);
    assert.equal(model.doStreamCalls.length, 8);
    const calls = model.doStreamCalls;
    for (const [i, call] of calls.entries()) {
      writeToolsOffered(call, { last: i === calls.length - 1 });
    }
    assert.deepEqual(
      receiptsOf(await threadMessages(c, thread, db)),
      Array(9).fill("Read your list (1 open)"),
    );
  });

  test("a tool call the model gets wrong is saved as a refused receipt", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const model = scripted(
      { listArea: JSON.stringify(["not", "an", "object"]) },
      { text: "I couldn't read that." },
    );
    const done = await turn(c, thread, userMessage("What's next?"), model);
    assert.ok("chunks" in done && !done.broke);
    const reloaded = await threadMessages(c, thread, db);
    assert.deepEqual(receiptsOf(reloaded), [
      "Read your list (0 open)",
      "Couldn't read your list",
    ]);
    assert.deepEqual(textOf(reloaded)?.at(-1), [
      "assistant",
      "I couldn't read that.",
    ]);
    // The thread still takes the next turn.
    await turn(c, thread, userMessage("Try again"), replying("Ok."));
    assert.equal((await threadMessages(c, thread, db))!.length, 4);
  });

  test("a saved tool part that doesn't fit its tool still gets a reply", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    await saveMessage(c, thread, userMessage("Earlier"), db);
    await saveMessage(
      c,
      thread,
      {
        id: randomUUID(),
        role: "assistant",
        parts: [
          {
            type: "tool-listArea",
            toolCallId: "call_x",
            state: "output-available",
            // listArea's input is {}, so a string fails validation.
            input: "everyone's tasks",
            output: { open: 0, tasks: [] },
          },
          {
            type: "text",
            text: "I looked.",
            state: "done",
          },
        ],
      },
      db,
    );
    const model = replying("Still here.");
    const error = mock.method(console, "error", () => {});
    let done;
    try {
      done = await turn(c, thread, userMessage("Next?"), model);
    } finally {
      error.mock.restore();
    }
    assert.ok("chunks" in done && !done.broke);
    assert.equal(model.doStreamCalls.length, 1);
    const logged = error.mock.calls.map((call) =>
      call.arguments.map(String).join(" "),
    );
    const invalid = logged.flatMap((line) => {
      try {
        const entry = JSON.parse(line);
        return entry.event === "coach.history.invalid" ? [entry] : [];
      } catch {
        return [];
      }
    });
    assert.equal(invalid.length, 1, logged.join("\n"));
    assert.equal(invalid[0].error, "AI_TypeValidationError");
    assert.match(invalid[0].message, /messages\[/);
    assert.ok(!invalid[0].message.includes("Value:"));
    assert.ok(!logged.join("\n").includes("everyone's tasks"));
    // The bad tool part is out of the model's view; the earlier text remains.
    const history = model.doStreamCalls[0]!.prompt.filter(
      (m) => m.role !== "system",
    );
    assert.ok(!JSON.stringify(history).includes("everyone's tasks"));
    assert.ok(JSON.stringify(history).includes("I looked."));
    assert.deepEqual(textOf(await threadMessages(c, thread, db))?.at(-1), [
      "assistant",
      "Still here.",
    ]);
  });

  test("createTask adds a Task with Coach provenance from the message id", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const message = userMessage("Add call dentist");
    const model = scripted(
      {
        createTask: JSON.stringify({ name: "Call dentist" }),
        toolCallId: "call_create_1",
      },
      { text: "Added." },
    );
    await turn(c, thread, message, model);
    const open = await openTasks(c, db);
    assert.equal(open.length, 1);
    assert.equal(open[0]!.name, "Call dentist");
    const [row] = await db
      .select({ source: tasks.source, sourceId: tasks.sourceId })
      .from(tasks)
      .where(eq(tasks.id, open[0]!.id));
    assert.deepEqual(row, {
      source: "coach",
      sourceId: coachCreateSourceId(message.id, "Call dentist"),
    });
    const reloaded = await threadMessages(c, thread, db);
    assert.deepEqual(receiptsOf(reloaded), [
      "Read your list (0 open)",
      "Created task 'Call dentist'",
    ]);
    const createPart = reloaded!
      .flatMap((m) => m.parts)
      .find((p) => p.type === "tool-createTask") as {
      output?: { id?: string; name?: string };
    };
    assert.equal(createPart?.output?.id, open[0]!.id);
    assert.equal(createPart?.output?.name, "Call dentist");
    const created = reloaded!.flatMap((m) => shownParts(m.parts)).find((part) => "href" in part && part.receipt === "Created task 'Call dentist'");
    assert.equal(created && "href" in created ? created.href : null, taskHref(open[0]!.id));
  });

  test("two messages that create the same name each add a Task", async () => {
    // Provenance is message id + name, not the tool-call id: a second ask
    // is a new Task. Same-message resend is covered separately.
    const c = await account();
    const thread = await coachThread(c, db);
    const input = {
      createTask: JSON.stringify({ name: "Same" }),
      toolCallId: "call_same",
    };
    await turn(
      c,
      thread,
      userMessage("Add same"),
      scripted(input, { text: "Ok." }),
    );
    await turn(
      c,
      thread,
      userMessage("Add same again"),
      scripted(input, { text: "Still ok." }),
    );
    assert.equal((await openTasks(c, db)).length, 2);
    assert.deepEqual(receiptsOf(await threadMessages(c, thread, db)), [
      "Read your list (0 open)",
      "Created task 'Same'",
      "Read your list (1 open)",
      "Created task 'Same'",
    ]);
  });

  test("a refused createTask name adds nothing and shows a refused receipt", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    await turn(
      c,
      thread,
      userMessage("Add blank"),
      scripted(
        { createTask: JSON.stringify({ name: "   " }), toolCallId: "call_bad" },
        { text: "Couldn't." },
      ),
    );
    assert.equal((await openTasks(c, db)).length, 0);
    assert.deepEqual(receiptsOf(await threadMessages(c, thread, db)), [
      "Read your list (0 open)",
      "Couldn't create that task",
    ]);
  });

  test("a fourth parallel createTask in one step is refused by the per-turn cap", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const names = ["One", "Two", "Three", "Four"];
    // Local step counter: MockLanguageModelV4 records doStreamCalls before
    // doStream runs, so length === 0 is never true inside the handler.
    let step = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        step += 1;
        // First call: four createTask tool calls in one step.
        if (step === 1) {
          return {
            stream: simulateReadableStream({
              chunks: [
                ...names.map((name, i) => ({
                  type: "tool-call" as const,
                  toolCallId: `call_${i}`,
                  toolName: "createTask",
                  input: JSON.stringify({ name }),
                })),
                {
                  type: "finish" as const,
                  finishReason: {
                    unified: "tool-calls" as const,
                    raw: undefined,
                  },
                  usage,
                },
              ],
            }),
          };
        }
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "text-start" as const, id: "t" },
              { type: "text-delta" as const, id: "t", delta: "Capped." },
              { type: "text-end" as const, id: "t" },
              {
                type: "finish" as const,
                finishReason: { unified: "stop" as const, raw: undefined },
                usage,
              },
            ],
          }),
        };
      },
    });
    await turn(c, thread, userMessage("Add four"), model);
    const open = (await openTasks(c, db)).map((t) => t.name).sort();
    assert.deepEqual(open, ["One", "Three", "Two"]);
    const receipts = receiptsOf(await threadMessages(c, thread, db))!;
    assert.equal(
      receipts.filter((r) => r.startsWith("Created task")).length,
      3,
    );
    assert.ok(receipts.includes("Couldn't create that task"));
  });

  test("completeTask completes the person's Task and moves Next when needed", async () => {
    const c = await account();
    const ids = await addTasks(c, [
      ["First", 2],
      ["Second", 0],
    ]);
    // Highest priority is Next.
    const thread = await coachThread(c, db);
    await turn(
      c,
      thread,
      userMessage("Complete first"),
      scripted(
        {
          completeTask: JSON.stringify({ taskId: ids.First }),
          toolCallId: "call_done",
        },
        { text: "Done." },
      ),
    );
    const open = await openTasks(c, db);
    assert.deepEqual(
      open.map((t) => t.name),
      ["Second"],
    );
    assert.deepEqual(receiptsOf(await threadMessages(c, thread, db)), [
      "Read your list (2 open)",
      "Completed 'First'",
    ]);
  });

  test("completeTask returns not found for another account, completed, or missing id", async () => {
    const c = await account();
    const d = await account();
    const mine = await addTasks(c, [["Mine", 0]]);
    const theirs = await addTasks(d, [["Theirs", 0]]);
    await completeTask(c, mine.Mine!, db);
    const thread = await coachThread(c, db);
    for (const [label, taskId] of [
      ["theirs", theirs.Theirs!],
      ["done", mine.Mine!],
      ["missing", randomUUID()],
    ] as const) {
      await turn(
        c,
        thread,
        userMessage(`Complete ${label}`),
        scripted(
          {
            completeTask: JSON.stringify({ taskId }),
            toolCallId: `call_${label}`,
          },
          { text: "Not found." },
        ),
      );
    }
    assert.equal((await openTasks(c, db)).length, 0);
    assert.equal((await openTasks(d, db)).length, 1);
    const receipts = receiptsOf(await threadMessages(c, thread, db))!;
    assert.equal(
      receipts.filter((r) => r === "Couldn't find that task").length,
      3,
    );
  });

  test("a second completeTask in one turn completes nothing on the second call", async () => {
    const c = await account();
    const ids = await addTasks(c, [
      ["A", 2],
      ["B", 0],
    ]);
    const thread = await coachThread(c, db);
    await turn(
      c,
      thread,
      userMessage("Complete everything"),
      scripted(
        {
          completeTask: JSON.stringify({ taskId: ids.A }),
          toolCallId: "call_1",
        },
        {
          completeTask: JSON.stringify({ taskId: ids.B }),
          toolCallId: "call_2",
        },
        { text: "Only one." },
      ),
    );
    const open = await openTasks(c, db);
    assert.deepEqual(
      open.map((t) => t.name),
      ["B"],
    );
    const receipts = receiptsOf(await threadMessages(c, thread, db))!;
    assert.ok(receipts.includes("Completed 'A'"));
    assert.ok(
      receipts.includes("Couldn't complete that task") ||
        receipts.includes("Couldn't find that task"),
    );
  });

  test("a resend after a failed turn does not duplicate a Coach-created Task", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const message = userMessage("Add Call dentist");
    // Create, then fail the reply so nothing is saved and the person resends.
    let step = 0;
    const failingAfterCreate = new MockLanguageModelV4({
      doStream: async () => {
        step += 1;
        if (step === 1) {
          return {
            stream: simulateReadableStream({
              chunks: [
                {
                  type: "tool-call",
                  toolCallId: "call_first",
                  toolName: "createTask",
                  input: JSON.stringify({ name: "Call dentist" }),
                },
                {
                  type: "finish",
                  finishReason: { unified: "tool-calls", raw: undefined },
                  usage,
                },
              ],
            }),
          };
        }
        throw new Error("Gateway unavailable");
      },
    });
    await turn(c, thread, message, failingAfterCreate);
    assert.equal((await openTasks(c, db)).length, 1);
    // Resend the same message id with another create of the same name.
    await turn(
      c,
      thread,
      message,
      scripted(
        {
          createTask: JSON.stringify({ name: "Call dentist" }),
          toolCallId: "call_resend",
        },
        { text: "Already there." },
      ),
    );
    assert.equal((await openTasks(c, db)).length, 1);
    assert.ok(
      receiptsOf(await threadMessages(c, thread, db))!.includes(
        "Created task 'Call dentist'",
      ),
    );
  });

  test("createTask and createNote in one step share the per-turn cap", async () => {
    const c = await account();
    const book = await createNotebook(c, "Ideas", db);
    const thread = await coachThread(c, db);
    let step = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        step += 1;
        if (step === 1) {
          return {
            stream: simulateReadableStream({
              chunks: [
                ...["One", "Two"].map((name, i) => ({
                  type: "tool-call" as const,
                  toolCallId: `call_task_${i}`,
                  toolName: "createTask",
                  input: JSON.stringify({ name }),
                })),
                ...["Alpha", "Beta"].map((title, i) => ({
                  type: "tool-call" as const,
                  toolCallId: `call_note_${i}`,
                  toolName: "createNote",
                  input: JSON.stringify({
                    notebook: "Ideas",
                    title,
                    body: title,
                  }),
                })),
                {
                  type: "finish" as const,
                  finishReason: {
                    unified: "tool-calls" as const,
                    raw: undefined,
                  },
                  usage,
                },
              ],
            }),
          };
        }
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "text-start" as const, id: "t" },
              { type: "text-delta" as const, id: "t", delta: "Capped." },
              { type: "text-end" as const, id: "t" },
              {
                type: "finish" as const,
                finishReason: { unified: "stop" as const, raw: undefined },
                usage,
              },
            ],
          }),
        };
      },
    });
    await turn(c, thread, userMessage("Add four"), model);
    const open = (await openTasks(c, db)).map((t) => t.name).sort();
    const saved = (await listNotes(c, book.id, db)).map((n) => n.title).sort();
    assert.equal(open.length + saved.length, 3);
    assert.deepEqual(open, ["One", "Two"]);
    assert.deepEqual(saved, ["Alpha"]);
    const receipts = receiptsOf(await threadMessages(c, thread, db))!;
    assert.equal(
      receipts.filter(
        (r) => r.startsWith("Created task") || r.startsWith("Created Note"),
      ).length,
      3,
    );
    assert.ok(receipts.includes("Couldn't create that Note"));
  });

  test("a resend after a failed turn does not duplicate a Coach-created Note", async () => {
    const c = await account();
    const book = await createNotebook(c, "Ideas", db);
    const thread = await coachThread(c, db);
    const message = userMessage("Save meeting notes");
    const input = JSON.stringify({
      notebook: "Ideas",
      title: "Meeting",
      body: "Talked.",
    });
    let step = 0;
    const failingAfterCreate = new MockLanguageModelV4({
      doStream: async () => {
        step += 1;
        if (step === 1) {
          return {
            stream: simulateReadableStream({
              chunks: [
                {
                  type: "tool-call",
                  toolCallId: "call_first",
                  toolName: "createNote",
                  input,
                },
                {
                  type: "finish",
                  finishReason: { unified: "tool-calls", raw: undefined },
                  usage,
                },
              ],
            }),
          };
        }
        throw new Error("Gateway unavailable");
      },
    });
    await turn(c, thread, message, failingAfterCreate);
    assert.equal((await listNotes(c, book.id, db)).length, 1);
    await turn(
      c,
      thread,
      message,
      scripted(
        { createNote: input, toolCallId: "call_resend" },
        { text: "Already there." },
      ),
    );
    assert.equal((await listNotes(c, book.id, db)).length, 1);
    assert.ok(
      receiptsOf(await threadMessages(c, thread, db))!.includes(
        "Created Note 'Meeting'",
      ),
    );
  });

  test("unknown and ambiguous Notebook names are refused and write no Note", async () => {
    const c = await account();
    const ideas = await createNotebook(c, "Ideas", db);
    const clash = await createNotebook(c, "ideas", db);
    const thread = await coachThread(c, db);
    for (const [label, notebook] of [
      ["unknown", "Missing"],
      ["ambiguous", "Ideas"],
    ] as const) {
      await turn(
        c,
        thread,
        userMessage(`Save in ${label}`),
        scripted(
          {
            createNote: JSON.stringify({
              notebook,
              title: label,
              body: "",
            }),
            toolCallId: `call_${label}`,
          },
          { text: "Which notebook?" },
        ),
      );
    }
    assert.equal((await listNotes(c, ideas.id, db)).length, 0);
    assert.equal((await listNotes(c, clash.id, db)).length, 0);
    const reloaded = await threadMessages(c, thread, db);
    const receipts = receiptsOf(reloaded)!;
    assert.equal(
      receipts.filter((r) => r === "Couldn't create that Note").length,
      2,
    );
    const failed = reloaded!
      .flatMap((m) => shownParts(m.parts))
      .filter(
        (p) => "receipt" in p && p.receipt === "Couldn't create that Note",
      );
    assert.equal(failed.length, 2);
    for (const part of failed) {
      assert.equal("href" in part, false);
    }
  });

  test("a successful createNote receipt links to the Note after reload", async () => {
    const c = await account();
    const book = await createNotebook(c, "Ideas", db);
    const thread = await coachThread(c, db);
    const info = mock.method(console, "info", () => {});
    try {
      await turn(
        c,
        thread,
        userMessage("Save meeting notes"),
        scripted(
          { listNotebooks: "{}", toolCallId: "call_books" },
          {
            createNote: JSON.stringify({
              notebook: "ideas",
              title: "Meeting",
              body: "Talked.",
            }),
            toolCallId: "call_note",
          },
          { text: "Saved." },
        ),
      );
    } finally {
      info.mock.restore();
    }
    const [note] = await listNotes(c, book.id, db);
    assert.equal(note?.title, "Meeting");
    const reloaded = await threadMessages(c, thread, db);
    assert.ok(
      receiptsOf(reloaded)!.includes("Created Note 'Meeting'"),
    );
    const created = reloaded!.flatMap((m) => shownParts(m.parts)).find(
      (p) => "receipt" in p && p.receipt === "Created Note 'Meeting'",
    );
    assert.equal(
      created && "href" in created ? created.href : undefined,
      noteHref(book.id, note!.id),
    );
    const lines = info.mock.calls
      .map((call) => String(call.arguments[0]))
      .filter((line) => line.includes("coach.turn"));
    assert.equal(lines.length, 1);
    const entry = JSON.parse(lines[0]!);
    assert.equal(entry.toolCalls.listNotebooks, 1);
    assert.equal(entry.toolCalls.createNote, 1);
  });

  test("the last model step is not offered tools", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const model = scripted({ listArea: "{}" });
    await turn(c, thread, userMessage("Keep going"), model);
    assert.equal(model.doStreamCalls.length, 8);
    writeToolsOffered(model.doStreamCalls.at(-1)!, { last: true });
    writeToolsOffered(model.doStreamCalls[0]!);
  });

  test("convertToModelMessages needs the tools to keep a listArea part", async () => {
    const tools = coachTools({
      listOpenTasks: async () => [],
      ...unusedWrites,
    });
    const messages: UIMessage[] = [
      {
        id: randomUUID(),
        role: "assistant",
        parts: [
          {
            type: "tool-listArea",
            toolCallId: "call_keep",
            state: "output-available",
            input: {},
            output: { open: 0, tasks: [] },
          },
        ],
      },
    ];
    const withTools = await convertToModelMessages(messages, { tools });
    assert.deepEqual(
      withTools.map((m) => m.role),
      ["assistant", "tool"],
    );
    const call = withTools[0]!.content as { type: string; toolName: string }[];
    assert.equal(call[0]!.type, "tool-call");
    assert.equal(call[0]!.toolName, "listArea");
  });

  test("a finished turn logs one coach.turn line with its listArea reads, and nothing private", async () => {
    const c = await account();
    const thread = await coachThread(c, db);
    const info = mock.method(console, "info", () => {});
    try {
      await turn(c, thread, userMessage("Is my list empty?"), replying("Yes."));
      // A model that reads the list again anyway shows up as a second read.
      await turn(
        c,
        thread,
        userMessage("Sure?"),
        scripted({ listArea: "{}" }, { text: "It's empty." }),
      );
    } finally {
      info.mock.restore();
    }
    const lines = info.mock.calls
      .map((call) => String(call.arguments[0]))
      .filter((line) => line.includes("coach.turn"));
    assert.deepEqual(
      lines.map((line) => JSON.parse(line)),
      [
        { listArea: 1, steps: 1 },
        { listArea: 2, steps: 2 },
      ].map(({ listArea, steps }) => ({
        event: "coach.turn",
        threadId: thread,
        model: "mock-model-id",
        steps,
        toolCalls: {
          listArea,
          listInboxDrafts: 0,
          fileDraft: 0,
          listNotebooks: 0,
          createTask: 0,
          createNote: 0,
          appendJournal: 0,
          setMood: 0,
          completeTask: 0,
          scheduleTask: 0,
          updateTask: 0,
        },
        finishReason: "stop",
      })),
    );
    for (const secret of [
      c,
      "Is my list empty?",
      "Yes.",
      "It's empty.",
      '"open"',
    ]) {
      assert.ok(!lines.join("\n").includes(secret), secret);
    }
  });
});

test("appliedWritesBlock ignores readSkill parts", () => {
  const message = { id: "m", role: "assistant", parts: [
    { type: "tool-readSkill", toolCallId: "a", state: "output-available", input: { name: "habit-design" }, output: "# habit-design\n\nbody" },
    { type: "tool-readSkill", toolCallId: "b", state: "output-available", input: { name: "x" }, output: "unknown skill" },
  ] } as unknown as UIMessage;
  assert.equal(appliedWritesBlock([message]), "");
});

test("fake CoachData undo refusals return a neutral receipt and release their write slot; an applied undo uses one", async () => {
  const habitId = randomUUID();
  const context = { userId: randomUUID(), messageId: randomUUID(), today: "2026-10-09" };
  const refusals = [
    { reason: "changedSince" as const, count: 6, question: "'Water' has changed since my last update (now 6). What should the total be?", line: "'Water' has changed since (now 6)" },
    { reason: "nothingToUndo" as const, count: 0, question: "I have no update of mine to undo for 'Water' for today. What should the total be?", line: "Nothing to undo for 'Water' for today" },
  ];
  let calls = 0;
  const tools = coachTools({
    ...unusedWrites,
    listOpenTasks: async () => [],
    trackHabit: async (_userId, input) => {
      const refusal = refusals[calls++];
      if (refusal) return { refused: true, reason: refusal.reason, id: habitId, name: "Water", period: "day", day: input.day, action: "undo", count: refusal.count, question: refusal.question };
      return { id: habitId, name: "Water", period: "day", trackMode: "many", goalCount: 5, bad: false,
        day: input.day, action: input.action, count: 3, changed: true, previousCount: 8, undoes: randomUUID(), done: false, due: true, streak: null, record: null };
    },
  });
  const execute = async () => tools.trackHabit.execute!({ habitId, action: "undo" }, { context, toolCallId: randomUUID(), messages: [] });
  for (const refusal of refusals) {
    const output = await execute() as { refused?: boolean; question?: string };
    assert.equal(output.refused, true);
    assert.equal(output.question, refusal.question);
    const part = { type: "tool-trackHabit", toolCallId: randomUUID(), state: "output-available", output };
    assert.equal(receipt(part, context.today), refusal.line);
    const message = { id: "m", role: "assistant", parts: [part] } as unknown as UIMessage;
    assert.equal(appliedWritesBlock([message]), "");
    assert.match(checkedResultsBlock([message]), /Checked results in this thread \(nothing written\)/);
  }
  for (let i = 0; i < 3; i++) {
    const output = await execute();
    assert.equal(receipt({ type: "tool-trackHabit", state: "output-available", output }, context.today), "Undid 'Water' for today");
  }
  await assert.rejects(execute(), /only 3 .* writes per reply/);
  assert.equal(calls, 5);
});

test("a person-write refusal is a checked result, not an applied write or a failure", () => {
  const message = { id: "m", role: "assistant", parts: [
    { type: "tool-setPersonLastConnected", toolCallId: "a", state: "output-available", input: { name: "Ada" }, output: { refused: true, name: "Ada", question: "No person matches 'Ada'." } },
    { type: "tool-setPersonAgreedDay", toolCallId: "b", state: "output-available", input: { name: "Bo", day: "2026-11-01" }, output: { refused: true, name: "Bo", question: "An agreed day requires a rule." } },
  ] } as unknown as UIMessage;
  assert.equal(appliedWritesBlock([message]), "");
  const block = checkedResultsBlock([message]);
  assert.match(block, /- No change: asked about 'Ada'/);
  assert.match(block, /- No change: asked about 'Bo'/);
  assert.doesNotMatch(block, /Couldn't/);
});
