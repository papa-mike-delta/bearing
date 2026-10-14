import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import type { LinkEnd, PickerHit } from "@repo/domain";
import {
  createRelatedPicker,
  type RelatedPickerSearch,
} from "./related-picker.ts";

type Page = Awaited<ReturnType<RelatedPickerSearch>>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const source: LinkEnd = { kind: "task", id: "source" };
const today = "2026-10-13";
const hit = (
  id: string,
  label = `Plan ${id}`,
  kind: PickerHit["kind"] = "task",
): PickerHit => ({
  kind,
  id,
  label,
  detail: null,
  completed: false,
});
const plan = hit("plan", "Plan the party");
const book = hit("book", "Book venue");
const day = hit("2026-10-12", "Monday, Oct 12, 2026", "journal");

function setup() {
  const requests: (ReturnType<typeof deferred<Page>> & {
    query: string;
    offset: number;
    today: string;
    source: LinkEnd;
  })[] = [];
  const search: RelatedPickerSearch = (
    query,
    offset,
    today,
    sourceKind,
    sourceId,
  ) => {
    const request = deferred<Page>();
    requests.push({
      ...request,
      query,
      offset,
      today,
      source: { kind: sourceKind, id: sourceId },
    });
    return request.promise;
  };
  const picker = createRelatedPicker({ source, search, today: () => today });
  function begin(query = "Plan") {
    picker.dispatch({ type: "open" });
    picker.dispatch({ type: "query", value: query });
    mock.timers.tick(150);
  }
  return { picker, requests, begin };
}

beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
afterEach(() => mock.timers.reset());

test("debounces searches and supplies query, source, today and the first-page offset", () => {
  const { picker, requests } = setup();
  picker.dispatch({ type: "open" });
  picker.dispatch({ type: "query", value: "P" });
  mock.timers.tick(100);
  picker.dispatch({ type: "query", value: "Plan" });
  mock.timers.tick(149);
  assert.equal(requests.length, 0);
  mock.timers.tick(1);
  assert.equal(requests.length, 1);
  assert.partialDeepStrictEqual(requests[0], {
    query: "Plan",
    offset: 0,
    today,
    source,
  });
  assert.equal(picker.getSnapshot().loading, true);
});

test("ignores out-of-order responses even when the query returns to the same text", async () => {
  const { picker, requests, begin } = setup();
  begin();
  picker.dispatch({ type: "query", value: "Book" });
  mock.timers.tick(150);
  picker.dispatch({ type: "query", value: "Plan" });
  mock.timers.tick(150);
  requests[2]!.resolve({ hits: [plan], more: false });
  await Promise.resolve();
  const accepted = picker.getSnapshot();
  requests[1]!.resolve({ hits: [book], more: true });
  requests[0]!.resolve({ hits: [hit("old")], more: true });
  await Promise.resolve();
  assert.equal(picker.getSnapshot(), accepted);
  assert.deepEqual(accepted.hits, [plan]);
});

test("a query change invalidates an in-flight first page before the next search starts", async () => {
  const { picker, requests, begin } = setup();
  begin();
  picker.dispatch({ type: "query", value: "Book" });
  requests[0]!.resolve({ hits: [plan], more: true });
  await Promise.resolve();
  assert.deepEqual(
    {
      query: picker.getSnapshot().query,
      hits: picker.getSnapshot().hits,
      more: picker.getSnapshot().more,
      active: picker.getSnapshot().active,
    },
    {
      query: "Book",
      hits: [],
      more: false,
      active: 0,
    },
  );
  assert.equal(requests.length, 1);
  mock.timers.tick(150);
  requests[1]!.resolve({ hits: [book], more: false });
  await Promise.resolve();
  assert.deepEqual(picker.getSnapshot().hits, [book]);
});

test("a query change clears results immediately and cancels a response during the debounce", async () => {
  const { picker, requests, begin } = setup();
  begin();
  requests[0]!.resolve({ hits: [plan, hit("second")], more: true });
  await Promise.resolve();
  picker.dispatch({ type: "move", direction: 1 });
  picker.dispatch({ type: "more" });
  picker.dispatch({ type: "query", value: "Book" });
  assert.deepEqual(
    {
      hits: picker.getSnapshot().hits,
      more: picker.getSnapshot().more,
      active: picker.getSnapshot().active,
    },
    {
      hits: [],
      more: false,
      active: 0,
    },
  );
  requests[1]!.resolve({ hits: [hit("stale")], more: true });
  await Promise.resolve();
  assert.deepEqual(picker.getSnapshot().hits, []);
  mock.timers.tick(150);
  requests[2]!.resolve({ hits: [book], more: false });
  await Promise.resolve();
  assert.deepEqual(picker.getSnapshot().hits, [book]);
});

