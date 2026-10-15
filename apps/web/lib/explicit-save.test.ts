import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createExplicitSave, type ExplicitSaveAdapter } from "./explicit-save.ts";

const failureMessage = "Could not save. Your text is kept here; please retry.";
const conflict = "Conflict: this Note changed in another tab. Your unsaved text is kept here. Copy it before reloading to compare with the latest version.";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

function setup() {
  return createExplicitSave({
    initial: { value: "saved text", saved: { revision: 3 } },
    failureMessage,
  });
}

for (const error of [conflict, "Could not save. Your text is kept here; please try again.", "Body exceeds 100,000 characters. Shorten it before saving; your text has not been truncated."]) {
  test(`rejection retains local work and the saved baseline, then retry advances it: ${error}`, async () => {
    const session = setup();
    session.edit("my unsaved text");
    const rejected = mock.fn(async () => ({ error }));
    await session.save(rejected);
    assert.deepEqual(session.getSnapshot(), {
      value: "my unsaved text", saved: { revision: 3 }, baseline: "saved text",
      dirty: true, pending: false, error,
    });
    const retry: ExplicitSaveAdapter<string, { revision: number }> = async (submitted) => {
      assert.deepEqual({ value: submitted.value, saved: submitted.saved, baseline: submitted.baseline }, {
        value: "my unsaved text", saved: { revision: 3 }, baseline: "saved text",
      });
      assert.equal(session.getSnapshot().error, "");
      assert.equal(session.getSnapshot().pending, true);
      return { value: submitted.value, saved: { revision: 4 } };
    };
    await session.save(retry);
    assert.deepEqual(session.getSnapshot(), {
      value: "my unsaved text", saved: { revision: 4 }, baseline: "my unsaved text",
      dirty: false, pending: false, error: "",
    });
  });
}

test("thrown save failures retain text and expose the caller's existing fallback", async () => {
  for (const message of [failureMessage, "Could not save the template. Your text is kept here; please retry."]) {
    const session = createExplicitSave({ initial: { value: "old", saved: "old" }, failureMessage: message });
    session.edit("new");
    await session.save(async () => { throw new Error("network failure"); });
    assert.deepEqual(session.getSnapshot(), {
      value: "new", saved: "old", baseline: "old", dirty: true, pending: false, error: message,
    });
    await session.save(async ({ value }) => ({ value, saved: value }));
    assert.equal(session.getSnapshot().dirty, false);
    assert.equal(session.getSnapshot().error, "");
  }
});

test("dirty tracks edits back to baseline, including all Note fields and normalized titles", async () => {
  const original = { title: "Title", body: "Body", pinned: false };
  const session = createExplicitSave({
    initial: { value: original, saved: { revision: 1 } }, failureMessage,
    equal: (left, right) => left.title === right.title && left.body === right.body && left.pinned === right.pinned,
  });
  for (const edit of [{ title: "Changed" }, { body: "Changed" }, { pinned: true }]) {
    session.edit({ ...original, ...edit });
    assert.equal(session.getSnapshot().dirty, true);
    session.edit({ ...original });
    assert.equal(session.getSnapshot().dirty, false);
  }
  session.edit({ ...original, title: "  New title  ", pinned: true });
  await session.save(async ({ value }) => ({ value: { ...value, title: value.title.trim() }, saved: { revision: 2 } }));
  assert.deepEqual(session.getSnapshot().value, { ...original, title: "New title", pinned: true });
  assert.equal(session.getSnapshot().dirty, false);
  session.edit({ ...original });
  assert.equal(session.getSnapshot().dirty, true);
});

test("pending covers the entire request; no premature baseline advancement or duplicate request", async () => {
  const session = setup();
  const request = deferred<{ value: string; saved: { revision: number } }>();
  const save = mock.fn(() => request.promise);
  const observed: boolean[] = [];
  const unsubscribe = session.subscribe(() => observed.push(session.getSnapshot().pending));
  session.edit("changed");
  const saving = session.save(save);
  assert.equal(session.getSnapshot().pending, true);
  assert.equal(session.getSnapshot().dirty, true);
  assert.equal(session.getSnapshot().baseline, "saved text");
  assert.deepEqual(session.getSnapshot().saved, { revision: 3 });
  await session.save(save);
  assert.equal(save.mock.callCount(), 1);
  request.resolve({ value: "changed", saved: { revision: 4 } });
  await saving;
  assert.equal(session.getSnapshot().pending, false);
  assert.equal(session.getSnapshot().baseline, "changed");
  assert.ok(observed.includes(true));
  assert.equal(observed.at(-1), false);
  unsubscribe();
  const count = observed.length;
  session.edit("another edit");
  assert.equal(observed.length, count);
});

test("an edit arriving during a request is retained while the accepted baseline advances", async () => {
  const session = setup();
  session.edit("submitted");
  const request = deferred<{ value: string; saved: { revision: number } }>();
  const saving = session.save(() => request.promise);
  session.edit("newer work");
  request.resolve({ value: "submitted", saved: { revision: 4 } });
  await saving;
  assert.equal(session.getSnapshot().value, "newer work");
  assert.equal(session.getSnapshot().baseline, "submitted");
  assert.equal(session.getSnapshot().dirty, true);
});

test("Journal preloaded and inserted templates are clean virtual baselines until edited and saved", async () => {
  const template = "## Gratitude\n\n## Best thing\n";
  for (const preload of [false, true]) {
    const session = createExplicitSave({
      initial: { value: preload ? template : "", saved: { body: "", revision: 0 } }, failureMessage,
    });
    const save = mock.fn<ExplicitSaveAdapter<string, { body: string; revision: number }>>(async ({ value, saved, baseline }) => {
      assert.equal(saved.revision, 0);
      assert.equal(baseline, template);
      return { value, saved: { body: value, revision: 1 } };
    });
    if (!preload) {
      session.setError("earlier error");
      session.loadBaseline(template);
    }
    assert.deepEqual(session.getSnapshot(), {
      value: template, saved: { body: "", revision: 0 }, baseline: template,
      dirty: false, pending: false, error: "",
    });
    assert.equal(save.mock.callCount(), 0);
    session.edit(`${template}My reflection`);
    assert.equal(session.getSnapshot().dirty, true);
    session.edit(template);
    assert.equal(session.getSnapshot().dirty, false);
    session.edit(`${template}My reflection`);
    await session.save(save);
    assert.equal(save.mock.callCount(), 1);
    assert.equal(session.getSnapshot().saved.revision, 1);
    assert.equal(session.getSnapshot().dirty, false);
  }
});

test("Journal empty-save rejection leaves the virtual baseline and revision zero intact", async () => {
  const session = createExplicitSave({
    initial: { value: "template", saved: { body: "", revision: 0 } }, failureMessage,
  });
  session.edit(" ");
  const error = "An empty reflection or untouched template is not saved. Your saved entry is kept.";
  await session.save(async () => ({ error }));
  assert.equal(session.getSnapshot().baseline, "template");
  assert.equal(session.getSnapshot().value, " ");
  assert.equal(session.getSnapshot().saved.revision, 0);
  assert.equal(session.getSnapshot().error, error);
});
