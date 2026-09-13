import fs from "node:fs";
import path from "node:path";
import { cliPackageRoot } from "./workspace.js";

/**
 * What a release knows about itself once it is outside a checkout. Written
 * by `scripts/publish-cli.mjs` next to the package's `dist/`; absent inside
 * the workspace, where the same facts are computed live from the sources.
 */
export interface ReleaseManifest {
  /** Directory holding the release's aggregated migrations, relative to the package root. */
  migrationsDir: string;
  /** PostgREST schemas the release needs exposed. */
  schemas: string[];
  supabaseCliVersion: string;
  version: string;
}

export function releaseManifestPath(): string {
  return path.join(cliPackageRoot(), "release-manifest.json");
}

export function readReleaseManifest(): ReleaseManifest | null {
  const file = releaseManifestPath();
  if (!fs.existsSync(file)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as ReleaseManifest;
}

export function requireReleaseManifest(command: string): ReleaseManifest {
  const manifest = readReleaseManifest();
  if (!manifest) {
    throw new Error(
      `engenty ${command} needs the release facts (schemas, migrations) that the published \`engenty\` package carries in release-manifest.json. Run it through \`npx engenty\`, or inside a checkout.`
    );
  }
  return manifest;
}
