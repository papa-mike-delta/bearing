import { beforeEach, expect, it, vi } from "vitest";
import { SESSION_COOKIE, createSession } from "@/lib/session";
import { GET } from "./route";

const db = vi.hoisted(() => ({ ledger: { findFirst: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));
const request = (userId?: string, verified = true) => new Request("http://localhost/api/receipts/receipt", {
  headers: userId ? { cookie: `${SESSION_COOKIE}=${createSession(userId, `${userId}@example.test`, verified)}` } : {},
});
const ctx = { params: Promise.resolve({ id: "receipt" }) };
beforeEach(() => vi.resetAllMocks());
it("requires a session before looking up a receipt", async () => {
  expect((await GET(request(), ctx)).status).toBe(401);
  expect(db.ledger.findFirst).not.toHaveBeenCalled();
});
it("requires completed two-factor verification before looking up a receipt", async () => {
  expect((await GET(request("alice", false), ctx)).status).toBe(401);
  expect(db.ledger.findFirst).not.toHaveBeenCalled();
});
it("reads an owned ordinary receipt without enabling Coach", async () => {
  db.ledger.findFirst.mockResolvedValue({ id: "receipt", userId: "alice", actor: "user:alice", payload: '{"id":"item"}', receipt: '{"ok":false,"conflict":true,"currentRevision":2}' });
  const response = await GET(request("alice"), ctx);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ actor: "user:alice", payload: { id: "item" }, receipt: { conflict: true, currentRevision: 2 } });
  expect(db.ledger.findFirst).toHaveBeenCalledWith({ where: { id: "receipt", userId: "alice" } });
});
it.each(["missing", "other-users-receipt"])("hides %s with the same owner-scoped lookup", async () => {
  db.ledger.findFirst.mockResolvedValue(null);
  expect((await GET(request("bob"), ctx)).status).toBe(404);
  expect(db.ledger.findFirst).toHaveBeenCalledWith({ where: { id: "receipt", userId: "bob" } });
});
it("keeps legacy malformed stored payloads readable", async () => {
  db.ledger.findFirst.mockResolvedValue({ payload: "old payload", receipt: "old receipt" });
  expect(await (await GET(request("alice"), ctx)).json()).toMatchObject({ payload: "old payload", receipt: "old receipt" });
});
