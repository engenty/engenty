import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { confirm, isCancel } from "@clack/prompts";
import {
  runSupabaseCli,
  runSupabaseCliStreaming,
} from "../db/run-supabase-cli.js";
import { runSupabaseSyncScript } from "../db/run-supabase-sync.js";
import { envFilePath } from "../env-setup/env-files.js";
import { runEnvInitWizard } from "../env-setup/env-wizard.js";
import { isInteractiveTerminal } from "../select-loop.js";
import { runSetupScript } from "./run-setup-script.js";

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
 * prompting, so scripted `setup --local` keeps working unattended.
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

export function isSupabaseRunning(): boolean {
  const result = runSupabaseCli(["status"]);
  return result.ok && result.output.includes("API URL");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isDockerRunning(): boolean {
  return spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
}

/**
 * Ensure the Docker daemon is up (Supabase needs it). On macOS with Docker
 * Desktop installed, auto-start it and wait. Returns false if it can't be made
 * ready — the caller prints guidance and stops cleanly instead of crashing.
 */
async function ensureDockerReady(): Promise<boolean> {
  if (isDockerRunning()) {
    return true;
  }
  if (
    process.platform === "darwin" &&
    fs.existsSync("/Applications/Docker.app")
  ) {
    console.log("Docker isn't running — starting Docker Desktop…");
    spawnSync("open", ["-a", "Docker"], { stdio: "ignore" });
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      if (isDockerRunning()) {
        return true;
      }
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
    if (isSupabaseRunning()) {
      return true;
    }
    if (i === 0) {
      console.log("Waiting for Supabase to be ready…");
    }
    await sleep(delayMs);
  }
  return isSupabaseRunning();
}

export function localDatabaseNeedsInit(): boolean {
  const result = runSupabaseCli(["migration", "list", "--local"]);
  if (!result.ok) {
    return true;
  }
  return !result.output.split("\n").some((line) => line.includes("Applied"));
}

export async function runLocalSetup(params: {
  refresh?: boolean;
  repoRoot: string;
  allowDbReset?: boolean;
}): Promise<void> {
  const setup = runSetupScript({
    cwd: params.repoRoot,
    refresh: params.refresh === true,
  });
  if (setup.output.length > 0) {
    console.log(setup.output);
  }
  if (setup.ran && !setup.ok) {
    throw new Error("setup failed.");
  }

  if (isSupabaseRunning()) {
    console.log("Local Supabase is already running.");
  } else {
    if (!(await ensureDockerReady())) {
      console.log(
        `
Docker isn't running, so local Supabase can't start.

  1. Start Docker Desktop (https://docs.docker.com/desktop)
  2. Re-run: pnpm engenty setup --local

Plugin selection and generated artifacts above are already done — this just
finishes the database and .env.local steps.`
      );
      return;
    }
    console.log("Starting local Supabase (Docker)…");
    runSupabaseOrThrow(["start"]);
  }

  if (localDatabaseNeedsInit()) {
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
        console.log("Applying migrations with supabase db reset…");
        runSupabaseOrThrow(["db", "reset"]);
      } else {
        console.log(
          "Skipped — run `pnpm db:reset` (or `pnpm db:migrate`) later."
        );
      }
    } else {
      if (!params.allowDbReset) {
        throw new Error(
          "Local database has no applied migrations, but this isn't an interactive " +
            "terminal, so the destructive `supabase db reset` won't run unattended. " +
            "Re-run `pnpm engenty setup --local` in an interactive terminal to confirm " +
            "the reset, or pass --yes-reset-db if wiping local data is known to be safe."
        );
      }
      console.log(
        "Applying migrations with supabase db reset (--yes-reset-db)…"
      );
      runSupabaseOrThrow(["db", "reset"]);
    }
  } else {
    console.log("Applying pending migrations…");
    const sync = runSupabaseSyncScript();
    if (sync.output.length > 0) {
      console.log(sync.output);
    }
    if (sync.ran && !sync.ok) {
      throw new Error("db sync failed.");
    }
    runSupabaseOrThrow(["migration", "up", "--include-all"]);
  }

  const envPath = envFilePath(params.repoRoot, "root");
  if (!fs.existsSync(envPath)) {
    // env --init harvests `supabase status` for keys — make sure the stack the
    // db step just (re)started is actually answering first.
    await waitForSupabaseReady();
  }
  if (fs.existsSync(envPath)) {
    console.log(`Using existing ${envPath}.`);
  } else if (
    // The env wizard is interactive — only run it on a real TTY; otherwise
    // print the hint so non-interactive `setup --local` never hangs.
    isInteractiveTerminal() &&
    (await confirmStep("Initialize .env.local now (env --init wizard)?", true))
  ) {
    await runEnvInitWizard(["root"]);
  } else {
    console.log(`
Missing ${envPath}
Run: pnpm engenty env --init
`);
  }

  console.log(`
Local setup complete. Start the stack with:

  pnpm dev
`);
}
