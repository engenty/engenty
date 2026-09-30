import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enabledModuleSlugSet,
  modulePackageName,
  readEngentyModulesManifest,
  resolveEnabledModules,
  resolveInstalledModules,
} from "./lib/engenty-modules.mjs";
import {
  resolveHeldMigrationOwners,
  resolveMigrationOwners,
} from "./lib/migration-owners.mjs";
import { syncUiModuleDependencies } from "./lib/sync-ui-module-deps.mjs";

describe("engenty.plugins compose", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  function createRepo(slugs: string[]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-compose-"));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, "modules"), { recursive: true });
    fs.mkdirSync(path.join(root, "apps/ui"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      `${JSON.stringify(
        {
          workspaces: ["modules/*", "apps/*"],
          engenty: {
            plugins: Object.fromEntries(
              slugs.map((slug) => [slug, { source: "workspace" }])
            ),
          },
        },
        null,
        2
      )}\n`,
      "utf-8"
    );
    fs.writeFileSync(
      path.join(root, "apps/ui/package.json"),
      `${JSON.stringify({ name: "@engenty/ui", dependencies: {} }, null, 2)}\n`,
      "utf-8"
    );
    return root;
  }

  function writeModule(root: string, slug: string, withUi = false) {
    const moduleDir = path.join(root, "modules", slug);
    fs.mkdirSync(moduleDir, { recursive: true });
    fs.writeFileSync(
      path.join(moduleDir, "package.json"),
      `${JSON.stringify({ name: modulePackageName(slug) }, null, 2)}\n`,
      "utf-8"
    );
    fs.writeFileSync(
      path.join(moduleDir, "engenty.plugin.json"),
      `${JSON.stringify(
        withUi
          ? { id: slug, ui: { entry: `${modulePackageName(slug)}/ui/plugin` } }
          : { id: slug },
        null,
        2
      )}\n`,
      "utf-8"
    );
  }

  it("enabledModuleSlugSet reflects declared slugs only", () => {
    const root = createRepo(["alpha", "beta"]);
    writeModule(root, "alpha");
    writeModule(root, "beta");
    writeModule(root, "gamma");

    expect([...enabledModuleSlugSet(root)].sort()).toEqual(["alpha", "beta"]);
    expect(resolveEnabledModules(root)).toHaveLength(2);
  });

  it("syncUiModuleDependencies adds enabled UI modules and removes stale deps", () => {
    const root = createRepo(["enabled-ui"]);
    writeModule(root, "enabled-ui", true);
    writeModule(root, "disabled-ui", true);

    const uiPath = path.join(root, "apps/ui/package.json");
    fs.writeFileSync(
      uiPath,
      `${JSON.stringify(
        {
          name: "@engenty/ui",
          dependencies: {
            "@engenty/disabled-ui": "workspace:*",
            "@engenty/stale-only": "workspace:*",
          },
        },
        null,
        2
      )}\n`,
      "utf-8"
    );

    const result = syncUiModuleDependencies(root);
    expect(result.added).toEqual(["@engenty/enabled-ui"]);
    expect(result.removed).toEqual(["@engenty/disabled-ui"]);

    const parsed = JSON.parse(fs.readFileSync(uiPath, "utf-8")) as {
      dependencies: Record<string, string>;
    };
    expect(parsed.dependencies["@engenty/enabled-ui"]).toBe("workspace:*");
    expect(parsed.dependencies["@engenty/disabled-ui"]).toBeUndefined();
    expect(parsed.dependencies["@engenty/stale-only"]).toBe("workspace:*");
  });

  it("does not add closed-prefix UI modules as apps/ui workspace deps", () => {
    // `banking` is a real entry in scripts/lib/closed-paths.mjs, which is the
    // one list that decides what stays out of the public mirror. The fixture
    // used to write its own CLOSED_PREFIXES bash array into publish-open.sh;
    // that array is now a shell loop over closed-paths.mjs, so fabricating one
    // tested a parser rather than the boundary.
    const root = createRepo(["enabled-ui", "banking"]);
    writeModule(root, "enabled-ui", true);
    writeModule(root, "banking", true);

    const uiPath = path.join(root, "apps/ui/package.json");
    fs.writeFileSync(
      uiPath,
      `${JSON.stringify(
        {
          name: "@engenty/ui",
          dependencies: {
            "@engenty/banking": "workspace:*",
          },
        },
        null,
        2
      )}\n`,
      "utf-8"
    );

    const result = syncUiModuleDependencies(root);
    expect(result.added).toEqual(["@engenty/enabled-ui"]);
    expect(result.removed).toEqual(["@engenty/banking"]);

    const parsed = JSON.parse(fs.readFileSync(uiPath, "utf-8")) as {
      dependencies: Record<string, string>;
    };
    expect(parsed.dependencies["@engenty/enabled-ui"]).toBe("workspace:*");
    expect(parsed.dependencies["@engenty/banking"]).toBeUndefined();
  });

  it("readEngentyPluginsManifest rejects engenty.plugins arrays", () => {
    const root = createRepo(["alpha"]);
    const pkgPath = path.join(root, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
      engenty: { plugins: string[] };
    };
    pkg.engenty.plugins = ["alpha", "beta"] as unknown as string[];
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf-8");
    expect(() => readEngentyModulesManifest(root)).toThrow(/object map/);
  });
  it("refuses an install where a module requires one its stage leaves out", () => {
    const root = createRepo(["unfinished", "released"]);
    writeModule(root, "unfinished");
    writeModule(root, "released");
    const manifestPath = (slug: string) =>
      path.join(root, "modules", slug, "engenty.plugin.json");
    fs.writeFileSync(
      manifestPath("unfinished"),
      JSON.stringify({ id: "unfinished", stage: "dev" })
    );
    fs.writeFileSync(
      manifestPath("released"),
      JSON.stringify({ id: "released", requires: ["module.unfinished"] })
    );

    vi.stubEnv("ENGENTY_MODULE_STAGE", "beta");
    expect(() => resolveInstalledModules(root)).toThrow(
      /released requires module\.unfinished/
    );
    vi.stubEnv("ENGENTY_MODULE_STAGE", "dev");
    expect(
      resolveInstalledModules(root)
        .map((mod) => mod.slug)
        .sort()
    ).toEqual(["released", "unfinished"]);
  });
  it("holds back the migrations of modules its stage leaves out", () => {
    const root = createRepo(["unfinished", "released"]);
    for (const [slug, stage] of [
      ["unfinished", "dev"],
      ["released", undefined],
    ] as const) {
      writeModule(root, slug);
      fs.writeFileSync(
        path.join(root, "modules", slug, "engenty.plugin.json"),
        JSON.stringify(stage ? { id: slug, stage } : { id: slug })
      );
      const migrations = path.join(
        root,
        "modules",
        slug,
        "supabase",
        "migrations"
      );
      fs.mkdirSync(migrations, { recursive: true });
      fs.writeFileSync(
        path.join(migrations, `20260101000000_plugin_${slug}.sql`),
        "select 1;"
      );
    }
    const names = (owners: Array<{ name: string }>) =>
      owners.map((owner) => owner.name).sort();

    // A fresh beta database never gets the dev module's tables, and the
    // migrate step knows its versions to keep an older database pushable.
    vi.stubEnv("ENGENTY_MODULE_STAGE", "beta");
    expect(names(resolveMigrationOwners(root))).toEqual(["released"]);
    expect(names(resolveHeldMigrationOwners(root))).toEqual(["unfinished"]);

    vi.stubEnv("ENGENTY_MODULE_STAGE", "dev");
    expect(names(resolveMigrationOwners(root))).toEqual([
      "released",
      "unfinished",
    ]);
    expect(resolveHeldMigrationOwners(root)).toEqual([]);
  });
});
