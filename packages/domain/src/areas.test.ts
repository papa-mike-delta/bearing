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
  viewArea,
  wipLimit,
  type AreaRecord,
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
