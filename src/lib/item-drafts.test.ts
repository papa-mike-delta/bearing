import { beforeEach, expect, it } from "vitest";
import { createItemDraftOwner, itemDraftKey, newDraftKey, normalizeItem } from "./item-drafts";

let owner: ReturnType<typeof createItemDraftOwner>;
const a = { id: "a", revision: 2, title: "A", type: "note", content: "Original", metadata: null };
const b = { id: "b", revision: 7, title: "B", type: "journal", content: "Other" };
const key = itemDraftKey(a.id);
beforeEach(() => { owner = createItemDraftOwner(); owner.receive(key, a); });

it("normalizes partial seeds and nullable metadata without sharing mutable data", () => {
  const seed = { type: "bookmark", metadata: null, tags: [{ tag: { name: "work" } }] };
  const normalized = normalizeItem(seed);
  expect(normalized).toMatchObject({ title: "", content: "", type: "bookmark", metadata: {}, tagNames: ["work"] });
  expect(normalized.revision).toBeUndefined();
  normalized.tags[0].tag.name = "changed";
  expect(seed.tags[0].tag.name).toBe("work");
});

it("does not invent a revision or initialize a different Item from a partial seed", () => {
  owner.receive(itemDraftKey("partial"), { id: "partial", type: "note" });
  owner.receive(itemDraftKey("wrong"), a);
  expect(owner.get(itemDraftKey("partial"))).toBeUndefined();
  expect(owner.get(itemDraftKey("wrong"))).toBeUndefined();
});

it("retains A's draft and revision across B and a dirty refetch", () => {
  owner.change(key, { content: "Unsaved A" });
  owner.receive(itemDraftKey(b.id), b);
  owner.change(itemDraftKey(b.id), { title: "Unsaved B" });
  owner.receive(key, { ...a, content: "Remote A", revision: 3 });
  expect(owner.get(key)?.data).toMatchObject({ id: "a", revision: 2, content: "Unsaved A" });
  expect(owner.beginSave(key)?.data.revision).toBe(2);
  expect(owner.get(itemDraftKey(b.id))?.data).toMatchObject({ id: "b", revision: 7, title: "Unsaved B" });
});

it("refreshes clean drafts and ignores out-of-order older snapshots", () => {
  owner.receive(key, { ...a, title: "Fresh", revision: 3 });
  owner.receive(key, a);
  expect(owner.get(key)?.data).toMatchObject({ revision: 3, title: "Fresh" });
});

it("retains content on a conflict and explicitly discards to the latest snapshot", () => {
  owner.change(key, { content: "Unsaved" });
  const ticket = owner.beginSave(key)!;
  owner.receive(key, { ...a, content: "Remote", revision: 3 });
  owner.fail(ticket, Object.assign(new Error("This Item changed"), { status: 409 }));
  expect(owner.get(key)).toMatchObject({ conflict: true, data: { content: "Unsaved", revision: 2 } });
  owner.discard(key);
  expect(owner.get(key)).toMatchObject({ data: { content: "Remote", revision: 3 }, dirtyFields: [] });
});

it("does not overwrite newer edits or another selected Item with a delayed success", () => {
  owner.change(key, { content: "Submitted" });
  const ticket = owner.beginSave(key)!;
  owner.receive(itemDraftKey(b.id), b);
  owner.change(itemDraftKey(b.id), { content: "B's draft" });
  owner.change(key, { content: "Typed while saving" });
  owner.complete(ticket, { ...a, content: "Submitted", revision: 3 });
  expect(owner.get(key)).toMatchObject({ data: { content: "Typed while saving", revision: 3 }, dirtyFields: ["content"] });
  expect(owner.get(itemDraftKey(b.id))?.data.content).toBe("B's draft");
  expect(owner.beginSave(key)?.data.revision).toBe(3);
});

it("retains unsaved fields when the detail view saves only content", () => {
  owner.change(key, { title: "Unsaved title", content: "Saved content" });
  const ticket = owner.beginSave(key, ["content"])!;
  owner.complete(ticket, { ...a, content: "Saved content", revision: 3 });
  expect(owner.get(key)).toMatchObject({ data: { title: "Unsaved title", content: "Saved content", revision: 3 }, dirtyFields: ["title"] });
});

