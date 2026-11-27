import { defineConfig, devices } from "@playwright/test";
if (!process.env.TEST_DATABASE_URL)
  throw new Error("Use a disposable TEST_DATABASE_URL");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.BEARING_COACH_MODEL = "fixture";
process.env.SESSION_SECRET ||= "release-fixture-secret-at-least-32-characters";
const specs =
  /v1-(workflow|foundations|connected|coach|release|cleanup|link-proposals|theme|perspectives|account-settings|account|delete|organize)\.spec\.ts/;
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.RELEASE_BASE_URL || "http://127.0.0.1:3000",
    timezoneId: "America/New_York",
    trace: "retain-on-failure",
    ...(process.env.RELEASE_CHROMIUM_PATH
      ? {
          launchOptions: {
            executablePath: process.env.RELEASE_CHROMIUM_PATH,
            args: [
              "--no-sandbox",
              "--no-zygote",
              "--single-process",
              "--disable-dev-shm-usage",
              "--disable-gpu",
              "--in-process-gpu",
              "--disable-webgl",
            ],
          },
        }
      : {}),
  },
  projects: [
    { name: "setup", testMatch: /v1-workflow.setup.ts/ },
    ...["desktop", "phone"].map((name) => ({
      name,
      testMatch:
        name === "desktop" ? [specs, /auth\.spec\.ts/, /landing\.spec\.ts/] : specs,
      dependencies: ["setup"],
      use: {
        ...devices[name === "phone" ? "iPhone 13" : "Desktop Chrome"],
        defaultBrowserType: "chromium" as const,
        storageState: "e2e/.auth/workflow.json",
      },
    })),
  ],
  ...(!process.env.RELEASE_BASE_URL
    ? {
        webServer: [
          {
            cwd: process.cwd(),
            command: "node e2e/scripts/coach-provider.mjs",
            port: 5555,
          },
          {
            cwd: process.cwd(),
            command:
              "node --import tsx e2e/scripts/release-fixture.ts && npm run start -- --hostname 127.0.0.1",
            url: "http://127.0.0.1:3000/login",
            timeout: 120000,
            env: {
              DATABASE_URL: process.env.DATABASE_URL!,
              SESSION_SECRET: process.env.SESSION_SECRET!,
              BEARING_COACH_PROVIDER: "openrouter",
              BEARING_COACH_MODEL: "fixture",
              OPENROUTER_API_KEY: "fixture-key",
              BEARING_COACH_OPENROUTER_URL: "http://127.0.0.1:5555/v1",
            },
          },
        ],
      }
    : {}),
});
