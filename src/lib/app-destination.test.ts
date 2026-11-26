import { expect, it } from "vitest";
import { appDestination, loginDestination } from "./app-destination";
it("preserves app deep links and rejects external or non-app destinations", () => {
  expect(appDestination("/app/library/abc?q=one#detail")).toBe(
    "/app/library/abc?q=one#detail",
  );
  expect(loginDestination("/app/journal?date=2026-10-25")).toBe(
    "/login?next=%2Fapp%2Fjournal%3Fdate%3D2026-10-25",
  );
  expect(loginDestination("/app")).toBe("/login");
  for (const value of [
    "https://evil.test/app",
    "//evil.test/app",
    "/\\evil.test/app",
    "/api/v1/items",
    "/application",
    "/app/../../login",
    null,
  ])
    expect(appDestination(value)).toBe("/app");
});
