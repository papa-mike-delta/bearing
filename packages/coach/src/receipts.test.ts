import assert from "node:assert/strict";
import { test } from "node:test";
import { receipt, shownParts } from "./receipts.ts";

test("a listArea call reads as a one-line receipt", () => {
  const part = { type: "tool-listArea" };
  assert.equal(
    receipt({ ...part, state: "output-available", output: { open: 4 } }),
    "Read your list (4 open)",
  );
  assert.equal(
    receipt({ ...part, state: "output-available", output: { open: 0 } }),
    "Read your list (0 open)",
  );
  assert.equal(
    receipt({ ...part, state: "input-available" }),
    "Reading your list…",
  );
  assert.equal(
    receipt({ ...part, state: "output-error" }),
    "Couldn't read your list",
  );
  assert.equal(receipt({ type: "text" }), null);
  assert.equal(
    receipt({ type: "tool-somethingElse", state: "output-available" }),
    null,
  );
});

// Parts as a reply stores them: a step-start before each model step.
const step = { type: "step-start" };
const read = (
  toolCallId: string,
  open: number,
  state = "output-available",
) => ({
  type: "tool-listArea",
  toolCallId,
  state,
  ...(state === "output-available" && { output: { open, tasks: [] } }),
});
const text = (t: string) => ({ type: "text", text: t });

test("two identical reads in a row show as one receipt", () => {
  assert.deepEqual(
    shownParts([
      step,
      read("c1", 0),
      step,
      read("c2", 0),
      step,
      text("Empty."),
    ]),
    [
      { key: "c1", receipt: "Read your list (0 open)", calls: 2 },
      { key: "text-5", text: "Empty." },
    ],
  );
});

test("reads with different results stay separate", () => {
  assert.deepEqual(shownParts([read("c1", 0), read("c2", 3)]), [
    { key: "c1", receipt: "Read your list (0 open)", calls: 1 },
    { key: "c2", receipt: "Read your list (3 open)", calls: 1 },
  ]);
});

test("a repeated read after some text stays", () => {
  assert.deepEqual(shownParts([read("c1", 2), text("Two."), read("c2", 2)]), [
    { key: "c1", receipt: "Read your list (2 open)", calls: 1 },
    { key: "text-1", text: "Two." },
    { key: "c2", receipt: "Read your list (2 open)", calls: 1 },
  ]);
});

test("a failed or unfinished read isn't merged with a finished one", () => {
  assert.deepEqual(shownParts([read("c1", 0), read("c2", 0, "output-error")]), [
    { key: "c1", receipt: "Read your list (0 open)", calls: 1 },
    { key: "c2", receipt: "Couldn't read your list", calls: 1 },
  ]);
  assert.deepEqual(
    shownParts([read("c1", 0), read("c2", 0, "input-available")]),
    [
      { key: "c1", receipt: "Read your list (0 open)", calls: 1 },
      { key: "c2", receipt: "Reading your list…", calls: 1 },
    ],
  );
});

test("failed reads aren't merged, even with each other", () => {
  assert.deepEqual(
    shownParts([read("c1", 0, "output-error"), read("c2", 0, "output-error")]),
    [
      { key: "c1", receipt: "Couldn't read your list", calls: 1 },
      { key: "c2", receipt: "Couldn't read your list", calls: 1 },
    ],
  );
});

test("parts that show nothing are left out", () => {
  assert.deepEqual(shownParts([step, { type: "reasoning", text: "Hmm" }]), []);
});

const created = (
  toolCallId: string,
  output?: unknown,
  state = "output-available",
) => ({
  type: "tool-createTask",
  toolCallId,
  state,
  ...(output !== undefined && { output }),
});
const completed = (
  toolCallId: string,
  output?: unknown,
  state = "output-available",
) => ({
  type: "tool-completeTask",
  toolCallId,
  state,
  ...(output !== undefined && { output }),
});

test("a createTask call reads as a one-line receipt", () => {
  const part = { type: "tool-createTask" };
  assert.equal(
    receipt({
      ...part,
      state: "output-available",
      output: { id: "t1", name: "Call dentist" },
    }),
    "Created task 'Call dentist'",
  );
  assert.equal(
    receipt({ ...part, state: "input-streaming" }),
    "Creating a task…",
  );
  assert.equal(
    receipt({ ...part, state: "input-available" }),
    "Creating a task…",
  );
  assert.equal(
    receipt({ ...part, state: "output-available", output: {} }),
    "Couldn't create that task",
  );
  assert.equal(
    receipt({ ...part, state: "output-error" }),
    "Couldn't create that task",
  );
});

test("a completeTask call reads as a one-line receipt", () => {
  const part = { type: "tool-completeTask" };
  assert.equal(
    receipt({
      ...part,
      state: "output-available",
      output: { id: "t1", name: "Call dentist" },
    }),
    "Completed 'Call dentist'",
  );
  assert.equal(receipt({ ...part, state: "input-streaming" }), "Completing…");
  assert.equal(receipt({ ...part, state: "input-available" }), "Completing…");
  assert.equal(
    receipt({
      ...part,
      state: "output-available",
      output: { notFound: true },
    }),
    "Couldn't find that task",
  );
  assert.equal(
    receipt({
      ...part,
      state: "output-available",
      output: { invalidId: true },
    }),
    "That Task id isn't valid",
  );
  assert.equal(
    receipt({ ...part, state: "output-error" }),
    "Couldn't complete that task",
  );
  assert.equal(
    receipt({ ...part, state: "output-available" }),
    "Couldn't complete that task",
  );
});

test("a successful create links to the Priority List; a complete does not", () => {
  assert.deepEqual(
    shownParts([
      created("c1", { id: "t1", name: "Call dentist" }),
      completed("c2", { id: "t1", name: "Call dentist" }),
    ]),
    [
      {
        key: "c1",
        receipt: "Created task 'Call dentist'",
        calls: 1,
        href: "/",
      },
      { key: "c2", receipt: "Completed 'Call dentist'", calls: 1 },
    ],
  );
  assert.deepEqual(
    shownParts([
      created("c1", undefined, "input-available"),
      created("c2", {}, "output-error"),
      completed("c3", { notFound: true }),
      completed("c4", undefined, "output-error"),
    ]),
    [
      { key: "c1", receipt: "Creating a task…", calls: 1 },
      { key: "c2", receipt: "Couldn't create that task", calls: 1 },
      { key: "c3", receipt: "Couldn't find that task", calls: 1 },
      { key: "c4", receipt: "Couldn't complete that task", calls: 1 },
    ],
  );
});

test("two creates in a row stay two lines", () => {
  const output = { id: "t1", name: "Call dentist" };
  assert.deepEqual(shownParts([created("c1", output), created("c2", output)]), [
    {
      key: "c1",
      receipt: "Created task 'Call dentist'",
      calls: 1,
      href: "/",
    },
    {
      key: "c2",
      receipt: "Created task 'Call dentist'",
      calls: 1,
      href: "/",
    },
  ]);
  assert.deepEqual(
    shownParts([
      completed("c1", { id: "t1", name: "Call dentist" }),
      completed("c2", { id: "t1", name: "Call dentist" }),
    ]),
    [
      { key: "c1", receipt: "Completed 'Call dentist'", calls: 1 },
      { key: "c2", receipt: "Completed 'Call dentist'", calls: 1 },
    ],
  );
});
