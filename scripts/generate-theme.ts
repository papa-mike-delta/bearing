import { writeFile } from "node:fs/promises";
import { ThemeOverride } from "../src/lib/theme-override";

async function main() {
  const [url, ...extra] = process.argv.slice(2);
  if (!url?.startsWith("https://") || extra.length) {
    throw new Error("Usage: npm run theme:generate -- 'https://ui.shadcn.com/create?...'");
  }
  const theme = await ThemeOverride.parse(url);
  const stylesheet = ThemeOverride.serialize(theme);
  await writeFile(new URL("../src/app/theme-override.css", import.meta.url), stylesheet, "utf8");
  console.log("Generated src/app/theme-override.css with light and dark theme variables.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Theme generation failed.");
  process.exitCode = 1;
});
