import assert from "node:assert/strict";
import { test } from "node:test";
import {
  areaName,
  areaNameTaken,
  canDeleteArea,
  changeStatus,
  coachList,
  isCalendarDay,
  maxAreaNameLength,
  moveToLater,
  moveToNow,
  newTaskFields,
  pickArea,
  scheduleTask,
  stackedPage,
  utcDay,
  applyTaskUpdate,
  assignGoal,
  goalInArea,
  goalName,
  goalNameTaken,
  moveToColumn,
  nextGoalOrder,
  shiftGoal,
  viewArea,
  withoutGoal,
  wipLimit,
  type AreaRecord,
  type GoalRecord,
  type TaskRecord,
  type TaskStatus,
} from "./areas.ts";

const today = "2026-10-09";

function area(
  id: string,
  workflow: AreaRecord["workflow"] = "priority-list",
  day = 1,
): AreaRecord {
  return {
    id,
    name: id,
    workflow,
    wipLimit: 3,
    createdAt: new Date(Date.UTC(2026, 0, day)),
  };
}

function task(
  id: string,
  areaId: string,
  overrides: Partial<TaskRecord> = {},
): TaskRecord {
  return {
    id,
    areaId,
    name: id,
    note: "",
    priority: 0,
    status: "later",
    previousStatus: null,
    age: "2026-10-01",
    date: null,
    goalId: null,
    createdAt: new Date(Date.UTC(2026, 9, 1)),
    completedAt: null,
    ...overrides,
  };
}

const ids = (tasks: { id: string }[]) => tasks.map((item) => item.id);

test("a calendar day is a real YYYY-MM-DD, and utcDay is the UTC date", () => {
  assert.equal(isCalendarDay("2026-10-09"), true);
  assert.equal(isCalendarDay("2024-02-29"), true);
  assert.equal(isCalendarDay("2023-02-29"), false);
  assert.equal(isCalendarDay("2026-02-31"), false);
  assert.equal(isCalendarDay("10/09/2026"), false);
  assert.equal(utcDay(new Date("2026-10-09T03:00:00.000Z")), "2026-10-09");
  assert.equal(utcDay(new Date("2026-10-09T23:30:00.000Z")), "2026-10-09");
});

test("an Area name is trimmed, and a blank or overlong name is refused", () => {
  assert.equal(areaName("  Work "), "Work");
  assert.equal(areaName("  "), null);
  assert.equal(areaName("x".repeat(maxAreaNameLength + 1)), null);
  assert.equal(areaNameTaken("work", [{ id: "a", name: "Work" }]), true);
  assert.equal(
    areaNameTaken("work", [{ id: "a", name: "Work" }], "a"),
    false,
  );
});

test("one Area is used, several require one matching name, none refuses", () => {
  const areas = [
    { id: "work", name: "Work" },
    { id: "home", name: "Personal" },
  ];
  assert.equal(pickArea([{ id: "only", name: "Tasks" }], "Nope")?.id, "only");
  assert.equal(pickArea(areas)?.id, undefined);
  assert.equal(pickArea(areas, "personal")?.id, "home");
  assert.equal(pickArea(areas, "Nope"), null);
  assert.equal(pickArea([]), null);
  assert.equal(wipLimit(3), 3);
  assert.equal(wipLimit(0), null);
  assert.equal(wipLimit(1.5), null);
});

test("a new Task is later, normal priority, aged today", () => {
  assert.deepEqual(newTaskFields(today), {
    status: "later",
    priority: 0,
    age: today,
    date: null,
  });
  assert.equal(newTaskFields("today"), null);
});

test("deleting an Area is refused while it still has any Task", () => {
  const open = task("open", "a");
  const done = task("done", "a", {
    status: "completed",
    completedAt: new Date(),
  });
  assert.equal(canDeleteArea("a", []), true);
  assert.equal(canDeleteArea("a", [open]), false);
  assert.equal(canDeleteArea("a", [done]), false);
  assert.equal(canDeleteArea("b", [open]), true);
});

test("completing stores the status being left, and leaving completed is refused", () => {
  const at = new Date("2026-10-09T15:00:00.000Z");
  const done = changeStatus(task("a", "a", { status: "started" }), "completed", at);
  assert.equal(done?.status, "completed");
  assert.equal(done?.previousStatus, "started");
  assert.equal(done?.completedAt, at);
  assert.equal(changeStatus(done!, "later"), null);
  const later = task("a", "a");
  assert.equal(changeStatus(later, "later"), later);
});

