import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { readHidden } from "./hidden-input.ts";

// A stand-in terminal: keystrokes go in, whatever the prompt prints comes out,
// and raw mode is recorded so the test can see it was put back.
function terminal() {
  const input = Object.assign(new PassThrough(), {
    isTTY: true as const,
    isRaw: false,
    modes: [] as boolean[],
    setRawMode(mode: boolean) {
      this.isRaw = mode;
      this.modes.push(mode);
      return this;
    },
  });
  const output = new PassThrough();
  let printed = "";
  output.on("data", (chunk) => (printed += chunk));
  return { input, output, printed: () => printed };
}

test("a typed password is read without being shown, and the terminal is put back", async () => {
  const t = terminal();
  const read = readHidden("New password: ", t);
  t.input.write("correct ");
  t.input.write("horse\r");
  assert.equal(await read, "correct horse");
  assert.equal(t.printed(), "New password: \n");
  assert.deepEqual(t.input.modes, [true, false]);
  assert.equal(t.input.listenerCount("data"), 0);
});

test("backspace removes the last character, and a pasted line ends at the newline", async () => {
  const t = terminal();
  const read = readHidden("> ", t);
  t.input.write("hunter22\x7f\x7f2\b3\nignored");
  assert.equal(await read, "hunter3");
  assert.doesNotMatch(t.printed(), /hunter/);
});

test("an empty line reads as empty, so the caller can generate one", async () => {
  const t = terminal();
  const read = readHidden("> ", t);
  t.input.write("\r");
  assert.equal(await read, "");
});

test("Ctrl-C cancels and still puts the terminal back", async () => {
  const t = terminal();
  const read = readHidden("> ", t);
  t.input.write("secret\x03");
  await assert.rejects(read, { name: "AbortError" });
  assert.deepEqual(t.input.modes, [true, false]);
  assert.equal(t.input.isRaw, false);
  assert.equal(t.input.listenerCount("data"), 0);
  assert.doesNotMatch(t.printed(), /secret/);
});
