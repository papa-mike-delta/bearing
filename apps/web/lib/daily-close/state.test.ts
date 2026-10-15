import assert from "node:assert/strict";
import { test } from "node:test";
import type { UIMessage } from "ai";
import { closeDayOnScreen, startsNewClose } from "./state.ts";

const day = "2026-10-14";
const user = (text: string): UIMessage => ({ id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text }] });
const finish = (output: unknown = { finished: true, day }, state = "output-available"): UIMessage => ({
  id: crypto.randomUUID(), role: "assistant",
  parts: [{ type: "tool-finishDailyClose", toolCallId: "finish", state, input: {}, output }] as UIMessage["parts"],
});

test("banner ends from streamed successful completion or cancellation without a refresh", () => {
  assert.equal(closeDayOnScreen(day, [], day), day);
  assert.equal(closeDayOnScreen(day, [finish()], day), null);
  assert.equal(closeDayOnScreen(day, [user("Cancel Daily close")], day), null);
  assert.equal(closeDayOnScreen(day, [finish(undefined, "output-error")], day), day);
  assert.equal(closeDayOnScreen(day, [finish({ finished: false, day })], day), day);
  assert.equal(closeDayOnScreen(day, [finish({ finished: true, day: "2026-10-13" })], day), day);
});

test("a new close starts after completion and clears again when it finishes", () => {
  const messages = [finish(), user("Start Daily close")];
  assert.equal(closeDayOnScreen(day, messages, day), day);
  assert.equal(closeDayOnScreen(day, [...messages, finish()], day), null);
  assert.equal(startsNewClose("This daily close helped me reflect."), false);
  assert.equal(startsNewClose("Start Daily close"), true);
});