test("moving to Now sets next unless the Task is started or waiting", () => {
  assert.equal(moveToNow(task("a", "a"))?.status, "next");
  assert.equal(moveToNow(task("a", "a"))?.previousStatus, "later");
  assert.equal(moveToNow(task("a", "a", { status: "started" }))?.status, "started");
  assert.equal(moveToNow(task("a", "a", { status: "waiting" }))?.status, "waiting");
  assert.equal(moveToLater(task("a", "a", { status: "next" }))?.status, "later");
  assert.equal(moveToNow(task("a", "a", { status: "completed" })), null);
});

test("scheduling takes a future day, forces later, and sets age to that day", () => {
  const scheduled = scheduleTask(
    task("a", "a", { status: "next" }),
    "2026-10-20",
    today,
  );
  assert.equal(scheduled?.status, "later");
  assert.equal(scheduled?.previousStatus, "next");
  assert.equal(scheduled?.date, "2026-10-20");
  assert.equal(scheduled?.age, "2026-10-20");
  assert.equal(scheduleTask(task("a", "a"), today, today), null);
  assert.equal(scheduleTask(task("a", "a"), "2026-10-08", today), null);
  assert.equal(scheduleTask(task("a", "a"), "2026-02-31", today), null);
  const replaced = scheduleTask(
    task("a", "a", { status: "later", date: "2026-11-01", age: "2026-11-01" }),
    "2026-12-01",
    today,
  );
  assert.equal(replaced?.date, "2026-12-01");
  assert.equal(replaced?.previousStatus, null);
});

test("a Priority List stays one list, and a date does not reorder it or add a strip", () => {
  const work = area("Work");
  const tasks = [
    task("low-old", "Work", {
      priority: -1,
      createdAt: new Date(Date.UTC(2026, 0, 1)),
      date: today,
    }),
    task("high", "Work", {
      priority: 2,
      createdAt: new Date(Date.UTC(2026, 0, 5)),
      date: "2026-12-01",
    }),
    task("done", "Work", {
      status: "completed" as TaskStatus,
      completedAt: new Date(),
      priority: 2,
    }),
  ];
  const view = viewArea(work, tasks, today);
  assert.deepEqual(ids(view.tasks), ["high", "low-old"]);
  assert.equal(view.nextId, "high");
  assert.deepEqual(view.strip, []);
  assert.deepEqual(view.sections, []);
  assert.equal(view.warning, false);
});

test("Now and Later stay present, sort by age then priority, and warn on Now", () => {
  const home = { ...area("Personal", "now-later"), wipLimit: 1 };
  const tasks = [
    task("young-high", "Personal", { status: "next", age: "2026-10-08", priority: 2 }),
    task("old", "Personal", { status: "started", age: "2026-09-01", priority: 0 }),
    task("waiting", "Personal", { status: "waiting", age: "2026-10-08", priority: 2 }),
    task("later-old", "Personal", { age: "2026-08-01" }),
    task("done", "Personal", { status: "completed", completedAt: new Date() }),
  ];
  const view = viewArea(home, tasks, today);
  assert.deepEqual(
    view.sections.map((section) => section.id),
    ["now", "later"],
  );
  assert.deepEqual(ids(view.sections[0]!.tasks), [
    "old",
    "waiting",
    "young-high",
  ]);
  assert.deepEqual(ids(view.sections[1]!.tasks), ["later-old"]);
  assert.equal(view.nextId, "old");
  assert.equal(view.warning, true);
  const empty = viewArea(home, [], today);
  assert.equal(empty.nextId, null);
  assert.equal(empty.warning, false);
  assert.deepEqual(
    empty.sections.map((section) => section.tasks.length),
    [0, 0],
  );
});

test("a future date sits at the bottom of Later, and a due date is only in the strip", () => {
  const home = area("Personal", "now-later");
  const tasks = [
    task("undated-young", "Personal", { age: "2026-12-01" }),
    task("future-old-age", "Personal", {
      age: "2026-01-01",
      date: "2026-10-20",
    }),
    task("future-sooner", "Personal", {
      age: "2026-10-15",
      date: "2026-10-15",
      priority: 2,
    }),
    task("due", "Personal", { age: "2026-10-09", date: today }),
    task("missed", "Personal", { age: "2026-10-01", date: "2026-10-01", priority: 1 }),
    task("in-now", "Personal", {
      status: "next",
      age: "2026-10-01",
      date: today,
    }),
  ];
  const view = viewArea(home, tasks, today);
  assert.deepEqual(ids(view.strip), ["missed", "due"]);
  assert.deepEqual(ids(view.sections[1]!.tasks), [
    "undated-young",
    "future-sooner",
    "future-old-age",
  ]);
  assert.deepEqual(ids(view.sections[0]!.tasks), ["in-now"]);
  assert.equal(view.warning, false);
});

