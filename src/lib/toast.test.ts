import { beforeEach, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  promise: vi.fn(),
  dismiss: vi.fn(),
}));
vi.mock("sonner", () => ({ toast }));

import { notify } from "./toast";

beforeEach(() => vi.resetAllMocks());

it("shows success and keeps errors on screen longer", () => {
  notify.success("Focus complete");
  notify.error("Could not save");
  expect(toast.success).toHaveBeenCalledWith("Focus complete", {
    description: undefined,
    duration: 4000,
  });
  expect(toast.error).toHaveBeenCalledWith("Could not save", {
    description: undefined,
    duration: 6000,
  });
});
