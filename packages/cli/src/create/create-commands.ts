import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Command } from "commander";
import { runCliAction } from "../cli-errors.js";
import { runHostChecks } from "../doctor/host-checks.js";
import { cyan, dim, green, red, yellow } from "../env-setup/env-style.js";
import { cliVersion, currentWorkspaceRoot } from "../workspace.js";

export const DEFAULT_REPO = "https://github.com/engenty/engenty.git";

export interface CreateOptions {
  dir: string;
  ref?: string;
  repo: string;
  setup: boolean;
}

/** The tag a package at `version` clones by default. */
export function defaultRef(version: string): string {
  return `v${version}`;
}

/** codeload URL for a GitHub repository at a tag or branch — the no-git path. */
export function tarballUrl(repo: string, ref: string): string | null {
  const match = repo.match(
    /^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+)\/([^/]+?)(?:\.git)?\/?$/
  );
  if (!match) {
    return null;
  }
  const kind = ref.startsWith("v") ? "tags" : "heads";
  return `https://codeload.github.com/${match[1]}/${match[2]}/tar.gz/refs/${kind}/${ref}`;
}

function assertTargetIsFree(target: string): void {
  if (!fs.existsSync(target)) {
    return;
  }
  if (fs.readdirSync(target).length > 0) {
    throw new Error(`${target} exists and is not empty.`);
  }
}

function run(command: string, args: string[], cwd: string): number {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) {
    throw new Error(`${command} is not on PATH.`);
  }
  return result.status ?? 1;
}

function cloneWithGit(repo: string, ref: string, target: string): void {
  const status = run(
    "git",
    ["clone", "--depth", "1", "--branch", ref, repo, target],
    process.cwd()
  );
  if (status !== 0) {
    throw new Error(
      `git clone of ${repo} at ${ref} failed. A release tag that is not on the repository yet? Pass --ref main to take the branch head.`
    );
  }
}

async function downloadTarball(
  repo: string,
  ref: string,
  target: string
): Promise<void> {
  const url = tarballUrl(repo, ref);
  if (!url) {
    throw new Error(
      `git is not installed and ${repo} is not a GitHub URL, so there is no tarball to download.`
    );
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${url} → HTTP ${response.status}`);
  }
  const archive = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "engenty-create-")),
    "source.tar.gz"
  );
  fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  fs.mkdirSync(target, { recursive: true });
  const status = run(
    "tar",
    ["-xzf", archive, "-C", target, "--strip-components=1"],
    process.cwd()
  );
  fs.rmSync(path.dirname(archive), { force: true, recursive: true });
  if (status !== 0) {
    throw new Error("Extracting the source archive failed.");
  }
}

function printChecks(checks: ReturnType<typeof runHostChecks>): void {
  for (const check of checks) {
    const mark =
      check.status === "ok"
        ? green("✓")
        : check.status === "warn"
          ? yellow("!")
          : red("✗");
    console.log(
      `${mark} ${check.label}${check.detail ? ` — ${check.detail}` : ""}`
    );
    if (check.fix) {
      console.log(dim(`    fix: ${check.fix}`));
    }
  }
}

/**
 * The door before there is a checkout: prerequisites → clone at this
 * package's release → `pnpm install` → the checkout's own `engenty setup`.
 * Everything after the clone is the checkout's code, at the checkout's
 * version, so `create` never drifts from what it installs.
 */
export async function runCreate(options: CreateOptions): Promise<void> {
  const inside = currentWorkspaceRoot();
  if (inside) {
    throw new Error(
      `Already inside a checkout (${inside}) — run \`pnpm engenty setup\` there instead.`
    );
  }
  const target = path.resolve(options.dir);
  assertTargetIsFree(target);

  const checks = runHostChecks();
  printChecks(checks);
  const hasGit = checks.find((check) => check.label === "git")?.status === "ok";
  // git is optional (a tarball works); everything else `setup` needs.
  const blocking = checks.filter(
    (check) => check.status === "fail" && check.label !== "git"
  );
  if (blocking.length > 0) {
    throw new Error(
      `${blocking.length} prerequisite(s) missing — fix them and run \`npx engenty create\` again.`
    );
  }

  const ref = options.ref ?? defaultRef(cliVersion());
  console.log(
    `\nFetching ${cyan(options.repo)} at ${cyan(ref)} into ${cyan(target)} …`
  );
  if (hasGit) {
    cloneWithGit(options.repo, ref, target);
  } else {
    await downloadTarball(options.repo, ref, target);
  }

  console.log(`\n${cyan("pnpm install")}`);
  if (run("pnpm", ["install"], target) !== 0) {
    throw new Error(`pnpm install failed in ${target}.`);
  }

  const rel = path.relative(process.cwd(), target) || ".";
  if (options.setup) {
    console.log(`\n${cyan("pnpm engenty setup")}`);
    const status = run("pnpm", ["engenty", "setup"], target);
    if (status !== 0) {
      console.log(
        yellow(
          `\nengenty setup finished with exit ${status} — see above. Re-run it any time: cd ${rel} && pnpm engenty setup`
        )
      );
    }
  }

  console.log(`\n${green("Ready.")} Next:\n\n    cd ${rel} && pnpm dev\n`);
  console.log(
    dim(
      options.setup
        ? "Open http://localhost:5173 — the first visit is /initial_setup."
        : "Then: pnpm engenty setup (Docker + Supabase + migrations + .env.local), and pnpm dev."
    )
  );
}

export function registerCreateCommand(program: Command): void {
  program
    .command("create")
    .description(
      "Get a checkout: check prerequisites, clone the repository at this release, pnpm install, then run its `engenty setup`"
    )
    .argument("[dir]", "Directory to create", "engenty")
    .option("--repo <url>", "Repository to clone", DEFAULT_REPO)
    .option(
      "--ref <ref>",
      "Tag or branch to check out (default: the release this package is, v<version>)"
    )
    .option("--no-setup", "Stop after pnpm install")
    .action(
      runCliAction(
        (
          dir: string,
          options: { ref?: string; repo: string; setup: boolean }
        ) =>
          runCreate({
            dir,
            ref: options.ref,
            repo: options.repo,
            setup: options.setup,
          })
      )
    );
}
