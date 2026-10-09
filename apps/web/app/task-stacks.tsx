"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import {
  maxPriority,
  minPriority,
  stackedPage,
  type AreaRecord,
  type TaskRecord,
  type TaskStatus,
  type Workflow,
} from "@repo/domain";
import { useState, useSyncExternalStore } from "react";
import { localToday } from "../lib/today";
import {
  addTaskToList,
  changeTaskPriority,
  completeTaskOnList,
  moveTaskOnList,
  scheduleTaskOnList,
} from "./actions";

export type StackArea = {
  id: string;
  name: string;
  workflow: Workflow;
  wipLimit: number;
  createdAt: string;
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
  createdAt: string;
  completedAt: string | null;
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

function TaskLine({
  task,
  next,
  today,
  moves,
}: {
  task: TaskRecord;
  next: boolean;
  today: string;
  moves: boolean;
}) {
  const [pickingDate, setPickingDate] = useState(false);
  return (
    <li>
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
      <span>
        {task.name}
        {task.note ? <small>{task.note}</small> : null}
        {task.date ? <small>{formatDay(task.date)}</small> : null}
        {task.status === "started" ? <small>In progress</small> : null}
        {task.status === "waiting" ? <small>Waiting</small> : null}
      </span>
      {next ? <strong>Next</strong> : null}
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
      {moves && task.status !== "next" && task.status !== "started" && task.status !== "waiting" ? (
        <form action={moveTaskOnList}>
          <input type="hidden" name="id" value={task.id} />
          <input type="hidden" name="to" value="now" />
          <Button type="submit" variant="outline" size="xs">
            Now
          </Button>
        </form>
      ) : null}
      {moves && task.status !== "later" ? (
        <form action={moveTaskOnList}>
          <input type="hidden" name="id" value={task.id} />
          <input type="hidden" name="to" value="later" />
          <Button type="submit" variant="outline" size="xs">
            Later
          </Button>
        </form>
      ) : null}
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
    </li>
  );
}

export function TaskStacks({
  areas,
  tasks,
  hiddenAreaIds,
}: {
  areas: StackArea[];
  tasks: StackTask[];
  hiddenAreaIds: string[];
}) {
  const today = useBrowserToday();
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
  const pages = stackedPage(records, rows, hiddenAreaIds, today);
  if (pages.length === 0) return <p>No areas showing.</p>;
  return (
    <>
      {pages.map((view) => (
        <section className="stack" key={view.id}>
          <h2>{view.name}</h2>
          {view.warning ? (
            <p className="warning" role="status">
              Now has more than {view.wipLimit}.
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
                    next={false}
                    today={today}
                    moves
                  />
                ))}
              </ul>
            </>
          ) : null}
          {view.sections.length === 0 ? (
            view.tasks.length === 0 ? (
              <p>No tasks yet.</p>
            ) : (
              <ul>
                {view.tasks.map((task) => (
                  <TaskLine
                    key={task.id}
                    task={task}
                    next={task.id === view.nextId}
                    today={today}
                    moves={false}
                  />
                ))}
              </ul>
            )
          ) : (
            view.sections.map((section) => (
              <div key={section.id}>
                <h3 className="stack-heading">{section.label}</h3>
                {section.tasks.length === 0 ? null : (
                  <ul>
                    {section.tasks.map((task) => (
                      <TaskLine
                        key={task.id}
                        task={task}
                        next={task.id === view.nextId}
                        today={today}
                        moves
                      />
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
        </section>
      ))}
    </>
  );
}
