#!/usr/bin/env node
/**
 * Free dev ports occupied by stale processes from this repo before the dev
 * servers start. Avoids "Port 5173 is already in use" when a previous
 * `pnpm dev` / `pnpm dev:portless` was killed uncleanly and left a Vite /
 * gateway / docs process behind.
 *
 * Only processes that look like they belong to this repo are killed
 * (command line references the repo root, or it is a `vite` process on one
 * of the known dev ports). Unrelated apps holding a port are reported, not
 * killed — the script exits non-zero so the user sees a clear message instead
 * of a vague Vite bind error.
 *
 * Usage:
 *   node scripts/dev-port-check.mjs --ports=5173,8787,8790,3002,43111
 *   node scripts/dev-port-check.mjs --domain=tab-ui
 *   node scripts/dev-port-check.mjs --ports=5173 --dry-run
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveDevPortlessConfig,
  resolveWorkspaceRoot,
} from "./dev-portless-lib.mjs";

const DEFAULT_PORT_LABELS = {
  5173: "ui (Vite)",
  8787: "core (gateway)",
  8790: "ai",
  3002: "docs",
  43111: "studio",
};

function parseArgs(argv) {
  const out = {
    explicitDomain: null,
    cwd: null,
    ports: null,
    dryRun: false,
    json: false,
  };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a.startsWith("--domain=")) {
      out.explicitDomain = a.slice("--domain=".length);
    } else if (a === "--domain") {
      out.explicitDomain = argv[++i];
    } else if (a.startsWith("--cwd=")) {
      out.cwd = a.slice("--cwd=".length);
    } else if (a.startsWith("--ports=")) {
      out.ports = a
        .slice("--ports=".length)
        .split(",")
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0);
    } else if (a === "--dry-run") {
      out.dryRun = true;
    } else if (a === "--json") {
      out.json = true;
    }
    i++;
  }
  return out;
}

/** PIDs of the current process and all its ancestors. */
export function ancestorPids(pid = process.pid) {
  const pids = [pid];
  let current = pid;
  for (let depth = 0; depth < 32 && current > 1; depth++) {
    let ppid;
    try {
      ppid = Number(
        execFileSync("ps", ["-o", "ppid=", "-p", String(current)], {
          encoding: "utf8",
        }).trim()
      );
    } catch {
      break;
    }
    if (!Number.isFinite(ppid) || ppid <= 1 || pids.includes(ppid)) {
      break;
    }
    pids.push(ppid);
    current = ppid;
  }
  return new Set(pids);
}

/** Listening processes on a TCP port (macOS lsof). */
export function listenersOn(port) {
  let raw;
  try {
    raw = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return [];
  }
  const lines = raw.trim().split("\n");
  if (lines.length < 2) {
    return [];
  }
  return lines
    .slice(1)
    .map((line) => {
      const cols = line.split(/\s+/);
      return {
        command: cols[0] ?? "",
        pid: Number(cols[1]),
        user: cols[2] ?? "",
      };
    })
    .filter((p) => Number.isFinite(p.pid) && p.pid > 0);
}

/** Full command line for a PID (to inspect whether it belongs to this repo). */
export function fullCommand(pid) {
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

/**
 * A listener is "ours" if its command line references the repo root, or it is
 * a `vite` process (Vite on one of our dev ports is almost certainly a stale
 * dev server).
 */
export function isRepoProcess(cmd, repoRoot) {
  if (!cmd) {
    return false;
  }
  if (repoRoot && cmd.includes(repoRoot)) {
    return true;
  }
  return /\bvite\b/i.test(cmd);
}

function killPid(pid, dryRun) {
  if (dryRun) {
    return false;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return false;
  }
  for (let i = 0; i < 10; i++) {
    try {
      execFileSync("kill", ["-0", String(pid)], { stdio: "ignore" });
    } catch {
      return true;
    }
    sleep(100);
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* ignore */
  }
  return true;
}

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* busy wait — short durations only */
  }
}

function resolvePorts(args, repoRoot) {
  if (args.ports) {
    return args.ports;
  }
  const config = resolveDevPortlessConfig({
    explicitDomain: args.explicitDomain,
    cwd: args.cwd ?? repoRoot,
    persist: true,
  });
  const p = config.ports;
  return [p.ui, p.core, p.ai, p.docs, p.studio];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = args.cwd ? path.resolve(args.cwd) : resolveWorkspaceRoot();
  const ports = resolvePorts(args, repoRoot);
  const ancestors = ancestorPids();

  const report = [];
  const unrelated = [];

  for (const port of ports) {
    const label = DEFAULT_PORT_LABELS[port] ?? "dev";
    const listeners = listenersOn(port).filter((l) => !ancestors.has(l.pid));
    if (listeners.length === 0) {
      report.push({ port, label, status: "free" });
      continue;
    }
    for (const l of listeners) {
      const cmd = fullCommand(l.pid);
      if (isRepoProcess(cmd, repoRoot)) {
        const killed = killPid(l.pid, args.dryRun);
        report.push({
          port,
          label,
          status: args.dryRun
            ? "stale-would-kill"
            : killed
              ? "freed"
              : "kill-failed",
          pid: l.pid,
          command: cmd,
        });
      } else {
        unrelated.push({ port, label, pid: l.pid, command: cmd });
        report.push({
          port,
          label,
          status: "unrelated",
          pid: l.pid,
          command: cmd,
        });
      }
    }
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ report, unrelated }, null, 2)}\n`);
  } else {
    for (const r of report) {
      if (r.status === "free") {
        continue;
      }
      const tag =
        r.status === "freed"
          ? "freed"
          : r.status === "stale-would-kill"
            ? "stale (dry-run)"
            : r.status === "kill-failed"
              ? "could not kill"
              : "held by unrelated process";
      const cmd = r.command ? ` — ${truncate(r.command, 100)}` : "";
      process.stdout.write(
        `port ${r.port} [${r.label}]: ${tag} (pid ${r.pid})${cmd}\n`
      );
    }
  }

  if (unrelated.length > 0) {
    process.stderr.write(
      `\nRefusing to start: port${unrelated.length > 1 ? "s" : ""} ` +
        `${[...new Set(unrelated.map((u) => u.port))].join(", ")} ` +
        `held by unrelated process${unrelated.length > 1 ? "es" : ""} ` +
        `I won't kill automatically.\n` +
        `Free ${unrelated.length > 1 ? "them" : "it"} manually, e.g.:\n` +
        unrelated.map((u) => `  kill ${u.pid}   # port ${u.port}`).join("\n") +
        "\nthen retry: pnpm dev:portless\n"
    );
    process.exit(1);
  }

  if (!args.json) {
    const freed = report.filter((r) => r.status === "freed").length;
    if (freed > 0) {
      process.stdout.write(
        `Killed ${freed} stale dev process${freed > 1 ? "es" : ""} blocking the dev ports.\n`
      );
    }
  }
  process.exit(0);
}

function truncate(s, n) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

const invokedDirect =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirect) {
  main();
}
