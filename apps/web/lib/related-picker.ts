import { linkPageSize, type LinkEnd, type PickerHit } from "@repo/domain";
import { acceptResponse, matchesQuery } from "./link-picker.ts";

type SearchPage = { hits: PickerHit[]; more: boolean };

export type RelatedPickerSearch = (
  query: string,
  offset: number,
  today: string,
  sourceKind: LinkEnd["kind"],
  sourceId: string,
) => Promise<SearchPage>;

export type RelatedPickerState = {
  readonly open: boolean;
  readonly query: string;
  readonly hits: readonly PickerHit[];
  readonly more: boolean;
  readonly active: number;
  readonly loading: boolean;
  readonly error: unknown;
};

export type RelatedPickerIntent =
  | { type: "open" | "cancel" | "reset" | "more" }
  | { type: "query"; value: string }
  | { type: "source"; source: LinkEnd }
  | { type: "move"; direction: -1 | 1 };

/** Search and selection only. Choosing a hit never writes a link. */
export function createRelatedPicker({
  source: initialSource,
  search,
  today,
}: {
  source: LinkEnd;
  search: RelatedPickerSearch;
  today: () => string;
}) {
  let source = { ...initialSource };
  let state: RelatedPickerState = {
    open: false,
    query: "",
    hits: [],
    more: false,
    active: 0,
    loading: false,
    error: null,
  };
  const listeners = new Set<() => void>();
  let generation = 0;
  let offset = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function publish(change: Partial<RelatedPickerState>) {
    state = { ...state, ...change };
    for (const listener of listeners) listener();
  }

  function cancelRequest() {
    generation += 1;
    clearTimeout(timer);
    timer = undefined;
  }

  async function load(append: boolean) {
    const id = ++generation;
    const requestedQuery = state.query;
    const requestedSource = source;
    const start = append ? offset : 0;
    publish({ loading: true, error: null });
    try {
      const page = await search(
        requestedQuery,
        start,
        today(),
        requestedSource.kind,
        requestedSource.id,
      );
      if (!acceptResponse(generation, id)) return;
      const hits = append ? [...state.hits] : [];
      const seen = new Set(hits.map((hit) => `${hit.kind}:${hit.id}`));
      for (const hit of page.hits) {
        const key = `${hit.kind}:${hit.id}`;
        if (seen.has(key) || !matchesQuery(hit, requestedQuery)) continue;
        if (hit.kind === source.kind && hit.id === source.id) continue;
        seen.add(key);
        hits.push(hit);
      }
      // Server pages consume twenty rows, even when fewer survive filtering.
      // Never use the number of visible hits as a server offset.
      offset = start + linkPageSize;
      publish({
        hits,
        more: page.more,
        active: append ? state.active : 0,
        loading: false,
      });
    } catch (error) {
      if (acceptResponse(generation, id)) publish({ loading: false, error });
    }
  }

  function restart(change: Partial<RelatedPickerState>) {
    cancelRequest();
    offset = 0;
    publish({
      ...change,
      hits: [],
      more: false,
      active: 0,
      loading: false,
      error: null,
    });
    // An empty query still searches: the server lists recent targets.
    if (state.open) {
      timer = setTimeout(() => {
        timer = undefined;
        void load(false);
      }, 150);
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch(intent: RelatedPickerIntent) {
      switch (intent.type) {
        case "open":
          restart({ open: true });
          break;
        case "cancel":
          restart({ open: false });
          break;
        case "reset":
          restart({ open: false, query: "" });
          break;
        case "query":
          restart({ query: intent.value });
          break;
        case "source":
          if (
            source.kind === intent.source.kind &&
            source.id === intent.source.id
          )
            return;
          source = { ...intent.source };
          restart({});
          break;
        case "more":
          if (state.open && state.more) void load(true);
          break;
        case "move":
          publish({
            // Matches the pre-module view: down clamps to the last hit (so -1
            // with no hits), up clamps to 0.
            active:
              intent.direction > 0
                ? Math.min(state.hits.length - 1, state.active + 1)
                : Math.max(0, state.active - 1),
          });
          break;
      }
    },
  };
}
