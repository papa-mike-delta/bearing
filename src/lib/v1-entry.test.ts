import { beforeEach, expect, it, vi } from "vitest";
import React from "react";
const { preferences } = vi.hoisted(() => ({ preferences: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "session" }) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("@/lib/session", () => ({
  SESSION_COOKIE: "bearing-session",
  verifySession: () => ({ userId: "alice", twoFactorVerified: true }),
}));
vi.mock("@/lib/v1/workflow", () => ({ Workflow: { preferences } }));
import AppPage from "@/app/app/page";
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.unstubAllEnvs();
  preferences.mockReset();
});
it("respects startup preference and opens a canonical route", async () => {
  preferences.mockResolvedValue({ startup: "journal" });
  await expect(AppPage()).rejects.toThrow("redirect:/app/journal");
});
it("surfaces a preference failure instead of swallowing it", async () => {
  preferences.mockRejectedValue(new Error("private database diagnostic"));
  await expect(AppPage()).rejects.toThrow("private database diagnostic");
});
