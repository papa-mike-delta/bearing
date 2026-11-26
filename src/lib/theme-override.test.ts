import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ThemeCatalog } from "./theme-catalog";
import { ThemeChrome } from "./theme-chrome";
import { ThemeOverride } from "./theme-override";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected network request"))));
afterEach(() => vi.unstubAllGlobals());

it("imports light and dark CSS variables while discarding unrelated rules", async () => {
  const theme = await ThemeOverride.parse(fixture("theme.css"));
  expect(theme.light).toEqual({ "--background": "oklch(1 0 0)", "--primary": "oklch(0.488 0.243 264.376)", "--radius": "0.625rem" });
  expect(theme.dark).toEqual({ "--background": "oklch(0.145 0 0)", "--primary": "oklch(0.424 0.199 265.638)" });
  expect(ThemeOverride.serialize(theme)).toBe(":root {\n  --background: oklch(1 0 0);\n  --primary: oklch(0.488 0.243 264.376);\n  --radius: 0.625rem;\n}\n\n.dark {\n  --background: oklch(0.145 0 0);\n  --primary: oklch(0.424 0.199 265.638);\n}\n");
});

it.each([
  "red; color: red",
  "red} body {display:none",
  "</style><script>alert(1)</script>",
  "url(https://example.com/track)",
  "u\\72l(https://example.com/track)",
  "expression(alert(1))",
  "red !important",
  "red/*comment*/",
  "var(--color",
])("refuses unsafe variable value %s even when serializing stored data", (value) => {
  expect(() => ThemeOverride.serialize({ light: { "--primary": value }, dark: { "--primary": "black" } })).toThrow();
});

it.each([":root { --primary: red; }", ".dark { --primary: black; }", "body { color: red; }", ":root { --primary: red; color: red; } .dark { --primary: black; }"])("refuses incomplete or non-variable theme declarations", async (css) => {
  await expect(ThemeOverride.parse(css)).rejects.toThrow();
});

it("rejects invalid variable names and empty maps", () => {
  expect(() => ThemeOverride.serialize({ light: { "color": "red" }, dark: { "--primary": "black" } })).toThrow();
  expect(() => ThemeOverride.serialize({ light: {}, dark: {} })).toThrow();
});

it("imports shadcn registry JSON, including shared extended variables, and round-trips normalized JSON", async () => {
  const theme = await ThemeOverride.parse(fixture("theme.json"));
  expect(theme.light["--primary"]).toBe("oklch(0.488 0.243 264.376)");
  expect(theme.dark["--primary"]).toBe("oklch(0.424 0.199 265.638)");
  expect(theme.light["--font-heading"]).toBe("var(--font-sans)");
  expect(theme.dark["--shadow-sm"]).toBe("0 1px 2px 0 rgb(0 0 0 / 0.05)");
  expect(await ThemeOverride.parse(JSON.stringify(theme))).toEqual(theme);
  expect(await ThemeOverride.parse(ThemeOverride.serialize(theme))).toEqual(theme);
});

it("keeps shared variables from an exported Tailwind theme block", async () => {
  const theme = await ThemeOverride.parse(fixture("theme.css") + '\n@theme inline { --font-heading: "Geist", sans-serif; --shadow-sm: 0 1px 2px rgb(0 0 0 / 5%); }');
  expect(theme.light["--font-heading"]).toBe('"Geist", sans-serif');
  expect(theme.dark["--shadow-sm"]).toBe("0 1px 2px rgb(0 0 0 / 5%)");
});

it.each(["{}", "null", "[]", '{"light":{"primary":1},"dark":{"primary":"black"}}', '{"light":[],"dark":{}}', '{"cssVars":{"theme":{"radius":"1rem"}}}'])("rejects malformed JSON themes: %s", async (input) => {
  await expect(ThemeOverride.parse(input)).rejects.toThrow();
});

