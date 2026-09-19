// `engenty setup` keeps the AI service's credential alive on a local stack.
//
// The row lives in `core.service_credential`; a `db reset` drops it and
// every checkout's ENGENTY_AI_SERVICE_SECRET then names a credential that
// no longer exists — apps/ai boots with `invalid_client` and the scheduler
// stays off, silently, until someone waits for a routine that never fires.
// The mint itself lives in apps/core (`service-token ensure-local`, the
// same hash and row shape the API writes); this step runs it with the env
// files as they are NOW and writes the new secret back into .env.local.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { mergeWorkspaceDotEnvLayers } from "@engenty/environment/env";
import { runEnvSet } from "../env-setup/env-set.js";

export const AI_SERVICE_SECRET_KEY = "ENGENTY_AI_SERVICE_SECRET";

/** What `service-token ensure-local --json` prints. */
export type EnsureLocalCredentialOutput =
  | { credentialId: string; status: "kept" }
  | {
      credentialId: string;
      reason: string;
      secret: string;
      status: "minted";
    };

export interface LocalServiceCredentialStepDeps {
  /** Runs the core command; returns its stdout+stderr and whether it exited 0. */
  run: (env: Record<string, string | undefined>) => {
    ok: boolean;
    output: string;
  };
  /** Persists the new secret into the root .env.local. */
  writeSecret: (value: string) => void;
}

/** The keys the child must read from the files, not this process's env. */
const FRESH_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  AI_SERVICE_SECRET_KEY,
] as const;

/**
 * The child's env: this process's, with the three keys taken from the env
 * files as written by the steps before — `engenty setup` loaded .env.local
 * when it started, before env init wrote it.
 */
export function ensureLocalCredentialChildEnv(
  workspaceRoot: string,
  baseEnv: Record<string, string | undefined> = process.env
): Record<string, string | undefined> {
  const fromFiles = mergeWorkspaceDotEnvLayers(
    workspaceRoot,
    path.join(workspaceRoot, "apps", "core")
  );
  const env = { ...baseEnv };
  for (const key of FRESH_KEYS) {
    const value = fromFiles[key]?.trim();
    if (value) {
      env[key] = value;
    } else {
      delete env[key];
    }
  }
  return env;
}

/** The last JSON object line of the command's output; null when there is none. */
export function parseEnsureLocalOutput(
  output: string
): EnsureLocalCredentialOutput | null {
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{") && line.endsWith("}"));
  for (const line of lines.toReversed()) {
    try {
      const parsed = JSON.parse(line) as Partial<EnsureLocalCredentialOutput>;
      if (parsed.status === "kept" && parsed.credentialId) {
        return { credentialId: parsed.credentialId, status: "kept" };
      }
      if (parsed.status === "minted" && parsed.credentialId && parsed.secret) {
        return {
          credentialId: parsed.credentialId,
          reason: parsed.reason ?? "missing",
          secret: parsed.secret,
          status: "minted",
        };
      }
    } catch {
      // not our line
    }
  }
  return null;
}

export function defaultLocalServiceCredentialStepDeps(
  workspaceRoot: string
): LocalServiceCredentialStepDeps {
  return {
    run: (env) => {
      const result = spawnSync(
        "pnpm",
        [
          "--filter",
          "@engenty/core",
          "exec",
          "tsx",
          "src/index.ts",
          "service-token",
          "ensure-local",
          "--json",
        ],
        { cwd: workspaceRoot, encoding: "utf8", env }
      );
      return {
        ok: result.status === 0,
        output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
      };
    },
    writeSecret: (value) => {
      runEnvSet({
        force: false,
        key: AI_SERVICE_SECRET_KEY,
        manifestComplete: true,
        scope: "root",
        value,
        workspaceRoot,
      });
    },
  };
}

/**
 * Never fatal: setup's job is the database and .env.local, and a stack whose
 * scheduler is off still runs. The message says what to do by hand.
 */
export function runLocalServiceCredentialStep(input: {
  deps: LocalServiceCredentialStepDeps;
  log?: (line: string) => void;
  workspaceRoot: string;
}): "kept" | "minted" | "skipped" {
  const log = input.log ?? console.log;
  const env = ensureLocalCredentialChildEnv(input.workspaceRoot);
  const result = input.deps.run(env);
  const parsed = parseEnsureLocalOutput(result.output);
  if (!(result.ok && parsed)) {
    log(
      `Could not check the AI service credential (the scheduler needs it to fire routines). Run \`pnpm engenty service-token ensure-local\` once core's env is complete.${
        result.output ? `\n${result.output}` : ""
      }`
    );
    return "skipped";
  }
  if (parsed.status === "kept") {
    return "kept";
  }
  input.deps.writeSecret(parsed.secret);
  log(
    `Minted a local AI service credential (${parsed.credentialId}) — ${
      parsed.reason === "missing"
        ? "none was configured"
        : `the configured one was ${parsed.reason.replace("_", " ")}`
    }. ${AI_SERVICE_SECRET_KEY} is written to .env.local; restart apps/ai to pick it up.`
  );
  return "minted";
}
