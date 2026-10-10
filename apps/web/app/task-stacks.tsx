"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import {
  kanbanColumns,
  maxAreaNameLength,
  maxPriority,
  minPriority,
  stackedPage,
  type AreaGoal,
  type AreaRecord,
  type GoalRecord,
  type KanbanColumn,
  type TaskGroup,
  type TaskRecord,
  type TaskStatus,
  type Workflow,
} from "@repo/domain";
import { useState, useSyncExternalStore, type DragEvent } from "react";
import { localToday } from "../lib/today";
import {
  addTaskToList,
  assignTaskGoal,
  changeTaskPriority,
  completeTaskOnList,
  createNamedGoal,
  deleteNamedGoal,
  moveNamedGoal,
  moveTaskOnList,
  renameNamedGoal,
  scheduleTaskOnList,
} from "./actions";

export type StackArea = {
  id: string;
  name: string;
  workflow: Workflow;
  wipLimit: number;
  createdAt: string;
};

export type StackGoal = {
  id: string;
  areaId: string;
  name: string;
  order: number;
};

export type StackTask = {
  id: string;
  areaId: string;
  name: string;
  note: string;
  priority: number;
  status: TaskStatus;
  previousStatus: TaskStatus | null;
  age: string;
  date: string | null;
  goalId: string | null;
  createdAt: string;
  completedAt: string | null;
};

const columnLabel: Record<KanbanColumn, string> = {
  started: "In progress",
  next: "Next",
  waiting: "Waiting",
  later: "Later",
};

function dayAfter(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, date! + 1))
    .toISOString()
    .slice(0, 10);
}

