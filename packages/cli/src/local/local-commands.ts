import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import { runCliAction } from "../cli-errors.js";
import { readEnvFileValue, runMigrateAgainst } from "../deploy/migrate.js";
import { checkDocker } from "../doctor/host-checks.js";
import { bold, cyan, dim, green, red, yellow } from "../env-setup/env-style.js";
import {
  engentyHome,
  homeExists,
  readInstallVersion,
  writeInstallVersion,
} from "../home.js";
import { isInteractiveTerminal } from "../select-loop.js";
import { cliVersion } from "../workspace.js";
import {
  composeDown,
  composePull,
  composeStates,
  composeUp,
  writeComposeFiles,
} from "./compose.js";
import { DEFAULT_EDGE_PORT, homeEnvPath, writeHomeEnv } from "./local-env.js";
import {
  readStackCredentials,
  readStackIdentity,
  runManagedSupabase,
  startStack,
  stopStack,
} from "./supabase-stack.js";

function resolvePort(home: string): number {
  const configured = readEnvFileValue(homeEnvPath(home), "PUBLIC_APP_URL");
  const match = configured?.match(/:(\d+)$/);
  return match ? Number(match[1]) : DEFAULT_EDGE_PORT;
}

/**
 * `supabase db push --db-url` assumes a hosted database and negotiates TLS,
 * which a local Postgres does not offer ("The server does not support SSL
 * connections"). The deploy path must keep TLS, so this is local-only.
 */
function withoutTls(dbUrl: string): string {
  return dbUrl.includes("sslmode=")
    ? dbUrl
    : `${dbUrl}${dbUrl.includes("?") ? "&" : "?"}sslmode=disable`;
}

/**
 * The containers reach Supabase through the host: it runs in the Supabase
 * CLI's own compose project, not ours. The browser keeps localhost.
 */
function internalHost(url: string): string {
  return url.replace(
    /(?<=^[a-z+]+:\/\/)(?:[^@/]*@)?(127\.0\.0\.1|localhost)\b/,
    (match) =>
      match.replace(/(127\.0\.0\.1|localhost)$/, "host.docker.internal")
  );
}

function requireDockerReady(): void {
  const docker = checkDocker();
  if (docker.status === "fail") {
    throw new Error(
      `${docker.detail} — ${docker.fix ?? "start a Docker-compatible runtime and try again."}`
    );
  }
}

async function runStart(): Promise<void> {
  const home = engentyHome();
  const first = !homeExists(home);
  // Named up front because this is machine-scoped, not checkout-scoped: run it
  // inside a clone and it still manages ~/.engenty, while `pnpm dev` is what
  // runs that clone's own code.
  console.log(
    `${first ? "Creating" : "Starting"} the managed install at ${cyan(home)}`
  );
  requireDockerReady();

  await startStack(home);
  const credentials = readStackCredentials(home);
  if (!credentials) {
    throw new Error(
      "Supabase is running but `supabase status` did not report its keys. Run `engenty stop` and `engenty start` again."
    );
  }

  const port = resolvePort(home);
  const envFile = writeHomeEnv(
    {
      credentials,
      internalDbUrl: withoutTls(internalHost(credentials.SUPABASE_DB_URL)),
      internalSupabaseUrl: internalHost(credentials.SUPABASE_URL),
      port,
      sandboxDir: path.join(home, "sandboxes"),
      spacesDir: path.join(home, "spaces"),
    },
    home
  );
  writeComposeFiles(home);

  // `supabase start` seeds a database it just created from
  // <home>/supabase/migrations, so this is a no-op on a first run and the
  // upgrade path for every run after a new release.
  runMigrateAgainst(withoutTls(credentials.SUPABASE_DB_URL), "start");
  composeUp(home);
  writeInstallVersion(cliVersion(), home);

  const url = `http://localhost:${port}`;
  console.log(`\n${green("engenty is up.")} ${cyan(url)}`);
  console.log(
    dim(
      first
        ? "First visit is /initial_setup: administrator account, team, model provider, first space."
        : `Installation: ${home}`
    )
  );
  console.log(dim(`Configuration: ${envFile}`));
}

