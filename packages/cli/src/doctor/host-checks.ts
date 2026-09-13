import { spawnSync } from "node:child_process";

/**
 * One row of `engenty doctor`: what was checked, how it went, and the
 * command that fixes it. `warn` is informational and never fails the run.
 */
export interface LocalCheck {
  detail?: string;
  fix?: string;
  label: string;
  status: "ok" | "fail" | "warn";
}

const NODE_MIN_MAJOR = 22;
const NODE_RECOMMENDED_MAJOR = 24;

function commandVersion(command: string, args: string[]): string | null {
  try {
    const result = spawnSync(command, args, { encoding: "utf8" });
    return result.status === 0 ? result.stdout.trim().split("\n")[0] : null;
  } catch {
    return null;
  }
}

export function checkNode(version = process.version): LocalCheck {
  const major = Number(version.replace(/^v/, "").split(".")[0]);
  if (major < NODE_MIN_MAJOR) {
    return {
      label: "Node",
      status: "fail",
      detail: `${version} — engenty needs Node ${NODE_MIN_MAJOR}+ (${NODE_RECOMMENDED_MAJOR} recommended)`,
      fix: `nvm install ${NODE_RECOMMENDED_MAJOR} && nvm use ${NODE_RECOMMENDED_MAJOR}`,
    };
  }
  return major < NODE_RECOMMENDED_MAJOR
    ? {
        label: "Node",
        status: "warn",
        detail: `${version} — CI and the deploy images run Node ${NODE_RECOMMENDED_MAJOR}`,
      }
    : { label: "Node", status: "ok", detail: version };
}

export function checkPnpm(): LocalCheck {
  const version = commandVersion("pnpm", ["--version"]);
  return version
    ? { label: "pnpm", status: "ok", detail: version }
    : {
        label: "pnpm",
        status: "fail",
        detail: "not on PATH",
        fix: "corepack enable (pnpm is pinned by the checkout's package.json)",
      };
}

export function checkGit(): LocalCheck {
  const version = commandVersion("git", ["--version"]);
  return version
    ? {
        label: "git",
        status: "ok",
        detail: version.replace(/^git version /, ""),
      }
    : {
        label: "git",
        status: "fail",
        detail: "not on PATH",
        fix: "install git — `engenty create` clones the repository with it",
      };
}

export function checkDocker(): LocalCheck {
  const ok = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
  return ok
    ? {
        label: "Container runtime",
        status: "ok",
        detail: "docker info answers",
      }
    : {
        label: "Container runtime",
        status: "fail",
        detail: "docker info fails",
        fix: "start Docker Desktop / OrbStack / Dory (macOS) or the Docker daemon (Linux); `engenty dev` can auto-start a saved macOS app",
      };
}

/**
 * The machine, before there is a checkout: what `engenty create` needs to
 * clone, install and run the first setup.
 */
export function runHostChecks(): LocalCheck[] {
  return [checkNode(), checkPnpm(), checkGit(), checkDocker()];
}
