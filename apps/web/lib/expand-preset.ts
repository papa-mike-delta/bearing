import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { themeBlocks } from "./account-theme.ts";

const require = createRequire(import.meta.url);

// Runs the installed CLI's theme-only apply in a throwaway project, then
// keeps the custom properties. Does not edit Bearing's shared theme, and
// does not call the undocumented init URL.
export async function expandPreset(code: string) {
  const root = await mkdtemp(path.join(tmpdir(), "bearing-theme-"));
  try {
    await mkdir(path.join(root, "app"));
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "bearing-theme-stub",
        private: true,
        dependencies: { next: "16.3.4", tailwindcss: "4.3.3" },
      }),
    );
    await writeFile(path.join(root, "next.config.mjs"), "export default {};\n");
    await writeFile(
      path.join(root, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { paths: { "@/*": ["./*"] } } }),
    );
    await writeFile(
      path.join(root, "app/layout.tsx"),
      "export default function Layout({ children }: { children: React.ReactNode }) { return children }\n",
    );
    await writeFile(
      path.join(root, "components.json"),
      JSON.stringify({
        $schema: "https://ui.shadcn.com/schema.json",
        style: "base-mira",
        rsc: true,
        tsx: true,
        tailwind: {
          config: "",
          css: "globals.css",
          baseColor: "neutral",
          cssVariables: true,
        },
        iconLibrary: "lucide",
        aliases: {
          components: "@/components",
          utils: "@/lib/utils",
          ui: "@/components",
          lib: "@/lib",
          hooks: "@/hooks",
        },
      }),
    );
    await writeFile(path.join(root, "globals.css"), '@import "tailwindcss";\n');
    const preset = require.resolve("shadcn/preset");
    const bin = path.join(path.dirname(preset), "..", "index.js");
    const status = await run(process.execPath, [
      bin,
      "apply",
      code,
      "--only",
      "theme",
      "-y",
      "-s",
    ], root);
    if (status !== 0) return null;
    return themeBlocks(await readFile(path.join(root, "globals.css"), "utf8"));
  } catch {
    return null;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function run(command: string, args: string[], cwd: string) {
  return new Promise<number>((resolve) => {
    const child = spawn(command, args, { cwd, stdio: "ignore" });
    const timer = setTimeout(() => child.kill(), 60_000);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(1);
    });
    child.on("exit", (status) => {
      clearTimeout(timer);
      resolve(status ?? 1);
    });
  });
}
