import { expect, it } from "vitest";
import { captureInput, captureIntent } from "./workflow-contracts";
import {
  instantFromInput,
  localDateTime,
  markdownTasks,
  plannedForDay,
  toggleMarkdownTask,
} from "./workflow-dates";
it("preserves unclassified text and only interprets complete explicit shortcuts", () => {
  const input = captureInput.parse({
    clientId: "capture-1",
    text: "  A thought\n",
    capturedAt: "2026-10-25T12:00:00Z",
    occurredAt: "2026-10-24T23:00:00Z",
    timezone: "America/New_York",
  });
  expect(input.text).toBe("  A thought\n");
  expect(captureIntent(input.text).kind).toBe("raw");
  expect(captureIntent("/task Call Alex")).toMatchObject({
    kind: "item",
    item: { type: "task", title: "Call Alex", status: "inbox" },
  });
  expect(captureIntent("/place Riverside")).toMatchObject({
    kind: "item",
    item: { type: "bookmark", metadata: { category: "place" } },
  });
  expect(captureIntent("/task").kind).toBe("raw");
  expect(captureIntent("/mood unsure").kind).toBe("raw");
  expect(captureIntent("/mood 4 energy 2")).toEqual({
    kind: "check_in",
    data: { mood: 4, energy: 2 },
  });
});
it("keeps due dates, work schedules and Event plans distinct", () => {
  expect(
    plannedForDay(
      {
        type: "task",
        localDate: "2026-10-25",
        scheduledAt: "2026-10-24T12:00:00Z",
      },
      "2026-10-25",
      "UTC",
    ),
  ).toBe("Due");
  expect(
    plannedForDay(
      { type: "task", scheduledAt: "2026-10-25T12:00:00Z" },
      "2026-10-25",
      "UTC",
    ),
  ).toBe("Scheduled work");
  expect(
    plannedForDay(
      {
        type: "event",
        startAt: "2026-10-24T23:00:00Z",
        endAt: "2026-10-25T01:00:00Z",
      },
      "2026-10-25",
      "UTC",
    ),
  ).toBe("Event plan");
  expect(
    plannedForDay(
      {
        type: "event",
        startAt: "2026-10-24T23:00:00Z",
        endAt: "2026-10-25T00:00:00Z",
      },
      "2026-10-25",
      "UTC",
    ),
  ).toBeNull();
});
it("backdates in the selected timezone and refuses nonexistent DST wall times", () => {
  expect(instantFromInput("2026-10-24T23:30", "America/New_York")).toBe(
    "2026-10-25T03:30:00.000Z",
  );
  expect(localDateTime("2026-10-25T03:30:00Z", "America/New_York")).toBe(
    "2026-10-24T23:30",
  );
  expect(() =>
    instantFromInput("2026-03-08T02:30", "America/New_York"),
  ).toThrow("does not exist");
});
it("toggles only real Markdown checkboxes, leaving fenced examples and other text intact", () => {
  const text =
    "# Plan\n- [ ] Call Alex\n```md\n- [ ] Example\n```\n1. [x] Stretch";
  expect(markdownTasks(text).map((t) => t.index)).toEqual([1, 5]);
  expect(toggleMarkdownTask(text, 1, true)).toContain("- [x] Call Alex");
  expect(toggleMarkdownTask(text, 3, true)).toBe(text);
});
