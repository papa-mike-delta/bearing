import { describe, expect, it } from "vitest";
import {
  CORE_ITEM_TYPES, TASK_STATUSES, HABIT_TEMPLATES, BOOKMARK_CATEGORIES,
  MEDIA_FORMATS, DEFAULT_TASK_PRIORITY, isTaskPriority, isTaskStatus,
  isInProgressTask, isActiveTask, effectiveAreas, validateCapturedMoment,
} from "./contracts";

describe("Bearing V1 core contract", () => {
  it("has no Finance or independent Routine type", () => {
    expect(CORE_ITEM_TYPES).not.toContain("finance");
    expect(CORE_ITEM_TYPES).not.toContain("routine");
    expect(CORE_ITEM_TYPES).toContain("habit");
    expect(HABIT_TEMPLATES).toContain("routine");
  });

  it("accepts exactly five integer priority levels", () => {
    expect(DEFAULT_TASK_PRIORITY).toBe(0);
    for (const value of [-2, -1, 0, 1, 2]) expect(isTaskPriority(value)).toBe(true);
    for (const value of [-3, 3, 1.5, "1", null, undefined, NaN]) {
      expect(isTaskPriority(value)).toBe(false);
    }
  });

  it("stores Delegated independently while grouping it into In Progress", () => {
    expect(TASK_STATUSES).toContain("delegated");
    expect(isTaskStatus("delegated")).toBe(true);
    expect(isInProgressTask("delegated")).toBe(true);
    expect(isActiveTask("delegated")).toBe(true);
    expect(isInProgressTask("done")).toBe(false);
    expect(isActiveTask("archived")).toBe(false);
  });

  it("has simple Bookmark categories with extensible media classification", () => {
    expect(BOOKMARK_CATEGORIES).toEqual(["media", "place", "web", "file"]);
    expect(MEDIA_FORMATS).toContain("audiobook");
    expect(MEDIA_FORMATS).toContain("podcast");
  });

  it("unions direct Areas and inherited primary Project Areas without copying", () => {
    const direct = ["health", "learning"];
    const inherited = ["health", "relationships"];
    expect(effectiveAreas(direct, inherited)).toEqual(["health", "learning", "relationships"]);
    expect(direct).toEqual(["health", "learning"]);
    expect(effectiveAreas([])).toEqual([]);
  });

  it("validates offline moments before enqueue or server acknowledgement", () => {
    const captured = {
      clientId: "local-123", occurredAt: "2026-10-24T19:00:00.000Z",
      text: "Call Sarah about the book", intendedType: "task",
    };
    expect(validateCapturedMoment(captured)).toBe(true);
    expect(validateCapturedMoment({ ...captured, text: "  " })).toBe(false);
    expect(validateCapturedMoment({ ...captured, clientId: "" })).toBe(false);
    expect(validateCapturedMoment({ ...captured, intendedType: "finance" })).toBe(false);
    expect(validateCapturedMoment({ ...captured, occurredAt: "yesterday" })).toBe(false);
  });
});
