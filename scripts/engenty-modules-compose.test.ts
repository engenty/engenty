import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  enabledModuleSlugSet,
  modulePackageName,
  readEngentyModulesManifest,
  resolveEnabledModules,
} from "./lib/engenty-modules.mjs";
import { syncUiModuleDependencies } from "./lib/sync-ui-module-deps.mjs";

describe("engenty.plugins compose", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
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
});
