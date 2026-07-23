import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards the open/closed boundary of the public mirror (engenty/engenty).
 *
 * Two scripts decide what may be published and they are maintained by hand:
 * `publish-open.sh` (per-commit cherry-pick) and `publish-open-snapshot.sh`
 * (whole-tree snapshot, run by CI on every release tag). They drifted once —
 * `packages/entitlements` was closed in the first and absent from the second —
 * which would have pushed a closed package to a public repo on the next tag.
 *
 * The dependency check is the one that matters most: excluding a package from
 * the snapshot while an open workspace package still declares a `workspace:*`
 * dependency on it produces a public repo where `pnpm install` fails outright.
 */

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

function readScript(name: string): string {
  return readFileSync(path.join(repoRoot, "scripts", name), "utf8");
}

/** Pull a bash array literal (`NAME=( ... )`) out of a script as plain entries. */
function parseBashArray(source: string, name: string): string[] {
  const match = source.match(new RegExp(`${name}=\\(([\\s\\S]*?)\\n\\)`));
  if (!match) {
    throw new Error(`Could not find bash array ${name}`);
  }
  return match[1]
    .split("\n")
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/^"|"$/g, ""));
}

const closedPrefixes = parseBashArray(
  readScript("publish-open.sh"),
  "CLOSED_PREFIXES"
);
const snapshotExcludes = parseBashArray(
  readScript("publish-open-snapshot.sh"),
  "EXCLUDES"
);

const WORKSPACE_GLOBS = ["apps", "packages", "modules"] as const;

/**
 * Debt, not permission. Each entry is an OPEN workspace package declaring a
 * `workspace:*` dependency on a CLOSED one — which means `pnpm install` fails
 * on the public mirror, because the dependency was filtered out of the
 * snapshot. Both also import the closed package from source, so removing the
 * manifest entry alone would not be enough; the integration has to move behind
 * the module/plugin loader (apps/ai) or into a pro-side package (apps/core).
 *
 * Only ever shrink this list.
 */
const KNOWN_OPEN_TO_CLOSED_DEPS = [
  "apps/ai -> @engenty/engenty-remote",
  "apps/core -> @engenty/entitlements",
];

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
  it("keeps the snapshot exclude list a superset of the closed prefixes", () => {
    const missing = closedPrefixes.filter(
      (prefix) => !snapshotExcludes.includes(prefix)
    );
    expect(missing).toEqual([]);
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
