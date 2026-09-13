import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { disablePluginsInProduct, enablePluginsInProduct } from "@engenty/cli";
import { afterEach, describe, expect, it } from "vitest";
import { loadPlugins } from "./loader.js";

// End-to-end proof of in-repo plugin activation: enabling a module in the root
// `engenty.plugins` manifest must make discovery surface it and the loader load
// it; disabling must stop it. This is the contract the `plugins enable/disable`
// CLI relies on — the manifest is the single source of truth for modules.
describe("in-repo plugin activation", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  function createRepo(enabled: Record<string, { source: string }>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-activation-"));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, "modules"), { recursive: true });
    fs.mkdirSync(path.join(root, "packages"), { recursive: true });
    fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
    // generate.mjs stub so enable's generate step is a no-op success.
    fs.writeFileSync(
      path.join(root, "scripts/generate.mjs"),
      "// stub\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(root, "package.json"),
      `${JSON.stringify(
        {
          name: "repo",
          workspaces: ["modules/*"],
          engenty: { plugins: enabled },
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    return root;
  }

  function writeModule(root: string, slug: string): void {
    const dir = path.join(root, "modules", slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "package.json"),
      `${JSON.stringify({ name: `@demo/${slug}`, version: "0.0.0" }, null, 2)}\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(dir, "engenty.plugin.json"),
      `${JSON.stringify(
        { id: slug, name: slug, server: { entry: "index.ts" } },
        null,
        2
      )}\n`,
      "utf8"
    );
    // No-op factory that marks itself by providing a capability so we can
    // assert it actually executed (loaded), not merely discovered.
    fs.writeFileSync(
      path.join(dir, "index.ts"),
      `const factory = (engenty) => { engenty.capabilities.provides("${slug}.loaded"); };\nexport default factory;\n`,
      "utf8"
    );
  }

  function loadFrom(root: string) {
    return loadPlugins({
      modulesDir: path.join(root, "modules"),
      packagesDir: path.join(root, "packages"),
      dataDir: path.join(root, "data"),
      config: {},
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      startRegisteredServices: false,
    });
  }

  it("module on disk but not in manifest is neither discovered nor loaded", () => {
    const root = createRepo({});
    writeModule(root, "demo-mod");

    const registry = loadFrom(root);
    expect(registry.plugins.find((p) => p.id === "demo-mod")).toBeUndefined();
  });

  it("enabling loads the module; disabling stops it (manifest is the gate)", () => {
    const root = createRepo({});
    writeModule(root, "demo-mod");

    enablePluginsInProduct({
      repoRoot: root,
      slugs: ["demo-mod"],
      runInstall: false,
      runSetup: false,
    });

    const afterEnable = loadFrom(root);
    const enabledRecord = afterEnable.plugins.find((p) => p.id === "demo-mod");
    expect(enabledRecord?.loaded).toBe(true);
    expect(enabledRecord?.loadError ?? null).toBeNull();
    expect(enabledRecord?.provides).toContain("demo-mod.loaded");

    disablePluginsInProduct({
      repoRoot: root,
      slugs: ["demo-mod"],
      runSetup: false,
    });

    const afterDisable = loadFrom(root);
    expect(
      afterDisable.plugins.find((p) => p.id === "demo-mod")
    ).toBeUndefined();
  });
});
