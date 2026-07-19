#!/usr/bin/env node
/**
 * Waits for Portless dev stack loopback ports, then prints the browser URL.
 * Used as a Turbo task (`dev:portless:ready`) and as a /dev/tty announcer.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ports as defaultPorts } from "../apps/ports.config.mjs";

const POLL_MS = 500;

function envInt(name, fallback) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Cold boots on a loaded machine (several worktree stacks in parallel) can
// exceed 5 minutes; the override keeps the ready gate from killing the stack.
const DEFAULT_MAX_WAIT_MS = envInt("ENGENTY_DEV_READY_MAX_WAIT_MS", 300_000);

export function resolveGatewayOrigin() {
  const fromEnv =
    process.env.GATEWAY_ORIGIN?.trim() ||
    process.env.ENGENTY_UI_BASE_URL?.trim() ||
    "https://engenty.localhost";
  return fromEnv.replace(/\/$/, "");
}

export function buildReadyBanner({
  gatewayOrigin,
  uiPort,
  corePort,
  domain = null,
}) {
  const lines = [
    "",
    "══════════════════════════════════════════════════════════",
    `  Open ${gatewayOrigin}/`,
  ];
  if (domain) {
    lines.push(
      `  Worktree: ${domain} · UI loopback :${uiPort} · core :${corePort}`
    );
  } else {
    lines.push(`  Loopback UI :${uiPort} · core :${corePort}`);
  }
  lines.push("══════════════════════════════════════════════════════════");
  lines.push("");
  return lines.join("\n");
}

export function buildStartingHint({ gatewayOrigin, domain = null }) {
  if (domain) {
    return `Starting Portless dev (${domain}) → ${gatewayOrigin}/`;
  }
  return `Starting Portless dev → ${gatewayOrigin}/`;
}

async function probeOk(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function waitForDevPortlessReady({
  uiPort = envInt("ENGENTY_UI_PORT", defaultPorts.ui),
  corePort = envInt("ENGENTY_CORE_PORT", defaultPorts.core),
  maxWaitMs = DEFAULT_MAX_WAIT_MS,
  pollMs = POLL_MS,
  log = () => {},
} = {}) {
  const uiUrl = `http://127.0.0.1:${uiPort}/`;
  const coreUrl = `http://127.0.0.1:${corePort}/api/openapi.json`;
  const deadline = Date.now() + maxWaitMs;
  let lastProgressAt = 0;

  while (Date.now() < deadline) {
    const [uiReady, coreReady] = await Promise.all([
      probeOk(uiUrl),
      probeOk(coreUrl),
    ]);
    if (uiReady && coreReady) {
      return { uiPort, corePort, uiReady, coreReady };
    }
    const now = Date.now();
    if (now - lastProgressAt >= 15_000) {
      log(
        `Waiting for dev stack… UI:${uiReady ? "ok" : "…"} core:${coreReady ? "ok" : "…"}`
      );
      lastProgressAt = now;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  return {
    uiPort,
    corePort,
    uiReady: await probeOk(uiUrl),
    coreReady: await probeOk(coreUrl),
    timedOut: true,
  };
}

function writeToTty(text) {
  // Turbo TUI owns the terminal (mouse tracking, alt screen). Writing to /dev/tty
  // while it runs injects bytes that leak into task stdout and pane titles.
  if (process.env.TURBO_HASH) {
    return false;
  }
  try {
    fs.writeFileSync("/dev/tty", `${text}\n`);
    return true;
  } catch {
    return false;
  }
}

function emit(text, { preferTty = false } = {}) {
  if (preferTty && writeToTty(text)) {
    return;
  }
  process.stdout.write(`${text}\n`);
}

function parseArgs(argv) {
  return {
    printHint: argv.includes("--print-hint"),
    wait: argv.includes("--wait"),
    tty: argv.includes("--tty"),
    turboPane: argv.includes("--turbo-pane") || argv.length === 0,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const gatewayOrigin = resolveGatewayOrigin();
  const domain = process.env.ENGENTY_DEV_DOMAIN?.trim() || null;
  const uiPort = envInt("ENGENTY_UI_PORT", defaultPorts.ui);
  const corePort = envInt("ENGENTY_CORE_PORT", defaultPorts.core);

  if (args.printHint) {
    emit(buildStartingHint({ gatewayOrigin, domain }), { preferTty: args.tty });
    return;
  }

  const log = (message) => emit(message, { preferTty: false });
  if (args.turboPane) {
    emit(`Waiting for UI (:${uiPort}) and core (:${corePort})…`);
  } else if (args.wait) {
    log(`Waiting for Portless dev stack on UI :${uiPort}, core :${corePort}…`);
  }

  const result = await waitForDevPortlessReady({
    uiPort,
    corePort,
    log,
  });

  if (result.timedOut && !(result.uiReady && result.coreReady)) {
    const message = `Dev stack did not become ready in time (UI :${uiPort}, core :${corePort}).`;
    emit(message, { preferTty: args.tty && !args.turboPane });
    process.exitCode = 1;
    return;
  }

  const banner = buildReadyBanner({
    gatewayOrigin,
    uiPort,
    corePort,
    domain,
  });
  emit(banner, { preferTty: args.tty && !args.turboPane });

  if (args.turboPane) {
    emit("Pinned — URL stays visible in this Turbo task while dev runs.");
    await new Promise(() => {});
  }
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
