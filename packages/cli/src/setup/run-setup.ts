import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { confirm, isCancel } from "@clack/prompts";
import {
  applyLocalDbMigrations,
  isLocalStackRunning,
  localDatabaseIsEmpty,
  resetLocalDb,
} from "../db/local-db.js";
import { runSupabaseCliStreaming } from "../db/run-supabase-cli.js";
import { envFilePath } from "../env-setup/env-files.js";
import { runEnvInitWizard } from "../env-setup/env-wizard.js";
import {
  describeStackPortMismatch,
  readLocalStackApiPort,
} from "../env-setup/local-stack-port.js";
import { isInteractiveTerminal } from "../select-loop.js";
import {
  defaultLocalServiceCredentialStepDeps,
  runLocalServiceCredentialStep,
} from "./local-service-credential-step.js";
import { promptLocalStackIdentity } from "./local-stack-prompt.js";
import { generateDerivedArtifacts } from "./run-generate-script.js";

/** One key out of a dotenv file, unquoted; undefined when absent. */
function readEnvValue(filePath: string, key: string): string | undefined {
  const line = fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .find((entry) => entry.startsWith(`${key}=`));
  return line
    ?.slice(key.length + 1)
    .trim()
    .replace(/^["']|["']$/g, "");
}

function runSupabaseOrThrow(args: readonly string[]): void {
  // Stream live — these are the long ones (start, db reset, migration up);
  // capturing made them look stuck while migrations applied.
  const result = runSupabaseCliStreaming(args);
  if (!result.ok) {
    throw new Error(`supabase ${args.join(" ")} failed.`);
  }
}

/**
 * Confirm a step. Non-interactive shells (CI) take the default without
 * prompting, so a scripted `engenty setup` keeps working unattended.
 */
async function confirmStep(
  message: string,
  defaultYes: boolean
): Promise<boolean> {
  if (!isInteractiveTerminal()) {
    return defaultYes;
  }
  const answer = await confirm({ message, initialValue: defaultYes });
  if (isCancel(answer)) {
    return false;
  }
  return answer === true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isDockerRunning(): boolean {
  return spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
}

function savedMacRuntimeApp(repoRoot: string): string | undefined {
  const file = path.join(repoRoot, ".engenty", "container-runtime");
  let runtime = "";
  if (fs.existsSync(file)) {
    runtime = fs.readFileSync(file, "utf8").trim();
  }
  if (runtime === "orbstack") {
    return "OrbStack";
  }
  if (runtime === "dory") {
    return "Dory";
  }
  if (runtime === "docker-desktop" || runtime === "docker" || runtime === "") {
    return "Docker";
  }
  return;
}

/**
 * Ensure the Docker daemon is up (Supabase needs it). If `docker info` already
 * works — Linux Engine, CI, a Mac app the user started — that is enough.
 * On macOS only, auto-start the saved app (Docker Desktop / OrbStack / Dory)
 * and wait. Returns false if it can't be made ready.
 */
async function ensureDockerReady(repoRoot: string): Promise<boolean> {
  if (isDockerRunning()) {
    return true;
  }
  if (process.platform !== "darwin") {
    return false;
  }
  const app = savedMacRuntimeApp(repoRoot);
  if (!(app && fs.existsSync(`/Applications/${app}.app`))) {
    return false;
  }
  console.log(`Docker isn't running — starting ${app}…`);
  spawnSync("open", ["-a", app], { stdio: "ignore" });
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    if (isDockerRunning()) {
      return true;
    }
  }
  return isDockerRunning();
}

/** Poll until the local stack answers — `db reset` restarts containers. */
async function waitForSupabaseReady(
  attempts = 15,
  delayMs = 2000
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (isLocalStackRunning()) {
      return true;
    }
    if (i === 0) {
      console.log("Waiting for Supabase to be ready…");
    }
    await sleep(delayMs);
  }
  return isLocalStackRunning();
}

/**
 * The first run of a checkout, and safe to run again: every step checks what
 * is already there. Generated files → container runtime → local Supabase →
 * migrations → `.env.local`. No preflight of the dev stack happens here; that
 * is `engenty dev`'s job.
 */
export async function runSetup(params: {
  refresh?: boolean;
  repoRoot: string;
  allowDbReset?: boolean;
  /** Finish with exit 0 even when .env.local has values that need attention. */
  allowGaps?: boolean;
}): Promise<void> {
  const stackEnv = await promptLocalStackIdentity({
    refresh: params.refresh === true,
    repoRoot: params.repoRoot,
  });
  generateDerivedArtifacts({
    cwd: params.repoRoot,
    env: stackEnv,
    refresh: params.refresh === true,
  });

  if (isLocalStackRunning()) {
    console.log("Local Supabase is already running.");
  } else {
    if (!(await ensureDockerReady(params.repoRoot))) {
      const dockerHint =
        process.platform === "darwin"
          ? `
Docker isn't running, so local Supabase can't start.

  1. Start Docker Desktop, OrbStack, or Dory
  2. Re-run: pnpm engenty setup
`
          : `
Docker isn't running, so local Supabase can't start.

  1. Start your container engine so \`docker info\` succeeds
     (Docker Engine, or any Docker-compatible daemon).
  2. Re-run: pnpm engenty setup
`;
      console.log(`${dockerHint}
Plugin selection and generated artifacts above are already done — this just
finishes the database and .env.local steps.`);
      return;
    }
    console.log("Starting local Supabase (Docker)…");
    runSupabaseOrThrow(["start"]);
  }

  // .env.local BEFORE migrations: the Mastra schema step reads
  // SUPABASE_DB_URL from it, and skipped silently when the file did not exist
  // yet. The harvest needs the stack up, which it is by now.
  const envPath = envFilePath(params.repoRoot, "root");
  if (!fs.existsSync(envPath)) {
    // env init harvests `supabase status` for keys — make sure the stack the
    // db step just (re)started is actually answering first.
    await waitForSupabaseReady();
  }
  let envExitCode = 0;
  if (fs.existsSync(envPath)) {
    console.log(`Using existing ${envPath}.`);
    const mismatch = describeStackPortMismatch({
      configPort: readLocalStackApiPort(params.repoRoot),
      envUrl: readEnvValue(envPath, "SUPABASE_URL"),
    });
    if (mismatch) {
      throw new Error(mismatch);
    }
  } else if (
    // The env wizard is interactive — only run it on a real TTY; otherwise
    // print the hint so a non-interactive `engenty setup` never hangs.
    isInteractiveTerminal() &&
    (await confirmStep("Initialize .env.local now (env init wizard)?", true))
  ) {
    envExitCode = await runEnvInitWizard(["root"]);
  } else {
    console.log(`
Missing ${envPath}
Run: pnpm engenty env init
`);
    envExitCode = 1;
  }

  if (localDatabaseIsEmpty()) {
    // `db reset` wipes data — it must never run unattended. Non-interactive
    // shells (Claude Code's Bash tool, CI, etc.) have no TTY, so the confirm
    // prompt below can't render; silently defaulting to "yes" here is exactly
    // how the 2026-08-02 shared-DB wipe happened. Refuse unless the caller
    // explicitly opted in via --yes-reset-db.
    if (isInteractiveTerminal()) {
      const reset = await confirmStep(
        "Fresh local database — reset it (apply all migrations; wipes local data)?",
        true
      );
      if (reset) {
        resetLocalDb();
      } else {
        console.log(
          "Skipped — run `pnpm engenty db reset` (or `pnpm engenty db migrate`) later."
        );
      }
    } else {
      if (!params.allowDbReset) {
        throw new Error(
          "Local database has no applied migrations, but this isn't an interactive " +
            "terminal, so the destructive `supabase db reset` won't run unattended. " +
            "Re-run `pnpm engenty setup` in an interactive terminal to confirm " +
            "the reset, or pass --yes-reset-db if wiping local data is known to be safe."
        );
      }
      console.log("Resetting the local database (--yes-reset-db)…");
      resetLocalDb();
    }
  } else {
    console.log("Applying pending migrations…");
    applyLocalDbMigrations();
  }

  // The AI service's credential lives in the database that was just
  // migrated or reset: keep .env.local's ENGENTY_AI_SERVICE_SECRET backed by
  // a live row, or the scheduler boots disabled and routines never fire.
  if (fs.existsSync(envPath)) {
    runLocalServiceCredentialStep({
      deps: defaultLocalServiceCredentialStepDeps(params.repoRoot),
      workspaceRoot: params.repoRoot,
    });
  }

  if (envExitCode !== 0 && !params.allowGaps) {
    throw new Error(
      "Setup finished, but .env.local still has values that need attention (listed above). Set them with pnpm engenty env edit <KEY> and rerun, or pass --allow-gaps to accept this for now. (Keys the browser asks for, like the AI provider key, do not count.)"
    );
  }

  console.log(`
Setup complete. Start the stack with:

  pnpm dev
`);
}