it("resolves a create URL through the JSON export endpoint, preserving its theme options", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(fixture("theme.json")));
  const theme = await ThemeOverride.parse("https://ui.shadcn.com/create?theme=blue&baseColor=neutral&preset=abc");
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("https://ui.shadcn.com/init?theme=blue&baseColor=neutral&preset=abc"), expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }));
  expect(theme.dark["--primary"]).toBe("oklch(0.424 0.199 265.638)");
});

it("supplies required builder defaults for a minimal create URL", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(fixture("theme.json")));
  await ThemeOverride.parse("https://ui.shadcn.com/create?theme=blue");
  const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
  expect(url.searchParams.get("theme")).toBe("blue");
  expect(url.searchParams.get("base")).toBe("radix");
  expect(url.searchParams.get("style")).toBe("nova");
  expect(url.searchParams.get("font")).toBe("geist");
});

it.each([
  "https://example.com/create", "https://ui.shadcn.com.evil.test/create",
  "http://ui.shadcn.com/create", "https://ui.shadcn.com:8443/create",
  "https://user:pass@ui.shadcn.com/create", "https://ui.shadcn.com/other",
  "file:///etc/passwd", "https://ui.shadcn.com@127.0.0.1/create",
])("refuses unapproved theme URL %s before fetching", async (url) => {
  await expect(ThemeOverride.parse(url)).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});

it("surfaces upstream errors and rejects redirects or HTML instead of importing the builder page", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
  await expect(ThemeOverride.parse("https://ui.shadcn.com/create")).rejects.toThrow("503");
  vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"));
  await expect(ThemeOverride.parse("https://ui.shadcn.com/create")).rejects.toThrow();
  vi.mocked(fetch).mockResolvedValueOnce(new Response("<html>Builder</html>"));
  await expect(ThemeOverride.parse("https://ui.shadcn.com/create")).rejects.toThrow();
});

it("imports the Bearing preset into the override without a network request", async () => {
  const theme = await ThemeOverride.parse("preset:bearing");
  expect(fetch).not.toHaveBeenCalled();
  expect(theme.light["--background"]).toBe("#f4efe4");
  expect(theme.light["--primary"]).toBe("#f0c779");
  expect(theme.light["--chart-2"]).toBe("#486b5c");
  expect(theme.dark["--background"]).toBe("#101e20");
  expect(theme.light["--font-heading"]).toContain("Georgia");
  expect(theme.light["--field-image"]).toContain("radial-gradient");
  expect(theme.dark["--field-image"]).toContain("#2d5c52");
  expect(await ThemeOverride.parse(ThemeOverride.serialize(theme))).toEqual(theme);
});

it("imports a create preset through the same override parser", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(fixture("theme.json")));
  const theme = await ThemeOverride.parse("preset:teal");
  const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
  expect(url.origin).toBe("https://ui.shadcn.com");
  expect(url.pathname).toBe("/init");
  expect(url.searchParams.get("theme")).toBe("teal");
  expect(url.searchParams.get("chartColor")).toBe("amber");
  expect(theme.light["--primary"]).toBe("oklch(0.488 0.243 264.376)");
  expect(theme.dark["--primary"]).toBe("oklch(0.424 0.199 265.638)");
  expect(theme.light["--font-sans"]).toContain(ThemeCatalog.fontFamily(url.searchParams.get("font")!));
  expect(theme.light["--bearing-style"]).toBe(url.searchParams.get("style"));
  expect(theme.light["--bearing-base"]).toBe(url.searchParams.get("base"));
  expect(ThemeOverride.serialize(theme)).toContain("--font-heading:");
});

