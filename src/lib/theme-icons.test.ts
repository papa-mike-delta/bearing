import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { typeIcons } from "./v1/client-model";
import { ThemeIcons } from "./theme-icons";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(path);
    return entry.name.endsWith(".tsx") || entry.name.endsWith(".ts") ? [path] : [];
  });
}

it("maps every icon name the app renders and points each library at a real export", async () => {
  const used = new Set<string>(Object.values(typeIcons));
  for (const file of sourceFiles(new URL("../", import.meta.url).pathname)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/\bicon=(?:"|')([A-Z][A-Za-z0-9]+)(?:"|')/g)) used.add(match[1]);
    for (const match of text.matchAll(/\bicon:\s*(?:"|')([A-Z][A-Za-z0-9]+)(?:"|')/g)) used.add(match[1]);
    for (const match of text.matchAll(/<Icon\s+name=(?:"|')([A-Z][A-Za-z0-9]+)(?:"|')/g)) used.add(match[1]);
  }
  const missing = [...used].filter((name) => !ThemeIcons.resolve("lucide", name));
  expect(missing, missing.join(", ")).toEqual([]);

  const [lucide, phosphor, tabler, huge, remix] = await Promise.all([
    import("lucide-react"),
    import("@phosphor-icons/react"),
    import("@tabler/icons-react"),
    import("@hugeicons/core-free-icons"),
    import("@remixicon/react"),
  ]);
  const modules = { lucide, phosphor, tabler, hugeicons: huge, remixicon: remix };
  for (const name of used) {
    for (const library of ["lucide", "phosphor", "tabler", "hugeicons", "remixicon"] as const) {
      const exportName = ThemeIcons.resolve(library, name);
      expect(exportName, `${library} ${name}`).toBeTruthy();
      expect(modules[library][exportName as keyof typeof modules[typeof library]], `${library}.${exportName}`).toBeTruthy();
    }
  }
}, 30_000);
