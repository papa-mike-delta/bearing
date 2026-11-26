import { expect, it } from "vitest";
import { BrowserWriteError, operationReceiptHref } from "./browser-writes";
import { createItemDraftOwner, itemDraftKey } from "./item-drafts";

const item = { id: "item-a", title: "New title", type: "note", revision: 3 };

it("uses the typed outcome, rather than HTTP status alone, for draft conflicts", () => {
  for (const [failure, conflict] of [
    [{ source: "user" as const, kind: "malformed" as const, status: 409, message: "Invalid response" }, false],
    [{ source: "user" as const, kind: "conflict" as const, status: 200, currentRevision: 5, message: "Changed" }, true],
  ] as const) {
    const owner = createItemDraftOwner();
    const key = itemDraftKey(item.id);
    owner.receive(key, item);
    owner.change(key, { title: "Unsaved" });
    owner.fail(owner.beginSave(key)!, new BrowserWriteError(failure));
    expect(owner.get(key)?.conflict).toBe(conflict);
    expect(owner.get(key)?.data.title).toBe("Unsaved");
  }
});

it("keeps a conflict receipt on the draft and links it to the shared ledger", () => {
  const owner = createItemDraftOwner();
  const key = itemDraftKey(item.id);
  owner.receive(key, { ...item, revision: 2 });
  owner.change(key, { title: "Unsaved" });
  const error = new BrowserWriteError({
    source: "user",
    kind: "conflict",
    status: 409,
    currentRevision: 9,
    receiptId: "receipt /1",
    message: "This record changed.",
  });
  owner.fail(owner.beginSave(key)!, error);
  expect(error).toMatchObject({ status: 409, receiptId: "receipt /1" });
  expect(owner.get(key)).toMatchObject({
    conflict: true,
    data: { title: "Unsaved", revision: 2 },
    failure: { receiptId: "receipt /1", currentRevision: 9 },
  });
  expect(operationReceiptHref("receipt /1", "user")).toBe("/api/receipts/receipt%20%2F1");
});
