// Builds lib/shadcn-themes.json from the theme endpoint the pinned shadcn
// CLI calls for `shadcn apply <preset> --only theme`. Dev-only; requests
// never run this. Regenerate after bumping shadcn:
//
//   npm run themes:generate -w web
//
// It checks a sample of presets against the live endpoint first and exits
// non-zero, leaving the table untouched, on any mismatch.

import { readFileSync, writeFileSync } from "node:fs";
import {
  DEFAULT_PRESET_CONFIG,
  PRESET_BASE_COLORS,
  PRESET_CHART_COLORS,
  PRESET_MENU_ACCENTS,
  PRESET_RADII,
  PRESET_THEMES,
  decodePreset,
  encodePreset,
} from "shadcn/preset";
import { sanitizeBlock } from "../lib/account-theme.ts";
import {
  presetInput,
  renderDeclarations,
  themeVars,
  type ThemeModes,
  type ThemeTable,
  type VarMap,
} from "../lib/theme-vars.ts";

const endpoint = "https://ui.shadcn.com/init";
const out = new URL("../lib/shadcn-themes.json", import.meta.url);
const version: string = JSON.parse(
  readFileSync(
    new URL("../../../node_modules/shadcn/package.json", import.meta.url),
    "utf8",
  ),
).version;
const chartKeys = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"];

type Config = Record<string, string | undefined>;
type Reply = { ok: true; vars: ThemeModes } | { ok: false; error: string };

// The CLI's query (shadcn's init URL builder), without its tracking flag.
function query(config: Config, code: string | null) {
  const params = new URLSearchParams();
  for (const key of [
    "style",
    "baseColor",
    "theme",
    "iconLibrary",
    "font",
  ] as const) {
    params.set(key, config[key] ?? "");
  }
  params.set("rtl", "false");
  params.set("menuAccent", config.menuAccent ?? "subtle");
  params.set("menuColor", config.menuColor ?? "default");
  params.set("radius", config.radius ?? "default");
  if (config.chartColor && config.chartColor !== "neutral") {
    params.set("chartColor", config.chartColor);
  }
  if (config.fontHeading && config.fontHeading !== "inherit") {
    params.set("fontHeading", config.fontHeading);
  }
  if (code) params.set("preset", code);
  params.set("only", "theme");
  return `${endpoint}?base=base&${params}`;
}

async function fetchVars(url: string): Promise<Reply> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "bearing-themes" },
      });
      const body = await response.json();
      // An unavailable combination, or a name this endpoint doesn't know
      // (e.g. "gray"): no table entry, so the import is refused.
      if (
        response.status === 400 &&
        /is not available|Invalid enum value/.test(body.error)
      ) {
        return { ok: false, error: body.error };
      }
      if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
      return { ok: true, vars: { light: body.cssVars.light, dark: body.cssVars.dark } };
    } catch (error) {
      if (attempt >= 2) throw error;
      await new Promise((done) => setTimeout(done, 1000 * (attempt + 1)));
    }
  }
}

async function pooled<T, R>(items: T[], run: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const at = next++;
      results[at] = await run(items[at]!);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return results;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const preset = (over: Config): Config => ({ ...DEFAULT_PRESET_CONFIG, ...over });

function pick(vars: VarMap, keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, vars[key]!]));
}

// Values in `vars` that differ from `base`, which must have the same keys in
// the same order.
function diff(base: VarMap, vars: VarMap, label: string) {
  if (Object.keys(base).join() !== Object.keys(vars).join()) {
    fail(`${label}: variables differ from the base color's`);
  }
  return Object.fromEntries(
    Object.entries(vars).filter(([key, value]) => base[key] !== value),
  );
}

// 1. Every base color with every theme. Without a preset or chartColor the
// charts follow the theme, which is what an absent chartColor means here.
const pairs = PRESET_BASE_COLORS.flatMap((baseColor) =>
  PRESET_THEMES.map((theme) => ({ baseColor, theme })),
);
console.log(`Fetching ${pairs.length} base color / theme pairs`);
const pairReplies = await pooled(pairs, (pair) =>
  fetchVars(query(preset(pair), null)),
);
const bases: Record<string, ThemeModes> = {};
for (const [at, pair] of pairs.entries()) {
  const reply = pairReplies[at]!;
  if (pair.theme === pair.baseColor && reply.ok) {
    bases[pair.baseColor] = reply.vars;
  }
}
const themes: Record<string, ThemeModes> = {};
for (const [at, pair] of pairs.entries()) {
  const reply = pairReplies[at]!;
  const base = bases[pair.baseColor];
  if (!reply.ok) continue;
  if (!base) fail(`${pair.baseColor} has themes but is not a theme of itself`);
  const label = `${pair.baseColor}/${pair.theme}`;
  themes[label] = {
    light: diff(base.light, reply.vars.light, label),
    dark: diff(base.dark, reply.vars.dark, label),
  };
}