it("writes heading font, direction and inverted menu into the override", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
    cssVars: {
      light: { background: "oklch(1 0 0)", foreground: "oklch(0.2 0 0)", sidebar: "oklch(0.98 0 0)", "sidebar-foreground": "oklch(0.2 0 0)" },
      dark: { background: "oklch(0.2 0 0)", foreground: "oklch(0.98 0 0)", sidebar: "oklch(0.25 0 0)", "sidebar-foreground": "oklch(0.98 0 0)" },
    },
  })));
  const theme = await ThemeOverride.parse("https://ui.shadcn.com/create?theme=violet&font=inter&fontHeading=playfair-display&menuColor=inverted-translucent&rtl=true&pointer=true");
  expect(theme.light["--font-heading"]).toContain("Playfair Display Variable");
  expect(theme.light["--font-sans"]).toContain("Inter Variable");
  expect(theme.light["--bearing-base"]).toBe("radix");
  expect(theme.light["--bearing-style"]).toBe("nova");
  expect(theme.light["--bearing-icon"]).toBe("lucide");
  expect(theme.light["--bearing-font"]).toBe("inter");
  expect(theme.light["--bearing-font-heading"]).toBe("playfair-display");
  expect(theme.light["--direction"]).toBe("rtl");
  expect(theme.dark["--pointer"]).toBe("pointer");
  expect(theme.light["--sidebar"]).toBe("color-mix(in oklch, oklch(0.25 0 0) 72%, transparent)");
  expect(theme.dark["--sidebar"]).toBe("color-mix(in oklch, oklch(0.98 0 0) 72%, transparent)");
  const again = await ThemeOverride.parse(ThemeOverride.serialize(theme));
  expect(again.light["--sidebar"]).toBe(theme.light["--sidebar"]);
  expect(again.dark["--sidebar"]).toBe(theme.dark["--sidebar"]);
});

it("rejects an unknown preset before fetching", async () => {
  await expect(ThemeOverride.parse("preset:not-a-theme")).rejects.toThrow(/Unknown theme preset/);
  expect(fetch).not.toHaveBeenCalled();
});

it("ships the create option set, expanded colors, and a preset collection", () => {
  expect(ThemeCatalog.options.style).toEqual(["vega", "nova", "maia", "lyra", "mira", "luma", "sera", "rhea"]);
  expect(ThemeCatalog.options.baseColor).toEqual(["neutral", "stone", "zinc", "mauve", "olive", "mist", "taupe"]);
  expect(ThemeCatalog.options.theme).toEqual(expect.arrayContaining(["amber", "blue", "cyan", "emerald", "fuchsia", "green", "indigo", "lime", "orange", "pink", "purple", "red", "rose", "sky", "teal", "violet", "yellow"]));
  expect(ThemeCatalog.options.font).toHaveLength(26);
  expect(ThemeCatalog.presets.length).toBeGreaterThanOrEqual(28);
  const selections = ThemeCatalog.presets.flatMap((preset) => preset.selection ? [preset.selection] : []);
  const themes = new Set(selections.map((selection) => selection.theme));
  for (const theme of ThemeCatalog.options.theme) expect(themes.has(theme)).toBe(true);
  for (const key of ["base", "style", "baseColor", "radius", "menuAccent", "menuColor", "iconLibrary"] as const) {
    for (const value of ThemeCatalog.options[key]) {
      expect(selections.some((selection) => selection[key] === value)).toBe(true);
    }
  }
  expect(selections.some((selection) => selection.rtl)).toBe(true);
  expect(selections.some((selection) => selection.fontHeading === "playfair-display")).toBe(true);
  for (const preset of ThemeCatalog.presets) {
    if (preset.variables) {
      expect(preset.id).toBe("bearing");
      expect(ThemeCatalog.importInput(preset.id)).toContain("#f4efe4");
      continue;
    }
    const url = new URL(ThemeCatalog.importInput(preset.id));
    expect(url.origin).toBe("https://ui.shadcn.com");
    expect(url.searchParams.get("theme")).toBe(preset.selection!.theme);
    expect(ThemeCatalog.allowedTheme(preset.selection!.baseColor, preset.selection!.theme)).toBe(true);
    expect(ThemeCatalog.allowedTheme(preset.selection!.baseColor, preset.selection!.chartColor)).toBe(true);
  }
  expect(() => ThemeCatalog.createUrl({ ...ThemeCatalog.defaults(), theme: "nope" })).toThrow(/Unknown theme/);
  expect(() => ThemeCatalog.createUrl({ ...ThemeCatalog.defaults(), theme: "stone" })).toThrow(/base color stone/);
});

