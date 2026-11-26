/**
 * Bearing V1 vocabulary and validation shared by UI, API and Coach.
 * These seven kinds are the product model. Do not add legacy Item types here
 * or convert stored Item rows into V1Item. See ADR 0005.
 *
 * Product authority: docs/redesign/BEARING_V1_SPEC.md
 */
export const CORE_ITEM_TYPES = [
  "task", "note", "habit", "event", "goal", "person", "bookmark",
] as const;
export type CoreItemType = (typeof CORE_ITEM_TYPES)[number];

export const TASK_STATUSES = [
  "inbox", "todo", "in_progress", "delegated", "done", "archived",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const ACTIVE_TASK_STATUSES: readonly TaskStatus[] = [
  "todo", "in_progress", "delegated",
];

export const BOOKMARK_CATEGORIES = [
  "media", "place", "web", "file",
] as const;
export type BookmarkCategory = (typeof BOOKMARK_CATEGORIES)[number];

export const MEDIA_FORMATS = [
  "book", "audiobook", "comic", "manga", "graphic_novel",
  "article", "research_paper", "movie", "tv_series", "documentary",
  "video", "album", "song", "podcast", "game", "course",
  "lecture", "tutorial", "other",
] as const;
export type MediaFormat = (typeof MEDIA_FORMATS)[number];

export const REVIEW_PERIODS = ["daily", "weekly", "monthly"] as const;
export type ReviewPeriod = (typeof REVIEW_PERIODS)[number];

export const DEFAULT_TASK_PRIORITY = 0;
export const MIN_TASK_PRIORITY = -2;
export const MAX_TASK_PRIORITY = 2;

export function isTaskPriority(value: unknown): value is -2 | -1 | 0 | 1 | 2 {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_TASK_PRIORITY &&
    value <= MAX_TASK_PRIORITY;
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" &&
    (TASK_STATUSES as readonly string[]).includes(value);
}

/** "Delegated" has its own persisted status but belongs in In Progress views. */
export function isInProgressTask(status: unknown): boolean {
  return status === "in_progress" || status === "delegated";
}

export function isActiveTask(status: unknown): boolean {
  return status === "todo" || isInProgressTask(status);
}

/** Habit templates, including a Routine, are not separate Item types. */
export const HABIT_TEMPLATES = ["habit", "routine"] as const;
export type HabitTemplate = (typeof HABIT_TEMPLATES)[number];

export const NOTE_TEMPLATES = [
  "note", "idea", "vision", "affirmation", "long_form",
] as const;

export type CapturedMoment = {
  clientId: string; // stable idempotency identifier generated before offline enqueue
  occurredAt: string; // ISO time of the experience, not necessarily when saved
  text: string;
  intendedType?: CoreItemType;
};

export function validateCapturedMoment(value: unknown): value is CapturedMoment {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<CapturedMoment>;
  return typeof candidate.clientId === "string" &&
    candidate.clientId.trim().length > 0 &&
    typeof candidate.text === "string" &&
    candidate.text.trim().length > 0 &&
    typeof candidate.occurredAt === "string" &&
    Number.isFinite(Date.parse(candidate.occurredAt)) &&
    (!candidate.intendedType ||
      (CORE_ITEM_TYPES as readonly string[]).includes(candidate.intendedType));
}

export function effectiveAreas(
  directlyAssignedAreaIds: readonly string[],
  primaryProjectAreaIds: readonly string[] = [],
): string[] {
  return [...new Set([...directlyAssignedAreaIds, ...primaryProjectAreaIds])];
}
