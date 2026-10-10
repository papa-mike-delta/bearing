"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Menu } from "@base-ui/react/menu";
import {
  kanbanColumns,
  maxAreaNameLength,
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
import {
  kanbanFrame,
  taskMenu,
  type MenuItem,
} from "../lib/area-view";
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

function isColumn(id: string): id is KanbanColumn {
  return (kanbanColumns as readonly string[]).includes(id);
}

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

function usePhone() {
  return useSyncExternalStore(
    (onStoreChange) => {
      const query = window.matchMedia("(max-width: 480px)");
      query.addEventListener("change", onStoreChange);
      return () => query.removeEventListener("change", onStoreChange);
    },
    () => window.matchMedia("(max-width: 480px)").matches,
    () => false,
  );
}

function runMenu(taskId: string, item: MenuItem, onDate: () => void) {
  if (!item.enabled || item.current) return;
  if (item.action.type === "date") {
    onDate();
    return;
  }
  const data = new FormData();
  data.set("id", taskId);
  if (item.action.type === "move") {
    data.set("to", item.action.to);
    void moveTaskOnList(data);
  } else if (item.action.type === "priority") {
    data.set("step", item.action.step);
    void changeTaskPriority(data);
  } else {
    data.set("goal", item.action.goalId ?? "");
    void assignTaskGoal(data);
  }
}

function TaskMenu({
  task,
  goals,
  workflow,
  onDate,
}: {
  task: TaskRecord;
  goals: AreaGoal[];
  workflow: Workflow;
  onDate: () => void;
}) {
  const groups = taskMenu({
    workflow,
    status: task.status,
    priority: task.priority,
    goals,
    goalId: task.goalId,
  });
  return (
    <Menu.Root>
      <Menu.Trigger
        className="hit task-menu-trigger"
        aria-label={`Actions for ${task.name}`}
      >
        Actions
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner>
          <Menu.Popup className="task-menu">
            {groups.map((group) => (
              <Menu.Group key={group.id}>
                {group.id === "date" ? null : (
                  <Menu.GroupLabel className="task-menu-label">
                    {group.label}
                  </Menu.GroupLabel>
                )}
                {group.id === "goal" ? (
                  <Menu.RadioGroup value={task.goalId ?? ""}>
                    {group.items.map((item) => (
                      <Menu.RadioItem
                        key={`${group.id}-${item.label}`}
                        className="task-menu-item"
                        value={
                          item.action.type === "goal"
                            ? (item.action.goalId ?? "")
                            : item.label
                        }
                        disabled={!item.enabled}
                        closeOnClick
                        aria-current={item.current ? "true" : undefined}
                        onClick={() => runMenu(task.id, item, onDate)}
                      >
                        {item.label}
                        {item.current ? " (current)" : ""}
                      </Menu.RadioItem>
                    ))}
                  </Menu.RadioGroup>
                ) : (
                  group.items.map((item) => (
                    <Menu.Item
                      key={`${group.id}-${item.label}`}
                      className="task-menu-item"
                      disabled={!item.enabled}
                      aria-current={item.current ? "true" : undefined}
                      onClick={() => runMenu(task.id, item, onDate)}
                    >
                      {item.label}
                      {item.current ? " (current)" : ""}
                    </Menu.Item>
                  ))
                )}
              </Menu.Group>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function TaskLine({
  task,
  next,
  today,
  goals,
  workflow,
  drag,
}: {
  task: TaskRecord;
  next: boolean;
  today: string;
  goals: AreaGoal[];
  workflow: Workflow;
  drag: boolean;
}) {
  const [pickingDate, setPickingDate] = useState(false);
  const goalName = goals.find((goal) => goal.id === task.goalId)?.name;
  const kanbanNext = next && workflow === "kanban";
  return (
    <li
      draggable={drag}
      onDragStart={
        drag
          ? (event: DragEvent<HTMLLIElement>) => {
              event.dataTransfer.setData("text/plain", task.id);
              event.dataTransfer.effectAllowed = "move";
            }
          : undefined
      }
    >
      <div className="card-title">
        <form action={completeTaskOnList}>
          <input type="hidden" name="id" value={task.id} />
          <Button
            type="submit"
            variant="outline"
            size="icon-xs"
            className="hit rounded-full"
            aria-label={`Complete ${task.name}`}
          />
        </form>
        <span className={kanbanNext ? "card-name next-title" : "card-name"}>
          {kanbanNext ? <span className="sr-only">Next: </span> : null}
          {task.name}
          {task.note ? <small>{task.note}</small> : null}
          {task.date ? <small>{formatDay(task.date)}</small> : null}
          {goalName ? <small>{goalName}</small> : null}
          {workflow !== "kanban" && task.status === "started" ? (
            <small>In progress</small>
          ) : null}
          {workflow !== "kanban" && task.status === "waiting" ? (
            <small>Waiting</small>
          ) : null}
        </span>
      </div>
      {next && workflow !== "kanban" ? <strong>Next</strong> : null}
      <TaskMenu
        task={task}
        goals={goals}
        workflow={workflow}
        onDate={() => setPickingDate(true)}
      />
      {pickingDate ? (
        <form
          action={(formData) => {
            setPickingDate(false);
            return scheduleTaskOnList(formData);
          }}
        >
          <input type="hidden" name="id" value={task.id} />
          <input type="hidden" name="today" value={today} />
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
        </form>
      ) : null}
    </li>
  );
}

function TaskGroups({
  groups,
  nextId,
  today,
  goals,
  workflow,
  drag,
}: {
  groups: TaskGroup[];
  nextId: string | null;
  today: string;
  goals: AreaGoal[];
  workflow: Workflow;
  drag: boolean;
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
            workflow={workflow}
            drag={drag}
          />
        ))}
      </ul>
    </div>
  ));
}

function GoalList({ areaId, goals }: { areaId: string; goals: AreaGoal[] }) {
  return (
    <div className="goals">
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
  const phone = usePhone();
  const [over, setOver] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Record<string, KanbanColumn>>({});
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
    const task = rows.find((row) => row.id === id);
    if (!task || task.status === column) return;
    const data = new FormData();
    data.set("id", id);
    data.set("to", column);
    void moveTaskOnList(data);
  }

  return (
    <>
      {pages.map((view) => {
        const workflow = view.workflow;
        const frame =
          workflow === "kanban"
            ? kanbanFrame({
                narrow: phone,
                columns: view.sections.flatMap((column) =>
                  isColumn(column.id)
                    ? [
                        {
                          id: column.id,
                          count: column.tasks.length,
                          holdsNext: column.tasks.some(
                            (task) => task.id === view.nextId,
                          ),
                        },
                      ]
                    : [],
                ),
                chosen: chosen[view.id] ?? null,
              })
            : null;
        const shown = frame
          ? view.sections.filter((column) => {
              const id = column.id;
              return isColumn(id) && frame.shown.includes(id);
            })
          : [];
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
                      workflow={workflow}
                      drag={frame?.dragging ?? false}
                    />
                  ))}
                </ul>
              </>
            ) : null}
            {frame ? (
              <>
                {frame.switcher ? (
                  <div className="switcher" role="group" aria-label={`${view.name} columns`}>
                    {frame.switcher.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        className="hit"
                        aria-pressed={frame.shown[0] === entry.id}
                        onClick={() =>
                          setChosen((current) => ({
                            ...current,
                            [view.id]: entry.id,
                          }))
                        }
                      >
                        {entry.label} {entry.count}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className={frame.switcher ? undefined : "board"}>
                  {shown.map((column) => (
                    <div
                      key={column.id}
                      className={
                        over === `${view.id}:${column.id}` ? "column over" : "column"
                      }
                      onDragOver={
                        frame.dragging
                          ? (event) => {
                              event.preventDefault();
                              event.dataTransfer.dropEffect = "move";
                              setOver(`${view.id}:${column.id}`);
                            }
                          : undefined
                      }
                      onDragLeave={
                        frame.dragging
                          ? () =>
                              setOver((current) =>
                                current === `${view.id}:${column.id}` ? null : current,
                              )
                          : undefined
                      }
                      onDrop={
                        frame.dragging
                          ? (event) => {
                              const id = column.id;
                              if (isColumn(id)) dropOn(id, event);
                            }
                          : undefined
                      }
                    >
                      {frame.switcher ? null : <h3>{column.label}</h3>}
                      {column.tasks.length === 0 ? (
                        <p>Empty</p>
                      ) : (
                        <TaskGroups
                          groups={column.groups}
                          nextId={view.nextId}
                          today={today}
                          goals={view.goals}
                          workflow="kanban"
                          drag={frame.dragging}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : view.sections.length === 0 ? (
              view.tasks.length === 0 ? (
                <p>No tasks yet.</p>
              ) : (
                <TaskGroups
                  groups={view.groups}
                  nextId={view.nextId}
                  today={today}
                  goals={view.goals}
                  workflow={workflow}
                  drag={false}
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
                      workflow={workflow}
                      drag={false}
                    />
                  )}
                </div>
              ))
            )}
            <details className="manage-goals">
              <summary>Goals</summary>
              <GoalList areaId={view.id} goals={view.goals} />
            </details>
          </section>
        );
      })}
    </>
  );
}
