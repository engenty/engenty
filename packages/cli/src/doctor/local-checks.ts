import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { listLocalMigrations, parseJsonObject } from "../db/local-db.js";
import { runSupabaseCli } from "../db/run-supabase-cli.js";
import { buildScopeReport } from "../env-setup/env-check.js";
import { requiredGaps } from "../env-setup/env-diff.js";
import { envFilePath } from "../env-setup/env-files.js";
import {
  describeStackPortMismatch,
  readLocalStackApiPort,
} from "../env-setup/local-stack-port.js";
import { checkDocker, type LocalCheck } from "./host-checks.js";

/**
 * Read-only. Every probe answers "would `engenty dev` get past this?" and
 * names the command that fixes it. Nothing here starts, restarts or migrates
 * anything — that is what the preflight inside `engenty dev` does.
 */
export type { LocalCheck } from "./host-checks.js";

const HTTP_TIMEOUT_MS = 3000;

async function httpStatus(url: string): Promise<number | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    return response.status;
  } catch {
    return null;
  }
}

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const settle = (inUse: boolean) => {
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(500);
    socket.once("connect", () => settle(true));
    socket.once("timeout", () => settle(false));
    socket.once("error", () => settle(false));
    socket.connect(port, "127.0.0.1");
  });
}

function checkGeneratedFiles(root: string): LocalCheck[] {
  const files: [string, string][] = [
    ["supabase/config.toml", "Local Supabase config"],
    ["apps/ui/src/plugins/generated-catalog.ts", "UI plugin catalog"],
  ];
  return files.map(([rel, label]) =>
    fs.existsSync(path.join(root, rel))
      ? { label, status: "ok", detail: rel }
      : {
          label,
          status: "fail",
          detail: `${rel} is missing`,
          fix: "pnpm engenty generate (or pnpm engenty setup on a fresh checkout)",
        }
  );
}

function readStackStatus(): Record<string, string> | null {
  const result = runSupabaseCli(["status", "-o", "json"]);
  if (!result.ok) {
    return null;
  }
  return parseJsonObject<Record<string, string>>(result.output);
}

async function checkStack(
  status: Record<string, string> | null
): Promise<LocalCheck[]> {
  if (!status?.API_URL) {
    return [
      {
        label: "Local Supabase",
        status: "fail",
        detail: "the stack is not running",
        fix: "pnpm engenty db up",
      },
    ];
  }
  const api = status.API_URL;
  const checks: LocalCheck[] = [
    { label: "Local Supabase", status: "ok", detail: api },
  ];
  const rest = await httpStatus(`${api}/rest/v1/`);
  checks.push(
    rest !== null && rest < 500
      ? { label: "PostgREST", status: "ok", detail: `HTTP ${rest}` }
      : {
          label: "PostgREST",
          status: "fail",
          detail: rest === null ? "no answer" : `HTTP ${rest}`,
          fix: "pnpm engenty db restart — a 503 with PGRST002 in `docker logs supabase_rest_<project>` means the exposed schemas changed; restart reloads them",
        }
  );
  const auth = await httpStatus(`${api}/auth/v1/health`);
  checks.push(
    auth === 200
      ? { label: "Auth", status: "ok", detail: "HTTP 200" }
      : {
          label: "Auth",
          status: "fail",
          detail: auth === null ? "no answer" : `HTTP ${auth}`,
          fix: "pnpm engenty db restart; if several stacks run at once the host is saturated — stop the ones you are not using",
        }
  );
  return checks;
}

function checkMigrations(stackUp: boolean): LocalCheck {
  const label = "Migrations";
  if (!stackUp) {
    return { label, status: "warn", detail: "skipped — stack not running" };
  }
  const rows = listLocalMigrations();
  if (!rows) {
    return {
      label,
      status: "fail",
      detail: "supabase migration list failed",
      fix: "pnpm engenty db migrate",
    };
  }
  const applied = rows.filter((row) => row.remote).length;
  const pending = rows.filter((row) => row.local && !row.remote).length;
  if (applied === 0) {
    return {
      label,
      status: "fail",
      detail: "none applied — empty database",
      fix: "pnpm engenty setup (asks before `db reset`) or pnpm engenty db reset",
    };
  }
  return pending === 0
    ? { label, status: "ok", detail: `${applied} applied, none pending` }
    : {
        label,
        status: "fail",
        detail: `${pending} pending (${applied} applied)`,
        fix: "pnpm engenty db migrate",
      };
}

function checkEnv(root: string): LocalCheck {
  const label = "Local env";
  const envPath = envFilePath(root, "root");
  if (!fs.existsSync(envPath)) {
    return {
      label,
      status: "fail",
      detail: `${path.relative(root, envPath)} is missing`,
      fix: "pnpm engenty env init",
    };
  }
  const report = buildScopeReport(root, "root");
  const mismatch = describeStackPortMismatch({
    configPort: readLocalStackApiPort(root),
    envUrl: report.vars.find((entry) => entry.spec.key === "SUPABASE_URL")
      ?.value,
  });
  if (mismatch) {
    return {
      label,
      status: "fail",
      detail: mismatch.split(" Fix:")[0],
      fix: "pnpm engenty env init (rewrites the Supabase block from supabase status)",
    };
  }
  const gaps = requiredGaps(report);
  return gaps.length === 0
    ? { label, status: "ok", detail: path.relative(root, envPath) }
    : {
        label,
        status: "fail",
        detail: `${gaps.length} required value(s) need attention: ${gaps
          .map((gap) => gap.spec.key)
          .join(", ")}`,
        fix: "pnpm engenty env check, then pnpm engenty env init",
      };
}

async function checkPorts(root: string): Promise<LocalCheck> {
  const label = "Dev ports";
  const configPath = path.join(root, "apps", "ports.config.mjs");
  if (!fs.existsSync(configPath)) {
    return { label, status: "warn", detail: "apps/ports.config.mjs not found" };
  }
  const { ports } = (await import(pathToFileURL(configPath).href)) as {
    ports: Record<string, number>;
  };
  const inUse: string[] = [];
  for (const [name, port] of Object.entries(ports)) {
    // The config lists every app the monorepo can have; a tree without one
    // (the open mirror ships no www) must not be told its port is taken.
    const appDir = name === "appHost" ? "app-host" : name;
    if (!fs.existsSync(path.join(root, "apps", appDir))) {
      continue;
    }
    if (await isPortInUse(port)) {
      inUse.push(`${name}:${port}`);
    }
  }
  return inUse.length === 0
    ? { label, status: "ok", detail: "all free" }
    : {
        label,
        status: "warn",
        detail: `in use — ${inUse.join(", ")} (a running dev stack, or a stale one that \`engenty dev\` frees)`,
      };
}

export async function runLocalChecks(root: string): Promise<LocalCheck[]> {
  const docker = checkDocker();
  const checks: LocalCheck[] = [docker, ...checkGeneratedFiles(root)];
  const status = docker.status === "ok" ? readStackStatus() : null;
  checks.push(...(await checkStack(status)));
  checks.push(checkMigrations(Boolean(status?.API_URL)));
  checks.push(checkEnv(root));
  checks.push(await checkPorts(root));
  return checks;
}