test("switching workflow keeps status and date, and a Priority List never warns", () => {
  const tasks = [
    task("a", "Work", { status: "started", date: "2026-12-01", age: "2026-12-01" }),
    task("b", "Work", { status: "later" }),
    task("c", "Work", { status: "later" }),
    task("d", "Work", { status: "later" }),
    task("e", "Work", { status: "next" }),
  ];
  const asList = viewArea({ ...area("Work"), wipLimit: 1 }, tasks, today);
  assert.equal(asList.warning, false);
  assert.equal(asList.strip.length, 0);
  assert.equal(asList.tasks.length, 5);
  const asNow = viewArea(
    { ...area("Work", "now-later"), wipLimit: 1 },
    tasks,
    today,
  );
  assert.equal(asNow.sections[0]!.tasks.length, 2);
  assert.equal(asNow.warning, true);
  assert.equal(asNow.strip.length, 0);
  const kept = asNow.sections[0]!.tasks.find((item) => item.id === "a");
  assert.equal(kept?.status, "started");
  assert.equal(kept?.date, "2026-12-01");
});

test("hidden Areas leave the page and stay in the Coach's list", () => {
  const areas = [area("Work", "priority-list", 2), area("Personal", "now-later", 1)];
  const tasks = [
    task("home", "Personal", {
      status: "next",
      priority: 1,
      createdAt: new Date(Date.UTC(2026, 0, 2)),
    }),
    task("job", "Work", { priority: 0, createdAt: new Date(Date.UTC(2026, 0, 3)) }),
  ];
  const page = stackedPage(areas, tasks, ["Work"], today);
  assert.deepEqual(
    page.map((item) => item.id),
    ["Personal"],
  );
  assert.deepEqual(stackedPage(areas, tasks, ["Work", "Personal"], today), []);
  const listed = coachList(areas, tasks, today);
  assert.deepEqual(
    listed.map((item) => [item.area, item.name, item.isNext]),
    [
      ["Personal", "home", true],
      ["Work", "job", true],
    ],
  );
});

test("the Coach follows Area creation order, then that Area's order", () => {
  const areas = [
    area("Later-area", "now-later", 2),
    area("First", "priority-list", 1),
  ];
  const tasks = [
    task("second", "First", {
      priority: 0,
      createdAt: new Date(Date.UTC(2026, 1, 1)),
    }),
    task("first", "First", {
      priority: 1,
      createdAt: new Date(Date.UTC(2026, 2, 1)),
    }),
    task("due", "Later-area", { date: today, age: today }),
    task("now", "Later-area", { status: "next", age: "2026-09-01" }),
    task("backlog", "Later-area", { age: "2026-08-01" }),
  ];
  assert.deepEqual(
    coachList(areas, tasks, today).map((item) => [item.area, item.name, item.isNext]),
    [
      ["First", "first", true],
      ["First", "second", false],
      ["Later-area", "due", false],
      ["Later-area", "now", true],
      ["Later-area", "backlog", false],
    ],
  );
});

test("moving a strip Task to Now uses the Now rule and keeps the date", () => {
  const due = task("due", "Personal", { date: today, age: today });
  const moved = moveToNow(due);
  assert.equal(moved?.status, "next");
  assert.equal(moved?.date, today);
  const view = viewArea(
    area("Personal", "now-later"),
    [moved!],
    today,
  );
  assert.deepEqual(ids(view.strip), []);
  assert.equal(view.nextId, "due");
});

function goal(
  id: string,
  areaId: string,
  order: number,
  name = id,
): GoalRecord {
  return { id, areaId, name, order };
}

