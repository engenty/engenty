#!/usr/bin/env node
/**
 * Optional Portless dev setup: trust local CA, health check, sync .env.local URLs.
 * Default localhost dev uses http://localhost:5173 — run pnpm dev:urls:localhost.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, "..");
const portlessBin = path.join(workspaceRoot, "node_modules/.bin/portless");

function run(command, args, { allowFail = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0 && !allowFail) {
    process.exit(result.status ?? 1);
  }
  return result.status ?? 0;
}

function ensurePortlessInstalled() {
  if (fs.existsSync(portlessBin)) {
    return;
  }
  console.error(
    "portless is not installed. Run: pnpm install  (adds the portless dev dependency)"
  );
  process.exit(1);
}

function portless(args, options) {
  return run(portlessBin, args, options);
}

console.log("Portless setup (optional — HTTPS https://engenty.localhost instead of http://localhost:5173)\n");

ensurePortlessInstalled();

console.log("1/3 Trusting local CA for *.localhost HTTPS (may prompt for sudo)…");
portless(["trust"], { allowFail: true });

console.log("\n2/3 Running portless doctor…");
portless(["doctor"], { allowFail: true });

console.log("\n3/3 Syncing dev URLs to .env.local…");
run("node", [path.join(scriptDir, "sync-dev-env-from-portless.mjs")]);

console.log(
  "\nPortless setup complete. Start the stack with `pnpm portless` or per-app portless scripts."
);
