import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { assertMigrated, markerUrl } from "./migration-check.js";

/** @type {(phase: string) => import('next').NextConfig} */
export default function nextConfig(phase) {
  if (phase === "phase-production-build") {
    assertMigrated(process.env, () => readFileSync(markerUrl, "utf8"));
  }
  return {
    transpilePackages: ["@repo/ui"],
    outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
    // Static Coach knowledge is read with node:fs, including in deployments.
    outputFileTracingIncludes: {
      "/api/coach": ["../../packages/coach/knowledge/journaling.md"],
      "/coach/knowledge/journaling": ["../../packages/coach/knowledge/journaling.md"],
    },
  };
}
