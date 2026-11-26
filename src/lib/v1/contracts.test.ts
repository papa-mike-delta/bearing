import { expect, it } from "vitest";
import {
  activityInput,
  itemInput,
  momentInput,
  reviewInput,
  recurrenceRule,
} from "./contracts";
import { dateInZone, localInstant, nextOccurrence } from "./dates";

it.each(["task", "note", "habit", "goal", "person"])(
  "normalizes %s metadata and defaults",
  (type) => {
    const value = itemInput.parse({ type, title: "Example" });
    expect(value.priority).toBe(0);
    expect(value.status).toBe("inbox");
    expect(value.metadata.version).toBe(1);
  },
);
it("uses templates and rejects retired core types", () => {
  expect(
    itemInput.parse({
      type: "habit",
      template: "routine",
      title: "Morning",
      content: "- [ ] Stretch",
    }).type,
  ).toBe("habit");
  for (const type of ["finance", "routine", "journal", "contact", "medication"])
    expect(itemInput.safeParse({ type, title: "Retired" }).success).toBe(false);
  expect(
    itemInput.safeParse({ type: "note", template: "routine", title: "Wrong" })
      .success,
  ).toBe(false);
});
it.each([-3, 3, 0.5, "1", null])("rejects invalid priority %s", (priority) =>
  expect(
    itemInput.safeParse({ type: "task", title: "Task", priority }).success,
  ).toBe(false),
);
it("rejects unknown/nested fields, mismatched metadata and invalid dates", () => {
  for (const data of [
    { userId: "other" },
    { metadata: { version: 2 } },
    { metadata: { version: 1, hidden: true } },
    { dueAt: "2026-10-25" },
    { timezone: "Mars/Olympus" },
  ])
    expect(
      itemInput.safeParse({ type: "task", title: "Task", ...data }).success,
    ).toBe(false);
  expect(
    itemInput.safeParse({ type: "note", title: " ", metadata: {} }).success,
  ).toBe(false);
});
it("validates lightweight Bookmarks without a tracker", () => {
  expect(
    itemInput.parse({
      type: "bookmark",
      template: "media",
      title: "A film",
      metadata: { version: 1, category: "media", format: "independent cinema" },
    }).metadata,
  ).toMatchObject({ format: "independent cinema" });
  expect(
    itemInput.safeParse({
      type: "bookmark",
      template: "place",
      title: "Here",
      metadata: { category: "place", latitude: 40 },
    }).success,
  ).toBe(false);
  expect(
    itemInput.safeParse({
      type: "bookmark",
      template: "web",
      title: "Bad",
      metadata: { category: "web", url: "javascript:alert(1)" },
    }).success,
  ).toBe(false);
});
it("requires an Event range and preserves date-only birthdays", () => {
  expect(itemInput.safeParse({ type: "event", title: "Meeting" }).success).toBe(
    false,
  );
  expect(
    itemInput.safeParse({
      type: "event",
      title: "Meeting",
      startAt: "2026-01-01T12:00:00Z",
      endAt: "2026-01-01T11:00:00Z",
    }).success,
  ).toBe(false);
  expect(
    itemInput.parse({
      type: "person",
      title: "Alex",
      metadata: { birthday: "2000-02-29" },
    }).metadata,
  ).toMatchObject({ birthday: "2000-02-29" });
  expect(
    itemInput.safeParse({
      type: "person",
      title: "Alex",
      metadata: { birthday: "2001-02-29" },
    }).success,
  ).toBe(false);
});
it("keeps Journal, repeatable check-ins and structured Reviews distinct", () => {
  expect(
    momentInput.parse({
      clientId: "offline_1",
      text: "A line",
      occurredAt: "2026-10-25T01:00:00Z",
      timezone: "America/New_York",
    }).needsOrganization,
  ).toBe(true);
  expect(
    activityInput.safeParse({
      clientId: "c1",
      occurredAt: "2026-10-25T01:00:00Z",
      timezone: "UTC",
      kind: "check_in",
      data: {},
    }).success,
  ).toBe(false);
  expect(
    reviewInput.safeParse({
      period: "monthly",
      localDate: "2026-10-01",
      timezone: "UTC",
      prompts: { notes: "A month" },
    }).success,
  ).toBe(true);
});
it("groups instants by the caller's local date", () => {
  expect(dateInZone("2026-10-25T01:00:00Z", "America/New_York")).toBe(
    "2026-10-24",
  );
  expect(dateInZone("2026-10-25T01:00:00Z", "Asia/Tokyo")).toBe("2026-10-25");
});
it("resolves DST gaps and overlaps deterministically", () => {
  expect(
    localInstant("2026-03-08", "02:30", "America/New_York").toISOString(),
  ).toBe("2026-03-08T07:00:00.000Z");
  expect(
    localInstant("2026-11-01", "01:30", "America/New_York").toISOString(),
  ).toBe("2026-11-01T05:30:00.000Z");
});
it("keeps calendar recurrence on the local clock and month-day anchor", () => {
  const rule = recurrenceRule.parse({
    mode: "calendar",
    unit: "day",
    interval: 1,
    timezone: "America/New_York",
    localTime: "09:00",
  });
  expect(
    nextOccurrence(
      rule,
      new Date("2026-03-07T14:00:00Z"),
      new Date("2026-03-09T16:00:00Z"),
    ).toISOString(),
  ).toBe("2026-03-08T13:00:00.000Z");
  const month = recurrenceRule.parse({
    ...rule,
    unit: "month",
    timezone: "UTC",
  });
  const jan = new Date("2026-01-31T09:00:00Z"),
    feb = nextOccurrence(month, jan, jan);
  expect(feb.toISOString()).toBe("2026-02-28T09:00:00.000Z");
  expect(nextOccurrence(month, feb, feb, jan).toISOString()).toBe(
    "2026-03-31T09:00:00.000Z",
  );
});
it("completion intervals anchor on actual completion, never on the overdue deadline", () => {
  const rule = recurrenceRule.parse({
    mode: "completion",
    unit: "day",
    interval: 2,
    timezone: "UTC",
  });
  expect(
    nextOccurrence(
      rule,
      new Date("2026-01-01T09:00:00Z"),
      new Date("2026-01-10T11:15:00Z"),
    ).toISOString(),
  ).toBe("2026-01-12T11:15:00.000Z");
});
