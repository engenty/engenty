import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isCancel, note, text } from "@clack/prompts";
import { isInteractiveTerminal } from "../select-loop.js";

interface LocalStackLib {
  configuredPorts: (content: string) => number[];
  DEFAULT_SUPABASE_PROJECT_ID: string;
  detectPortOffset: (content: string, templateContent: string) => number;
  parseProjectId: (content: string) => string | null;
  projectIdError: (projectId: string) => string | null;
}

/**
 * Same reason as the doctor's probes: the rules live in `scripts/` because
 * `scripts/setup.mjs` is what actually writes config.toml, and a second copy
 * here could disagree with it.
 */
async function importLocalStackLib(repoRoot: string): Promise<LocalStackLib> {
  const href = pathToFileURL(
    path.join(repoRoot, "scripts", "lib", "supabase-local-stack.mjs")
  ).href;
  return (await import(href)) as LocalStackLib;
}

const PORT_PROBE_TIMEOUT_MS = 500;

/**
 * Probe by connecting, not by binding: on macOS a `listen` on 127.0.0.1
 * succeeds even while a container holds the same port on 0.0.0.0 (SO_REUSEADDR
 * allows the narrower address), so a bind probe reported the running stack's
 * ports as free. A refused connection is the honest answer.
 */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const settle = (free: boolean) => {
      socket.destroy();
      resolve(free);
    };
    socket.setTimeout(PORT_PROBE_TIMEOUT_MS);
    socket.once("connect", () => settle(false));
    socket.once("timeout", () => settle(false));
    socket.once("error", () => settle(true));
    socket.connect(port, "127.0.0.1");
  });
}

async function allPortsFree(ports: readonly number[]): Promise<boolean> {
  for (const port of ports) {
    if (!(await isPortFree(port))) {
      return false;
    }
  }
  return true;
}

const PORT_BAND_STEP = 1000;
const MAX_PORT_BANDS = 10;

/**
 * A second stack needs a free band, not just a distinct id — the CLI refuses to
 * start when a port is taken. Bands are whole thousands so every service of one
 * stack stays readable together (54321 → 55321 → 56321), which is the offset
 * the worktree stacks were already shifted by hand.
 */
async function findFreePortBand(ports: readonly number[]): Promise<number> {
  for (let band = 1; band <= MAX_PORT_BANDS; band++) {
    const offset = band * PORT_BAND_STEP;
    if (await allPortsFree(ports.map((port) => port + offset))) {
      return offset;
    }
  }
  return PORT_BAND_STEP;
}

/**
 * Ask which local Supabase stack this workspace should own, before
 * `scripts/setup.mjs` materializes config.toml from the template.
 *
 * The CLI keys its containers by `project_id`, so two checkouts answering
 * `engenty-local` share one database — which is what you want for a worktree of
 * the same project, and not what you want for a second install. Returns the
 * variables `runSetupScript` hands the child, or undefined to leave the
 * template's own default alone (no TTY, or config.toml already exists).
 */
export async function promptLocalStackIdentity(params: {
  repoRoot: string;
  refresh: boolean;
}): Promise<Record<string, string> | undefined> {
  const configPath = path.join(params.repoRoot, "supabase", "config.toml");
  if (fs.existsSync(configPath) && !params.refresh) {
    return;
  }
  if (!isInteractiveTerminal()) {
    return;
  }

  const examplePath = path.join(
    params.repoRoot,
    "supabase",
    "config.toml.example"
  );
  if (!fs.existsSync(examplePath)) {
    return;
  }

  let lib: LocalStackLib;
  try {
    lib = await importLocalStackLib(params.repoRoot);
  } catch {
    return;
  }

  const template = fs.readFileSync(examplePath, "utf-8");
  // On --refresh the file already exists: default to the stack this workspace
  // already owns, so a blind Enter cannot silently re-point it at the shared
  // one, and reuse its band so the rewrite leaves the running stack in place.
  const existing = fs.existsSync(configPath)
    ? fs.readFileSync(configPath, "utf-8")
    : null;
  const current = existing ? lib.parseProjectId(existing) : null;
  const fallback = current ?? lib.DEFAULT_SUPABASE_PROJECT_ID;

  note(
    `The Supabase CLI names its containers after this id, not after the folder.
Keep the default to share one local database with your other checkouts of
this project; give a different id to a separate install so it gets its own
database and its own ports.`,
    "Local Supabase stack"
  );
  const answer = await text({
    initialValue: fallback,
    message: "Supabase project id",
    validate: (value) => lib.projectIdError((value ?? "").trim()) ?? undefined,
  });
  const projectId = isCancel(answer) ? fallback : (answer ?? "").trim();

  if (projectId === current && existing) {
    const keptOffset = lib.detectPortOffset(existing, template);
    return {
      ENGENTY_SUPABASE_PORT_OFFSET: String(keptOffset),
      ENGENTY_SUPABASE_PROJECT_ID: projectId,
    };
  }
  if (projectId === lib.DEFAULT_SUPABASE_PROJECT_ID) {
    return;
  }

  const ports = lib.configuredPorts(template);
  const portOffset = await findFreePortBand(ports);
  note(
    `Stack "${projectId}" on ports ${Math.min(...ports) + portOffset}\u2013${Math.max(...ports) + portOffset}.
.env.local is written from \`supabase status\`, so it picks these up.`,
    "Local Supabase stack"
  );
  return {
    ENGENTY_SUPABASE_PORT_OFFSET: String(portOffset),
    ENGENTY_SUPABASE_PROJECT_ID: projectId,
  };
}
