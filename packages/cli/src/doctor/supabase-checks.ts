import path from "node:path";
import { pathToFileURL } from "node:url";
import { readReleaseManifest } from "../release-manifest.js";
import { currentWorkspaceRoot } from "../workspace.js";

export type {
  SchemaProbe,
  SelfCheckProbe,
} from "../../lib/supabase-probes.mjs";
export {
  probeDeploymentSelfCheck,
  probeExposedSchemas,
} from "../../lib/supabase-probes.mjs";

/**
 * Which schemas a deployment must expose. Inside a checkout the answer comes
 * from the committed migration sources (`scripts/lib/migration-owners.mjs`
 * and the composer in `scripts/supabase-sync-lib.mjs`, the same code
 * `engenty generate` runs); outside, from the release manifest the published
 * package carries.
 */
export async function loadRequiredSchemas(): Promise<string[]> {
  const root = currentWorkspaceRoot();
  if (root) {
    const load = async <T>(relativePath: string): Promise<T> =>
      (await import(pathToFileURL(path.join(root, relativePath)).href)) as T;
    const owners = await load<{
      resolveMigrationOwners: (root: string) => unknown[];
    }>("scripts/lib/migration-owners.mjs");
    const sync = await load<{
      composeApiSchemasFromOwners: (owners: unknown[]) => string[];
    }>("scripts/supabase-sync-lib.mjs");
    return sync.composeApiSchemasFromOwners(
      owners.resolveMigrationOwners(root)
    );
  }
  const manifest = readReleaseManifest();
  if (!manifest) {
    throw new Error(
      "Cannot tell which schemas this release needs: not inside a checkout and no release-manifest.json next to the CLI. Run `npx engenty doctor --remote` from the published package."
    );
  }
  return manifest.schemas;
}
