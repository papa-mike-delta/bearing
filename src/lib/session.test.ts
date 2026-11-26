import { afterEach, expect, it, vi } from "vitest";
import { SESSION_COOKIE, createSession, verifySession, sessionCookie } from "./session";
import { getUserFromRequest } from "./auth";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
it("rejects tampering, expiry and malformed signed claims", () => {
  const token = createSession("owner", "owner@example.test", true);
  expect(verifySession(token)?.userId).toBe("owner");
  expect(verifySession(token + "x")).toBeNull();
  expect(verifySession("garbage")).toBeNull();
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 8 * 86400_000);
  expect(verifySession(token)).toBeNull();
});
it("pending 2FA cannot authorize a data request and expires in ten minutes", async () => {
  const token = createSession("owner", "owner@example.test", false);
  expect(
    await getUserFromRequest(
      new Request("http://localhost", {
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      }),
    ),
  ).toBeNull();
  expect(verifySession(token)).not.toBeNull();
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 601_000);
  expect(verifySession(token)).toBeNull();
});
it("fails closed without a strong production secret and uses secure cookies", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SESSION_SECRET", "short");
  expect(() => createSession("u", "u@example.test", true)).toThrow(
    "SESSION_SECRET",
  );
  expect(verifySession("invalid")).toBeNull();
  vi.stubEnv(
    "SESSION_SECRET",
    "unique-production-secret-at-least-32-characters",
  );
  expect(
    verifySession(createSession("u", "u@example.test", true))
      ?.twoFactorVerified,
  ).toBe(true);
  expect(sessionCookie("test")).toContain("HttpOnly; SameSite=Lax");
  expect(sessionCookie("test")).toContain("; Secure");
});
