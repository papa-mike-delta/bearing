import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { CoachData } from "../data.ts";
import { appendJournal } from "./append-journal.ts";

test("Journal identity resolves day aliases and distinguishes text and repeated occurrences", async () => {
  const calls: { operationId: string; text: string }[] = [];
  const today = "2026-10-09";
  const data = { appendJournal: async (_user, input) => { calls.push(input); return { id: randomUUID(), day: input.day }; } } satisfies Partial<CoachData>;
  const context = { userId: "owner", messageId: "message", toolCallId: "call", today, appendOrdinal: 1, data: data as CoachData };
  for (const day of [undefined, "today", today]) await appendJournal.run({ text: "Reflection", day }, context);
  await appendJournal.run({ text: "Other reflection" }, context);
  await appendJournal.run({ text: "Reflection" }, { ...context, appendOrdinal: 2 });
  assert.equal(calls[0]!.operationId, calls[1]!.operationId);
  assert.equal(calls[0]!.operationId, calls[2]!.operationId);
  assert.equal(new Set(calls.map(call => call.operationId)).size, 3);
  assert.equal(calls[0]!.text, "Reflection");
});
