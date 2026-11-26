import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";
import { DELETE, GET, POST } from "./route";

const settings = vi.hoisted(() => new Map<string, { id: string; value: string; userId?: string }>());
vi.mock("@/lib/db", () => ({ db: { setting: {
  findFirst: async ({ where }: { where: { id: string; userId?: string } }) => {
    const row = settings.get(where.id);
    return row && (!where.userId || row.userId === where.userId) ? row : null;
  },
  upsert: async ({ create }: { create: { id: string; value: string; userId?: string } }) => { settings.set(create.id, create); return create; },
  deleteMany: async ({ where }: { where: { id: string } }) => { settings.delete(where.id); },
} } }));

const fixture = (name: string) => readFileSync(new URL(`../../../../lib/fixtures/${name}`, import.meta.url), "utf8");
const request = (method = "GET", body?: unknown, userId: string | null = "user-1") => new Request("http://localhost/api/preferences/theme", {
  method,
  headers: userId ? { cookie: `${SESSION_COOKIE}=${createSession(userId, `${userId}@example.com`, true)}` } : {},
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

beforeEach(() => {
  settings.clear();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected network request")));
});
afterEach(() => vi.unstubAllGlobals());

it("imports CSS and restores the same override on a later settings request", async () => {
  expect(await (await GET(request())).json()).toEqual({ css: "" });
  const response = await POST(request("POST", { input: fixture("theme.css") }));
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.css).toContain(":root {\n  --background: oklch(1 0 0);");
  expect(result.css).toContain(".dark {\n  --background: oklch(0.145 0 0);");
  expect(result.css).not.toContain("@import");
  expect(await (await GET(request())).json()).toEqual(result);
});

it.each(["json", "url"])("accepts a %s import and returns a usable override", async (format) => {
  vi.mocked(fetch).mockResolvedValue(new Response(fixture("theme.json")));
  const response = await POST(request("POST", { input: format === "json" ? fixture("theme.json") : "https://ui.shadcn.com/create?theme=blue" }));
  expect(response.status).toBe(200);
  const { css } = await response.json();
  expect(css).toContain("--primary: oklch(0.488 0.243 264.376);");
  expect(css).toContain("--primary: oklch(0.424 0.199 265.638);");
  expect(await (await GET(request())).json()).toEqual({ css });
});

it.each([null, {}, { input: 1 }, { input: "body { color: red; }" }, { input: "https://evil.test/create" }, {
  input: '{"light":{"primary":"red; color:red"},"dark":{"primary":"black"}}',
}])("refuses invalid imports without replacing the saved override: %j", async (body) => {
  await POST(request("POST", { input: fixture("theme.css") }));
  const saved = await (await GET(request())).json();
  expect((await POST(request("POST", body))).status).toBe(400);
  expect(await (await GET(request())).json()).toEqual(saved);
});

it("writes a shipped preset and a create preset into the stored override", async () => {
  const bearing = await POST(request("POST", { input: "preset:bearing" }));
  expect(bearing.status).toBe(200);
  const saved = await bearing.json();
  expect(saved.css).toContain("--background: #f4efe4;");
  expect(saved.css).toContain("--background: #101e20;");
  expect(saved.css).toContain("--primary: #f0c779;");
  expect(saved.css).toContain("--chart-1: #c4923e;");
  expect(fetch).not.toHaveBeenCalled();
  expect(await (await GET(request())).json()).toEqual(saved);

  vi.mocked(fetch).mockResolvedValue(new Response(fixture("theme.json")));
  const teal = await POST(request("POST", { input: "preset:teal" }));
  expect(teal.status).toBe(200);
  const next = await teal.json();
  expect(next.css).toContain("--primary: oklch(0.488 0.243 264.376);");
  expect(next.css).toContain("--font-heading:");
  expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("theme=teal");
  expect(await (await GET(request())).json()).toEqual(next);

  expect((await POST(request("POST", { input: "preset:not-a-theme" }))).status).toBe(400);
  expect(await (await GET(request())).json()).toEqual(next);
});

it("isolates themes by authenticated user and resets only the current user's import", async () => {
  await POST(request("POST", { input: fixture("theme.css") }));
  expect(await (await GET(request("GET", undefined, "user-2"))).json()).toEqual({ css: "" });
  await POST(request("POST", { input: fixture("theme.json") }, "user-2"));
  const other = await (await GET(request("GET", undefined, "user-2"))).json();
  expect((await DELETE(request("DELETE"))).status).toBe(200);
  expect(await (await GET(request())).json()).toEqual({ css: "" });
  expect(await (await GET(request("GET", undefined, "user-2"))).json()).toEqual(other);
  expect((await DELETE(request("DELETE"))).status).toBe(200);
});

it("requires a verified session for loading, importing, and resetting", async () => {
  for (const handler of [GET, POST, DELETE]) {
    expect((await handler(request("POST", { input: fixture("theme.css") }, null))).status).toBe(401);
    expect((await handler(new Request("http://localhost/api/preferences/theme", { headers: { cookie: `${SESSION_COOKIE}=forged` } }))).status).toBe(401);
  }
  expect(fetch).not.toHaveBeenCalled();
});

it("refuses unsafe stored data, including data restored from a backup", async () => {
  settings.set("theme-user-1", { id: "theme-user-1", userId: "user-1", value: '{"light":{"--primary":"</style><script>alert(1)</script>"},"dark":{"--primary":"black"}}' });
  const response = await GET(request());
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Stored theme is invalid. Import a new theme or reset it." });
});

it("rejects a theme action when the signed-in cookie changed accounts", async () => {
  for (const [method, handler] of [["GET", GET], ["POST", POST], ["DELETE", DELETE]] as const) {
    const req = request(method, method === "POST" ? { input: fixture("theme.css") } : undefined, "user-2");
    req.headers.set("X-Bearing-Account", "user-1");
    expect((await handler(req)).status).toBe(409);
  }
  expect(settings.size).toBe(0);
});