it("keeps create config from a pasted init export and refuses an unknown base", async () => {
  const theme = await ThemeOverride.parse(JSON.stringify({
    config: { style: "base-maia", iconLibrary: "hugeicons", menuColor: "default", rtl: true },
    registryDependencies: ["utils", "font-figtree", "font-heading-playfair-display"],
    cssVars: { light: { background: "white", primary: "teal" }, dark: { background: "black", primary: "teal" } },
  }));
  expect(theme.light["--bearing-base"]).toBe("base");
  expect(theme.light["--bearing-style"]).toBe("maia");
  expect(theme.light["--bearing-icon"]).toBe("hugeicons");
  expect(theme.light["--bearing-font"]).toBe("figtree");
  expect(theme.light["--bearing-font-heading"]).toBe("playfair-display");
  expect(theme.light["--font-sans"]).toContain("Figtree Variable");
  expect(theme.light["--font-heading"]).toContain("Playfair Display Variable");
  expect(theme.light["--direction"]).toBe("rtl");
  expect(await ThemeOverride.parse(ThemeOverride.serialize(theme))).toEqual(theme);
  await expect(ThemeOverride.parse(JSON.stringify({ config: { style: "radix-gray", iconLibrary: "lucide" }, cssVars: { light: { primary: "red" }, dark: { primary: "black" } } }))).rejects.toThrow(/Unknown/);
  expect(() => ThemeOverride.serialize({ light: { "--bearing-base": "nope", "--primary": "red" }, dark: { "--primary": "black" } })).toThrow(/Unknown value/);
});

it("gives every shipped style a distinct control treatment", () => {
  const seen = new Set<string>();
  for (const style of ThemeCatalog.options.style) {
    const rules = ThemeChrome.rules(style);
    expect(rules).toContain('[data-slot="button"]');
    expect(rules).toContain('[data-slot="section-card"]');
    expect(rules).toContain('[data-slot="dialog-content"]');
    expect(rules).toContain('[data-slot="select-content"]');
    expect(rules).toContain('[data-slot="sidebar-link"]');
    seen.add(rules);
  }
  expect(seen.size).toBe(ThemeCatalog.options.style.length);
  expect(ThemeChrome.rules("lyra")).toContain("border-radius: 0");
  expect(ThemeChrome.rules("lyra")).toContain("font-size: 0.75rem");
  expect(ThemeChrome.rules("maia")).toContain("border-radius: 2rem");
  expect(ThemeChrome.rules("sera")).toContain("text-transform: uppercase");
  expect(ThemeChrome.rules("mira")).toContain("height: 1.75rem");
  expect(ThemeChrome.read(":root { --bearing-base: aria; --bearing-style: sera; --bearing-icon: tabler; --bearing-font: outfit; --bearing-font-heading: lora; }")).toMatchObject({
    base: "aria", style: "sera", iconLibrary: "tabler", font: "outfit", fontHeading: "lora",
  });
  expect(ThemeChrome.read(":root { --bearing-base: evil; }").base).toBe("radix");
});

it("preserves optional semantic overrides, non-hex values and extended palette variables", async () => {
  const theme = { light: { "--type-task": "hsl(210 70% 35%)", "--domain-health": "var(--primary)", "--income": "oklch(0.4 0.1 150)" }, dark: { "--type-task": "oklch(0.8 0.1 240)", "--mood-5": "color-mix(in oklch, var(--chart-2) 60%, white)" } };
  expect(await ThemeOverride.parse(ThemeOverride.serialize(theme))).toEqual(theme);
});
