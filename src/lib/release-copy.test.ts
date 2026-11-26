import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { siteConfig } from "./seo";
it("public metadata describes V1 and does not revive retired feature promises", () => {
  const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8"));
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const page = readFileSync("src/app/page.tsx", "utf8");
  const current = JSON.stringify([
    siteConfig,
    manifest.description,
    pkg.description,
    pkg.keywords,
    page,
  ]);
  expect(current).not.toMatch(
    /finance tracker|finance-tracker|17 item|8 life domains|No signup|entirely in your browser/i,
  );
  expect(siteConfig.screenshotUrls.every((url) => url.includes("v1-"))).toBe(
    true,
  );
  expect(page).toContain("Sign-in required");
  expect(pkg.engines.node).toBe(">=22");
});
