/**
 * The identity of the local Supabase stack: its `project_id` and the port band
 * it listens on.
 *
 * The Supabase CLI keys its containers by `project_id`, not by directory — two
 * checkouts that share an id share one stack, and two that share ports cannot
 * both run. `engenty setup` asks for the id on a fresh workspace and
 * shifts the whole 543xx band when the answer is not the default, so a second
 * install on the same machine gets its own database instead of migrating into
 * the first one's.
 */

import fs from "node:fs";
import path from "node:path";

export const DEFAULT_SUPABASE_PROJECT_ID = "engenty-local";

/** The CLI's own constraint: lowercase, digits, `-` and `_`, starting alphanumeric. */
const PROJECT_ID_RE = /^[a-z0-9][a-z0-9_-]*$/;

/** The ports the local stack claims. `# port = 587` (SMTP) is not one of them. */
const LOCAL_PORT_MIN = 54_300;
const LOCAL_PORT_MAX = 54_399;

const PORT_LINE_RE = /^(\s*#?\s*[a-z0-9_]*port\s*=\s*)(\d+)\s*$/gm;

export function projectIdError(projectId) {
  if (projectId.length === 0) {
    return "Enter a project id.";
  }
  if (!PROJECT_ID_RE.test(projectId)) {
    return "Use lowercase letters, digits, - and _ (starting with a letter or digit).";
  }
  return null;
}

function isLocalStackPort(port) {
  return port >= LOCAL_PORT_MIN && port <= LOCAL_PORT_MAX;
}

/**
 * Every port the stack binds, commented-out ones excluded — those are the
 * optional services the CLI does not start, so nothing is listening on them.
 *
 * Reads the template's own band. `scripts/generate.mjs` always materializes from
 * the pristine `config.toml.example`, `--refresh` included, so nothing ever
 * shifts an already-shifted file and this never has to answer for one.
 */
export function configuredPorts(content) {
  const ports = [];
  for (const line of content.split("\n")) {
    const match = line.match(/^\s*[a-z0-9_]*port\s*=\s*(\d+)\s*$/);
    const port = match ? Number(match[1]) : Number.NaN;
    if (isLocalStackPort(port)) {
      ports.push(port);
    }
  }
  return ports;
}

export function parseProjectId(content) {
  const match = content.match(/^project_id\s*=\s*"([^"]+)"/m);
  return match ? match[1] : null;
}

/**
 * How far an existing config.toml sits from the template — the `[api]` port is
 * the first uncommented `port =` line in both, so their difference is the band.
 * Lets `--refresh` rewrite a custom stack's file without moving it.
 */
export function detectPortOffset(content, templateContent) {
  const firstPort = (text) => {
    const match = text.match(/^\s*port\s*=\s*(\d+)\s*$/m);
    return match ? Number(match[1]) : null;
  };
  const current = firstPort(content);
  const base = firstPort(templateContent);
  if (current === null || base === null) {
    return 0;
  }
  return current - base;
}

export function applyProjectId(content, projectId) {
  return content.replace(
    /^project_id\s*=\s*"[^"]*"/m,
    `project_id = "${projectId}"`
  );
}

/**
 * Shift the stack's ports as one block, commented lines included — an operator
 * who later uncomments `smtp_port` should land in this stack's band, not the
 * default one's.
 */
export function shiftLocalPorts(content, offset) {
  if (offset === 0) {
    return content;
  }
  return content.replace(PORT_LINE_RE, (line, prefix, digits) => {
    const port = Number(digits);
    return isLocalStackPort(port) ? `${prefix}${port + offset}` : line;
  });
}

export function applyLocalStackIdentity(
  content,
  { projectId, portOffset = 0 }
) {
  return shiftLocalPorts(applyProjectId(content, projectId), portOffset);
}

/**
 * The stack's identity comes from `engenty setup`, which asks for it on
 * a fresh workspace; a bare `engenty generate` (CI) sets neither
 * variable and materializes the template's own default stack, as before.
 */
export function localStackIdentityFromEnv(env) {
  const projectId = (env.ENGENTY_SUPABASE_PROJECT_ID ?? "").trim();
  const portOffset = Number.parseInt(
    env.ENGENTY_SUPABASE_PORT_OFFSET ?? "",
    10
  );
  return {
    portOffset: Number.isFinite(portOffset) ? portOffset : 0,
    projectId: projectId === "" ? DEFAULT_SUPABASE_PROJECT_ID : projectId,
  };
}

/**
 * Write supabase/config.toml from the committed template. Returns the stack's
 * project id when it wrote one, or false when an existing config was kept —
 * always from the pristine template, so ports are never shifted twice.
 */
export function materializeSupabaseConfig(root, refresh, env = process.env) {
  const examplePath = path.join(root, "supabase", "config.toml.example");
  const configPath = path.join(root, "supabase", "config.toml");
  if (!fs.existsSync(examplePath)) {
    throw new Error(
      `Missing ${examplePath}. The committed Supabase template must exist in the repo.`
    );
  }
  if (!refresh && fs.existsSync(configPath)) {
    return false;
  }
  const identity = localStackIdentityFromEnv(env);
  fs.writeFileSync(
    configPath,
    applyLocalStackIdentity(fs.readFileSync(examplePath, "utf-8"), identity),
    "utf-8"
  );
  return identity.projectId;
}
