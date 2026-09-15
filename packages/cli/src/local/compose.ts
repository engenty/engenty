import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { engentyHome, ensureEngentyHome } from "../home.js";
import { requireTemplate } from "./package-templates.js";

export const COMPOSE_FILES = [
  "docker-compose.prebuilt.yaml",
  "docker-compose.local.yaml",
] as const;

/**
 * Directories the compose bind-mounts by relative path. Without them Docker
 * creates a directory where a config file belongs and the proxy containers die
 * with "not a directory".
 */
export const COMPOSE_DIRS = ["egress-proxy", "browser-proxy"] as const;

/** Copy this release's compose files in, replacing the previous release's. */
export function writeComposeFiles(home = engentyHome()): string[] {
  ensureEngentyHome(home);
  const written: string[] = [];
  for (const name of COMPOSE_FILES) {
    fs.copyFileSync(requireTemplate(name), path.join(home, name));
    written.push(name);
  }
  for (const dir of COMPOSE_DIRS) {
    const target = path.join(home, dir);
    fs.rmSync(target, { force: true, recursive: true });
    fs.cpSync(requireTemplate(dir), target, { recursive: true });
    written.push(dir);
  }
  return written;
}

function composeArgs(rest: readonly string[]): string[] {
  const files = COMPOSE_FILES.flatMap((name) => ["-f", name]);
  return ["compose", "--project-name", "engenty", ...files, ...rest];
}

export function runCompose(
  rest: readonly string[],
  params: { capture?: boolean; home?: string } = {}
): { ok: boolean; output: string } {
  const home = params.home ?? engentyHome();
  const result = spawnSync("docker", composeArgs(rest), {
    cwd: home,
    encoding: "utf8",
    stdio: params.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) {
    throw new Error(
      "docker is not on PATH. Install Docker Desktop, OrbStack or another Docker-compatible runtime, then run `engenty doctor`."
    );
  }
  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
  };
}

export function composeUp(home = engentyHome()): void {
  if (!runCompose(["up", "-d"], { home }).ok) {
    throw new Error("docker compose up failed — see the output above.");
  }
}

export function composeDown(
  params: { home?: string; volumes?: boolean } = {}
): void {
  runCompose(["down", ...(params.volumes ? ["--volumes"] : [])], {
    home: params.home,
  });
}

export function composePull(home = engentyHome()): void {
  runCompose(["pull"], { home });
}

export interface ServiceState {
  name: string;
  state: string;
}

export function composeStates(home = engentyHome()): ServiceState[] {
  const result = runCompose(["ps", "--format", "json"], {
    capture: true,
    home,
  });
  if (!result.ok) {
    return [];
  }
  const states: ServiceState[] = [];
  for (const line of result.output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) {
      continue;
    }
    try {
      const row = JSON.parse(trimmed) as { Service?: string; State?: string };
      if (row.Service) {
        states.push({ name: row.Service, state: row.State ?? "unknown" });
      }
    } catch {
      // A non-JSON line is progress noise, not a service.
    }
  }
  return states;
}