it("applies a newer refetch after save without reviving a stale response", () => {
  owner.change(key, { content: "Saved" });
  const ticket = owner.beginSave(key)!;
  owner.receive(key, { ...a, content: "Saved", title: "New remote title", revision: 4 });
  owner.complete(ticket, { ...a, content: "Saved", revision: 3 });
  expect(owner.get(key)?.data).toMatchObject({ revision: 4, title: "New remote title" });
});

it("keeps distinct new drafts and adopts a saved identity without losing newer edits", () => {
  const first = newDraftKey(), second = newDraftKey();
  expect(first).not.toBe(second);
  owner.receive(first, { type: "journal" });
  owner.receive(second, { type: "journal" });
  owner.change(first, { content: "First" });
  owner.change(second, { content: "Second" });
  const ticket = owner.beginSave(first)!;
  owner.change(first, { content: "Newer" });
  owner.complete(ticket, { id: "created", revision: 0, type: "journal", content: "First" });
  owner.receive(first, { type: "journal" });
  expect(owner.get(first)).toBe(owner.get(itemDraftKey("created")));
  expect(owner.get(first)?.data).toMatchObject({ id: "created", content: "Newer", revision: 0 });
  expect(owner.get(second)?.data.content).toBe("Second");
});

it("prevents parallel saves and ignores duplicate/old completions", () => {
  const ticket = owner.beginSave(key)!;
  expect(owner.beginSave(key)).toBeNull();
  owner.complete(ticket, { ...a, revision: 3 });
  expect(owner.complete(ticket, { ...a, revision: 4 })).toBeNull();
  expect(owner.get(key)?.data.revision).toBe(3);
});

it("clears session data and rejects late responses after sign-out", () => {
  const ticket = owner.beginSave(key)!;
  owner.clear();
  owner.receive(key, { ...a, title: "Different session" });
  expect(owner.complete(ticket, { ...a, title: "Old response", revision: 3 })).toBeNull();
  owner.fail(ticket, new Error("Old refusal"));
  expect(owner.get(key)?.data.title).toBe("Different session");
  expect(owner.get(key)?.error).toBeUndefined();
});

it("leaves the draft intact on transport failure or a mismatched save response", () => {
  owner.change(key, { content: "Keep me" });
  let ticket = owner.beginSave(key)!;
  owner.fail(ticket, new Error("Network unavailable"));
  expect(owner.get(key)?.data.content).toBe("Keep me");
  ticket = owner.beginSave(key)!;
  expect(owner.complete(ticket, b)).toBeNull();
  expect(owner.get(key)).toMatchObject({ data: { id: "a", revision: 2, content: "Keep me" }, error: expect.stringContaining("Invalid save response") });
});

it("keeps Journal drafts in their own namespace when record ids coincide", () => {
  const owner = createItemDraftOwner();
  owner.receive("item:shared", {
    id: "shared",
    revision: 0,
    type: "note",
    title: "Item",
  });
  owner.receive("moment:shared", {
    id: "shared",
    revision: 0,
    type: "journal-moment",
    title: "Journal",
    content: "Original",
  });
  owner.change("moment:shared", { content: "Edited moment" });
  const ticket = owner.beginSave("moment:shared")!;
  owner.complete(
    ticket,
    {
      id: "shared",
      revision: 1,
      type: "journal-moment",
      title: "Journal",
      content: "Edited moment",
    },
    "moment",
  );
  expect(owner.get("item:shared")?.data.title).toBe("Item");
  expect(owner.get("moment:shared")?.data.content).toBe("Edited moment");
});
it("transient create completion retains concurrent edits and ignores stale account responses", () => {
  const owner = createItemDraftOwner();
  owner.receive("review:new", { wins: "" }); owner.receive("other", { content: "Unrelated" });
  owner.change("review:new", { wins: "First reflection" });
  const ticket = owner.beginSave("review:new")!;
  owner.change("review:new", { wins: "An edit while saving" });
  owner.completeTransient(ticket, { wins: "" });
  expect(owner.get("review:new")?.data.wins).toBe("An edit while saving");
  expect(owner.get("other")?.data.content).toBe("Unrelated");
  const next = owner.beginSave("review:new")!; owner.clear(); owner.completeTransient(next, { wins: "" });
  expect(owner.get("review:new")).toBeUndefined();
});
