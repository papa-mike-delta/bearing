import { expect, it } from "vitest";
import { NextRequest } from "next/server";
import { SESSION_COOKIE, createSession } from "@/lib/session";
import { proxy } from "./proxy";

const request = (path: string, token?: string) => new NextRequest(`http://localhost${path}`, {
  headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
});

it.each(["/", "/login"])("redirects a signed-in visit to %s to /app", (path) => {
  const response = proxy(request(path, createSession("u1", "a@example.com", true)));
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("http://localhost/app");
});

it.each([
  "/api/items",
  "/api/items/abc/links",
  "/api/coach",
  "/api/seed",
  "/api/preferences",
])("does not tombstone retired %s", (path) => {
  const authed = proxy(request(path, createSession("u1", "a@example.com", true)));
  expect(authed.status).toBe(200);
  expect(proxy(request(path)).status).toBe(401);
});

it("leaves theme, receipts and V1 on their own handlers", () => {
  const token = createSession("u1", "a@example.com", true);
  for (const path of ["/api/preferences/theme", "/api/receipts/r1", "/api/v1/workspace"]) {
    expect(proxy(request(path, token)).status).not.toBe(410);
  }
  expect(proxy(request("/api/v1/items")).status).toBe(401);
});

it.each([
  ["no cookie", undefined],
  ["a forged cookie", "forged"],
  ["a session still awaiting 2FA", createSession("u1", "a@example.com", false)],
])("serves the landing page uncached with %s", (_label, token) => {
  const response = proxy(request("/", token));
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("cache-control")).toBe("no-store");
});