// 2. Chart colors, sent as the CLI sends them (with the preset code). Some
// are only available on some base colors; the values never depend on it.
const chartPairs = PRESET_BASE_COLORS.flatMap((baseColor) =>
  PRESET_CHART_COLORS.map((chartColor) => ({ baseColor, chartColor })),
);
console.log(`Fetching ${chartPairs.length} base color / chart color pairs`);
const chartReplies = await pooled(chartPairs, (pair) => {
  const config = preset({ ...pair, theme: pair.baseColor });
  return fetchVars(query(config, encodePreset(config)));
});
const charts: Record<string, ThemeModes> = {};
const chartColors: Record<string, string[]> = {};
for (const [at, pair] of chartPairs.entries()) {
  const reply = chartReplies[at]!;
  const allowed = (chartColors[pair.baseColor] ??= []);
  if (!reply.ok) continue;
  allowed.push(pair.chartColor);
  const values = {
    light: pick(reply.vars.light, chartKeys),
    dark: pick(reply.vars.dark, chartKeys),
  };
  const seen = charts[pair.chartColor];
  if (seen && JSON.stringify(seen) !== JSON.stringify(values)) {
    fail(`chart ${pair.chartColor} differs on ${pair.baseColor}`);
  }
  charts[pair.chartColor] = values;
}

// 3. Radii.
const radii: Record<string, string> = {};
for (const radius of PRESET_RADII) {
  const reply = await fetchVars(query(preset({ radius }), null));
  if (!reply.ok || !reply.vars.light.radius) fail(`radius ${radius} failed`);
  radii[radius] = reply.vars.light.radius;
}

const table = {
  shadcn: version,
  generatedBy: "apps/web/scripts/generate-shadcn-themes.ts",
  bases,
  themes,
  charts,
  chartColors,
  radii,
} satisfies ThemeTable & { shadcn: string; generatedBy: string };

// 4. Check the composed table against the live endpoint, the way the CLI
// asks: fixed codes (including an old code without a chart color) plus
// random presets. An unavailable preset must expand to null.
const choose = <T>(list: readonly T[]) =>
  list[Math.floor(Math.random() * list.length)]!;
const codes = ["b1sACkXE8", "b1D0dxoG", "bc8D4OJ", "abc123"];
while (codes.length < 50) {
  codes.push(
    encodePreset(
      preset({
        baseColor: choose(PRESET_BASE_COLORS),
        theme: choose(PRESET_THEMES),
        chartColor: choose(PRESET_CHART_COLORS),
        radius: choose(PRESET_RADII),
        menuAccent: choose(PRESET_MENU_ACCENTS),
      }),
    ),
  );
}
// What expandPreset does with the table, before the table is written.
function expand(config: Config) {
  const vars = themeVars(presetInput(config), table);
  if (!vars) return null;
  const light = sanitizeBlock(renderDeclarations(vars.light));
  const dark = sanitizeBlock(renderDeclarations(vars.dark));
  return light && dark ? { light, dark } : null;
}
const mismatches: string[] = [];
let available = 0;
await pooled(codes, async (code) => {
  const config = decodePreset(code);
  if (!config) return fail(`${code} does not decode`);
  const reply = await fetchVars(query(config, code));
  const ours = expand(config);
  if (!reply.ok) {
    if (ours) mismatches.push(`${code}: endpoint says ${reply.error}, table expands it`);
    return;
  }
  available++;
  const render = (vars: VarMap) => renderDeclarations(Object.entries(vars));
  if (
    ours?.light !== render(reply.vars.light) ||
    ours?.dark !== render(reply.vars.dark)
  ) {
    mismatches.push(`${code}: ${JSON.stringify(config)}`);
  }
});
if (mismatches.length > 0) {
  fail(`Table does not match the endpoint:\n${mismatches.join("\n")}`);
}
writeFileSync(out, `${JSON.stringify(table, null, 1)}\n`);
console.log(
  `Verified ${codes.length} presets (${available} available) against ${endpoint}; wrote ${out.pathname}`,
);
