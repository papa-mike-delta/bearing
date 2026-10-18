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
  const allTools = { ...coachTools(data), createHabit: { execute: unreachable }, trackHabit: { execute: unreachable } };
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
