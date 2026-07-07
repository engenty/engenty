import fs from "node:fs";
import path from "node:path";
import { resolveWorkspaceRoot } from "./env-files.js";
import type {
  ContributedEnv,
  ContributedEnvVarSpec,
  EnvFeatureInfo,
  EnvVarSpec,
} from "./env-manifest-types.js";
import { resolveValidator } from "./env-validators.js";

/**
 * Discovers env contributions from modules actually present in the workspace.
 *
 * A lightweight filesystem scan of `apps/*`, `packages/*`, and `modules/*` under
 * the repo root for `engenty.plugin.json` files carrying an optional `env` field.
 * It does NOT boot the plugin host: only members present on disk contribute, so a
 * minimal build documents only the env of installed modules.
 */

const MEMBER_PARENTS = ["apps", "packages", "modules"] as const;

interface DiscoveredContribution {
  env: ContributedEnv;
  /** Manifest path, for error messages. */
  source: string;
}

function readManifestEnv(manifestPath: string): ContributedEnv | undefined {
  let raw: string;
  try {
    raw = fs.readFileSync(manifestPath, "utf8");
  } catch {
    return;
  }
  let parsed: { env?: ContributedEnv };
  try {
    parsed = JSON.parse(raw) as { env?: ContributedEnv };
  } catch (err) {
    throw new Error(`Invalid JSON in ${manifestPath}: ${String(err)}`);
  }
  const env = parsed.env;
  if (!(env && Array.isArray(env.vars)) || env.vars.length === 0) {
    return;
  }
  return env;
}

function readManifestId(manifestPath: string): string | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      id?: unknown;
    };
    return typeof parsed.id === "string" && parsed.id.trim()
      ? parsed.id.trim()
      : undefined;
  } catch {
    return;
  }
}

/**
 * Manifest members directly under `parentDir`, plus (for the `modules` parent)
 * nested connector providers at `modules/<parent>/providers/<child>`. Nested
 * members sort by their manifest id (the slug), so the combined ordering — and
 * thus `.env.example` — is identical to the old flat layout.
 */
function listManifestMembers(
  parentDir: string,
  includeProviders: boolean
): Array<{ manifestPath: string; sortKey: string }> {
  const members: Array<{ manifestPath: string; sortKey: string }> = [];
  for (const ent of fs.readdirSync(parentDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) {
      continue;
    }
    const dir = path.join(parentDir, ent.name);
    const manifestPath = path.join(dir, "engenty.plugin.json");
    if (fs.existsSync(manifestPath)) {
      members.push({ manifestPath, sortKey: ent.name });
    }
    if (!includeProviders) {
      continue;
    }
    const providersDir = path.join(dir, "providers");
    if (
      !(fs.existsSync(providersDir) && fs.statSync(providersDir).isDirectory())
    ) {
      continue;
    }
    for (const child of fs.readdirSync(providersDir, { withFileTypes: true })) {
      if (!child.isDirectory()) {
        continue;
      }
      const childManifest = path.join(
        providersDir,
        child.name,
        "engenty.plugin.json"
      );
      if (!fs.existsSync(childManifest)) {
        continue;
      }
      members.push({
        manifestPath: childManifest,
        sortKey: readManifestId(childManifest) ?? child.name,
      });
    }
  }
  return members.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

function discoverContributions(
  workspaceRoot: string
): DiscoveredContribution[] {
  const found: DiscoveredContribution[] = [];
  for (const parent of MEMBER_PARENTS) {
    const parentDir = path.join(workspaceRoot, parent);
    if (!(fs.existsSync(parentDir) && fs.statSync(parentDir).isDirectory())) {
      continue;
    }
    for (const member of listManifestMembers(parentDir, parent === "modules")) {
      const env = readManifestEnv(member.manifestPath);
      if (env) {
        found.push({ env, source: member.manifestPath });
      }
    }
  }
  return found;
}

function resolveContributedVar(
  spec: ContributedEnvVarSpec,
  source: string
): EnvVarSpec {
  const { validate, ...rest } = spec;
  const resolved: EnvVarSpec = { ...rest };
  if (validate !== undefined) {
    try {
      resolved.validate = resolveValidator(validate);
    } catch (err) {
      throw new Error(`${String(err)} (from ${source}, key ${spec.key})`);
    }
  }
  return resolved;
}

export interface EnvContributions {
  features: EnvFeatureInfo[];
  vars: EnvVarSpec[];
}

/**
 * Assembles env contributions from all present modules. Preserves discovery
 * order (apps → packages → modules, alphabetical within each), so contributed
 * groups render after core groups in a stable order.
 */
export function loadEnvContributions(
  workspaceRoot: string = resolveWorkspaceRoot()
): EnvContributions {
  const discovered = discoverContributions(workspaceRoot);
  const vars: EnvVarSpec[] = [];
  const features: EnvFeatureInfo[] = [];
  const seenFeatures = new Set<string>();
  for (const { env, source } of discovered) {
    if (env.feature && !seenFeatures.has(env.feature.id)) {
      seenFeatures.add(env.feature.id);
      features.push(env.feature);
    }
    for (const spec of env.vars) {
      vars.push(resolveContributedVar(spec, source));
    }
  }
  return { features, vars };
}
