import assert from "node:assert/strict";
import { test } from "node:test";
import { dailyClosePrompt } from "./prompt.ts";

test("Daily close restrictions apply only to this close and preserve earlier actions", () => {
  const prompt = dailyClosePrompt("2026-10-09", "2026-10-08", "# Reflection");
  assert.match(prompt, /during this Daily close only/i);
  assert.match(prompt, /Task creation and filing/i);
  assert.match(prompt, /Earlier messages, receipts and actions in this thread stand and are real/i);
  assert.match(prompt, /Never correct, retract or doubt them/i);
});

test("Daily close finishes through its tool after the draft step", () => {
  const prompt = dailyClosePrompt("2026-10-09", "2026-10-08", "");
  assert.match(prompt, /After drafts have been offered and handled or skipped[\s\S]*call finishDailyClose/);
  assert.match(prompt, /before telling the person the close is complete/);
});
