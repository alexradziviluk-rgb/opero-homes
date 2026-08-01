import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: externalBaseUrl ?? "http://127.0.0.1:3100",
    storageState: process.env.E2E_STORAGE_STATE || undefined,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "npm run dev -- --port 3100",
        url: "http://127.0.0.1:3100/login",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
