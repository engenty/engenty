import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CLOSED_PATHS,
  CLOSED_PLUGIN_SLUGS,
  CLOSED_PREFIXES,
  isClosedPath as isClosedPublishPath,
} from "./lib/closed-paths.mjs";
import { listWorkspaceModulesOnDisk } from "./lib/engenty-modules.mjs";

/**
 * Guards the open/closed boundary of the public mirror (engenty/engenty).
 *
 * Two scripts decide what may be published — `publish-open.sh` (per-commit
 * cherry-pick) and `publish-open-snapshot.sh` (whole-tree snapshot, run by CI
 * on every release tag) — and both now read `scripts/lib/closed-paths.mjs`
 * instead of carrying their own array. These tests keep it that way, and check
 * the two things a single list cannot enforce on its own.
 *
 * Both failure modes here have happened. `packages/entitlements` was closed in
 * one list and absent from the other, which would have pushed a closed package
 * to a public repo on the next tag. Later `modules/expenses` and
 * `modules/finance-reports` were stripped from the published tree while their
 * slugs stayed in the published `engenty.plugins`, so the mirror named two
 * modules it did not contain and its own `pnpm plugins:check` exited 1.
 *
 * The dependency check is the one that matters most: excluding a package from
 * the publish while an open workspace package still declares a `workspace:*`
 * dependency on it produces a public repo where `pnpm install` fails outright.
 */

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

function readScript(name: string): string {
  return readFileSync(path.join(repoRoot, "scripts", name), "utf8");
}

const closedPrefixes = CLOSED_PREFIXES;

const WORKSPACE_GLOBS = ["apps", "packages", "modules"] as const;

/**
 * Debt, not permission. Each entry is an OPEN workspace package declaring a
 * `workspace:*` dependency on a CLOSED one in dependencies/devDependencies/
 * peerDependencies (optionalDependencies are allowed). That used to make
 * `pnpm install` fail on the public mirror. Closed integrations now load
 * through optionalDependencies plus a runtime import.
 *
 * Only ever shrink this list.
 */
const KNOWN_OPEN_TO_CLOSED_DEPS: string[] = [];

interface WorkspacePackage {
  closed: boolean;
  deps: string[];
  dir: string;
  name: string;
}

function isClosedPath(relativePath: string): boolean {
  return closedPrefixes.some(
    (prefix) => relativePath === prefix || relativePath.startsWith(`${prefix}/`)
  );
}

function collectWorkspacePackages(): WorkspacePackage[] {
  const found: WorkspacePackage[] = [];

  const visit = (relativeDir: string) => {
    const manifestPath = path.join(repoRoot, relativeDir, "package.json");
    let raw: string;
    try {
      raw = readFileSync(manifestPath, "utf8");
    } catch {
      return;
    }
    const manifest = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      name?: string;
      peerDependencies?: Record<string, string>;
    };
    if (!manifest.name) {
      return;
    }
    const deps = [
      ...Object.entries(manifest.dependencies ?? {}),
      ...Object.entries(manifest.devDependencies ?? {}),
      ...Object.entries(manifest.peerDependencies ?? {}),
    ]
      .filter(([, range]) => range.startsWith("workspace:"))
      .map(([dep]) => dep);
    found.push({
      closed: isClosedPath(relativeDir),
      deps,
      dir: relativeDir,
      name: manifest.name,
    });
  };

  for (const root of WORKSPACE_GLOBS) {
    for (const entry of readdirSync(path.join(repoRoot, root))) {
      const relativeDir = `${root}/${entry}`;
      if (!statSync(path.join(repoRoot, relativeDir)).isDirectory()) {
        continue;
      }
      visit(relativeDir);
      // modules/*/providers/* is a workspace root too.
      const providersDir = path.join(repoRoot, relativeDir, "providers");
      try {
        for (const provider of readdirSync(providersDir)) {
          visit(`${relativeDir}/providers/${provider}`);
        }
      } catch {
        // no providers directory
      }
    }
  }

  return found;
}

describe("open-source publish exclusions", () => {
  it("leaves neither publish script its own hand-kept path list", () => {
    for (const script of ["publish-open.sh", "publish-open-snapshot.sh"]) {
      const source = readScript(script);
      expect(source).toContain("scripts/lib/closed-paths.mjs");
      expect(source).not.toMatch(/^(CLOSED_PREFIXES|EXCLUDES)=\(\n\s+"/m);
    }
  });

  it("gives every closed plugin directory its engenty.plugins slug", () => {
    const withoutSlug = CLOSED_PATHS.filter(
      (entry) => entry.path.startsWith("modules/") && !entry.slug
    ).map((entry) => entry.path);

    expect(withoutSlug).toEqual([]);
  });

  it("matches each closed slug to the module manifest on disk", () => {
    const mismatches: string[] = [];

    for (const entry of CLOSED_PATHS) {
      if (!entry.slug) {
        continue;
      }
      const manifestPath = path.join(
        repoRoot,
        entry.path,
        "engenty.plugin.json"
      );
      // Closed modules are absent from some branches (a 0.2.x module on a 0.1.x
      // checkout). Only an on-disk manifest that disagrees is a failure.
      let manifest: { id?: string };
      try {
        manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      } catch {
        continue;
      }
      const id = manifest.id ?? path.basename(entry.path);
      if (id !== entry.slug) {
        mismatches.push(
          `${entry.path}: manifest "${id}" ≠ slug "${entry.slug}"`
        );
      }
    }

    expect(mismatches).toEqual([]);
  });

  it("strips every enabled plugin that lives behind a closed prefix", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(repoRoot, "package.json"), "utf8")
    ) as { engenty?: { plugins?: Record<string, unknown> } };
    const enabled = Object.keys(pkg.engenty?.plugins ?? {});
    const onDisk = new Map(
      listWorkspaceModulesOnDisk(repoRoot).map((mod) => [
        mod.slug,
        path.relative(repoRoot, mod.dir),
      ])
    );

    // The bug this exists for: the tree filter dropped modules/expenses while
    // the manifest kept "expenses", so the mirror's own plugins:check exited 1.
    const leaked = enabled
      .filter((slug) => {
        const dir = onDisk.get(slug);
        return Boolean(dir) && isClosedPublishPath(dir as string);
      })
      .filter((slug) => !CLOSED_PLUGIN_SLUGS.includes(slug))
      .sort();

    expect(leaked).toEqual([]);
  });

  it("adds no new open→closed workspace dependency", () => {
    const packages = collectWorkspacePackages();
    const closedNames = new Map(
      packages.filter((pkg) => pkg.closed).map((pkg) => [pkg.name, pkg.dir])
    );

    const violations = packages
      .filter((pkg) => !pkg.closed)
      .flatMap((pkg) =>
        pkg.deps
          .filter((dep) => closedNames.has(dep))
          .map((dep) => `${pkg.dir} -> ${dep}`)
      )
      .sort();

    expect(violations).toEqual(KNOWN_OPEN_TO_CLOSED_DEPS);
  });
});
