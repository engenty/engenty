/**
 * Per-machine container-runtime preference for local Supabase.
 *
 * Lives in gitignored `.engenty/container-runtime` — never in package.json.
 * Invoked from `scripts/predev-check.sh` as:
 *   node scripts/lib/container-runtime.mjs read|write <runtime>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

export const CONTAINER_RUNTIMES = ["docker-desktop", "orbstack", "dory"];

const VALID = new Set(CONTAINER_RUNTIMES);

export function normalizeRuntime(value) {
  if (value === "docker") {
    return "docker-desktop";
  }
  return value;
}

export function runtimeFilePath(root) {
  return path.join(root, ".engenty", "container-runtime");
}

/**
 * Saved choice, or leftover `engenty.containerRuntime` in package.json from
 * older checkouts. Never writes the package.json field back.
 */
export function readRuntimeChoice(root) {
  const file = runtimeFilePath(root);
  if (fs.existsSync(file)) {
    const raw = normalizeRuntime(fs.readFileSync(file, "utf8").trim());
    if (VALID.has(raw)) {
      return raw;
    }
  }
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8")
    );
    const raw = normalizeRuntime(pkg.engenty?.containerRuntime ?? "");
    if (VALID.has(raw)) {
      return raw;
    }
  } catch {
    // ignore unreadable package.json
  }
  return "";
}

export function writeRuntimeChoice(root, runtime) {
  const normalized = normalizeRuntime(runtime);
  if (!VALID.has(normalized)) {
    throw new Error(`Unknown container runtime: ${runtime}`);
  }
  fs.mkdirSync(path.dirname(runtimeFilePath(root)), { recursive: true });
  fs.writeFileSync(runtimeFilePath(root), `${normalized}\n`);
}

const invokedDirectly =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const cmd = process.argv[2];
  if (cmd === "read") {
    process.stdout.write(readRuntimeChoice(ROOT));
  } else if (cmd === "write") {
    writeRuntimeChoice(ROOT, process.argv[3] ?? "");
  } else {
    process.stderr.write("Usage: container-runtime.mjs read|write <runtime>\n");
    process.exit(1);
  }
}