for (const query of ["", "   "]) {
  test(`an empty query ${JSON.stringify(query)} still searches, clears old results and ignores the stale response`, async () => {
    const { picker, requests, begin } = setup();
    begin();
    picker.dispatch({ type: "query", value: query });
    assert.deepEqual(picker.getSnapshot().hits, []);
    assert.equal(picker.getSnapshot().more, false);
    requests[0]!.resolve({ hits: [plan], more: true });
    await Promise.resolve();
    assert.deepEqual(picker.getSnapshot().hits, []);
    mock.timers.tick(150);
    assert.equal(requests.length, 2);
    assert.equal(requests[1]!.query, query);
    assert.equal(requests[1]!.offset, 0);
    // With no needle, client filtering keeps every server hit.
    requests[1]!.resolve({ hits: [plan, book, day], more: false });
    await Promise.resolve();
    assert.deepEqual(picker.getSnapshot().hits, [plan, book, day]);
  });
}

test("More consumes raw twenty-row pages, filtering and deduplicating within and across pages", async () => {
  const { picker, requests, begin } = setup();
  begin();
  requests[0]!.resolve({
    hits: [plan, plan, book, hit(source.id)],
    more: true,
  });
  await Promise.resolve();
  assert.deepEqual(picker.getSnapshot().hits, [plan]);
  picker.dispatch({ type: "more" });
  assert.equal(requests[1]!.offset, 20);
  // A whole page can be consumed without adding any visible hits.
  requests[1]!.resolve({ hits: [book, plan, hit(source.id)], more: true });
  await Promise.resolve();
  assert.deepEqual(
    {
      hits: picker.getSnapshot().hits,
      more: picker.getSnapshot().more,
    },
    {
      hits: [plan],
      more: true,
    },
  );
  picker.dispatch({ type: "more" });
  assert.equal(requests[2]!.offset, 40);
  const note = hit(plan.id, "Plan a note", "note");
  requests[2]!.resolve({ hits: [plan, note, note, book], more: false });
  await Promise.resolve();
  assert.deepEqual(
    {
      hits: picker.getSnapshot().hits,
      more: picker.getSnapshot().more,
    },
    {
      hits: [plan, note],
      more: false,
    },
  );
  picker.dispatch({ type: "more" });
  assert.equal(requests.length, 3);
});

test("a stale More cannot replace the results of a newer query", async () => {
  const { picker, requests, begin } = setup();
  begin();
  requests[0]!.resolve({ hits: [plan], more: true });
  await Promise.resolve();
  picker.dispatch({ type: "more" });
  picker.dispatch({ type: "query", value: "Book" });
  mock.timers.tick(150);
  requests[2]!.resolve({ hits: [book], more: false });
  await Promise.resolve();
  const accepted = picker.getSnapshot();
  requests[1]!.resolve({ hits: [hit("stale")], more: true });
  await Promise.resolve();
  assert.equal(picker.getSnapshot(), accepted);
});

test("restarting the same search cancels an in-flight More and resets the cursor", async () => {
  const { picker, requests, begin } = setup();
  begin();
  requests[0]!.resolve({ hits: [plan], more: true });
  await Promise.resolve();
  picker.dispatch({ type: "more" });
  picker.dispatch({ type: "query", value: "Plan" });
  mock.timers.tick(150);
  assert.equal(requests[2]!.offset, 0);
  requests[2]!.resolve({ hits: [hit("new")], more: true });
  await Promise.resolve();
  requests[1]!.resolve({ hits: [hit("stale")], more: false });
  await Promise.resolve();
  assert.deepEqual(
    {
      hits: picker.getSnapshot().hits,
      more: picker.getSnapshot().more,
    },
    {
      hits: [hit("new")],
      more: true,
    },
  );
  picker.dispatch({ type: "more" });
  assert.equal(requests[3]!.offset, 20);
});

