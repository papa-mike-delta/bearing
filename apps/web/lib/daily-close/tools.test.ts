import assert from "node:assert/strict";
import { test } from "node:test";
import { listHabits, type CoachData, type ListedHabit } from "@repo/coach";
import { z } from "zod";
import { coachTools } from "../coach-tools.ts";
import { dailyCloseToolNames } from "./prompt.ts";
import { closeTools } from "./tools.ts";

test("Daily close adds exactly the bound listHabits read and omits every habit write handler", async () => {
  const reads: [string, string][] = [];
  const rows: ListedHabit[] = [
    { id: "water", name: "Water", period: "day", trackMode: "many", goalCount: 3, bad: false, count: 2, done: false, streak: null, record: null },
    { id: "bad", name: "Cut down", period: "day", trackMode: "once", goalCount: null, bad: true, count: 0, done: false, streak: null, record: null },
  ];
  const data = { listHabits: async (userId: string, day: string) => { reads.push([userId, day]); return rows; } } as CoachData;
  const unreachable = () => assert.fail("A habit write must have no handler during Daily close");
  const allTools = { ...coachTools(data), createHabit: { ...coachTools(data).createHabit, execute: unreachable }, trackHabit: { ...coachTools(data).trackHabit, execute: unreachable } };
  const tools = closeTools(allTools, data, "owner", "2026-10-08", "message");
  const expected = ["appendJournal", "fileDraft", "finishDailyClose", "getJournalTemplate", "listHabits", "listInboxDrafts", "listNotebooks", "readJournalDay", "readJournalingArticle", "setMood"];
  assert.deepEqual([...dailyCloseToolNames].sort(), expected);
  assert.deepEqual(Object.keys(tools).sort(), expected);
  for (const name of ["createHabit", "trackHabit", "setHabitDay", "changeHabitDayCount", "deleteHabit"]) assert.equal(name in tools, false);
  const schema = tools.listHabits.inputSchema as z.ZodType;
  assert.equal(schema.safeParse({}).success, true);
  for (const input of [{ day: "2026-10-09" }, { id: "water" }, { userId: "other" }]) assert.equal(schema.safeParse(input).success, false);
  const result = await tools.listHabits.execute!({}, { toolCallId: "read", messages: [], context: {} });
  assert.deepEqual(reads, [["owner", "2026-10-08"]]);
  const shared = await listHabits.run({}, { userId: "owner", today: "2026-10-08", messageId: "message", toolCallId: "read", data });
  assert.deepEqual(result, { ...shared, day: "2026-10-08" });
});

test("Daily close masks and logs a failed habit read, including an invalid bound day before reading", async (t) => {
  const logs: string[] = [];
  t.mock.method(console, "error", (line: string) => { logs.push(line); });
  let reads = 0;
  const data = { listHabits: async () => { reads++; throw new Error("private database details", { cause: { code: "XX001" } }); } } as unknown as CoachData;
  for (const day of ["2026-13-40", "2026-10-08"]) {
    const tools = closeTools(coachTools(data), data, "owner", day, "message");
    await assert.rejects(async () => tools.listHabits.execute!({}, { toolCallId: day, messages: [], context: {} }), { message: "Couldn't read your habits." });
    if (day === "2026-13-40") assert.equal(reads, 0);
  }
  assert.equal(reads, 1);
  assert.deepEqual(logs.map((line) => JSON.parse(line)), [
    { event: "coach.tool.error", tool: "listHabits", toolCallId: "2026-13-40", error: "Error" },
    { event: "coach.tool.error", tool: "listHabits", toolCallId: "2026-10-08", error: "Error", code: "XX001" },
  ]);
  assert.ok(logs.every((line) => !line.includes("private database details")));
});

test("Daily close shares reservations: refusals release slots, applied replays keep slots", async () => {
  const userId = "00000000-0000-4000-8000-000000000001";
  const messageId = "00000000-0000-4000-8000-000000000002";
  const day = "2026-10-08";
  const data = { createTask: async () => null, appendJournal: async () => ({ id: messageId, day }) } as unknown as CoachData;
  const tools = coachTools(data);
  const close = closeTools(tools, data, userId, day, messageId);
  const options = { toolCallId: "call", messages: [], context: { userId, messageId, today: day } };
  await tools.createTask.execute!({ name: "Refused" }, options);
  await assert.rejects(Promise.resolve(close.appendJournal.execute!({ text: "Future", day: "2026-10-09" }, options)), /not open yet/);
  for (let i = 0; i < 3; i++) await close.appendJournal.execute!({ text: "Applied or replay" }, options);
  await assert.rejects(Promise.resolve(close.appendJournal.execute!({ text: "Fourth" }, options)), /only 3/);
  await assert.rejects(Promise.resolve(tools.createTask.execute!({ name: "Also capped" }, options)), /only 3/);
  assert.equal("trackHabit" in close, false);
});