test("Kanban keeps four columns, sorts by age then priority, and warns on In progress", () => {
  const board = { ...area("Work", "kanban"), wipLimit: 1 };
  const tasks = [
    task("young-high", "Work", { status: "started", age: "2026-10-08", priority: 2 }),
    task("old", "Work", { status: "started", age: "2026-09-01", priority: 0 }),
    task("next-young", "Work", { status: "next", age: "2026-10-08", priority: 2 }),
    task("next-old", "Work", { status: "next", age: "2026-09-01", priority: 0 }),
    task("waiting", "Work", { status: "waiting", age: "2026-08-01" }),
    task("later", "Work", { age: "2026-07-01" }),
    task("done", "Work", { status: "completed", completedAt: new Date(), priority: 2 }),
  ];
  const view = viewArea(board, tasks, today);
  assert.deepEqual(
    view.sections.map((column) => column.id),
    ["started", "next", "waiting", "later"],
  );
  assert.deepEqual(
    view.sections.map((column) => column.label),
    ["In progress", "Next", "Waiting", "Later"],
  );
  assert.deepEqual(ids(view.sections[0]!.tasks), ["old", "young-high"]);
  assert.deepEqual(ids(view.sections[1]!.tasks), ["next-old", "next-young"]);
  assert.equal(view.nextId, "old");
  assert.equal(view.warning, true);
  const quiet = viewArea({ ...board, wipLimit: 3 }, tasks, today);
  assert.equal(quiet.warning, false);
  const empty = viewArea(board, [], today);
  assert.equal(empty.nextId, null);
  assert.equal(empty.warning, false);
  assert.deepEqual(
    empty.sections.map((column) => column.tasks.length),
    [0, 0, 0, 0],
  );
  assert.equal(view.sections.some((column) => column.tasks.some((item) => item.id === "done")), false);
});

test("a Kanban future date sits at the bottom of Later, and a due date is only in the strip", () => {
  const board = area("Work", "kanban");
  const tasks = [
    task("undated", "Work", { age: "2026-12-01" }),
    task("future", "Work", { age: "2026-01-01", date: "2026-10-20" }),
    task("due", "Work", { date: today, age: today }),
    task("started-dated", "Work", {
      status: "started",
      date: "2026-12-01",
      age: "2026-09-01",
    }),
  ];
  const view = viewArea(board, tasks, today);
  assert.deepEqual(ids(view.strip), ["due"]);
  assert.deepEqual(ids(view.sections[3]!.tasks), ["undated", "future"]);
  assert.deepEqual(ids(view.sections[0]!.tasks), ["started-dated"]);
  assert.equal(view.nextId, "started-dated");
  const atLimit = viewArea({ ...board, wipLimit: 1 }, tasks, today);
  assert.equal(atLimit.strip.length, 1);
  assert.equal(atLimit.warning, false);
  const onlyNext = viewArea(
    board,
    [task("soon", "Work", { status: "next", age: "2026-09-01" })],
    today,
  );
  assert.equal(onlyNext.nextId, "soon");
});

test("Kanban Next is the first started Task, otherwise the first Next, otherwise none", () => {
  const board = area("Work", "kanban");
  const started = stackedPage(
    [board],
    [
      task("next-old", "Work", { status: "next", age: "2026-01-01" }),
      task("started-new", "Work", { status: "started", age: "2026-10-01" }),
      task("started-old", "Work", { status: "started", age: "2026-05-01" }),
      task("waiting", "Work", { status: "waiting", age: "2026-01-01" }),
    ],
    [],
    today,
  );
  assert.equal(started[0]?.nextId, "started-old");

  const nextOnly = stackedPage(
    [board],
    [
      task("later-old", "Work", { age: "2026-01-01" }),
      task("next-new", "Work", { status: "next", age: "2026-10-01" }),
      task("next-old", "Work", { status: "next", age: "2026-05-01" }),
      task("waiting", "Work", { status: "waiting", age: "2026-01-01" }),
    ],
    [],
    today,
  );
  assert.equal(nextOnly[0]?.nextId, "next-old");

  const none = stackedPage(
    [board],
    [
      task("later-old", "Work", { age: "2026-01-01" }),
      task("waiting", "Work", { status: "waiting", age: "2026-01-01" }),
    ],
    [],
    today,
  );
  assert.equal(none[0]?.nextId, null);
});

test("moving onto a column sets that status and keeps the date", () => {
  const due = task("due", "Work", { date: today, age: today });
  const started = moveToColumn(due, "started");
  assert.equal(started?.status, "started");
  assert.equal(started?.previousStatus, "later");
  assert.equal(started?.date, today);
  const view = viewArea(area("Work", "kanban"), [started!], today);
  assert.deepEqual(ids(view.strip), []);
  assert.equal(view.nextId, "due");
  assert.equal(moveToColumn(task("done", "Work", { status: "completed" }), "next"), null);
});

