import assert from "node:assert/strict";
import { test } from "node:test";
import { shownThread, stoppedReplyMarker } from "./coach-screen.ts";

const read = (open: number) => ({
  type: "tool-listArea",
  toolCallId: "c1",
  state: "output-available",
  output: { open, tasks: [] },
});
const text = (value: string) => ({ type: "text", text: value });
const user = (id: string, value: string) => ({
  id,
  role: "user",
  parts: [text(value)],
});

// What a person would read. Ids and keys are not part of that.
const lines = (
  messages: Parameters<typeof shownThread>[0],
  stopped: readonly string[],
) =>
  shownThread(messages, stopped).map((turn) => ({
    who: turn.role === "user" ? "You" : "Coach",
    text: turn.parts.flatMap((part) => ("text" in part ? [part.text] : [])),
    receipts: turn.parts.flatMap((part) =>
      "receipt" in part ? [part.receipt] : [],
    ),
    note: turn.marker ?? null,
  }));

test("stop before the first token shows the stopped note", () => {
  assert.equal(
    stoppedReplyMarker,
    "Stopped. Reload to see the reply if the Coach finished it.",
  );
  // Nothing from the Coach has arrived: no bubble, no receipt, no text.
  assert.deepEqual(lines([user("u1", "What's next?")], ["u1"]), [
    { who: "You", text: ["What's next?"], receipts: [], note: null },
    {
      who: "Coach",
      text: [],
      receipts: [],
      note: "Stopped. Reload to see the reply if the Coach finished it.",
    },
  ]);
  // The list receipt can arrive before any text. The note still does.
  assert.deepEqual(
    lines(
      [
        user("u1", "What's next?"),
        { id: "a1", role: "assistant", parts: [read(3)] },
      ],
      ["u1"],
    ),
    [
      { who: "You", text: ["What's next?"], receipts: [], note: null },
      {
        who: "Coach",
        text: [],
        receipts: ["Read your list (3 open)"],
        note: "Stopped. Reload to see the reply if the Coach finished it.",
      },
    ],
  );
});

test("a reload shows the saved reply and its receipt, and the note is gone", () => {
  assert.deepEqual(
    lines(
      [
        user("u1", "What's next?"),
        {
          id: "a1",
          role: "assistant",
          parts: [read(3), text("Start with the dentist.")],
        },
      ],
      [],
    ),
    [
      { who: "You", text: ["What's next?"], receipts: [], note: null },
      {
        who: "Coach",
        text: ["Start with the dentist."],
        receipts: ["Read your list (3 open)"],
        note: null,
      },
    ],
  );
});

test("a stopped turn keeps whatever text had already arrived, and the note", () => {
  assert.deepEqual(
    lines(
      [
        user("u1", "Go on"),
        {
          id: "a1",
          role: "assistant",
          parts: [read(3), text("As far as")],
        },
      ],
      ["u1"],
    ),
    [
      { who: "You", text: ["Go on"], receipts: [], note: null },
      {
        who: "Coach",
        text: ["As far as"],
        receipts: ["Read your list (3 open)"],
        note: "Stopped. Reload to see the reply if the Coach finished it.",
      },
    ],
  );
});

test("an empty unstopped reply stays hidden", () => {
  assert.deepEqual(
    lines(
      [user("u1", "What's next?"), { id: "a1", role: "assistant", parts: [] }],
      [],
    ),
    [{ who: "You", text: ["What's next?"], receipts: [], note: null }],
  );
});

test("a message sent right after Stop stays after that turn", () => {
  assert.deepEqual(
    lines(
      [
        user("u1", "First"),
        user("u2", "Second"),
        {
          id: "a2",
          role: "assistant",
          parts: [read(3), text("Second answer.")],
        },
      ],
      ["u1"],
    ),
    [
      { who: "You", text: ["First"], receipts: [], note: null },
      {
        who: "Coach",
        text: [],
        receipts: [],
        note: "Stopped. Reload to see the reply if the Coach finished it.",
      },
      { who: "You", text: ["Second"], receipts: [], note: null },
      {
        who: "Coach",
        text: ["Second answer."],
        receipts: ["Read your list (3 open)"],
        note: null,
      },
    ],
  );
});
