import assert from "node:assert/strict";
import { test } from "node:test";
import { createExplicitSaveNavigation, type NavigationBrowser } from "./explicit-save-navigation.ts";
import { createExplicitSave } from "./explicit-save.ts";

class FakeElement extends EventTarget {
  readonly attributes: Record<string, string>;
  readonly link: FakeElement | null;
  constructor(attributes: Record<string, string> = {}, link: FakeElement | null = null) {
    super();
    this.attributes = attributes;
    this.link = link;
  }
  closest() { return this.link ?? ("href" in this.attributes ? this : null); }
  getAttribute(name: string) { return this.attributes[name] ?? null; }
  hasAttribute(name: string) { return name in this.attributes; }
}

function setup(subject = "Note") {
  const confirmations: string[] = [];
  const answers: boolean[] = [];
  const events: (() => void)[] = [];
  const window = Object.assign(new EventTarget(), {
    confirm(message: string) {
      confirmations.push(message);
      assert.ok(answers.length, "a confirmation needs an explicit test answer");
      return answers.shift()!;
    },
  });
  const document = new EventTarget();
  const href = "https://bearing.test/notes/book/note";
  const entries = [
    { state: { route: "outside" }, href: "https://bearing.test/notes/book" },
    { state: { route: "editor" }, href },
  ];
  let index = 1;
  let backCalls = 0;
  const history = {
    get state() { return entries[index]!.state; },
    pushState(state: { route: string }, _unused: string, url?: string | URL | null) {
      entries.splice(index + 1);
      entries.push({ state, href: String(url) });
      index += 1;
    },
    back() {
      backCalls += 1;
      if (index === 0) return;
      index -= 1;
      // Browser history traversal dispatches popstate asynchronously.
      events.push(() => window.dispatchEvent(new Event("popstate")));
    },
  };
  const browser: NavigationBrowser = {
    window, document, history, location: { href },
    isElement: (target): target is Element => target instanceof FakeElement,
  };
  const navigation = createExplicitSaveNavigation();
  const stop = navigation.listen(browser, subject);
  function dispatch(type: string, target: EventTarget | null = null, props: object = {}) {
    const event = new Event(type, { cancelable: true, bubbles: true });
    // Use ordinary EventTargets, supplying only the DOM properties the adapter reads.
    Object.defineProperty(event, "target", { value: target });
    for (const [key, value] of Object.entries(props)) Object.defineProperty(event, key, { value });
    let stopped = false;
    event.stopPropagation = () => { stopped = true; };
    if (type === "beforeunload") window.dispatchEvent(event);
    else document.dispatchEvent(event);
    return { event, get stopped() { return stopped; } };
  }
  function flushHistory() { while (events.length) events.shift()!(); }
  return {
    browser, navigation, confirmations, answers, stop, dispatch, flushHistory,
    get backCalls() { return backCalls; },
    get url() { return entries[index]!.href; },
    get entries() { return entries; },
  };
}

for (const subject of ["Note", "Journal", "Journal template", "Person"]) {
  test(`${subject}: links cancel or confirm with the existing text, and confirmation disarms unload`, () => {
    const fake = setup(subject);
    const { navigation, dispatch, answers, confirmations } = fake;
    navigation.sync(true);
    const link = new FakeElement({ href: "/elsewhere" });
    const child = new FakeElement({}, link);
    answers.push(false);
    const canceled = dispatch("click", child);
    assert.equal(canceled.event.defaultPrevented, true);
    assert.equal(canceled.stopped, true);
    assert.equal(dispatch("beforeunload").event.defaultPrevented, true);
    answers.push(true);
    const accepted = dispatch("click", child);
    assert.equal(accepted.event.defaultPrevented, false);
    assert.equal(accepted.stopped, false);
    assert.equal(dispatch("beforeunload").event.defaultPrevented, false);
    assert.deepEqual(confirmations, Array(2).fill(`Discard your unsaved ${subject} changes?`));
    // A subsequent render re-arms the same dirty editor, as before extraction.
    navigation.sync(true);
    assert.equal(dispatch("beforeunload").event.defaultPrevented, true);
    navigation.sync(false);
    assert.equal(dispatch("beforeunload").event.defaultPrevented, false);
    fake.stop();
    navigation.sync(true);
    assert.equal(dispatch("beforeunload").event.defaultPrevented, false);
  });
}

