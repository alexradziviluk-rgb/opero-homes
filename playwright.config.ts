import { defineConfig, devices } from "@playwright/test";
import { execFileSync } from "node:child_process";

function loadLocalSupabaseEnv() {
  const output = execFileSync("cmd.exe", ["/d", "/s", "/c", "supabase status -o env"], { encoding: "utf8" });
  const values = Object.fromEntries(output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z0-9_]+)="(.*)"$/);
    return match ? [[match[1], match[2]]] : [];
  }));
  const localUrl = values.API_URL;
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(localUrl ?? "")) {
    throw new Error("Local Supabase API URL is unavailable.");
  }
  process.env.E2E_LOCAL = "true";
  process.env.E2E_BASE_URL = "http://localhost:3201";
  process.env.NEXT_PUBLIC_SUPABASE_URL = localUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = values.ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = values.PUBLISHABLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = values.SERVICE_ROLE_KEY;
}

loadLocalSupabaseEnv();
const isLocalE2E = process.env.E2E_LOCAL === "true";
const localBaseUrl = "http://localhost:3201";
const configuredBaseUrl = process.env.E2E_BASE_URL ?? localBaseUrl;
const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

if (isLocalE2E) {
  if (configuredBaseUrl !== localBaseUrl) {
    throw new Error(`E2E_LOCAL requires E2E_BASE_URL=${localBaseUrl}.`);
  }

  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(configuredSupabaseUrl)) {
    throw new Error("E2E_LOCAL requires NEXT_PUBLIC_SUPABASE_URL to point to localhost or 127.0.0.1.");
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("E2E_LOCAL requires SUPABASE_SERVICE_ROLE_KEY for local fixture setup.");
  }
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: configuredBaseUrl,
    storageState: process.env.E2E_STORAGE_STATE || undefined,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: process.env.E2E_BASE_URL && !isLocalE2E
    ? undefined
    : {
        command: "npm run dev -- --port 3201",
        url: `${localBaseUrl}/login`,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          E2E_LOCAL: "true",
          E2E_BASE_URL: localBaseUrl,
          NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
        },
      },
});
