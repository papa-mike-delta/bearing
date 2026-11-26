import { describe, it, expect } from "vitest";
import {
  habitPeriod,
  navigationUrl,
  personContext,
  graphData,
  upcomingDates,
} from "./connected";
import { plannedForDay } from "./workflow-dates";
import type { Workspace } from "./client-model";
const workspace = (patch: Partial<Workspace> = {}) =>
  ({
    items: [],
    projects: [],
    links: [],
    moments: [],
    activities: [],
    reviews: [],
    tags: [],
    habitOccurrences: [],
    preferences: {},
    ...patch,
  }) as Workspace;
describe("connected life projections", () => {
  it("anchors Habit cadence in its timezone, Monday week and calendar month", () => {
    expect(
      habitPeriod("2026-11-01T03:30:00Z", "America/New_York", "daily"),
    ).toBe("2026-10-31");
    expect(
      habitPeriod("2026-11-01T03:30:00Z", "America/New_York", "weekly"),
    ).toBe("2026-10-26");
    expect(
      habitPeriod("2026-11-01T03:30:00Z", "America/New_York", "monthly"),
    ).toBe("2026-10");
  });
  it("navigates coordinates without requiring an address or venue service", () => {
    expect(navigationUrl({ latitude: 0, longitude: -73.5 })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=0%2C-73.5",
    );
    expect(navigationUrl({ address: "100 Main St & 2nd" })).toContain(
      "100%20Main%20St%20%26%202nd",
    );
    expect(navigationUrl({})).toBeNull();
  });
  it("keeps a Person mention separate from a real interaction and a plan", () => {
    const data = workspace({
      items: [
        {
          id: "task",
          type: "task",
          status: "delegated",
          delegateId: "alex",
          followUpAt: "2026-10-25T12:00:00Z",
        },
        { id: "book", type: "bookmark" },
      ] as any,
      links: [
        { id: "l", fromId: "alex", toId: "book", type: "related_to", note: "" },
      ],
      moments: [
        { id: "m", items: [{ itemId: "alex", relation: "mention" }] },
      ] as any,
    });
    const context = personContext(data, "alex");
    expect(context.mentions).toHaveLength(1);
    expect(context.interactions).toEqual([]);
    expect(context.followUps.map((i) => i.id)).toEqual(["task"]);
    expect(context.linked.map((i) => i.id)).toEqual(["task", "book"]);
  });
  it("builds Graph edges from actual links and Project membership without copying Items", () => {
    const graph = graphData(
      workspace({
        items: [
          { id: "one", type: "note", title: "One", projectId: "p" },
          { id: "two", type: "goal", title: "Two" },
        ] as any,
        projects: [{ id: "p", name: "Project" }] as any,
        links: [
          { id: "l", fromId: "one", toId: "two", type: "advances", note: "" },
        ],
      }),
    );
    expect(graph.nodes.map((n) => n.id)).toEqual(["one", "two", "p"]);
    expect(graph.edges.map((e) => [e.source, e.target])).toEqual([
      ["one", "two"],
      ["one", "p"],
    ]);
  });
  it("counts an Event ending at midnight only on days it overlaps", () => {
    const event = {
      type: "event",
      startAt: "2026-10-25T22:00:00-04:00",
      endAt: "2026-10-26T00:00:00-04:00",
    };
    expect(plannedForDay(event, "2026-10-25", "America/New_York")).toBe(
      "Event plan",
    );
    expect(plannedForDay(event, "2026-10-26", "America/New_York")).toBeNull();
  });
  it("includes both scheduled/deadline data without duplicating the canonical Task", () => {
    const task = {
      type: "task",
      scheduledAt: "2026-10-25T12:00:00Z",
      localDate: "2026-10-25",
    };
    expect(
      [task].filter((i) => plannedForDay(i, "2026-10-25", "UTC")),
    ).toHaveLength(1);
  });
  it("shows optional important dates across the year boundary without contact scoring", () => {
    const items = [
      {
        id: "person",
        type: "person",
        title: "Alex",
        status: "todo",
        metadata: {
          birthday: "1990-01-03",
          importantDates: [{ label: "Anniversary", date: "2020-12-28" }],
        },
      },
    ] as any;
    expect(upcomingDates(items, "2026-12-20").map((d) => d.date)).toEqual([
      "2026-12-28",
      "2027-01-03",
    ]);
  });
});

import { canonicalJson } from "./json";
it("compares Activity payloads independently of PostgreSQL JSONB key ordering", () => {
  expect(canonicalJson({ mood: 4, energy: 3 })).toBe(
    canonicalJson({ energy: 3, mood: 4 }),
  );
  expect(
    canonicalJson({
      value: 1,
      checklist: [true, false],
      content: "x",
      period: "2026-10-25",
    }),
  ).toBe(
    canonicalJson({
      period: "2026-10-25",
      content: "x",
      checklist: [true, false],
      value: 1,
    }),
  );
  expect(canonicalJson({ value: 1 })).not.toBe(canonicalJson({ value: 2 }));
});
