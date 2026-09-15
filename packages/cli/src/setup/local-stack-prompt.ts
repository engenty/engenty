import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isCancel, note, text } from "@clack/prompts";
import { findFreePortBand } from "../local/port-band.js";
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
