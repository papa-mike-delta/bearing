import assert from "node:assert/strict";
import { test } from "node:test";
import { receipt } from "./receipts.ts";

test("a listArea call reads as a one-line receipt", () => {
  const part = { type: "tool-listArea" };
  assert.equal(
    receipt({ ...part, state: "output-available", output: { open: 4 } }),
    "Read your list (4 open)",
  );
  assert.equal(
    receipt({ ...part, state: "output-available", output: { open: 0 } }),
    "Read your list (0 open)",
  );
  assert.equal(
    receipt({ ...part, state: "input-available" }),
    "Reading your list…",
  );
  assert.equal(
    receipt({ ...part, state: "output-error" }),
    "Couldn't read your list",
  );
  assert.equal(receipt({ type: "text" }), null);
  assert.equal(
    receipt({ type: "tool-somethingElse", state: "output-available" }),
    null,
  );
});
