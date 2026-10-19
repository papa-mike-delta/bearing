import assert from "node:assert/strict";
import { test } from "node:test";
import { colorModeChoice, colorModes } from "./color-mode.ts";

test("the switch offers Light, Dark and System, in that order", () => {
  assert.deepEqual(colorModes.map((mode) => mode.name), ["Light", "Dark", "System"]);
});

test("a stored light or dark choice is kept; anything else follows the system", () => {
  assert.equal(colorModeChoice("light"), "light");
  assert.equal(colorModeChoice("dark"), "dark");
  assert.equal(colorModeChoice("system"), "system");
  assert.equal(colorModeChoice(undefined), "system");
  assert.equal(colorModeChoice("mauve"), "system");
});
