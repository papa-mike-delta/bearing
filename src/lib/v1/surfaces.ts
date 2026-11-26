import type {
  ActivityRecord,
  ItemRecord,
  MomentRecord,
  ProjectRecord,
  ReviewRecord,
} from "./client-model";
import { dateInZone } from "./dates";
import { plannedForDay } from "./workflow-dates";

const closed = new Set(["done", "archived"]);

export type LibraryFilter = {
  type: string;
  status: string;
  area: string;
  tag: string | null;
};

/** Read-only groupings for the signed-in work surfaces. No second store. */
export class WorkSurface {
  static openTasks(items: ItemRecord[]) {
    return items.filter(
      (item) => item.type === "task" && !closed.has(item.status),
    );
  }

  static today(items: ItemRecord[], date: string, timezone: string) {
    const open = WorkSurface.openTasks(items);
    return {
      open,
      overdue: WorkSurface.byPriority(
        open.filter(
          (item) =>
            (item.localDate && item.localDate < date) ||
            (item.dueAt && dateInZone(item.dueAt, timezone) < date),
        ),
      ),
      progress: WorkSurface.byPriority(
        open.filter((item) =>
          ["in_progress", "delegated"].includes(item.status),
        ),
      ),
      planned: items.filter(
        (item) => !closed.has(item.status) && plannedForDay(item, date, timezone),
      ),
    };
  }

  static inbox(items: ItemRecord[], moments: MomentRecord[]) {
    const waitingMoments = moments.filter((moment) => moment.needsOrganization);
    const referenced = new Set(
      waitingMoments.flatMap((moment) => moment.items.map((ref) => ref.itemId)),
    );
    return {
      moments: waitingMoments,
      items: items.filter(
        (item) => item.status === "inbox" && !referenced.has(item.id),
      ),
    };
  }

  static organizeCount(items: ItemRecord[], moments: MomentRecord[]) {
    const waiting = WorkSurface.inbox(items, moments);
    return waiting.moments.length + waiting.items.length;
  }

  static journalDay(input: {
    moments: MomentRecord[];
    activities: ActivityRecord[];
    items: ItemRecord[];
    date: string;
    timezone: string;
    showActivities: boolean;
  }) {
    const moments = input.moments.filter(
      (moment) => moment.localDate === input.date,
    );
    const activities = input.activities.filter(
      (activity) =>
        activity.localDate === input.date &&
        !input.moments.some((moment) => moment.clientId === activity.clientId),
    );
    const planned = input.items.filter(
      (item) =>
        !closed.has(item.status) &&
        plannedForDay(item, input.date, input.timezone),
    );
    const timeline = [
      ...moments.map((moment) => ({
        time: moment.occurredAt,
        id: moment.id,
        kind: "moment" as const,
        moment,
      })),
      ...(input.showActivities
        ? activities.map((activity) => ({
            time: activity.occurredAt,
            id: activity.id,
            kind: "activity" as const,
            activity,
          }))
        : []),
    ].sort((a, b) => a.time.localeCompare(b.time));
    return { moments, activities, planned, timeline };
  }

  static agenda(items: ItemRecord[], date: string, timezone: string) {
    const rows = items.flatMap((item) => {
      if (item.status === "archived") return [];
      const context = plannedForDay(item, date, timezone);
      return context ? [{ item, context }] : [];
    });
    return {
      rows,
      events: rows.filter((row) => row.context === "Event plan"),
      scheduled: rows.filter((row) => row.context === "Scheduled work"),
      due: rows.filter((row) => row.context === "Due"),
    };
  }

  static weekContaining(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [date];
    const [year, month, day] = date.split("-").map(Number);
    const utc = new Date(Date.UTC(year, month - 1, day));
    const weekday = utc.getUTCDay();
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    return Array.from({ length: 7 }, (_, index) => {
      const cursor = new Date(utc);
      cursor.setUTCDate(utc.getUTCDate() + mondayOffset + index);
      return cursor.toISOString().slice(0, 10);
    });
  }

  static formatDay(date: string, options: Intl.DateTimeFormatOptions = {}) {
    const [year, month, day] = date.split("-").map(Number);
    return new Intl.DateTimeFormat(undefined, {
      timeZone: "UTC",
      ...options,
    }).format(new Date(Date.UTC(year, month - 1, day)));
  }

  static projectSnapshot(project: ProjectRecord, items: ItemRecord[]) {
    const lanes = WorkSurface.projectLanes(items, project.id);
    return {
      open: lanes.waiting.length,
      moving: lanes.moving.length,
      done: lanes.finished.length,
      references: lanes.context.length,
      areas: project.tags
        .filter((entry) => entry.tag.kind === "area")
        .map((entry) => entry.tag.name),
    };
  }

  static projectLanes(items: ItemRecord[], projectId: string) {
    const owned = items.filter((item) => item.projectId === projectId);
    const tasks = owned.filter((item) => item.type === "task");
    const known = new Set([
      "inbox",
      "todo",
      "in_progress",
      "delegated",
      "done",
      "archived",
    ]);
    return {
      waiting: WorkSurface.byPriority(
        tasks.filter(
          (item) =>
            ["inbox", "todo"].includes(item.status) || !known.has(item.status),
        ),
      ),
      moving: WorkSurface.byPriority(
        tasks.filter((item) =>
          ["in_progress", "delegated"].includes(item.status),
        ),
      ),
      finished: tasks.filter((item) =>
        ["done", "archived"].includes(item.status),
      ),
      context: owned.filter((item) => item.type !== "task"),
    };
  }

  static libraryItems(items: ItemRecord[], filter: LibraryFilter) {
    return items.filter(
      (item) =>
        (filter.type === "all" || item.type === filter.type) &&
        (filter.status === "all" ||
          (filter.status === "in_progress"
            ? ["in_progress", "delegated"].includes(item.status)
            : item.status === filter.status)) &&
        (!filter.area ||
          [...item.directAreas, ...item.inheritedAreas].some(
            (area) => area.id === filter.area,
          )) &&
        (!filter.tag || item.tags.some((entry) => entry.tagId === filter.tag)),
    );
  }

  static reviewCounts(reviews: ReviewRecord[]) {
    return {
      total: reviews.length,
      daily: reviews.filter((review) => review.period === "daily").length,
      weekly: reviews.filter((review) => review.period === "weekly").length,
      monthly: reviews.filter((review) => review.period === "monthly").length,
    };
  }

  static sortedReviews(reviews: ReviewRecord[]) {
    return [...reviews].sort(
      (a, b) =>
        b.localDate.localeCompare(a.localDate) ||
        a.period.localeCompare(b.period),
    );
  }

  static reviewExcerpt(review: ReviewRecord) {
    for (const key of ["wins", "learnings", "gratitude", "notes", "challenges"]) {
      const value = review.prompts[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    const priorities = review.prompts.priorities;
    if (Array.isArray(priorities) && priorities.length)
      return priorities.join(" · ");
    return "Saved reflection";
  }

  static byPriority(items: ItemRecord[]) {
    return [...items].sort(
      (a, b) =>
        b.priority - a.priority ||
        (a.localDate || "9999").localeCompare(b.localDate || "9999") ||
        a.title.localeCompare(b.title),
    );
  }
}
