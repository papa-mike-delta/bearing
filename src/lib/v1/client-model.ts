import type { CanonicalItem, ItemInput } from "./contracts";
export type TagRecord = { id: string; name: string; kind: "area" | "tag" };
export type ProjectRecord = {
  id: string;
  name: string;
  description: string;
  revision: number;
  status: string;
  tags: { tagId: string; tag: TagRecord }[];
};
export type ItemRecord = Omit<CanonicalItem, "tagIds"> & {
  selfProfile?: { userId: string } | null;
  id: string;
  revision: number;
  completedAt: string | null;
  createdAt: string;
  tags: { tagId: string; tag: TagRecord }[];
  directAreas: TagRecord[];
  inheritedAreas: TagRecord[];
  project: ProjectRecord | null;
};
export type MomentRecord = {
  id: string;
  clientId: string;
  revision: number;
  text: string;
  occurredAt: string;
  capturedAt: string;
  createdAt: string;
  localDate: string;
  timezone: string;
  needsOrganization: boolean;
  items: { itemId: string; relation: string }[];
};
export type ActivityRecord = {
  timezone: string;
  id: string;
  clientId: string;
  kind: string;
  localDate: string;
  occurredAt: string;
  data: Record<string, any>;
  itemId: string | null;
};
export type ReviewRecord = {
  id: string;
  period: string;
  localDate: string;
  prompts: Record<string, any>;
};
export type Workspace = {
  items: ItemRecord[];
  projects: ProjectRecord[];
  tags: TagRecord[];
  moments: MomentRecord[];
  activities: ActivityRecord[];
  reviews: ReviewRecord[];
  links: {
    id: string;
    fromId: string;
    toId: string;
    type: string;
    note: string;
  }[];
  habitOccurrences: { key: string; value: HabitOccurrence }[];
  trust?: {
    version: 1;
    revision: number;
    patterns: (
      | "file_raw_moment"
      | "create_open_task"
      | "link_existing"
    )[];
  };
  preferences: {
    startup?: string;
    timezone?: string;
    journalActivities?: boolean;
  };
};
export function itemSeed(item: ItemRecord) {
  return { ...item, tagIds: item.tags.map((entry) => entry.tagId) };
}
export function itemDto(data: Record<string, any>): ItemInput {
  return {
    type: data.type,
    template: data.template,
    title: data.title,
    content: data.content || "",
    status: data.status,
    priority: Number(data.priority),
    projectId: data.projectId || null,
    delegateId: data.delegateId || null,
    tagIds: data.tagIds || [],
    dueAt: data.dueAt || null,
    scheduledAt: data.scheduledAt || null,
    startAt: data.startAt || null,
    endAt: data.endAt || null,
    followUpAt: data.followUpAt || null,
    localDate: data.localDate || null,
    timezone: data.timezone || "UTC",
    metadata: data.metadata || { version: 1 },
  };
}
export const statusNames: Record<string, string> = {
  inbox: "Inbox",
  todo: "To do",
  in_progress: "In progress",
  delegated: "Delegated",
  done: "Done",
  archived: "Archived",
};
export const typeIcons: Record<string, string> = {
  task: "CheckSquare",
  note: "FileText",
  habit: "Repeat",
  event: "Calendar",
  person: "User",
  bookmark: "Bookmark",
  goal: "Target",
};

export function activitySummary(activity: ActivityRecord) {
  const data = activity.data;
  if (activity.kind === "check_in")
    return [
      data.mood
        ? `Mood ${["", "Low", "Meh", "Okay", "Good", "Great"][data.mood]} (${data.mood}/5)`
        : "",
      data.energy
        ? `Energy ${["", "Drained", "Low", "Steady", "Strong", "Charged"][data.energy]} (${data.energy}/5)`
        : "",
    ]
      .filter(Boolean)
      .join(" · ");
  if (activity.kind === "focus") return `${data.minutes} minutes`;
  if (activity.kind === "habit_completion")
    return `Completed${data.value == null ? "" : ` · ${data.value}`}`;
  if (activity.kind === "task_completion") return "Completed";
  return data.text || data.note || "Recorded";
}

export type HabitOccurrence = {
  revision: number;
  period: string;
  checklist: boolean[];
  content: string;
  value: number;
  completed: boolean;
};
