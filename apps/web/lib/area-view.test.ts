import assert from "node:assert/strict";
import { test } from "node:test";
import { kanbanFrame, taskMenu } from "./area-view.ts";

const goals = [
  { id: "chores", name: "Chores" },
  { id: "money", name: "Money" },
];

const columns = [
  { id: "started" as const, count: 1, holdsNext: true },
  { id: "next" as const, count: 0, holdsNext: false },
  { id: "waiting" as const, count: 2, holdsNext: false },
  { id: "later" as const, count: 4, holdsNext: false },
];

test("a Kanban menu offers the other columns and not the one the Task is in", () => {
  const labels = taskMenu({
    workflow: "kanban",
    status: "started",
    priority: 0,
    goals,
    goalId: null,
  })
    .find((group) => group.id === "move")!
    .items.map((item) => item.label);
  assert.deepEqual(labels, ["Next", "Waiting", "Later"]);
});

test("Now/Later offers only the other place", () => {
  const later = taskMenu({
    workflow: "now-later",
    status: "later",
    priority: 0,
    goals: [],
    goalId: null,
  }).find((group) => group.id === "move")!;
  assert.deepEqual(
    later.items.map((item) => item.action),
    [{ type: "move", to: "now" }],
  );
  const started = taskMenu({
    workflow: "now-later",
    status: "started",
    priority: 0,
    goals: [],
    goalId: null,
  }).find((group) => group.id === "move")!;
  assert.deepEqual(
    started.items.map((item) => item.action),
    [{ type: "move", to: "later" }],
  );
  const waiting = taskMenu({
    workflow: "now-later",
    status: "waiting",
    priority: 0,
    goals: [],
    goalId: null,
  }).find((group) => group.id === "move")!;
  assert.deepEqual(
    waiting.items.map((item) => item.label),
    ["Later"],
  );
});

test("a Priority List has no Move group", () => {
  const ids = taskMenu({
    workflow: "priority-list",
    status: "later",
    priority: 0,
    goals,
    goalId: "chores",
  }).map((group) => group.id);
  assert.equal(ids.includes("move"), false);
});

test("raise and lower are present and unusable at the ends of the scale", () => {
  const top = taskMenu({
    workflow: "priority-list",
    status: "later",
    priority: 2,
    goals: [],
    goalId: null,
  }).find((group) => group.id === "priority")!;
  assert.deepEqual(
    top.items.map((item) => [item.label, item.enabled]),
    [
      ["Raise", false],
      ["Lower", true],
    ],
  );
  const bottom = taskMenu({
    workflow: "kanban",
    status: "next",
    priority: -2,
    goals: [],
    goalId: null,
  }).find((group) => group.id === "priority")!;
  assert.deepEqual(
    bottom.items.map((item) => [item.label, item.enabled]),
    [
      ["Raise", true],
      ["Lower", false],
    ],
  );
});

test("Goals are listed in order, with No goal, and the current one is marked", () => {
  const goal = taskMenu({
    workflow: "kanban",
    status: "later",
    priority: 0,
    goals,
    goalId: "money",
  }).find((group) => group.id === "goal")!;
  assert.deepEqual(
    goal.items.map((item) => [item.label, item.current]),
    [
      ["Chores", false],
      ["Money", true],
      ["No goal", false],
    ],
  );
  const unset = taskMenu({
    workflow: "kanban",
    status: "later",
    priority: 0,
    goals,
    goalId: null,
  }).find((group) => group.id === "goal")!;
  assert.equal(
    unset.items.find((item) => item.label === "No goal")?.current,
    true,
  );
});

test("an Area with no Goals has no Goal group", () => {
  const ids = taskMenu({
    workflow: "now-later",
    status: "next",
    priority: 0,
    goals: [],
    goalId: null,
  }).map((group) => group.id);
  assert.equal(ids.includes("goal"), false);
});

test("the menu groups are Move, Priority, Goal, then Date", () => {
  const ids = taskMenu({
    workflow: "kanban",
    status: "waiting",
    priority: 1,
    goals,
    goalId: null,
  }).map((group) => group.id);
  assert.deepEqual(ids, ["move", "priority", "goal", "date"]);
});

test("a narrow screen shows one column, defaulting to Next's column", () => {
  const frame = kanbanFrame({
    narrow: true,
    columns: columns.map((column) =>
      column.id === "started"
        ? { ...column, count: 0, holdsNext: false }
        : column.id === "next"
          ? { ...column, count: 1, holdsNext: true }
          : column,
    ),
    chosen: null,
  });
  assert.deepEqual(frame.shown, ["next"]);
  assert.equal(frame.dragging, false);
  assert.deepEqual(
    frame.switcher?.map((entry) => [entry.label, entry.count]),
    [
      ["In progress", 0],
      ["Next", 1],
      ["Waiting", 2],
      ["Later", 4],
    ],
  );
});

test("a narrow screen with nothing Next opens on In progress", () => {
  const frame = kanbanFrame({
    narrow: true,
    columns: columns.map((column) => ({ ...column, holdsNext: false })),
    chosen: null,
  });
  assert.deepEqual(frame.shown, ["started"]);
});

test("a chosen column is the one shown, including an empty one", () => {
  const frame = kanbanFrame({ narrow: true, columns, chosen: "next" });
  assert.deepEqual(frame.shown, ["next"]);
  assert.equal(frame.switcher?.find((entry) => entry.id === "next")?.count, 0);
});

test("a wide screen shows all four columns and ignores the choice", () => {
  const frame = kanbanFrame({ narrow: false, columns, chosen: "waiting" });
  assert.deepEqual(frame.shown, ["started", "next", "waiting", "later"]);
  assert.equal(frame.switcher, null);
  assert.equal(frame.dragging, true);
});

test("Just came up is not a column", () => {
  const frame = kanbanFrame({ narrow: true, columns, chosen: null });
  assert.equal(
    frame.switcher?.some((entry) => entry.label === "Just came up"),
    false,
  );
  assert.equal(frame.shown.includes("strip" as never), false);
});
