import fs from "node:fs";
import path from "node:path";

export function resolveRepoRootFromModulesDir(modulesDir: string): string {
  return path.resolve(modulesDir, "..");
}

export function resolveUiPackageJsonPath(repoRootDir: string): string {
  return path.join(repoRootDir, "apps/ui/package.json");
}

export type UiWorkspaceDependencyWriteResult =
  | "added"
  | "exists"
  | "missing-ui-app";

export function addUiWorkspaceDependency(params: {
  packageName: string;
  uiPackageJsonPath: string;
}): UiWorkspaceDependencyWriteResult {
  if (!fs.existsSync(params.uiPackageJsonPath)) {
    return "missing-ui-app";
  }

  const raw = fs.readFileSync(params.uiPackageJsonPath, "utf8");
  const parsed = JSON.parse(raw) as {
    dependencies?: Record<string, string>;
  };
  const dependencies =
    parsed.dependencies && typeof parsed.dependencies === "object"
      ? parsed.dependencies
      : {};

  if (Object.hasOwn(dependencies, params.packageName)) {
    return "exists";
  }

  const nextDependencies = Object.fromEntries(
    Object.entries({
      ...dependencies,
      [params.packageName]: "workspace:*",
    }).sort(([left], [right]) => left.localeCompare(right))
  );

  const nextPackageJson = {
    ...parsed,
    dependencies: nextDependencies,
  };

  fs.writeFileSync(
    params.uiPackageJsonPath,
    `${JSON.stringify(nextPackageJson, null, 2)}\n`,
    "utf8"
  );
  return "added";
}
