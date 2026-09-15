import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { requireReleaseManifest } from "../release-manifest.js";
import { cliPackageRoot } from "../workspace.js";

/** Same shape as deploy/scripts/run-migrations.sh reads: a direct Postgres URL. */
export const DB_URL_HELP =
  "SUPABASE_DB_URL is not set. It is a direct Postgres connection string — postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres on Supabase Cloud — because the service-role key cannot run DDL. Put it in ./engenty-deploy/.env (the wizard writes it there) or export it.";

export function readEnvFileValue(
  filePath: string,
  key: string
): string | undefined {
  if (!fs.existsSync(filePath)) {
    return;
  }
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (match?.[1] === key) {
      return match[2].replace(/^["']|["']$/g, "").trim() || undefined;
    }
  }
  return;
}

export function resolveDeployDbUrl(cwd = process.cwd()): string | undefined {
  return (
    process.env.SUPABASE_DB_URL ||
    readEnvFileValue(
      path.join(cwd, "engenty-deploy", ".env"),
      "SUPABASE_DB_URL"
    )
  );
}

/**
 * Outside a checkout there is no `supabase link` and no aggregate step: the
 * package carries the release's migrations, and the Supabase CLI at the
 * release's pin is fetched through npx for this one run. `--include-all`
 * for the same reason as the migrate image — module migrations are
 * timestamped when written, so a release routinely carries versions older
 * than the remote's newest.
 */
export function runStandaloneMigrate(): void {
  const dbUrl = resolveDeployDbUrl();
  if (!dbUrl) {
    throw new Error(DB_URL_HELP);
  }
  runMigrateAgainst(dbUrl, "deploy migrate");
}

/** The same push against a database URL the caller already has. */
export function runMigrateAgainst(dbUrl: string, command: string): void {
  const manifest = requireReleaseManifest(command);
  const migrationsDir = path.join(cliPackageRoot(), manifest.migrationsDir);
  const files = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"))
    : [];
  if (files.length === 0) {
    throw new Error(
      `No migrations found at ${migrationsDir} — the package is incomplete.`
    );
  }

  // The CLI wants a project layout: config.toml names the project, and the
  // migrations sit under supabase/migrations.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-migrate-"));
  try {
    fs.mkdirSync(path.join(work, "supabase"));
    fs.writeFileSync(
      path.join(work, "supabase", "config.toml"),
      'project_id = "engenty"\n'
    );
    fs.cpSync(migrationsDir, path.join(work, "supabase", "migrations"), {
      recursive: true,
    });
    console.log(
      `Applying engenty ${manifest.version} (${files.length} migration files) with supabase@${manifest.supabaseCliVersion} …`
    );
    const result = spawnSync(
      "npx",
      [
        "--yes",
        `supabase@${manifest.supabaseCliVersion}`,
        "db",
        "push",
        "--db-url",
        dbUrl,
        "--include-all",
        "--yes",
      ],
      { cwd: work, stdio: "inherit" }
    );
    if (result.status !== 0) {
      throw new Error(`engenty ${command} failed.`);
    }
    console.log("Migrations up to date.");
  } finally {
    fs.rmSync(work, { force: true, recursive: true });
  }
}
