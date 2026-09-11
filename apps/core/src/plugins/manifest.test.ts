import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ENGENTY_PLUGIN_MANIFEST_FILENAME,
  isConventionalPluginRoot,
  loadPluginManifest,
  resolveEngentyPluginManifestPath,
} from "./manifest.js";

function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), `engenty-manifest-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe("loadPluginManifest", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns error when engenty.plugin.json does not exist", () => {
    tmpDir = makeTempDir();
    const result = loadPluginManifest(tmpDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("plugin.manifest.missing");
      expect(result.error).toContain("manifest not found");
      expect(result.manifestPath).toContain(ENGENTY_PLUGIN_MANIFEST_FILENAME);
    }
  });

  it("returns error when manifest has no id and host cannot derive one", () => {
    tmpDir = makeTempDir();
    fs.writeFileSync(
      path.join(tmpDir, ENGENTY_PLUGIN_MANIFEST_FILENAME),
      JSON.stringify({})
    );
    const result = loadPluginManifest(tmpDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("plugin.manifest.invalid");
      expect(result.error).toContain("requires id");
    }
  });

  it("returns error when manifest omits server.entry and host cannot derive one", () => {
    tmpDir = makeTempDir();
    fs.writeFileSync(
      path.join(tmpDir, ENGENTY_PLUGIN_MANIFEST_FILENAME),
      JSON.stringify({
        id: "test-plugin",
      })
    );
    const result = loadPluginManifest(tmpDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("plugin.manifest.invalid");
      expect(result.error).toContain("server.entry");
    }
  });

  it("loads UI-only manifest when ui.entry is declared", () => {
    tmpDir = makeTempDir();
    fs.writeFileSync(
      path.join(tmpDir, ENGENTY_PLUGIN_MANIFEST_FILENAME),
      JSON.stringify({
        id: "ui-only",
        ui: {
          entry: "@engenty/ui-only/plugin",
          load: "workspace",
        },
      })
    );

    const result = loadPluginManifest(tmpDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.server).toBeUndefined();
      expect(result.manifest.ui).toMatchObject({
        entry: "@engenty/ui-only/plugin",
        export: "default",
        load: "workspace",
      });
      expect(result.manifest.capabilities?.ui).toBe(true);
    }
  });

  it("loads valid manifest", () => {
    tmpDir = makeTempDir();
    fs.writeFileSync(path.join(tmpDir, "plugin-entry.ts"), "export {};");
    const manifest = {
      id: "test-plugin",
      name: "Test",
      description: "A test",
      version: "1.0.0",
      server: { entry: "./plugin-entry.ts" },
    };
    fs.writeFileSync(
      path.join(tmpDir, ENGENTY_PLUGIN_MANIFEST_FILENAME),
      JSON.stringify(manifest)
    );
    const result = loadPluginManifest(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.id).toBe("test-plugin");
      expect(result.manifest.name).toBe("Test");
      expect(result.manifest.description).toBe("A test");
      expect(result.manifest.version).toBe("1.0.0");
      expect(result.manifestPath).toContain(ENGENTY_PLUGIN_MANIFEST_FILENAME);
      expect(result.diagnostics).toEqual([]);
    }
  });

  it("reads full engenty.plugin.json fields", () => {
    tmpDir = makeTempDir();
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "@engenty/target", version: "1.0.0" })
    );
    fs.writeFileSync(
      path.join(tmpDir, ENGENTY_PLUGIN_MANIFEST_FILENAME),
      JSON.stringify({
        id: "target-plugin",
        name: "Target",
        description: "Target manifest",
        version: "1.0.0",
        kind: "module",
        category: "work",
        server: { entry: "./src/plugin.ts" },
        ui: {
          entry: "@engenty/target/ui/custom",
          export: "targetUiPlugin",
          load: "workspace",
          staticAssets: ["./dist/assets"],
          assetOrigins: ["self"],
          tailwindSources: ["./ui"],
        },
        provides: ["module.target", "module.target"],
        requires: ["module.contacts"],
        optional: ["module.inbox"],
        capabilities: {
          operations: true,
          ui: true,
          ai: false,
          frontendTools: true,
        },
      })
    );

    const result = loadPluginManifest(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifestPath).toContain(ENGENTY_PLUGIN_MANIFEST_FILENAME);
      expect(result.manifest.id).toBe("target-plugin");
      expect(result.manifest.category).toBe("work");
      expect(result.manifest.server).toEqual({
        entry: "./src/plugin.ts",
      });
      expect(result.manifest.ui?.export).toBe("targetUiPlugin");
      expect(result.manifest.ui?.load).toBe("workspace");
      expect(result.manifest.ui?.staticAssets).toEqual(["./dist/assets"]);
      expect(result.manifest.ui?.assetOrigins).toEqual(["self"]);
      expect(result.manifest.ui?.tailwindSources).toEqual(["./ui"]);
      expect(result.manifest.provides).toEqual(["module.target"]);
      expect(result.manifest.requires).toEqual(["module.contacts"]);
      expect(result.manifest.optional).toEqual(["module.inbox"]);
      expect(result.manifest.capabilities?.operations).toBe(true);
      expect(result.manifest.capabilities?.ai).toBe(false);
      expect(result.diagnostics).toEqual([]);
    }
  });

  it("rejects unknown category values", () => {
    tmpDir = makeTempDir();
    fs.writeFileSync(path.join(tmpDir, "plugin-entry.ts"), "export {};");
    fs.writeFileSync(
      path.join(tmpDir, ENGENTY_PLUGIN_MANIFEST_FILENAME),
      JSON.stringify({
        id: "bad-category",
        category: "not-a-real-category",
        server: { entry: "./plugin-entry.ts" },
      })
    );
    const result = loadPluginManifest(tmpDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("plugin.manifest.invalid");
      expect(result.error).toContain("category must be one of");
    }
  });

  it("rejects unknown placement values", () => {
    // Same hard failure as `category`, and for a sharper reason: a typo'd
    // placement would fall back to a default that decides whether the module
    // appears on the app rail at all (PLAN-spaces.md Phase 5a).
    tmpDir = makeTempDir();
    fs.writeFileSync(path.join(tmpDir, "plugin-entry.ts"), "export {};");
    fs.writeFileSync(
      path.join(tmpDir, ENGENTY_PLUGIN_MANIFEST_FILENAME),
      JSON.stringify({
        id: "bad-placement",
        placement: "globl",
        server: { entry: "./plugin-entry.ts" },
      })
    );
    const result = loadPluginManifest(tmpDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("plugin.manifest.invalid");
      expect(result.error).toContain("placement must be one of");
    }
  });

  it("reads a declared placement and leaves it undefined when absent", () => {
    // Undefined, NOT defaulted here: the manifest layer reports what was
    // written, and the UI resolver is the one place that turns absence into
    // "space" plus a diagnostic naming the plugin.
    tmpDir = makeTempDir();
    fs.writeFileSync(path.join(tmpDir, "plugin-entry.ts"), "export {};");
    fs.writeFileSync(
      path.join(tmpDir, ENGENTY_PLUGIN_MANIFEST_FILENAME),
      JSON.stringify({
        id: "placed",
        placement: "global",
        server: { entry: "./plugin-entry.ts" },
      })
    );
    const placed = loadPluginManifest(tmpDir);
    expect(placed.ok).toBe(true);
    if (placed.ok) {
      expect(placed.manifest.placement).toBe("global");
    }

    fs.writeFileSync(
      path.join(tmpDir, ENGENTY_PLUGIN_MANIFEST_FILENAME),
      JSON.stringify({ id: "unplaced", server: { entry: "./plugin-entry.ts" } })
    );
    const unplaced = loadPluginManifest(tmpDir);
    expect(unplaced.ok).toBe(true);
    if (unplaced.ok) {
      expect(unplaced.manifest.placement).toBeUndefined();
    }
  });

  it("reads runtime UI load policy", () => {
    tmpDir = makeTempDir();
    fs.writeFileSync(
      path.join(tmpDir, ENGENTY_PLUGIN_MANIFEST_FILENAME),
      JSON.stringify({
        id: "runtime-ui",
        server: { entry: "./src/plugin.ts" },
        ui: {
          entry: "./dist/ui/plugin.js",
          export: "default",
          load: "runtime",
        },
      })
    );

    const result = loadPluginManifest(tmpDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.ui?.load).toBe("runtime");
    }
  });

  it("defaults omitted UI load policy to runtime", () => {
    tmpDir = makeTempDir();
    fs.writeFileSync(
      path.join(tmpDir, ENGENTY_PLUGIN_MANIFEST_FILENAME),
      JSON.stringify({
        id: "default-runtime-ui",
        server: { entry: "./src/plugin.ts" },
        ui: {
          entry: "./dist/ui/plugin.js",
          export: "default",
        },
      })
    );

    const result = loadPluginManifest(tmpDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.ui?.load).toBe("runtime");
    }
  });

  it("warns when manifest version disagrees with package.json", () => {
    tmpDir = makeTempDir();
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        version: "1.0.0",
      })
    );
    fs.writeFileSync(
      path.join(tmpDir, ENGENTY_PLUGIN_MANIFEST_FILENAME),
      JSON.stringify({
        id: "target-plugin",
        name: "Target",
        description: "Target manifest",
        version: "2.0.0",
        kind: "module",
        server: { entry: "./src/plugin.ts" },
      })
    );

    const result = loadPluginManifest(tmpDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diagnostics).toEqual([
        {
          code: "plugin.manifest.version_mismatch",
          level: "warn",
          message:
            'engenty.plugin.json version "2.0.0" disagrees with package.json version "1.0.0".',
        },
      ]);
    }
  });

  it("returns error for invalid JSON", () => {
    tmpDir = makeTempDir();
    fs.writeFileSync(
      path.join(tmpDir, ENGENTY_PLUGIN_MANIFEST_FILENAME),
      "not valid json {"
    );
    const result = loadPluginManifest(tmpDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("plugin.manifest.invalid");
      expect(result.error).toContain("parse");
    }
  });

  it("derives manifest for conventional modules/* without engenty.plugin.json", () => {
    tmpDir = makeTempDir();
    const modRoot = path.join(tmpDir, "modules", "conv-nomanifest");
    fs.mkdirSync(path.join(modRoot, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(modRoot, "package.json"),
      JSON.stringify({ name: "@engenty/conv-nomanifest", version: "0.1.0" })
    );
    fs.writeFileSync(
      path.join(modRoot, "src", "plugin.ts"),
      "export default () => {};"
    );
    fs.mkdirSync(path.join(modRoot, "ui"), { recursive: true });
    fs.writeFileSync(
      path.join(modRoot, "ui", "plugin.ts"),
      "export default () => {};"
    );
    const result = loadPluginManifest(modRoot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.id).toBe("conv-nomanifest");
      expect(result.manifest.server?.entry).toBe("./src/plugin.ts");
      expect(result.manifest.ui).toMatchObject({
        entry: "@engenty/conv-nomanifest/ui/plugin",
        export: "default",
        load: "workspace",
        tailwindSources: ["./ui"],
      });
      expect(result.manifest.capabilities?.ui).toBe(true);
      expect(result.manifestPath).toContain(ENGENTY_PLUGIN_MANIFEST_FILENAME);
    }
  });

  it("merges defaults for empty engenty.plugin.json under modules/*", () => {
    tmpDir = makeTempDir();
    const modRoot = path.join(tmpDir, "modules", "empty-json");
    fs.mkdirSync(path.join(modRoot, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(modRoot, "package.json"),
      JSON.stringify({ name: "@engenty/empty-json", version: "0.2.0" })
    );
    fs.writeFileSync(
      path.join(modRoot, "src", "plugin.ts"),
      "export default () => {};"
    );
    fs.mkdirSync(path.join(modRoot, "ui"), { recursive: true });
    fs.writeFileSync(
      path.join(modRoot, "ui", "plugin.ts"),
      "export default () => {};"
    );
    fs.writeFileSync(
      path.join(modRoot, ENGENTY_PLUGIN_MANIFEST_FILENAME),
      "{}"
    );
    const result = loadPluginManifest(modRoot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.id).toBe("empty-json");
      expect(result.manifest.server?.entry).toBe("./src/plugin.ts");
      expect(result.manifest.ui).toMatchObject({
        entry: "@engenty/empty-json/ui/plugin",
        export: "default",
        load: "workspace",
        tailwindSources: ["./ui"],
      });
      expect(result.manifest.capabilities?.ui).toBe(true);
    }
  });

  it("uses explicit engenty.plugin.json metadata over convention defaults", () => {
    tmpDir = makeTempDir();
    const modRoot = path.join(tmpDir, "modules", "explicit-manifest");
    fs.mkdirSync(path.join(modRoot, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(modRoot, "package.json"),
      JSON.stringify({ name: "@engenty/explicit-manifest" })
    );
    fs.writeFileSync(
      path.join(modRoot, "src", "plugin.ts"),
      "export default () => {};"
    );
    fs.writeFileSync(
      path.join(modRoot, "engenty.plugin.json"),
      JSON.stringify({
        id: "explicit-id",
      })
    );
    const result = loadPluginManifest(modRoot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.id).toBe("explicit-id");
      expect(result.manifest.server?.entry).toBe("./src/plugin.ts");
    }
  });

  it("defaults tailwindSources to ./src for conventional packages/* when ./ui is absent", () => {
    tmpDir = makeTempDir();
    const pkgRoot = path.join(tmpDir, "packages", "pkg-tailwind-default");
    fs.mkdirSync(path.join(pkgRoot, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(pkgRoot, "package.json"),
      JSON.stringify({
        name: "@engenty/pkg-tailwind-default",
        version: "0.1.0",
      })
    );
    fs.writeFileSync(
      path.join(pkgRoot, "src", "plugin.ts"),
      "export default () => {};"
    );
    fs.writeFileSync(
      path.join(pkgRoot, ENGENTY_PLUGIN_MANIFEST_FILENAME),
      JSON.stringify({
        id: "pkg-tailwind-default",
        ui: {
          entry: "@engenty/pkg-tailwind-default/plugin",
          load: "workspace",
        },
      })
    );
    const result = loadPluginManifest(pkgRoot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.ui?.tailwindSources).toEqual(["./src"]);
    }
  });

  it("does not infer ./src tailwindSources for modules/* without ./ui", () => {
    tmpDir = makeTempDir();
    const modRoot = path.join(tmpDir, "modules", "mod-no-ui-folder");
    fs.mkdirSync(path.join(modRoot, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(modRoot, "package.json"),
      JSON.stringify({ name: "@engenty/mod-no-ui-folder", version: "0.1.0" })
    );
    fs.writeFileSync(
      path.join(modRoot, "src", "plugin.ts"),
      "export default () => {};"
    );
    fs.writeFileSync(
      path.join(modRoot, ENGENTY_PLUGIN_MANIFEST_FILENAME),
      JSON.stringify({
        id: "mod-no-ui-folder",
        ui: {
          entry: "@engenty/mod-no-ui-folder/plugin",
          load: "workspace",
        },
      })
    );
    const result = loadPluginManifest(modRoot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.ui?.tailwindSources).toBeUndefined();
    }
  });

  it("does not infer tailwindSources outside conventional modules or packages roots", () => {
    tmpDir = makeTempDir();
    fs.writeFileSync(
      path.join(tmpDir, ENGENTY_PLUGIN_MANIFEST_FILENAME),
      JSON.stringify({
        id: "external-ui",
        ui: {
          entry: "@engenty/external-ui/plugin",
          load: "workspace",
        },
      })
    );
    const result = loadPluginManifest(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.ui?.tailwindSources).toBeUndefined();
    }
  });
});

describe("resolveEngentyPluginManifestPath", () => {
  it("returns path with engenty.plugin.json", () => {
    const root = "/some/plugin/root";
    expect(resolveEngentyPluginManifestPath(root)).toBe(
      path.join(root, ENGENTY_PLUGIN_MANIFEST_FILENAME)
    );
  });
});

describe("isConventionalPluginRoot", () => {
  it("accepts top-level modules and packages", () => {
    expect(isConventionalPluginRoot("/repo/modules/connections")).toBe(true);
    expect(isConventionalPluginRoot("/repo/packages/connections-sdk")).toBe(
      true
    );
  });

  it("accepts nested connector providers", () => {
    expect(
      isConventionalPluginRoot("/repo/modules/connections/providers/google")
    ).toBe(true);
  });

  it("rejects unrelated nesting", () => {
    expect(isConventionalPluginRoot("/repo/modules/connections/src")).toBe(
      false
    );
    expect(isConventionalPluginRoot("/repo/apps/core")).toBe(false);
  });
});
