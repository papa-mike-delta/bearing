import { describe, expect, it } from "vitest";
import type {
  ActivityRecord,
  ItemRecord,
  MomentRecord,
  ReviewRecord,
} from "./client-model";
import { WorkSurface } from "./surfaces";

function item(
  patch: Partial<ItemRecord> & Pick<ItemRecord, "id" | "title" | "type">,
): ItemRecord {
  return {
    content: "",
    status: "todo",
    priority: 0,
    projectId: null,
    delegateId: null,
    dueAt: null,
    scheduledAt: null,
    startAt: null,
    endAt: null,
    followUpAt: null,
    localDate: null,
    timezone: "America/New_York",
    metadata: { version: 1 },
    template: patch.type === "bookmark" ? "web" : patch.type,
    revision: 1,
    completedAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    tags: [],
    directAreas: [],
    inheritedAreas: [],
    project: null,
    ...patch,
  };
}

describe("WorkSurface", () => {
  const day = "2026-10-27";
  const zone = "America/New_York";

  it("keeps overdue deadlines and delegated work distinct from plans", () => {
    const items = [
      item({
        id: "late",
        title: "Late",
        type: "task",
        localDate: "2026-10-20",
        priority: 1,
      }),
      item({
        id: "instant",
        title: "Instant",
        type: "task",
        dueAt: "2026-10-26T03:30:00.000Z",
      }),
      item({
        id: "done",
        title: "Done",
        type: "task",
        status: "done",
        localDate: "2026-10-01",
      }),
      item({
        id: "delegated",
        title: "Delegated",
        type: "task",
        status: "delegated",
        priority: 2,
      }),
      item({
        id: "walk",
        title: "Walk",
        type: "event",
        startAt: "2026-10-27T14:00:00.000Z",
        endAt: "2026-10-27T15:00:00.000Z",
      }),
    ];
    const today = WorkSurface.today(items, day, zone);
    expect(today.overdue.map((entry) => entry.id)).toEqual(["late", "instant"]);
    expect(today.progress.map((entry) => entry.id)).toEqual(["delegated"]);
    expect(today.planned.map((entry) => entry.id)).toEqual(["walk"]);
    expect(today.open.map((entry) => entry.id)).not.toContain("done");
  });

  it("counts Inbox moments and unreferenced Inbox items once", () => {
    const moments = [
      {
        id: "m1",
        needsOrganization: true,
        items: [{ itemId: "linked", relation: "reference" }],
      },
      { id: "m2", needsOrganization: false, items: [] },
    ] as MomentRecord[];
    const items = [
      item({ id: "linked", title: "Linked", type: "task", status: "inbox" }),
      item({ id: "loose", title: "Loose", type: "note", status: "inbox" }),
      item({ id: "todo", title: "Todo", type: "task", status: "todo" }),
    ];
    const inbox = WorkSurface.inbox(items, moments);
    expect(inbox.moments.map((moment) => moment.id)).toEqual(["m1"]);
    expect(inbox.items.map((entry) => entry.id)).toEqual(["loose"]);
    expect(WorkSurface.organizeCount(items, moments)).toBe(2);
  });

  it("filters Library by effective Area and treats delegated as in progress", () => {
    const items = [
      item({
        id: "home",
        title: "Home",
        type: "task",
        status: "delegated",
        inheritedAreas: [{ id: "area-1", name: "Home", kind: "area" }],
      }),
      item({
        id: "note",
        title: "Note",
        type: "note",
        directAreas: [{ id: "area-1", name: "Home", kind: "area" }],
        tags: [{ tagId: "tag-1", tag: { id: "tag-1", name: "Idea", kind: "tag" } }],
      }),
    ];
    expect(
      WorkSurface.libraryItems(items, {
        type: "all",
        status: "in_progress",
        area: "",
        tag: null,
      }).map((entry) => entry.id),
    ).toEqual(["home"]);
    expect(
      WorkSurface.libraryItems(items, {
        type: "note",
        status: "all",
        area: "area-1",
        tag: "tag-1",
      }).map((entry) => entry.id),
    ).toEqual(["note"]);
  });

  it("splits a Project into prioritized lanes without dropping references", () => {
    const items = [
      item({
        id: "soon",
        title: "Soon",
        type: "task",
        projectId: "p",
        priority: 2,
      }),
      item({
        id: "later",
        title: "Later",
        type: "task",
        projectId: "p",
        priority: 0,
      }),
      item({
        id: "moving",
        title: "Moving",
        type: "task",
        status: "in_progress",
        projectId: "p",
      }),
      item({
        id: "note",
        title: "Note",
        type: "note",
        projectId: "p",
      }),
      item({ id: "other", title: "Other", type: "task", projectId: "q" }),
    ];
    const lanes = WorkSurface.projectLanes(items, "p");
    expect(lanes.waiting.map((entry) => entry.id)).toEqual(["soon", "later"]);
    expect(lanes.moving.map((entry) => entry.id)).toEqual(["moving"]);
    expect(lanes.context.map((entry) => entry.id)).toEqual(["note"]);
  });

  it("builds a Monday week and a Journal day without treating plans as history", () => {
    expect(WorkSurface.weekContaining("2026-10-27")).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
    expect(WorkSurface.weekContaining("2026-11-01")[0]).toBe("2026-10-26");
    const day = WorkSurface.journalDay({
      date: "2026-10-27",
      timezone: zone,
      showActivities: true,
      moments: [
        {
          id: "moment",
          clientId: "same",
          localDate: "2026-10-27",
          occurredAt: "2026-10-27T15:00:00.000Z",
        },
      ] as MomentRecord[],
      activities: [
        {
          id: "echo",
          clientId: "same",
          kind: "observation",
          localDate: "2026-10-27",
          occurredAt: "2026-10-27T15:00:00.000Z",
          timezone: zone,
          data: {},
          itemId: null,
        },
        {
          id: "focus",
          clientId: "focus",
          kind: "focus",
          localDate: "2026-10-27",
          occurredAt: "2026-10-27T16:00:00.000Z",
          timezone: zone,
          data: { minutes: 25 },
          itemId: null,
        },
      ] as ActivityRecord[],
      items: [
        item({
          id: "plan",
          title: "Plan",
          type: "task",
          localDate: "2026-10-27",
        }),
      ],
    });
    expect(day.timeline.map((entry) => entry.id)).toEqual(["moment", "focus"]);
    expect(day.planned.map((entry) => entry.id)).toEqual(["plan"]);
  });

  it("summarizes Reviews without inventing prompt text", () => {
    const reviews = [
      {
        id: "weekly",
        period: "weekly",
        localDate: "2026-10-24",
        prompts: { priorities: ["Walk"] },
      },
      {
        id: "daily",
        period: "daily",
        localDate: "2026-10-27",
        prompts: { wins: "  Made space  " },
      },
    ] as ReviewRecord[];
    expect(WorkSurface.sortedReviews(reviews).map((review) => review.id)).toEqual([
      "daily",
      "weekly",
    ]);
    expect(WorkSurface.reviewExcerpt(reviews[0])).toBe("Walk");
    expect(WorkSurface.reviewExcerpt(reviews[1])).toBe("Made space");
    expect(WorkSurface.reviewCounts(reviews)).toEqual({
      total: 2,
      daily: 1,
      weekly: 1,
      monthly: 0,
    });
  });
});
