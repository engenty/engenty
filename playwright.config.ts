import { defineConfig, devices } from "@playwright/test";

// Browser smoke lane: real stack (UI 5173 → core 8787 → ai 8790 → local
// Supabase) driven through the rendered UI. Run via `pnpm test:smoke` with
// the dev stack up (`pnpm dev`) — `reuseExistingServer` picks it up — or let
// Playwright boot it. Every spec logs in itself via /auth/agent-login (needs
// ENGENTY_DEV_PASS in .env.local, non-prod only) — see gotoLoggedIn(); a
// shared storageState breaks under refresh-token rotation.
//
// Interaction budgets live in e2e/smoke/interaction.smoke.spec.ts. Required
// on react / react-dom / react-router-dom upgrades because `BrowserRouter
// useTransitions={false}` is the escape hatch for useSyncExternalStore
// starving startTransition (React 5s expiration). Production-build timings
// use `pnpm test:smoke:prod` once ENGENTY_E2E_BASE_URL points at a prod
// gateway serving apps/ui/dist — see scripts/e2e-prod-preview.mjs.
export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  fullyParallel: false,
  outputDir: "e2e/.results",
  projects: [
    {
      name: "chromium",
      testIgnore: /mobile-.*\.smoke\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Phone lane. Scoped to the mobile specs rather than the whole suite: the
    // desktop specs drive chrome that is deliberately collapsed below `md`
    // (sidebar → nav sheet), so running them here would assert against a UI
    // that is not supposed to be visible. Widen this once the mobile layouts
    // of the core surfaces land and their specs are viewport-aware.
    //
    // WebKit is not optional here — iOS is the only engine where `dvh` and
    // `env(safe-area-inset-*)` behave differently from the desktop baseline,
    // which is the entire reason those tokens exist.
    {
      name: "mobile-safari",
      testMatch: /mobile-.*\.smoke\.spec\.ts$/,
      use: { ...devices["iPhone 14"] },
    },
    {
      name: "mobile-chrome",
      testMatch: /mobile-.*\.smoke\.spec\.ts$/,
      use: { ...devices["Pixel 7"] },
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
  // CI runs against a cold Vite dev server: the first navigation transforms the
  // whole module graph on demand and has outrun 60s on every nightly run.
  timeout: process.env.CI ? 120_000 : 60_000,
  use: {
    baseURL: process.env.ENGENTY_E2E_BASE_URL ?? "http://localhost:5173",
    // Portless serves the app over HTTPS with a locally-trusted (self-signed)
    // cert; accept it so the lane can target `*.engenty.localhost` too.
    ignoreHTTPSErrors: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm run dev",
    // Portless `*.engenty.localhost` uses a local CA; the browser already
    // sets ignoreHTTPSErrors below, but the webServer probe is a separate
    // Node fetch that would otherwise treat the origin as down and spawn a
    // second `pnpm run dev` on top of the worktree stack.
    ignoreHTTPSErrors: true,
    // Locally this picks up the worktree's own stack. In CI there is nothing
    // to reuse, and a stray listener on the port would silently become the
    // system under test instead of the build this run produced.
    reuseExistingServer: !process.env.CI,
    // The dev server's output is the only window into a failed CI boot.
    stdout: process.env.CI ? "pipe" : "ignore",
    timeout: 600_000,
    url: process.env.ENGENTY_E2E_BASE_URL ?? "http://localhost:5173",
  },
  // One worker: the smoke lane shares a dev database and a single login.
  workers: 1,
});
