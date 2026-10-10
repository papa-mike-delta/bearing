// What an Area shows. No React, no database. The page renders this.

import {
  kanbanColumns,
  kanbanLabels,
  maxPriority,
  minPriority,
  nowStatuses,
  type KanbanColumn,
  type TaskStatus,
  type Workflow,
} from "@repo/domain";

export type MenuAction =
  | { type: "move"; to: "now" | KanbanColumn }
  | { type: "priority"; step: "up" | "down" }
  | { type: "goal"; goalId: string | null }
  | { type: "date" };

export type MenuItem = {
  label: string;
  enabled: boolean;
  current: boolean;
  action: MenuAction;
};

export type MenuGroup = {
  id: "move" | "priority" | "goal" | "date";
  label: "Move" | "Priority" | "Goal" | "Date";
  items: MenuItem[];
};

export type AreaGoalName = { id: string; name: string };

function moveGroup(
  workflow: Workflow,
  status: TaskStatus,
): MenuGroup | null {
  if (workflow === "kanban") {
    const items = kanbanColumns
      .filter((column) => column !== status)
      .map(
        (column): MenuItem => ({
          label: kanbanLabels[column],
          enabled: true,
          current: false,
          action: { type: "move", to: column },
        }),
      );
    return items.length ? { id: "move", label: "Move", items } : null;
  }
  if (workflow === "now-later") {
    if (status === "later") {
      return {
        id: "move",
        label: "Move",
        items: [
          {
            label: "Now",
            enabled: true,
            current: false,
            action: { type: "move", to: "now" },
          },
        ],
      };
    }
    if (nowStatuses.has(status)) {
      return {
        id: "move",
        label: "Move",
        items: [
          {
            label: "Later",
            enabled: true,
            current: false,
            action: { type: "move", to: "later" },
          },
        ],
      };
    }
  }
  return null;
}

export function taskMenu(input: {
  workflow: Workflow;
  status: TaskStatus;
  priority: number;
  goals: AreaGoalName[];
  goalId: string | null;
}): MenuGroup[] {
  const groups: MenuGroup[] = [];
  const move = moveGroup(input.workflow, input.status);
  if (move) groups.push(move);
  groups.push({
    id: "priority",
    label: "Priority",
    items: [
      {
        label: "Raise",
        enabled: input.priority < maxPriority,
        current: false,
        action: { type: "priority", step: "up" },
      },
      {
        label: "Lower",
        enabled: input.priority > minPriority,
        current: false,
        action: { type: "priority", step: "down" },
      },
    ],
  });
  if (input.goals.length > 0) {
    groups.push({
      id: "goal",
      label: "Goal",
      items: [
        ...input.goals.map(
          (goal): MenuItem => ({
            label: goal.name,
            enabled: true,
            current: goal.id === input.goalId,
            action: { type: "goal", goalId: goal.id },
          }),
        ),
        {
          label: "No goal",
          enabled: true,
          current: input.goalId === null,
          action: { type: "goal", goalId: null },
        },
      ],
    });
  }
  groups.push({
    id: "date",
    label: "Date",
    items: [
      {
        label: "Set date…",
        enabled: true,
        current: false,
        action: { type: "date" },
      },
    ],
  });
  return groups;
}

// The row is the sentence. Controls live in the menu, not here.
export function taskRow() {
  return {
    fields: ["complete", "name", "note", "date", "goal", "next"] as const,
    controls: [] as string[],
  };
}

export type KanbanColumnCount = {
  id: KanbanColumn;
  count: number;
  holdsNext: boolean;
};

export function kanbanFrame(input: {
  narrow: boolean;
  columns: KanbanColumnCount[];
  chosen: KanbanColumn | null;
}) {
  const ids = input.columns.map((column) => column.id);
  const fallback =
    input.columns.find((column) => column.holdsNext)?.id ??
    ids.find((id) => id === "started") ??
    ids[0]!;
  if (!input.narrow) {
    return { shown: ids, switcher: null, dragging: true };
  }
  const shown =
    input.chosen && ids.includes(input.chosen) ? input.chosen : fallback;
  return {
    shown: [shown],
    switcher: input.columns.map((column) => ({
      id: column.id,
      label: kanbanLabels[column.id],
      count: column.count,
    })),
    dragging: false,
  };
}
