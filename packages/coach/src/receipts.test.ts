import assert from "node:assert/strict";
import { test } from "node:test";
import { taskHref } from "@repo/domain";
import { receipt, shownParts } from "./receipts.ts";

test("successful Task changes link to the Task and ignore untrusted output links", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  for (const [tool, label] of [["scheduleTask", "Scheduled"], ["updateTask", "Updated"], ["completeTask", "Completed"]]) {
    const part = { type: `tool-${tool}`, state: "output-available", output: { id, name: "Call dentist", href: "https://untrusted.invalid" } };
    assert.deepEqual(shownParts([part]), [
      { key: "part-0", receipt: `${label} 'Call dentist'`, calls: 1, href: taskHref(id) },
    ]);
    assert.deepEqual(shownParts([{ ...part, output: { id: "invalid", name: "Call dentist" } }]), [
      { key: "part-0", receipt: `${label} 'Call dentist'`, calls: 1 },
    ]);
  }
});

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
  assert.equal(
    receipt({
      type: "tool-scheduleTask",
      state: "output-available",
      output: { name: "Call dentist" },
    }),
    "Scheduled 'Call dentist'",
  );
  assert.equal(
    receipt({ type: "tool-scheduleTask", state: "output-available", output: { refused: true } }),
    "Couldn't schedule that task",
  );
  assert.equal(
    receipt({
      type: "tool-updateTask",
      state: "output-available",
      output: { name: "Oat milk" },
    }),
    "Updated 'Oat milk'",
  );
  assert.equal(
    receipt({ type: "tool-updateTask", state: "input-available" }),
    "Updating…",
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

test("a real failure keeps its receipt when a later call succeeds", () => {
  const filed = {
    type: "tool-fileDraft", toolCallId: "filed", state: "output-available",
    output: { kind: "journal", id: "00000000-0000-4000-8000-000000000001", day: "2026-10-09", href: "/journal/2026-10-09" },
  };
  assert.deepEqual(shownParts([{ type: "tool-fileDraft", toolCallId: "db-error", state: "output-error", errorText: "connection reset" }, filed]), [
    { key: "db-error", receipt: "Couldn't file that draft", calls: 1 },
    { key: "filed", receipt: "Appended draft to journal for 2026-10-09", calls: 1, href: "/journal/2026-10-09" },
  ]);
  const updated = { type: "tool-updateTask", toolCallId: "task-b", state: "output-available", output: { name: "Task B" } };
  assert.deepEqual(shownParts([{ type: "tool-updateTask", toolCallId: "task-a", state: "output-available", output: { notFound: true } }, updated]), [
    { key: "task-a", receipt: "Couldn't update that task", calls: 1 },
    { key: "task-b", receipt: "Updated 'Task B'", calls: 1 },
  ]);
});

test("a Daily close refusal renders no receipt", () => {
  assert.deepEqual(shownParts([{ type: "tool-fileDraft", toolCallId: "r", state: "output-error", errorText: "Daily close refused: no offer" }]), []);
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

test("a new create links to the task page; a stored create still links to /", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const href = taskHref(id);
  assert.deepEqual(shownParts([created("c1", { id, name: "Call dentist", href })]), [
    { key: "c1", receipt: "Created task 'Call dentist'", calls: 1, href },
  ]);
  assert.deepEqual(
    shownParts([created("c2", { id, name: "Call dentist", href: "https://evil.example" })]),
    [{ key: "c2", receipt: "Created task 'Call dentist'", calls: 1, href: "/" }],
  );
  assert.deepEqual(
    shownParts([{
      type: "tool-fileDraft",
      toolCallId: "filed-task",
      state: "output-available",
      output: { kind: "task", id, name: "Call dentist", href },
    }]),
    [{ key: "filed-task", receipt: "Filed draft as Task 'Call dentist'", calls: 1, href }],
  );
  assert.deepEqual(
    shownParts([{
      type: "tool-fileDraft",
      toolCallId: "filed-old",
      state: "output-available",
      output: { kind: "task", id, name: "Call dentist", href: "/" },
    }]),
    [{ key: "filed-old", receipt: "Filed draft as Task 'Call dentist'", calls: 1, href: "/" }],
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

test("legacy outputs link creates to the Priority List and keep completion text without an id", () => {
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

const noteId = "11111111-1111-4111-8111-111111111111";
const notebookId = "22222222-2222-4222-8222-222222222222";
const noteHref = `/notes/${notebookId}/${noteId}`;
const createdNote = (
  toolCallId: string,
  output?: unknown,
  state = "output-available",
) => ({
  type: "tool-createNote",
  toolCallId,
  state,
  ...(output !== undefined && { output }),
});

test("a createNote call reads as a one-line receipt and links to the Note", () => {
  const part = { type: "tool-createNote" };
  const output = {
    id: noteId,
    notebookId,
    name: "Meeting notes",
    href: noteHref,
  };
  assert.equal(
    receipt({ ...part, state: "output-available", output }),
    "Created Note 'Meeting notes'",
  );
  assert.deepEqual(shownParts([createdNote("n1", output)]), [
    {
      key: "n1",
      receipt: "Created Note 'Meeting notes'",
      calls: 1,
      href: noteHref,
    },
  ]);
  assert.equal(
    receipt({ ...part, state: "input-available" }),
    "Creating a Note…",
  );
  assert.deepEqual(
    shownParts([
      createdNote("n2", { refused: true }),
      createdNote("n3", {}, "output-error"),
    ]),
    [
      { key: "n2", receipt: "Couldn't create that Note", calls: 1 },
      { key: "n3", receipt: "Couldn't create that Note", calls: 1 },
    ],
  );
});

test("a createNote receipt with no notebook links under /notes/_", () => {
  const href = `/notes/_/${noteId}`;
  const output = { id: noteId, notebookId: null, name: "Loose", href };
  assert.equal(receipt({ type: "tool-createNote", state: "output-available", output }), "Created Note 'Loose'");
  assert.deepEqual(shownParts([createdNote("n4", output)]), [
    { key: "n4", receipt: "Created Note 'Loose'", calls: 1, href },
  ]);
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

test("a Daily close habits receipt keeps its selected day and Habits link after serialization", () => {
  for (const habits of [[], [{ name: "Walk" }]]) {
    const part = { type: "tool-listHabits", toolCallId: "close-habits", state: "output-available", output: { day: "2026-10-08", habits } };
    const expected = [{ key: "close-habits", receipt: `Read your habits for 2026-10-08 (${habits.length})`, calls: 1, href: "/habits" }];
    assert.deepEqual(shownParts([part]), expected);
    assert.deepEqual(shownParts(JSON.parse(JSON.stringify([part]))), expected);
  }
  for (const day of ["2026-02-30", "https://untrusted.invalid", null, 42]) {
    assert.deepEqual(shownParts([{ type: "tool-listHabits", state: "output-available", output: { day, habits: [] } }]), [
      { key: "part-0", receipt: "Couldn't read your habits", calls: 1 },
    ]);
  }
});

test("a habits lookup receipt names the section and rejects a foreign link", () => {
  const part = {
    type: "tool-searchKnowledge",
    state: "output-available",
    output: {
      match: true,
      title: "Habits",
      heading: "How long does a habit take? Not 21 days",
      href: "/coach/knowledge/habits",
    },
  };
  assert.equal(
    receipt(part),
    "Looked up 'How long does a habit take? Not 21 days' in Habits",
  );
  assert.equal(
    receipt({ ...part, output: { match: false } }),
    "No matching knowledge section",
  );
  assert.equal(
    receipt({
      ...part,
      output: { ...part.output, href: "https://example.com" },
    }),
    "Couldn't look up knowledge",
  );
});



test("habit read receipts show the count and link to Habits", () => {
  const part = { type: "tool-listHabits", toolCallId: "habits" };
  assert.equal(receipt({ ...part, state: "input-available" }), "Reading your habits…");
  assert.equal(receipt({ ...part, state: "output-error" }), "Couldn't read your habits");
  assert.equal(receipt({ ...part, state: "output-available", output: {} }), "Couldn't read your habits");
  assert.deepEqual(shownParts([{ ...part, state: "output-available", output: { habits: [{ name: "Walk" }] } }]), [
    { key: "habits", receipt: "Read your habits (1)", calls: 1, href: "/habits" },
  ]);
  assert.equal(receipt({ ...part, state: "output-available", output: { habits: [] } }), "Read your habits (0)");
});


for (const [type, action, period, label] of [
  ["createHabit", undefined, "day", "Created habit 'Walk'"],
  ["trackHabit", "did", "day", "Tracked 'Walk' for 2026-10-08"],
  ["trackHabit", "markDone", "day", "Tracked 'Walk' for 2026-10-08"],
  ["trackHabit", "undo", "day", "Undid 'Walk' for 2026-10-08"],
  ["trackHabit", "didnt", "day", "Undid 'Walk' for 2026-10-08"],
  ["trackHabit", "did", "week", "Tracked 'Walk' for week of 2026-10-05"],
  ["trackHabit", "undo", "week", "Undid 'Walk' for week of 2026-10-05"],
] as const) {
  test(`${type} ${action ?? "create"} ${period} receipt links to Habits and survives serialization`, () => {
    const part = { type: `tool-${type}`, toolCallId: "habit", state: "output-available", output: { id: "11111111-1111-4111-8111-111111111111", name: "Walk", href: "/habits", period, day: period === "day" ? "2026-10-08" : "2026-10-05", action, changed: true } };
    const expected = [{ key: "habit", receipt: label, calls: 1, href: "/habits" }];
    assert.deepEqual(shownParts([part]), expected);
    assert.deepEqual(shownParts(JSON.parse(JSON.stringify([part]))), expected);
    for (const bad of [
      { ...part, state: "output-error" },
      { ...part, output: { ...part.output, refused: true } },
      { ...part, output: { ...part.output, id: "invalid" } },
      { ...part, output: { ...part.output, href: "https://untrusted.invalid" } },
      { ...part, output: {} },
    ]) assert.deepEqual(shownParts([bad]), [{ key: "habit", receipt: type === "createHabit" ? "Couldn't create that habit" : "Couldn't track that habit", calls: 1 }]);
  });
}

test("an empty Bad didnt is shown as unchanged, without claiming a write", () => {
  assert.equal(receipt({ type: "tool-trackHabit", state: "output-available", output: { id: "11111111-1111-4111-8111-111111111111", name: "Smoking", href: "/habits", period: "day", day: "2026-10-08", action: "didnt", changed: false } }), "No change to 'Smoking' for 2026-10-08");
});
