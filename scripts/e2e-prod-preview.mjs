#!/usr/bin/env node
/**
 * Production-mode interaction lane hook.
 *
 * The nightly smoke workflow (`pnpm test:smoke`) measures Vite development
 * mode. Product budgets should also be collected against a production UI
 * build served by core's prod gateway:
 *
 *   pnpm --filter @engenty/ui build
 *   ENGENTY_DEV_GATEWAY=0 ENGENTY_PROD_GATEWAY=1 \
 *     ENGENTY_GATEWAY_UI_ROOT="$PWD/apps/ui/dist" \
 *     # restart core, then:
 *   ENGENTY_E2E_BASE_URL=<gateway origin> pnpm test:smoke:interaction
 *
 * This script does not start Docker or extra stacks. It:
 *   1. Ensures `apps/ui/dist` exists (builds the UI if missing, unless
 *      `--no-build`).
 *   2. Runs the interaction Playwright spec when `ENGENTY_E2E_BASE_URL` is set.
 *   3. Otherwise prints the operator steps and exits 0 (`--probe`) or 1
 *      (`--require-url`).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "apps/ui/dist");
const args = new Set(process.argv.slice(2));
const baseUrl = process.env.ENGENTY_E2E_BASE_URL?.trim() ?? "";

function run(command, commandArgs, extraEnv = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!(existsSync(join(dist, "index.html")) || args.has("--no-build"))) {
  console.info("apps/ui/dist missing — building @engenty/ui");
  run("pnpm", ["--filter", "@engenty/ui", "build"]);
}

if (baseUrl) {
  console.info(`interaction prod preview → ${baseUrl}`);
  run(
    "pnpm",
    ["exec", "playwright", "test", "e2e/smoke/interaction.smoke.spec.ts"],
    { ENGENTY_E2E_BASE_URL: baseUrl }
  );
  process.exit(0);
}

const steps = `
Production interaction lane is not pointed at a gateway.

1. Build the UI (already done if apps/ui/dist/index.html exists)
2. Serve that build through core:
     ENGENTY_DEV_GATEWAY=0 ENGENTY_PROD_GATEWAY=1 \\
     ENGENTY_GATEWAY_UI_ROOT=${dist}
3. Re-run:
     ENGENTY_E2E_BASE_URL=<origin> pnpm test:smoke:prod
`.trim();

console.info(steps);

if (args.has("--require-url")) {
  process.exit(1);
}
