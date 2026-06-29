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

function discoverContributions(
  workspaceRoot: string
): DiscoveredContribution[] {
  const found: DiscoveredContribution[] = [];
  for (const parent of MEMBER_PARENTS) {
    const parentDir = path.join(workspaceRoot, parent);
    if (!(fs.existsSync(parentDir) && fs.statSync(parentDir).isDirectory())) {
      continue;
    }
    const entries = fs
      .readdirSync(parentDir, { withFileTypes: true })
      .filter((ent) => ent.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const ent of entries) {
      const manifestPath = path.join(
        parentDir,
        ent.name,
        "engenty.plugin.json"
      );
      if (!fs.existsSync(manifestPath)) {
        continue;
      }
      const env = readManifestEnv(manifestPath);
      if (env) {
        found.push({ env, source: manifestPath });
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
