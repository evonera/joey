import { defineConfig, devices } from "@playwright/test";

const remoteBaseUrl = process.env.JOEY_SOAK_BASE_URL;
const durationMs = Number(process.env.JOEY_SOAK_DURATION_MS ?? 30 * 60 * 1000);
const warmupTimeoutMs = Number(process.env.JOEY_SOAK_WARMUP_TIMEOUT_MS ?? 10 * 60 * 1000);
if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error("JOEY_SOAK_DURATION_MS must be positive.");
if (!Number.isFinite(warmupTimeoutMs) || warmupTimeoutMs <= 0) {
  throw new Error("JOEY_SOAK_WARMUP_TIMEOUT_MS must be positive.");
}

export default defineConfig({
  testDir: "./tests/performance",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: warmupTimeoutMs + durationMs + 2 * 60 * 1000,
  reporter: [["list"], ["html", { outputFolder: "playwright-report/soak", open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: remoteBaseUrl ?? "http://localhost:3000",
    storageState: process.env.JOEY_SOAK_STORAGE_STATE,
    trace: "retain-on-failure",
  },
  webServer: remoteBaseUrl
    ? undefined
    : {
        command: "npm run build && npm run start",
        url: "http://localhost:3000",
        timeout: 180 * 1000,
        reuseExistingServer: true,
        env: {
          ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=",
          DATABASE_URL: process.env.DATABASE_URL ?? "postgres://dummy:dummy@localhost:5432/dummy",
          NEXT_OUTPUT: "server",
        },
      },
  projects: [{ name: "chromium-soak", use: { ...devices["Desktop Chrome"] } }],
});
