// `/company/apps/<slug>/`: the source of every App that a publishing Space
// owns, read-only.
//
// An App lives on the host at `<space drive>/apps/<slug>/{src,data}` —
// app-host's tree, the one the owning Space's computer binds read-write at
// `/sandbox/apps`. Everyone else in the company reads `src/`; `data/` is the
// running App's own state and stays with its Space. The same switch that
// shares a Space's `public/` folder shares its Apps: a private Space's Apps
// stay out until it publishes.
//
// Read from the host, not a table: the folder IS the App's placement
// (app-host names it by Space and slug), and core must not reach into the
// Apps module's schema. Slugs are unique per tenant, so one level suffices.

import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { resolveSpaceDrivePath } from "./local-workspace-paths.js";

const APP_SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;

export interface CompanyApp {
  slug: string;
  spaceId: string;
  /** Host path of the App's `src/`. */
  srcPath: string;
}

export function listCompanyApps(
  tenantId: string,
  spaces: readonly { id: string }[]
): CompanyApp[] {
  const apps: CompanyApp[] = [];
  const seen = new Set<string>();
  for (const space of spaces) {
    const root = resolveSpaceDrivePath(tenantId, space.id, "apps");
    let entries: string[];
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }
    for (const slug of entries.sort()) {
      const srcPath = path.join(root, slug, "src");
      if (
        !APP_SLUG.test(slug) ||
        seen.has(slug) ||
        !existsSync(srcPath) ||
        !statSync(srcPath).isDirectory()
      ) {
        continue;
      }
      seen.add(slug);
      apps.push({ slug, spaceId: space.id, srcPath });
    }
  }
  return apps;
}
