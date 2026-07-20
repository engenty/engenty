/**
 * Pure parsing/planning for `engenty modules add` (Level A / A4). Kept separate
 * from the side-effecting command so it is unit-testable without a registry or
 * a filesystem.
 */

export interface ModuleAddSpec {
  /** Full package spec to hand to the package manager, e.g. `@engenty/tasks@0.1.47`. */
  installArg: string;
  /** Package name without a version, e.g. `@engenty/tasks`. */
  packageName: string;
  /**
   * The `engenty.plugins.<slug>` entry to write. Carries a `package` override
   * only when the package name diverges from the conventional `@engenty/<slug>`.
   */
  pluginEntry: { source: "registry"; package?: string };
  /** Plugin slug the module registers under (engenty.plugins key). */
  slug: string;
  /** Version/dist-tag if the caller pinned one, else undefined (latest). */
  version?: string;
}

const DEFAULT_SCOPE = "@engenty/";

/**
 * Parse a `modules add` argument into an install plan.
 *
 * Accepts `@scope/name`, `@scope/name@version`, `name`, `name@version`. The slug
 * defaults to the unscoped package name; pass `slugOverride` when the manifest
 * id differs from the package name (e.g. `pdf-templates` for
 * `@engenty/pdf-templates-module`).
 */
export function parseModuleAddSpec(
  arg: string,
  slugOverride?: string
): ModuleAddSpec {
  const raw = arg.trim();
  if (!raw) {
    throw new Error("modules add: a package name is required");
  }
  // Split a trailing @version without mistaking the leading scope `@`.
  const scoped = raw.startsWith("@");
  const atIndex = raw.indexOf("@", scoped ? 1 : 0);
  const packageName = atIndex === -1 ? raw : raw.slice(0, atIndex);
  const version =
    atIndex === -1 ? undefined : raw.slice(atIndex + 1) || undefined;

  if (!packageName) {
    throw new Error(
      `modules add: could not parse a package name from "${arg}"`
    );
  }

  const unscoped = packageName.includes("/")
    ? packageName.slice(packageName.lastIndexOf("/") + 1)
    : packageName;
  const slug = (slugOverride ?? unscoped).trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(
      `modules add: "${slug}" is not a valid kebab-case slug (pass --slug to override)`
    );
  }

  const conventional = `${DEFAULT_SCOPE}${slug}`;
  const pluginEntry: ModuleAddSpec["pluginEntry"] =
    packageName === conventional
      ? { source: "registry" }
      : { source: "registry", package: packageName };

  return {
    installArg: version ? `${packageName}@${version}` : packageName,
    packageName,
    version,
    slug,
    pluginEntry,
  };
}