function runStatus(): void {
  const home = engentyHome();
  if (!homeExists(home)) {
    console.log(
      `No managed install at ${home}. Create one with \`npx engenty start\`.`
    );
    return;
  }
  const identity = readStackIdentity(home);
  const port = resolvePort(home);
  const installed = readInstallVersion(home);
  console.log(`${bold("Installation")}  ${home}`);
  console.log(
    `${bold("Release")}       ${installed ?? "unknown"}${
      installed && installed !== cliVersion()
        ? dim(`  (this CLI is ${cliVersion()} — \`engenty update\`)`)
        : ""
    }`
  );
  console.log(`${bold("App")}           http://localhost:${port}`);
  console.log(
    `${bold("Supabase")}      ${
      identity
        ? `project ${identity.projectId}, api ${identity.apiPort}, db ${identity.dbPort}`
        : "not configured"
    }`
  );
  console.log("");
  const states = composeStates(home);
  if (states.length === 0) {
    console.log(dim("No containers running."));
    return;
  }
  for (const service of states) {
    const mark = service.state === "running" ? green("✓") : yellow("!");
    console.log(`${mark} ${service.name} — ${service.state}`);
  }
}

async function runStop(options: { purge?: boolean }): Promise<void> {
  const home = engentyHome();
  if (!homeExists(home)) {
    console.log(`No managed install at ${home}.`);
    return;
  }
  if (options.purge) {
    if (!isInteractiveTerminal()) {
      throw new Error(
        "`engenty stop --purge` deletes every database volume of this install and cannot be undone, so it refuses to run unattended."
      );
    }
    const { confirm, isCancel } = await import("@clack/prompts");
    const answer = await confirm({
      initialValue: false,
      message: `${red("Delete all data")} of the install at ${home}? The databases and uploaded files go with it.`,
    });
    if (isCancel(answer) || !answer) {
      console.log("Left it alone.");
      return;
    }
  }
  composeDown({ home, volumes: options.purge });
  if (options.purge) {
    // `supabase stop --no-backup` drops the stack's volumes; without the flag
    // it keeps a dump and the next start restores it, which is the opposite of
    // what --purge asked for.
    runManagedSupabase(["stop", "--no-backup"], { home });
    console.log(`Stopped and purged. ${dim(`Configuration kept in ${home}`)}`);
    return;
  }
  stopStack(home);
  console.log("Stopped. Data kept — `engenty start` brings it back.");
}

async function runUpdate(): Promise<void> {
  const home = engentyHome();
  if (!homeExists(home)) {
    throw new Error(
      `No managed install at ${home}. Create one with \`npx engenty start\`.`
    );
  }
  requireDockerReady();
  const from = readInstallVersion(home);
  console.log(
    `Updating ${home}: ${from ?? "unknown"} → ${cliVersion()} …\n${dim(
      "This CLI's own version decides the target — `npx engenty@latest update` for the newest release."
    )}`
  );
  writeComposeFiles(home);
  await startStack(home);
  const credentials = readStackCredentials(home);
  if (!credentials) {
    throw new Error("Supabase did not report its keys — is it running?");
  }
  composePull(home);
  runMigrateAgainst(withoutTls(credentials.SUPABASE_DB_URL), "update");
  composeUp(home);
  writeInstallVersion(cliVersion(), home);
  console.log(green(`Updated to ${cliVersion()}.`));
}

export function registerLocalCommands(program: Command): void {
  program
    .command("start")
    .description(
      "Run engenty on this machine: start its Supabase, apply migrations and bring the containers up. Safe to repeat"
    )
    .action(runCliAction(runStart));

  program
    .command("status")
    .description("What a managed install is running, and where it lives")
    .action(runCliAction(runStatus));

  program
    .command("stop")
    .description("Stop a managed install; the data is kept")
    .option(
      "--purge",
      "Also delete the data volumes — the databases and uploaded files. Cannot be undone"
    )
    .action(runCliAction(runStop));

  program
    .command("update")
    .description(
      "Pull this release's images for a managed install, apply new migrations and restart"
    )
    .action(runCliAction(runUpdate));
}

/** Everything a managed install owns, for `doctor` and tests. */
export function managedInstallPaths(home = engentyHome()): string[] {
  return [
    path.join(home, ".env"),
    path.join(home, "supabase", "config.toml"),
  ].filter((file) => fs.existsSync(file));
}