test("switching to Kanban keeps status and date", () => {
  const tasks = [
    task("a", "Work", { status: "waiting", date: "2026-12-01", age: "2026-12-01" }),
    task("b", "Work", { status: "later", date: today }),
  ];
  const view = viewArea(area("Work", "kanban"), tasks, today);
  const waiting = view.sections[2]!.tasks[0];
  assert.equal(waiting?.id, "a");
  assert.equal(waiting?.status, "waiting");
  assert.equal(waiting?.date, "2026-12-01");
  assert.deepEqual(ids(view.strip), ["b"]);
});

test("Goals group inside a section, and an empty Goal stays on the Area", () => {
  const home = area("Personal", "now-later");
  const goals = [
    goal("chores", "Personal", 0, "Chores"),
    goal("work", "Personal", 1, "Work"),
    goal("empty", "Personal", 2, "Someday"),
  ];
  const tasks = [
    task("loose-young", "Personal", { status: "next", age: "2026-10-08", priority: 0 }),
    task("loose-old", "Personal", { status: "started", age: "2026-09-01", priority: 2 }),
    task("chore", "Personal", {
      status: "waiting",
      age: "2026-08-01",
      goalId: "chores",
    }),
    task("job", "Personal", { status: "next", age: "2026-07-01", goalId: "work" }),
    task("later-loose", "Personal", { age: "2026-06-01" }),
    task("later-chore", "Personal", { age: "2026-05-01", goalId: "chores" }),
  ];
  const view = viewArea(home, tasks, today, goals);
  assert.deepEqual(
    view.goals.map((item) => item.name),
    ["Chores", "Work", "Someday"],
  );
  assert.deepEqual(
    view.sections[0]!.groups.map((group) => group.name),
    [null, "Chores", "Work"],
  );
  assert.deepEqual(ids(view.sections[0]!.tasks), [
    "loose-old",
    "loose-young",
    "chore",
    "job",
  ]);
  assert.equal(view.nextId, "loose-old");
  assert.deepEqual(ids(view.sections[1]!.tasks), ["later-loose", "later-chore"]);
  assert.equal(
    view.sections[1]!.groups.some((group) => group.name === "Someday"),
    false,
  );
});

test("a future date sits at the bottom of Later, and the strip stays one list", () => {
  const home = area("Personal", "now-later");
  const goals = [goal("chores", "Personal", 0, "Chores")];
  const tasks = [
    task("loose", "Personal", { age: "2026-09-01" }),
    task("loose-future", "Personal", { age: "2026-01-01", date: "2026-11-01" }),
    task("chore", "Personal", { age: "2026-08-01", goalId: "chores" }),
    task("chore-future", "Personal", {
      age: "2026-01-01",
      date: "2026-10-20",
      goalId: "chores",
    }),
    task("due-chore", "Personal", {
      age: "2026-10-01",
      date: "2026-10-01",
      goalId: "chores",
    }),
    task("due-loose", "Personal", { age: "2026-10-09", date: today }),
  ];
  const view = viewArea(home, tasks, today, goals);
  assert.deepEqual(ids(view.strip), ["due-chore", "due-loose"]);
  assert.equal(view.strip[0]?.goalId, "chores");
  assert.deepEqual(ids(view.sections[1]!.tasks), [
    "loose",
    "chore",
    "loose-future",
    "chore-future",
  ]);
  assert.deepEqual(
    view.sections[1]!.groups.map((group) => [group.name, group.tasks[0]?.id]),
    [
      [null, "loose"],
      ["Chores", "chore"],
      [null, "loose-future"],
      ["Chores", "chore-future"],
    ],
  );
});

test("a Priority List groups by Goal and the bold Next is the first of that order", () => {
  const work = area("Work");
  const goals = [goal("alpha", "Work", 1, "Alpha"), goal("beta", "Work", 0, "Beta")];
  const tasks = [
    task("loose-low", "Work", { priority: -1, createdAt: new Date(Date.UTC(2026, 0, 1)) }),
    task("loose-high", "Work", { priority: 1, createdAt: new Date(Date.UTC(2026, 0, 5)) }),
    task("beta-high", "Work", {
      priority: 2,
      goalId: "beta",
      createdAt: new Date(Date.UTC(2026, 0, 1)),
    }),
    task("alpha", "Work", { priority: 2, goalId: "alpha" }),
  ];
  const view = viewArea(work, tasks, today, goals);
  assert.deepEqual(ids(view.tasks), ["loose-high", "loose-low", "beta-high", "alpha"]);
  assert.equal(view.nextId, "loose-high");
  assert.deepEqual(
    view.groups.map((group) => group.name),
    [null, "Beta", "Alpha"],
  );
});

