"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useStore } from "zustand";
import { createItemDraftOwner, normalizeItem, type ItemDraftOwner, type ItemSnapshot, type Draft } from "@/lib/item-drafts";
import { operationReceiptHref } from "@/lib/browser-writes";

const Context = createContext<{ owner: ItemDraftOwner; userId: string } | null>(null);

export function ItemDraftSession({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [owner] = useState(createItemDraftOwner);
  useEffect(() => () => owner.clear(), [owner]);
  return <Context.Provider value={{ owner, userId }}>{children}</Context.Provider>;
}

export function useDraftSession() {
  const session = useContext(Context);
  if (!session) throw new Error("Item drafts require a signed-in draft session");
  return session;
}

export function useItemDraft(key: string | null, seed?: ItemSnapshot | null) {
  const { owner } = useDraftSession();
  const draft = useStore(owner.store, (state) => key ? state.drafts[state.aliases[key] ?? key] : undefined);
  useEffect(() => {
    if (key && seed) owner.receive(key, seed);
  }, [owner, key, seed]);
  return { owner, draft, data: draft?.data ?? normalizeItem(seed ?? {}) };
}

export function DraftNotice({ draft, onDiscard, noun = "Item" }: { draft?: Draft; onDiscard: () => void; noun?: string }) {
  if (!draft?.dirtyFields.length && !draft?.error) return null;
  return <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2 text-xs">
    <span role={draft.error ? "alert" : "status"}>
      {draft.conflict ? `This ${noun} changed. Your edits are retained. Discard changes to load the latest version.` : draft.error ?? "Unsaved changes retained for this session."}
    </span>
    {draft.failure?.receiptId && <a className="underline" href={operationReceiptHref(draft.failure.receiptId, draft.failure.source)} target="_blank" rel="noreferrer">View receipt</a>}
    <button type="button" className="underline" disabled={!!draft.pending} onClick={onDiscard}>Discard changes</button>
  </div>;
}