test("repeated More requests accept only the latest response without skipping a page", async () => {
  const { picker, requests, begin } = setup();
  begin();
  requests[0]!.resolve({ hits: [plan], more: true });
  await Promise.resolve();
  picker.dispatch({ type: "more" });
  picker.dispatch({ type: "more" });
  assert.deepEqual(
    requests.slice(1).map((request) => request.offset),
    [20, 20],
  );
  requests[2]!.resolve({ hits: [hit("new")], more: true });
  await Promise.resolve();
  requests[1]!.resolve({ hits: [hit("stale")], more: false });
  await Promise.resolve();
  assert.deepEqual(
    {
      hits: picker.getSnapshot().hits,
      more: picker.getSnapshot().more,
    },
    {
      hits: [plan, hit("new")],
      more: true,
    },
  );
  picker.dispatch({ type: "more" });
  assert.equal(requests[3]!.offset, 40);
});

test("changing source kind or id cancels pending searches and More", async () => {
  const { picker, requests, begin } = setup();
  begin();
  const next = { kind: "note" as const, id: source.id };
  picker.dispatch({ type: "source", source: next });
  requests[0]!.resolve({ hits: [plan], more: true });
  await Promise.resolve();
  assert.deepEqual(picker.getSnapshot().hits, []);
  mock.timers.tick(150);
  assert.deepEqual(requests[1]!.source, next);
  requests[1]!.resolve({ hits: [plan], more: true });
  await Promise.resolve();
  picker.dispatch({ type: "more" });
  picker.dispatch({ type: "source", source: { ...next, id: "another" } });
  mock.timers.tick(150);
  assert.partialDeepStrictEqual(requests[3], {
    offset: 0,
    source: { kind: "note", id: "another" },
  });
  requests[2]!.resolve({ hits: [hit("stale")], more: true });
  await Promise.resolve();
  assert.deepEqual(picker.getSnapshot().hits, []);
  requests[3]!.resolve({ hits: [plan], more: false });
  await Promise.resolve();
  picker.dispatch({ type: "source", source: { kind: "note", id: "another" } });
  mock.timers.tick(150);
  assert.deepEqual(picker.getSnapshot().hits, [plan]);
  assert.equal(requests.length, 4);
});

test("Cancel invalidates pending debounce and in-flight results; reopening keeps the query", async () => {
  const { picker, requests, begin } = setup();
  picker.dispatch({ type: "open" });
  picker.dispatch({ type: "query", value: "Plan" });
  picker.dispatch({ type: "cancel" });
  mock.timers.tick(150);
  assert.equal(requests.length, 0);
  begin();
  picker.dispatch({ type: "cancel" });
  requests[0]!.resolve({ hits: [plan], more: true });
  await Promise.resolve();
  assert.deepEqual(
    {
      open: picker.getSnapshot().open,
      query: picker.getSnapshot().query,
      hits: picker.getSnapshot().hits,
      more: picker.getSnapshot().more,
    },
    {
      open: false,
      query: "Plan",
      hits: [],
      more: false,
    },
  );
  picker.dispatch({ type: "open" });
  mock.timers.tick(150);
  requests[1]!.resolve({ hits: [plan], more: true });
  await Promise.resolve();
  picker.dispatch({ type: "more" });
  picker.dispatch({ type: "reset" });
  requests[2]!.resolve({ hits: [hit("stale")], more: true });
  await Promise.resolve();
  assert.deepEqual(
    {
      open: picker.getSnapshot().open,
      query: picker.getSnapshot().query,
      hits: picker.getSnapshot().hits,
      more: picker.getSnapshot().more,
    },
    {
      open: false,
      query: "",
      hits: [],
      more: false,
    },
  );
  picker.dispatch({ type: "open" });
  mock.timers.tick(150);
  // Reopening after reset searches the empty query (recent targets).
  assert.equal(requests.length, 4);
  assert.equal(requests[3]!.query, "");
});

test("a rejected search settles loading and allows a new search", async () => {
  const { picker, requests, begin } = setup();
  begin();
  const error = new Error("unavailable");
  requests[0]!.reject(error);
  await Promise.resolve();
  assert.deepEqual(
    {
      hits: picker.getSnapshot().hits,
      more: picker.getSnapshot().more,
      loading: picker.getSnapshot().loading,
      error: picker.getSnapshot().error,
    },
    {
      hits: [],
      more: false,
      loading: false,
      error,
    },
  );
  picker.dispatch({ type: "query", value: "Book" });
  assert.equal(picker.getSnapshot().error, null);
  mock.timers.tick(150);
  requests[1]!.resolve({ hits: [book], more: false });
  await Promise.resolve();
  assert.deepEqual(picker.getSnapshot().hits, [book]);
});