function formatDay(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function addTask(formData: FormData) {
  formData.set("today", localToday());
  return addTaskToList(formData);
}

function useBrowserToday() {
  return useSyncExternalStore(
    () => () => {},
    () => localToday(),
    () => null,
  );
}

function MoveTo({ task }: { task: TaskRecord }) {
  return (
    <form className="move" action={moveTaskOnList}>
      <input type="hidden" name="id" value={task.id} />
      <select
        className="choice"
        name="to"
        aria-label={`Move ${task.name} to`}
        defaultValue=""
        onChange={(event) => {
          event.currentTarget.form?.requestSubmit();
        }}
      >
        <option value="" disabled>
          Move to…
        </option>
        {kanbanColumns.map((column) => (
          <option key={column} value={column}>
            {columnLabel[column]}
          </option>
        ))}
      </select>
      <noscript>
        <Button type="submit" className="sr-only">
          Move
        </Button>
      </noscript>
    </form>
  );
}

function TaskLine({
  task,
  next,
  today,
  goals,
  move,
}: {
  task: TaskRecord;
  next: boolean;
  today: string;
  goals: AreaGoal[];
  move: "none" | "now-later" | "kanban";
}) {
  const [pickingDate, setPickingDate] = useState(false);
  const done = (
    <form action={completeTaskOnList}>
      <input type="hidden" name="id" value={task.id} />
      <Button
        type="submit"
        variant="outline"
        size="icon-xs"
        className="size-4 rounded-full"
        aria-label={`Complete ${task.name}`}
      />
    </form>
  );
  const priority = (
    <form action={changeTaskPriority}>
      <input type="hidden" name="id" value={task.id} />
      <Button
        type="submit"
        name="step"
        value="up"
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground"
        aria-label={`Raise ${task.name}`}
        disabled={task.priority >= maxPriority}
      >
        ↑
      </Button>
      <Button
        type="submit"
        name="step"
        value="down"
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground"
        aria-label={`Lower ${task.name}`}
        disabled={task.priority <= minPriority}
      >
        ↓
      </Button>
    </form>
  );
  const goal =
    goals.length > 0 ? (
      <form action={assignTaskGoal}>
        <input type="hidden" name="id" value={task.id} />
        <select
          className="choice"
          name="goal"
          aria-label={`Goal for ${task.name}`}
          defaultValue={task.goalId ?? ""}
        >
          <option value="">No goal</option>
          {goals.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="ghost" size="xs">
          Goal
        </Button>
      </form>
    ) : null;
  const schedule = (
    <form action={scheduleTaskOnList}>
      <input type="hidden" name="id" value={task.id} />
      <input type="hidden" name="today" value={today} />
      {pickingDate ? (
        <>
          <Input
            type="date"
            name="date"
            className="w-36"
            aria-label={`Date for ${task.name}`}
            min={dayAfter(today)}
            required
          />
          <Button type="submit" variant="ghost" size="xs">
            Set
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => setPickingDate(true)}
        >
          Date
        </Button>
      )}
    </form>
  );

  if (move === "kanban") {
    return (
      <li className="card">
        <span className="card-title">
          <span
            className="handle"
            draggable
            aria-label={`Drag ${task.name}`}
            onDragStart={(event: DragEvent<HTMLSpanElement>) => {
              event.dataTransfer.setData("text/plain", task.id);
              event.dataTransfer.effectAllowed = "move";
            }}
          >
            ⋮⋮
          </span>
          <span className="card-name">
            {next ? <span className="sr-only">Next: </span> : null}
            <span className={next ? "next-title" : undefined}>{task.name}</span>
            {task.note ? <small>{task.note}</small> : null}
            {task.date ? <small>{formatDay(task.date)}</small> : null}
          </span>
        </span>
        <div className="card-row">
          {done}
          {priority}
        </div>
        <MoveTo task={task} />
        <details>
          <summary>More</summary>
          {goal}
          {schedule}
        </details>
      </li>
    );
  }

  return (
    <li>
      {done}
      <span>
        {task.name}
        {task.note ? <small>{task.note}</small> : null}
        {task.date ? <small>{formatDay(task.date)}</small> : null}
        {task.status === "started" ? <small>In progress</small> : null}
        {task.status === "waiting" ? <small>Waiting</small> : null}
      </span>
      {next ? <strong>Next</strong> : null}
      {priority}
      {move === "now-later" &&
      task.status !== "next" &&
      task.status !== "started" &&
      task.status !== "waiting" ? (
        <form action={moveTaskOnList}>
          <input type="hidden" name="id" value={task.id} />
          <input type="hidden" name="to" value="now" />
          <Button type="submit" variant="outline" size="xs">
            Now
          </Button>
        </form>
      ) : null}
      {move === "now-later" && task.status !== "later" ? (
        <form action={moveTaskOnList}>
          <input type="hidden" name="id" value={task.id} />
          <input type="hidden" name="to" value="later" />
          <Button type="submit" variant="outline" size="xs">
            Later
          </Button>
        </form>
      ) : null}
      {goal}
      {schedule}
    </li>
  );
}

function TaskGroups({
  groups,
  nextId,
  today,
  goals,
  move,
}: {
  groups: TaskGroup[];
  nextId: string | null;
  today: string;
  goals: AreaGoal[];
  move: "none" | "now-later" | "kanban";
}) {
  return groups.map((group, index) => (
    <div key={`${group.goalId ?? "none"}-${index}`}>
      {group.name ? <h4>{group.name}</h4> : null}
      <ul>
        {group.tasks.map((task) => (
          <TaskLine
            key={task.id}
            task={task}
            next={task.id === nextId}
            today={today}
            goals={goals}
            move={move}
          />
        ))}
      </ul>
    </div>
  ));
}

function GoalList({ areaId, goals }: { areaId: string; goals: AreaGoal[] }) {
  return (
    <div className="goals">
      <h3>Goals</h3>
      {goals.length === 0 ? (
        <p>No goals yet.</p>
      ) : (
        <ul>
          {goals.map((goal, index) => (
            <li key={goal.id}>
              <form className="goal-rename" action={renameNamedGoal}>
                <input type="hidden" name="id" value={goal.id} />
                <Input
                  name="name"
                  aria-label={`Rename ${goal.name}`}
                  className="w-40 goal-rename"
                  defaultValue={goal.name}
                  maxLength={maxAreaNameLength}
                  required
                />
                <Button type="submit" variant="outline" size="xs">
                  Rename
                </Button>
              </form>
              <form action={moveNamedGoal}>
                <input type="hidden" name="id" value={goal.id} />
                <Button
                  type="submit"
                  name="direction"
                  value="up"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Move ${goal.name} up`}
                  disabled={index === 0}
                >
                  ↑
                </Button>
                <Button
                  type="submit"
                  name="direction"
                  value="down"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Move ${goal.name} down`}
                  disabled={index === goals.length - 1}
                >
                  ↓
                </Button>
              </form>
              <form action={deleteNamedGoal}>
                <input type="hidden" name="id" value={goal.id} />
                <Button type="submit" variant="ghost" size="xs">
                  Delete
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={createNamedGoal}>
        <input type="hidden" name="area" value={areaId} />
        <Input
          name="name"
          aria-label={`New goal in this area`}
          placeholder="New goal"
          maxLength={maxAreaNameLength}
          required
        />
        <Button type="submit">Add goal</Button>
      </form>
    </div>
  );
}

export function TaskStacks({
  areas,
  tasks,
  goals,
  hiddenAreaIds,
}: {
  areas: StackArea[];
  tasks: StackTask[];
  goals: StackGoal[];
  hiddenAreaIds: string[];
}) {
  const today = useBrowserToday();
  const [over, setOver] = useState<string | null>(null);
  if (!today) return null;
  const records: AreaRecord[] = areas.map((area) => ({
    ...area,
    createdAt: new Date(area.createdAt),
  }));
  const rows: TaskRecord[] = tasks.map((task) => ({
    ...task,
    createdAt: new Date(task.createdAt),
    completedAt: task.completedAt ? new Date(task.completedAt) : null,
  }));
  const goalRows: GoalRecord[] = goals;
  const pages = stackedPage(records, rows, hiddenAreaIds, today, goalRows);
  if (pages.length === 0) return <p>No areas showing.</p>;

  function dropOn(column: KanbanColumn, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setOver(null);
    const id = event.dataTransfer.getData("text/plain");
    if (!id) return;
    const data = new FormData();
    data.set("id", id);
    data.set("to", column);
    void moveTaskOnList(data);
  }

  return (
    <>
      {pages.map((view) => {
        const move =
          view.workflow === "kanban"
            ? "kanban"
            : view.workflow === "now-later"
              ? "now-later"
              : "none";
        return (
          <section className="stack" key={view.id}>
            <h2>{view.name}</h2>
            {view.warning ? (
              <p className="warning" role="status">
                {view.workflow === "kanban" ? "In progress" : "Now"} has more
                than {view.wipLimit}.
              </p>
            ) : null}
            <form action={addTask}>
              <input type="hidden" name="area" value={view.name} />
              <input type="hidden" name="today" value={today} />
              <Input
                name="name"
                aria-label={`New task in ${view.name}`}
                placeholder="New task"
                required
              />
              <Button type="submit">Add</Button>
            </form>
            {view.strip.length > 0 ? (
              <>
                <h3>Just came up</h3>
                <ul>
                  {view.strip.map((task) => (
                    <TaskLine
                      key={task.id}
                      task={task}
                      next={task.id === view.nextId}
                      today={today}
                      goals={view.goals}
                      move={move}
                    />
                  ))}
                </ul>
              </>
            ) : null}
            {view.workflow === "kanban" ? (
              <div className="board">
                {view.sections.map((column) => (
                  <div
                    key={column.id}
                    className={
                      over === `${view.id}:${column.id}` ? "column over" : "column"
                    }
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setOver(`${view.id}:${column.id}`);
                    }}
                    onDragLeave={() =>
                      setOver((current) =>
                        current === `${view.id}:${column.id}` ? null : current,
                      )
                    }
                    onDrop={(event) => {
                      if (
                        column.id === "started" ||
                        column.id === "next" ||
                        column.id === "waiting" ||
                        column.id === "later"
                      ) {
                        dropOn(column.id, event);
                      }
                    }}
                  >
                    <h3>{column.label}</h3>
                    {column.tasks.length === 0 ? (
                      <p>Empty</p>
                    ) : (
                      <TaskGroups
                        groups={column.groups}
                        nextId={view.nextId}
                        today={today}
                        goals={view.goals}
                        move="kanban"
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : view.sections.length === 0 ? (
              view.tasks.length === 0 ? (
                <p>No tasks yet.</p>
              ) : (
                <TaskGroups
                  groups={view.groups}
                  nextId={view.nextId}
                  today={today}
                  goals={view.goals}
                  move="none"
                />
              )
            ) : (
              view.sections.map((section) => (
                <div key={section.id}>
                  <h3 className="stack-heading">{section.label}</h3>
                  {section.tasks.length === 0 ? null : (
                    <TaskGroups
                      groups={section.groups}
                      nextId={view.nextId}
                      today={today}
                      goals={view.goals}
                      move="now-later"
                    />
                  )}
                </div>
              ))
            )}
            <details className="manage-goals">
              <summary>Manage goals</summary>
              <GoalList areaId={view.id} goals={view.goals} />
            </details>
          </section>
        );
      })}
    </>
  );
}
