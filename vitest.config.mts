import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };
const integrationUrl = (() => {
  if (!process.env.TEST_DATABASE_URL)
    return "postgresql://postgres:postgres@127.0.0.1:5432/bearing_test_unconfigured";
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set("schema", `v1_test_${randomUUID().replaceAll("-", "")}`);
  return url.toString();
})();

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["e2e/**", "node_modules/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["integration/**/*.test.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
          env: {
            DATABASE_URL: integrationUrl,
            SESSION_SECRET: "test-only-secret-at-least-32-characters",
          },
        },
      },
    ],
  },
});