test("a rejected More retains hits and retries the same consumed-page position", async () => {
  const { picker, requests, begin } = setup();
  begin();
  requests[0]!.resolve({ hits: [plan], more: true });
  await Promise.resolve();
  picker.dispatch({ type: "more" });
  requests[1]!.reject(new Error("unavailable"));
  await Promise.resolve();
  assert.deepEqual(
    {
      hits: picker.getSnapshot().hits,
      more: picker.getSnapshot().more,
      loading: picker.getSnapshot().loading,
    },
    {
      hits: [plan],
      more: true,
      loading: false,
    },
  );
  picker.dispatch({ type: "more" });
  assert.equal(requests[2]!.offset, 20);
  requests[2]!.resolve({ hits: [hit("next")], more: false });
  await Promise.resolve();
  assert.deepEqual(
    {
      hits: picker.getSnapshot().hits,
      error: picker.getSnapshot().error,
    },
    {
      hits: [plan, hit("next")],
      error: null,
    },
  );
});

test("a stale rejection cannot change the current search state", async () => {
  const { picker, requests, begin } = setup();
  begin();
  picker.dispatch({ type: "query", value: "Book" });
  mock.timers.tick(150);
  const current = picker.getSnapshot();
  requests[0]!.reject(new Error("old failure"));
  await Promise.resolve();
  assert.equal(picker.getSnapshot(), current);
  requests[1]!.resolve({ hits: [book], more: false });
  await Promise.resolve();
  assert.deepEqual(
    {
      hits: picker.getSnapshot().hits,
      error: picker.getSnapshot().error,
    },
    {
      hits: [book],
      error: null,
    },
  );
});

for (const query of ["Oct 12", "2026-10", "MONDAY"]) {
  test(`Journal search keeps ISO-date and date-label matching for ${query}`, async () => {
    const { picker, requests, begin } = setup();
    begin(query);
    requests[0]!.resolve({ hits: [book, day], more: false });
    await Promise.resolve();
    assert.deepEqual(picker.getSnapshot().hits, [day]);
  });
}

test("keyboard selection is bounded, retained through More, and reset on query changes", async () => {
  const { picker, requests, begin } = setup();
  begin();
  // As before the module: down with no hits clamps to -1 (nothing selected).
  picker.dispatch({ type: "move", direction: 1 });
  assert.equal(picker.getSnapshot().active, -1);
  requests[0]!.resolve({ hits: [plan, hit("second")], more: true });
  await Promise.resolve();
  picker.dispatch({ type: "move", direction: -1 });
  assert.equal(picker.getSnapshot().active, 0);
  picker.dispatch({ type: "move", direction: 1 });
  picker.dispatch({ type: "move", direction: 1 });
  assert.equal(picker.getSnapshot().active, 1);
  picker.dispatch({ type: "more" });
  requests[1]!.resolve({ hits: [hit("third")], more: false });
  await Promise.resolve();
  assert.equal(picker.getSnapshot().active, 1);
  picker.dispatch({ type: "move", direction: 1 });
  assert.deepEqual(
    picker.getSnapshot().hits[picker.getSnapshot().active],
    hit("third"),
  );
  picker.dispatch({ type: "query", value: "Book" });
  assert.equal(picker.getSnapshot().active, 0);
});

test("subscribers see synchronous intent updates and accepted results; unsubscribe stops notifications", async () => {
  const { picker, requests, begin } = setup();
  const listener = mock.fn();
  const unsubscribe = picker.subscribe(listener);
  const initial = picker.getSnapshot();
  begin();
  assert.ok(listener.mock.callCount() > 0);
  assert.notEqual(picker.getSnapshot(), initial);
  listener.mock.resetCalls();
  requests[0]!.resolve({ hits: [plan], more: false });
  await Promise.resolve();
  assert.equal(listener.mock.callCount(), 1);
  unsubscribe();
  picker.dispatch({ type: "cancel" });
  assert.equal(listener.mock.callCount(), 1);
});