test("clean editors, non-links, ctrl/meta clicks, and blank-target links do not prompt", () => {
  const { navigation, dispatch, confirmations, stop } = setup();
  dispatch("click", new FakeElement({ href: "/elsewhere" }));
  navigation.sync(true);
  dispatch("click", new FakeElement());
  dispatch("click", null);
  dispatch("click", new FakeElement({ href: "/elsewhere" }), { ctrlKey: true });
  dispatch("click", new FakeElement({ href: "/elsewhere" }), { metaKey: true });
  dispatch("click", new FakeElement({ href: "/elsewhere", target: "_blank" }));
  assert.deepEqual(confirmations, []);
  assert.equal(dispatch("beforeunload").event.defaultPrevented, true);
  stop();
});

test("editor forms bypass confirmation; other forms cancel or confirm and disarm the guard", () => {
  const { navigation, dispatch, answers, confirmations, stop } = setup();
  navigation.sync(true);
  for (const attribute of ["data-note-editor", "data-journal-editor", "data-explicit-save-editor"]) {
    assert.equal(dispatch("submit", new FakeElement({ [attribute]: "" })).event.defaultPrevented, false);
  }
  assert.deepEqual(confirmations, []);
  answers.push(false);
  const canceled = dispatch("submit", new FakeElement());
  assert.equal(canceled.event.defaultPrevented, true);
  assert.equal(canceled.stopped, true);
  answers.push(true);
  assert.equal(dispatch("submit", new FakeElement()).event.defaultPrevented, false);
  assert.equal(dispatch("beforeunload").event.defaultPrevented, false);
  stop();
});

test("history cancellation restores the same URL guard; confirmation returns to the previous page", () => {
  const fake = setup("Journal");
  fake.navigation.sync(true);
  const cleanup = fake.navigation.guardHistory(fake.browser, "Journal");
  assert.equal(fake.entries.length, 3);
  assert.equal(fake.url, fake.browser.location.href);
  assert.deepEqual(fake.browser.history.state, { route: "editor", noteGuard: true });
  fake.answers.push(false);
  fake.browser.history.back();
  fake.flushHistory();
  assert.equal(fake.entries.length, 3);
  assert.equal(fake.url, fake.browser.location.href);
  assert.equal(fake.dispatch("beforeunload").event.defaultPrevented, true);
  fake.answers.push(true);
  fake.browser.history.back();
  fake.flushHistory();
  assert.equal(fake.backCalls, 3);
  assert.equal(fake.url, "https://bearing.test/notes/book");
  assert.equal(fake.dispatch("beforeunload").event.defaultPrevented, false);
  assert.deepEqual(fake.confirmations, Array(2).fill("Discard your unsaved Journal changes?"));
  cleanup();
  assert.equal(fake.backCalls, 3);
  fake.stop();
});

test("cleaning or unmounting a dirty editor removes the history sentinel and listeners", () => {
  const fake = setup();
  fake.navigation.sync(true);
  const cleanup = fake.navigation.guardHistory(fake.browser, "Note");
  fake.navigation.sync(false);
  cleanup();
  fake.flushHistory();
  assert.equal(fake.backCalls, 1);
  assert.equal(fake.url, fake.browser.location.href);
  assert.deepEqual(fake.browser.history.state, { route: "editor" });
  fake.browser.history.back();
  fake.flushHistory();
  assert.deepEqual(fake.confirmations, []);
  fake.stop();
});

test("deliberate leave after Note deletion bypasses links, forms, unload and history without discarding local state", () => {
  const fake = setup();
  const session = createExplicitSave({
    initial: { value: "saved", saved: { revision: 1 } }, failureMessage: "Could not save.",
  });
  session.edit("unsaved Note text");
  fake.navigation.sync(session.getSnapshot().dirty);
  const cleanup = fake.navigation.guardHistory(fake.browser, "Note");
  // Note deletion calls this only after the delete action succeeds.
  fake.navigation.leaveWithoutPrompt();
  assert.equal(fake.dispatch("click", new FakeElement({ href: "/notes" })).event.defaultPrevented, false);
  assert.equal(fake.dispatch("submit", new FakeElement()).event.defaultPrevented, false);
  assert.equal(fake.dispatch("beforeunload").event.defaultPrevented, false);
  fake.browser.history.back();
  fake.flushHistory();
  assert.equal(fake.url, "https://bearing.test/notes/book");
  assert.deepEqual(fake.confirmations, []);
  assert.equal(session.getSnapshot().value, "unsaved Note text");
  cleanup();
  fake.stop();
});
