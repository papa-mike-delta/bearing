import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  activeAccount,
  activateAccount,
  enqueue,
  listEntries,
  lockAccount,
  syncOutbox,
  formatLocalTime,
  localTimeToInstant,
} from "../../../public/bearing-outbox.js";
const identity = (userId = "alice") => ({
  userId,
  email: `${userId}@example.test`,
  expiresAt: Date.now() + 600000,
});
const capture = {
  clientId: "offline-1",
  text: "  A line\n",
  capturedAt: "2026-10-25T12:00:00Z",
  occurredAt: "2026-10-24T23:00:00Z",
  timezone: "America/New_York",
};
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
});
afterEach(() => vi.unstubAllGlobals());
it("durably isolates pending captures and locks the previous account without deleting its queue", async () => {
  await activateAccount(identity());
  await enqueue("alice", capture);
  await activateAccount(identity("bob"));
  expect(await listEntries("bob")).toEqual([]);
  await expect(
    enqueue("alice", { ...capture, clientId: "second" }),
  ).rejects.toThrow("account");
  expect(await listEntries("alice")).toHaveLength(1);
  await lockAccount();
  expect(await activeAccount()).toBeNull();
});
it("retains captures across network and lost-ack failures, then acknowledges the same client key", async () => {
  await activateAccount(identity());
  await enqueue("alice", capture);
  const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("offline"));
  expect(await syncOutbox("alice", { fetcher })).toMatchObject({
    offline: true,
  });
  expect((await listEntries("alice"))[0]).toMatchObject({
    status: "pending",
    text: capture.text,
  });
  const bodies: string[] = [];
  const server = vi.fn(async (_url: string, init: RequestInit = {}) => {
    if (!init.method) return Response.json(identity());
    bodies.push(String(init.body));
    if (bodies.length === 1) throw new TypeError("ack lost after commit");
    return Response.json({ ok: true, value: { id: "server-1" } });
  });
  await syncOutbox("alice", { fetcher: server });
  await syncOutbox("alice", { fetcher: server });
  expect(bodies[0]).toBe(bodies[1]);
  expect((await listEntries("alice"))[0]).toMatchObject({
    status: "synced",
    serverId: "server-1",
  });
});
it("never uploads an old queue into a different verified session", async () => {
  await activateAccount(identity());
  await enqueue("alice", capture);
  const fetcher = vi.fn(async () => Response.json(identity("bob")));
  expect(await syncOutbox("alice", { fetcher })).toMatchObject({
    locked: true,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(await activeAccount()).toBeNull();
  expect(await listEntries("alice")).toHaveLength(1);
});
it("preserves explicit server errors until an intentional retry and rejects missing acknowledgment", async () => {
  await activateAccount(identity());
  await enqueue("alice", capture);
  let fail = true;
  const fetcher = vi.fn(async (_url, init: RequestInit = {}) =>
    !init.method
      ? Response.json(identity())
      : fail
        ? Response.json({ error: "Create limit reached" }, { status: 429 })
        : Response.json({ ok: true, value: { id: "server-1" } }),
  );
  await syncOutbox("alice", { fetcher });
  expect((await listEntries("alice"))[0]).toMatchObject({
    status: "error",
    error: "Create limit reached",
  });
  fail = false;
  await syncOutbox("alice", { fetcher });
  expect((await listEntries("alice"))[0].status).toBe("error");
  await syncOutbox("alice", { fetcher, retryErrors: true });
  expect((await listEntries("alice"))[0].status).toBe("synced");
});
it("uses the same selected-zone clock and DST rules in the static shell", () => {
  expect(formatLocalTime("2026-10-25T03:30:00Z", "America/New_York")).toBe(
    "2026-10-24T23:30",
  );
  expect(localTimeToInstant("2026-10-24T23:30", "America/New_York")).toBe(
    "2026-10-25T03:30:00.000Z",
  );
  expect(() =>
    localTimeToInstant("2026-03-08T02:30", "America/New_York"),
  ).toThrow("does not exist");
});
