import { defineConfig, devices } from "@playwright/test";

// Browser smoke lane: real stack (UI 5173 → core 8787 → ai 8790 → local
// Supabase) driven through the rendered UI. Run via `pnpm test:smoke` with
// the dev stack up (`pnpm dev`) — `reuseExistingServer` picks it up — or let
// Playwright boot it. Every spec logs in itself via /auth/agent-login (needs
// ENGENTY_DEV_PASS in .env.local, non-prod only) — see gotoLoggedIn(); a
// shared storageState breaks under refresh-token rotation.
export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  fullyParallel: false,
  outputDir: "e2e/.results",
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "e2e/.report" }]]
    : [["list"]],
  // One retry everywhere: the app's boot-time session refresh can race the
  // agent-login session (concurrent auth clients), and a loaded dev machine
  // occasionally stalls first paint past the login timeout.
  retries: 1,
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: process.env.ENGENTY_E2E_BASE_URL ?? "http://localhost:5173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm run dev",
    reuseExistingServer: true,
    stdout: "ignore",
    timeout: 600_000,
    url: process.env.ENGENTY_E2E_BASE_URL ?? "http://localhost:5173",
  },
  // One worker: the smoke lane shares a dev database and a single login.
  workers: 1,
});
