import { createStore } from "zustand/vanilla";
import { BrowserWriteError, type WriteFailure } from "./browser-writes";

export type ItemSnapshot = Record<string, any>;
export type Draft = {
  data: ItemSnapshot;
  baseline: ItemSnapshot;
  latest: ItemSnapshot;
  dirtyFields: string[];
  pending?: number;
  error?: string;
  conflict?: boolean;
  failure?: WriteFailure;
};
export type SaveTicket = {
  key: string; epoch: number; request: number;
  data: ItemSnapshot; fields: string[];
};

export const itemDraftKey = (id: string) => `item:${id}`;
export const newDraftKey = () => `new:${crypto.randomUUID()}`;

/** UI snapshots are normalized once, without inventing a revision for an Item. */
export function normalizeItem(seed: ItemSnapshot = {}): ItemSnapshot {
  return structuredClone({
    ...seed,
    title: seed.title ?? "", type: seed.type ?? "task", content: seed.content ?? "",
    status: seed.status ?? "active", priority: seed.priority ?? 0,
    domainId: seed.domainId ?? "", projectId: seed.projectId ?? "",
    dueDate: seed.dueDate ?? "", scheduledAt: seed.scheduledAt ?? "",
    metadata: seed.metadata && typeof seed.metadata === "object" ? seed.metadata : {},
    tagNames: seed.tagNames ?? seed.tags?.map((entry: any) => entry.tag.name) ?? [],
  });
}

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const dirty = (data: ItemSnapshot, baseline: ItemSnapshot) =>
  Object.keys(data).filter((field) => field !== "id" && field !== "revision" && !equal(data[field], baseline[field]));

/** One session owns identity, draft, baseline revision and pending save together. */
export function createItemDraftOwner() {
  const store = createStore<{ drafts: Record<string, Draft>; aliases: Record<string, string> }>(() => ({ drafts: {}, aliases: {} }));
  let epoch = 0;
  let request = 0;
  const resolve = (key: string) => store.getState().aliases[key] ?? key;
  const get = (key: string) => store.getState().drafts[resolve(key)];
  const put = (key: string, draft: Draft) => store.setState((state) => ({ drafts: { ...state.drafts, [resolve(key)]: draft } }));
  const owner = {
    store, get,
    get generation() { return epoch; },
    receive(key: string, seed: ItemSnapshot) {
      if (seed.id && (!Number.isSafeInteger(seed.revision) || seed.revision < 0)) return;
      if (seed.id && key.startsWith("item:") && key !== itemDraftKey(seed.id)) return;
      const snapshot = normalizeItem(seed);
      const previous = get(key);
      if (previous) {
        if (previous.data.id && !snapshot.id) return;
        // Ignore stale query/list seeds after a successful save.
        if (snapshot.id && snapshot.revision < previous.latest.revision) return;
        if (equal(snapshot, previous.latest)) return;
        if (previous.dirtyFields.length || previous.pending) {
          put(key, { ...previous, latest: snapshot });
          return;
        }
      }
      put(key, { data: snapshot, baseline: snapshot, latest: snapshot, dirtyFields: [] });
    },
    change(key: string, patch: ItemSnapshot) {
      const previous = get(key);
      if (!previous) return;
      const { id, revision, ...editable } = patch;
      const data = { ...previous.data, ...structuredClone(editable) };
      put(key, { ...previous, data, dirtyFields: dirty(data, previous.baseline), error: undefined, conflict: false, failure: undefined });
    },
    discard(key: string) {
      const previous = get(key);
      if (!previous || previous.pending) return;
      put(key, { data: previous.latest, baseline: previous.latest, latest: previous.latest, dirtyFields: [] });
    },
    beginSave(key: string, fields?: string[]): SaveTicket | null {
      const draft = get(key);
      if (!draft || draft.pending) return null;
      const ticket = { key: resolve(key), epoch, request: ++request, data: structuredClone(draft.data), fields: fields ?? Object.keys(draft.data) };
      put(key, { ...draft, pending: ticket.request, error: undefined, conflict: false, failure: undefined });
      return ticket;
    },
    complete(ticket: SaveTicket, saved: ItemSnapshot, namespace = "item") {
      const current = get(ticket.key);
      if (ticket.epoch !== epoch || current?.pending !== ticket.request) return null;
      if (!saved.id || !Number.isSafeInteger(saved.revision) || (ticket.data.id && saved.id !== ticket.data.id)) {
        owner.fail(ticket, new Error("Invalid save response; your draft is retained."));
        return null;
      }
      const baseline = normalizeItem(saved);
      const data = { ...baseline };
      // Retain edits made after submission and fields omitted from a partial save.
      for (const field of Object.keys(current.data)) {
        if (field === "id" || field === "revision") continue;
        if (!equal(current.data[field], ticket.data[field]) ||
          (!ticket.fields.includes(field) && current.dirtyFields.includes(field))) data[field] = current.data[field];
      }
      const key = namespace === "item" ? itemDraftKey(saved.id) : `${namespace}:${saved.id}`;
      const latest = current.latest.id === saved.id && current.latest.revision > saved.revision ? current.latest : baseline;
      const dirtyFields = dirty(data, baseline);
      const draft: Draft = dirtyFields.length
        ? { data, baseline, latest, dirtyFields }
        : { data: latest, baseline: latest, latest, dirtyFields: [] };
      store.setState((state) => {
        const drafts = { ...state.drafts };
        delete drafts[ticket.key];
        drafts[key] = draft;
        return { drafts, aliases: { ...state.aliases, [ticket.key]: key } };
      });
      return draft;
    },
    /** Finish a non-Item create form without aliasing its next draft to a saved record. */
    completeTransient(ticket: SaveTicket, seed: ItemSnapshot) {
      const current = get(ticket.key);
      if (ticket.epoch !== epoch || current?.pending !== ticket.request) return;
      const baseline = normalizeItem(seed);
      const data = { ...baseline };
      for (const field of Object.keys(current.data)) {
        if (!equal(current.data[field], ticket.data[field])) data[field] = current.data[field];
      }
      put(ticket.key, { data, baseline, latest: baseline, dirtyFields: dirty(data, baseline) });
    },
    fail(ticket: SaveTicket, error: unknown) {
      const current = get(ticket.key);
      if (ticket.epoch !== epoch || current?.pending !== ticket.request) return;
      put(ticket.key, { ...current, pending: undefined,
        error: error instanceof Error ? error.message : "Failed to save. Your draft is retained.",
        conflict: error instanceof BrowserWriteError ? error.outcome.kind === "conflict"
          : typeof error === "object" && error !== null && "status" in error && error.status === 409,
        failure: error instanceof BrowserWriteError ? error.outcome : undefined,
      });
    },
    clear() {
      epoch++;
      store.setState({ drafts: {}, aliases: {} });
    },
  };
  return owner;
}
export type ItemDraftOwner = ReturnType<typeof createItemDraftOwner>;
