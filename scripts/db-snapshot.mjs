#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function resolveRepoRoot() {
  let dir = process.cwd();
  for (let i = 0; i < 20; i++) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return process.cwd();
}

const root = resolveRepoRoot();
const projectName = path.basename(root);
const containerName = `supabase_db_${projectName}`;
const snapshotDir = path.join(root, "supabase", "snapshots");
function getLocalTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}-${hours}-${minutes}`;
}

const action = process.argv[2] || "snapshot";

function isSupabaseRunning() {
  try {
    const output = execSync("docker ps --format '{{.Names}}'", {
      encoding: "utf-8",
    });
    return output
      .split("\n")
      .map((name) => name.trim())
      .includes(containerName);
  } catch {
    return false;
  }
}

function runSnapshot() {
  console.log("Checking if Supabase is running...");
  if (!isSupabaseRunning()) {
    console.error(
      `Error: Supabase container "${containerName}" is not running.`
    );
    console.error(
      "Please start it first using 'pnpm supabase:start' or 'supabase start'."
    );
    process.exit(1);
  }

  console.log("Retrieving database schemas...");
  let schemas = "";
  try {
    const query = `SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast', 'auth', 'storage', 'vault', 'extensions', 'graphql', 'graphql_public', 'realtime', '_realtime', 'cron', 'net', 'pgbouncer', 'pgmq', 'supabase_functions', 'supabase_migrations') ORDER BY schema_name;`;
    const output = execSync(
      `docker exec -i ${containerName} psql -U postgres -d postgres -t -A -c "${query}"`,
      { encoding: "utf-8" }
    );
    schemas = output
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .join(",");
  } catch (error) {
    console.error("Error retrieving schemas from the database:", error.message);
    process.exit(1);
  }

  if (!schemas) {
    console.error("Error: No developer schemas found to snapshot.");
    process.exit(1);
  }

  console.log(`Found schemas to snapshot: ${schemas}`);

  if (!fs.existsSync(snapshotDir)) {
    fs.mkdirSync(snapshotDir, { recursive: true });
  }

  const timestamp = getLocalTimestamp();
  const filename = `${timestamp}-snapshot.sql`;
  const snapshotFile = path.join(snapshotDir, filename);

  console.log(`Dumping database data to ${snapshotFile}...`);
  try {
    execSync(
      `supabase db dump --local --data-only --schema "${schemas}" --file "${snapshotFile}"`,
      { stdio: "inherit" }
    );
    console.log(`Database snapshot created successfully at ${snapshotFile}`);
  } catch (error) {
    console.error("Error dumping database:", error.message);
    process.exit(1);
  }
}

function getSnapshotFileToRestore() {
  const arg = process.argv[3];
  if (arg) {
    // If it's an absolute path
    if (path.isAbsolute(arg) && fs.existsSync(arg)) {
      return arg;
    }
    // If it exists relative to current working directory
    const cwdPath = path.resolve(arg);
    if (fs.existsSync(cwdPath)) {
      return cwdPath;
    }
    // If it exists in snapshotDir
    const snapshotPath = path.join(snapshotDir, arg);
    if (fs.existsSync(snapshotPath)) {
      return snapshotPath;
    }
    console.error(
      `Error: Snapshot file not found at "${arg}" or inside "${snapshotDir}".`
    );
    process.exit(1);
  }

  // No file specified, find the latest one
  if (!fs.existsSync(snapshotDir)) {
    console.error(`Error: Snapshot directory "${snapshotDir}" does not exist.`);
    console.error("Please create a snapshot first using 'pnpm db:snapshot'.");
    process.exit(1);
  }

  const files = fs.readdirSync(snapshotDir);
  const snapshotFiles = files
    .filter((file) => file.endsWith("-snapshot.sql") || file === "snapshot.sql")
    .map((file) => ({
      name: file,
      path: path.join(snapshotDir, file),
    }));

  if (snapshotFiles.length === 0) {
    console.error(`Error: No snapshot files found in "${snapshotDir}".`);
    console.error("Please create a snapshot first using 'pnpm db:snapshot'.");
    process.exit(1);
  }

  // Sort chronologically. 'snapshot.sql' is treated as the oldest.
  snapshotFiles.sort((a, b) => {
    if (a.name === "snapshot.sql") {
      return -1;
    }
    if (b.name === "snapshot.sql") {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });

  const latest = snapshotFiles.at(-1);
  console.log(`Automatically resolved latest snapshot: ${latest.name}`);
  return latest.path;
}

function runRestore() {
  const snapshotFile = getSnapshotFileToRestore();

  console.log("Checking if Supabase is running...");
  if (!isSupabaseRunning()) {
    console.error(
      `Error: Supabase container "${containerName}" is not running.`
    );
    console.error(
      "Please start it first using 'pnpm supabase:start' or 'supabase start'."
    );
    process.exit(1);
  }

  console.log("Resetting database before restoring snapshot...");
  try {
    execSync("pnpm db:reset", { stdio: "inherit", cwd: root });
  } catch (error) {
    console.error("Error resetting database:", error.message);
    process.exit(1);
  }

  console.log(`Restoring database data from ${snapshotFile}...`);
  try {
    execSync(
      `docker exec -i ${containerName} psql -U postgres -d postgres < "${snapshotFile}"`,
      {
        stdio: "inherit",
      }
    );
    console.log("Database restored successfully!");
  } catch (error) {
    console.error("Error restoring database snapshot:", error.message);
    process.exit(1);
  }
}

if (action === "snapshot") {
  runSnapshot();
} else if (action === "restore") {
  runRestore();
} else {
  console.error(`Unknown action: ${action}`);
  console.error(
    "Usage: node scripts/db-snapshot.mjs [snapshot|restore] [snapshot-filename]"
  );
  process.exit(1);
}