test("a Goal name is unique in its Area, ignoring case, and order moves within the Area", () => {
  const goals = [goal("a", "Work", 0, "Chores"), goal("b", "Work", 1, "Work")];
  assert.equal(goalName("  Chores "), "Chores");
  assert.equal(goalName("  "), null);
  assert.equal(goalNameTaken("chores", goals, "Work"), true);
  assert.equal(goalNameTaken("chores", goals, "Work", "a"), false);
  assert.equal(goalNameTaken("chores", goals, "Home"), false);
  assert.equal(nextGoalOrder(goals), 2);
  assert.equal(nextGoalOrder([]), 0);
  const down = shiftGoal(goals, "a", "down");
  assert.deepEqual(
    down?.map((item) => item.id),
    ["b", "a"],
  );
  assert.equal(shiftGoal(goals, "a", "up"), null);
  assert.equal(shiftGoal(goals, "missing", "down"), null);
});

test("a Task takes one Goal from its own Area, and deleting the Goal keeps the Task", () => {
  const chore = goal("chores", "Personal", 0, "Chores");
  const other = goal("job", "Work", 0, "Job");
  const open = task("milk", "Personal");
  assert.equal(assignGoal(open, chore)?.goalId, "chores");
  assert.equal(assignGoal(open, null)?.goalId, null);
  assert.equal(assignGoal(open, other), null);
  const filed = assignGoal(open, chore)!;
  const removed = withoutGoal([chore, other], [filed], "chores");
  assert.deepEqual(
    removed?.goals.map((item) => item.id),
    ["job"],
  );
  assert.equal(removed?.tasks[0]?.id, "milk");
  assert.equal(removed?.tasks[0]?.goalId, null);
  assert.equal(withoutGoal([chore], [filed], "missing"), null);
  assert.equal(goalInArea("chores", [chore, other], "Personal")?.id, "chores");
  assert.equal(goalInArea("chores", [chore], "Work"), null);
  assert.equal(goalInArea("nope", [chore], "Personal"), null);
});

test("the Coach's update changes name, note, priority, status, and Goal, and refuses the rest", () => {
  const at = new Date("2026-10-09T15:00:00.000Z");
  const open = task("milk", "Personal", { note: "skim", priority: 0, status: "next" });
  const chore = { id: "chores", areaId: "Personal" };
  const other = { id: "job", areaId: "Work" };
  const renamed = applyTaskUpdate(open, { name: "  Oat milk  ", note: "" }, at);
  assert.equal(renamed?.name, "Oat milk");
  assert.equal(renamed?.note, "");
  assert.equal(renamed?.status, "next");
  const filed = applyTaskUpdate(open, { goal: chore, priority: 2 }, at);
  assert.equal(filed?.goalId, "chores");
  assert.equal(filed?.priority, 2);
  const done = applyTaskUpdate(open, { status: "completed" }, at);
  assert.equal(done?.status, "completed");
  assert.equal(done?.previousStatus, "next");
  assert.equal(done?.completedAt, at);
  assert.equal(applyTaskUpdate(done!, { status: "later" }, at), null);
  assert.equal(applyTaskUpdate(done!, { name: "Still done" }, at)?.name, "Still done");
  assert.equal(applyTaskUpdate(done!, { status: "later", name: "Nope" }, at), null);
  assert.equal(applyTaskUpdate(open, { goal: other }, at), null);
  assert.equal(applyTaskUpdate(open, { priority: 3 }, at), null);
  assert.equal(applyTaskUpdate(open, { name: "  " }, at), null);
  assert.equal(applyTaskUpdate(open, {}, at), open);
});

test("the Coach's Kanban order is the strip, then the columns", () => {
  const areas = [area("Work", "kanban")];
  const goals = [goal("chores", "Work", 0, "Chores")];
  const tasks = [
    task("due", "Work", { date: today, age: today }),
    task("started-loose", "Work", { status: "started", age: "2026-10-01" }),
    task("started-chore", "Work", {
      status: "started",
      age: "2026-09-01",
      goalId: "chores",
    }),
    task("next", "Work", { status: "next", age: "2026-08-01" }),
    task("later", "Work", { age: "2026-07-01", goalId: "chores" }),
  ];
  assert.deepEqual(
    coachList(areas, tasks, today, goals).map((item) => [item.name, item.isNext]),
    [
      ["due", false],
      ["started-loose", true],
      ["started-chore", false],
      ["next", false],
      ["later", false],
    ],
  );
});
