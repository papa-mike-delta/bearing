import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePreset } from "shadcn/preset";
import { expandPreset, themeVars } from "./expand-preset.ts";
import { renderDeclarations } from "./theme-vars.ts";

test("b1sACkXE8 expands to the mauve fuchsia theme", () => {
  const blocks = expandPreset("b1sACkXE8");
  assert.ok(blocks);
  assert.match(blocks.light, /--primary: oklch\(0\.518 0\.253 323\.949\)/);
  assert.match(blocks.light, /--chart-1: oklch\(0\.865 0\.127 207\.078\)/);
  assert.match(blocks.light, /--radius: 0\.625rem/);
  assert.match(blocks.light, /--background: oklch\(1 0 0\)/);
  assert.match(blocks.dark, /--border: oklch\(1 0 0 \/ 10%\)/);
  assert.match(blocks.dark, /--primary: oklch\(0\.452 0\.211 324\.591\)/);
});

test("a preset that cannot be expanded returns null", () => {
  assert.equal(expandPreset("abc123!"), null);
  assert.equal(expandPreset("not a preset!"), null);
  assert.equal(themeVars({ baseColor: "olive", theme: "zinc" }), null);
  assert.equal(themeVars({ baseColor: "olive", theme: "nope" }), null);
  assert.equal(
    themeVars({ baseColor: "zinc", theme: "green", chartColor: "neutral" }),
    null,
  );
  assert.equal(
    expandPreset(
      encodePreset({
        baseColor: "olive",
        theme: "zinc",
        chartColor: "cyan",
      }),
    ),
    null,
  );
  assert.equal(
    expandPreset(
      encodePreset({
        baseColor: "zinc",
        theme: "green",
        chartColor: "neutral",
      }),
    ),
    null,
  );
  assert.equal(expandPreset("bc8D4OJ"), null);
});

test("a present neutral chart color is that palette, and an old code derives one", () => {
  const followed = themeVars({ baseColor: "neutral", theme: "blue" });
  const neutral = themeVars({
    baseColor: "neutral",
    theme: "blue",
    chartColor: "neutral",
  });
  assert.ok(followed);
  assert.ok(neutral);
  const followChart = followed.light.find(([key]) => key === "chart-1")?.[1];
  const neutralChart = neutral.light.find(([key]) => key === "chart-1")?.[1];
  assert.ok(followChart);
  assert.notEqual(neutralChart, followChart);

  const old = expandPreset("abc123");
  assert.ok(old);
  const derived = expandPreset("a0");
  const blue = themeVars({
    baseColor: "neutral",
    theme: "neutral",
    chartColor: "blue",
    radius: "default",
    menuAccent: "subtle",
  });
  const neutralTheme = themeVars({
    baseColor: "neutral",
    theme: "neutral",
    radius: "default",
    menuAccent: "subtle",
  });
  assert.ok(derived);
  assert.ok(blue);
  assert.ok(neutralTheme);
  assert.equal(derived.light, renderDeclarations(blue.light));
  assert.equal(derived.dark, renderDeclarations(blue.dark));
  assert.notEqual(derived.light, renderDeclarations(neutralTheme.light));
});

test("expansion does not spawn a process or read the environment", () => {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "expand-preset.ts"),
    "utf8",
  );
  assert.equal(source.includes("child_process"), false);
  assert.equal(source.includes("process.env"), false);
});

test("theme table records the installed shadcn version", async () => {
  const { readFile } = await import("node:fs/promises");
  const { createRequire } = await import("node:module");
  const { dirname, resolve } = await import("node:path");
  const require = createRequire(import.meta.url);
  const installed = JSON.parse(await readFile(resolve(dirname(require.resolve("shadcn/preset")), "../../package.json"), "utf8"));
  const table = JSON.parse(await readFile(new URL("./shadcn-themes.json", import.meta.url), "utf8"));
  assert.equal(table.shadcn, installed.version);
});
