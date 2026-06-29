import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertUiWorkspaceDependencies,
  collectChangedGeneratedArtifacts,
  collectMissingUiWorkspaceDependencies,
  createUiCatalogSourceInfo,
  enrichManifestForUiArtifacts,
  getPackageNameFromUiImportPath,
  normalizeAndSortUiPlugins,
  normalizeManifestUiEntry,
  renderCatalog,
  renderTailwindSources,
} from "./plugin-artifact-generator-lib.mjs";

describe("plugin-artifact-generator-lib", () => {
  it("sorts core ui plugins before others", () => {
    const result = normalizeAndSortUiPlugins([
      { id: "projects" },
      { id: "user-management-ui" },
      { id: "auth-ui" },
      { id: "contacts" },
    ]);

    expect(result.map((entry) => entry.id)).toEqual([
      "auth-ui",
      "user-management-ui",
      "contacts",
      "projects",
    ]);
  });

  it("sorts optional peer plugins before dependents", () => {
    const result = normalizeAndSortUiPlugins([
      { id: "projects", optionalPluginIds: ["team"] },
      { id: "team" },
    ]);

    expect(result.map((entry) => entry.id)).toEqual(["team", "projects"]);
  });

  it("renders catalog with lazy imports", () => {
    const output = renderCatalog([
      {
        id: "contacts",
        importPath: "@engenty/contacts/ui",
        optionalPluginIds: ["projects"],
        exportName: "default",
      },
    ]);

    expect(output).toContain(
      'import type { UiPluginCatalogEntry } from "./catalog";'
    );
    expect(output).toContain(
      'import { createGeneratedUiPluginCatalogEntry } from "./runtime-ui-loader";'
    );
    expect(output).toContain("createGeneratedUiPluginCatalogEntry");
    expect(output).toContain('pluginId: "contacts"');
    expect(output).toContain('import("@engenty/contacts/ui")');
    expect(output).toContain(".default");
    expect(output).toContain('optionalPluginIds: ["projects"]');
  });

  it("derives package names from generated UI import paths", () => {
    expect(getPackageNameFromUiImportPath("@engenty/contacts/ui/plugin")).toBe(
      "@engenty/contacts"
    );
    expect(getPackageNameFromUiImportPath("react-router-dom")).toBe(
      "react-router-dom"
    );
    expect(getPackageNameFromUiImportPath("./local-module")).toBeNull();
    expect(getPackageNameFromUiImportPath("/absolute/module")).toBeNull();
  });

  it("reports missing workspace dependencies for generated UI imports", () => {
    const missing = collectMissingUiWorkspaceDependencies({
      entries: [
        { importPath: "@engenty/contacts/ui/plugin", load: "workspace" },
        { importPath: "@engenty/projects/ui/plugin", load: "workspace" },
        {
          importPath: "@engenty/runtime-ui/dist/plugin.js",
          load: "runtime",
        },
        { importPath: "external-package/ui" },
      ],
      uiPackageManifest: {
        dependencies: {
          "@engenty/projects": "workspace:*",
        },
      },
      workspacePackageNames: [
        "@engenty/contacts",
        "@engenty/projects",
        "@engenty/runtime-ui",
        "external-workspace-package",
      ],
    });

    expect(missing).toEqual(["@engenty/contacts"]);
    expect(() =>
      assertUiWorkspaceDependencies({
        entries: [
          { importPath: "@engenty/contacts/ui/plugin", load: "workspace" },
        ],
        uiPackageManifest: { dependencies: {} },
        workspacePackageNames: ["@engenty/contacts"],
      })
    ).toThrow('Add "@engenty/contacts": "workspace:*" to apps/ui/package.json');
  });

  it("collects generated artifacts whose content changed", () => {
    expect(
      collectChangedGeneratedArtifacts([
        {
          filePath: "apps/ui/src/plugins/generated-catalog.ts",
          expectedContent: "new",
          actualContent: "old",
        },
        {
          filePath: "apps/ui/src/plugins/generated-tailwind-sources.css",
          expectedContent: "same",
          actualContent: "same",
        },
      ])
    ).toEqual(["apps/ui/src/plugins/generated-catalog.ts"]);
  });

  it("renders catalog source info for provenance diagnostics", () => {
    const sourceInfo = createUiCatalogSourceInfo({
      entry: {
        id: "contacts",
        importPath: "@engenty/contacts/ui/plugin",
      },
      manifestPath: "/tmp/repo/modules/contacts/engenty.plugin.json",
      packageManifest: {
        name: "@engenty/contacts",
        version: "0.0.1",
      },
      pkgDir: "/tmp/repo/modules/contacts",
      repoRootDir: "/tmp/repo",
      sourceType: "module",
    });

    expect(sourceInfo).toEqual({
      pluginId: "contacts",
      packageName: "@engenty/contacts",
      version: "0.0.1",
      sourceType: "module",
      rootDir: "modules/contacts",
      source: "@engenty/contacts/ui/plugin",
      manifestPath: "modules/contacts/engenty.plugin.json",
      manifestId: "contacts",
      registrationKind: "ui.plugin",
    });

    const output = renderCatalog([
      {
        id: "contacts",
        importPath: "@engenty/contacts/ui/plugin",
        optionalPluginIds: [],
        exportName: "default",
        sourceInfo,
      },
    ]);

    expect(output).toContain('"registrationKind":"ui.plugin"');
    expect(output).toContain(
      '"manifestPath":"modules/contacts/engenty.plugin.json"'
    );
  });

  it("deduplicates and normalizes tailwind sources", () => {
    const uiSrcDir = path.resolve("/tmp/repo/apps/ui/src");
    const output = renderTailwindSources({
      uiSrcDir,
      staticTailwindSources: [
        path.resolve("/tmp/repo/packages/ui-core/src"),
        path.resolve("/tmp/repo/packages/ui-core/src"),
      ],
      entries: [
        {
          tailwindSources: [path.resolve("/tmp/repo/modules/contacts/ui")],
        },
      ],
    });

    const sourceLines = output
      .split("\n")
      .filter((line) => line.startsWith("@source"));

    expect(sourceLines).toEqual([
      '@source "../../../modules/contacts/ui";',
      '@source "../../../packages/ui-core/src";',
    ]);
  });

  it("derives manifest id from modules/* path when engenty.plugin.json omits id", () => {
    const pkgDir = path.resolve("/tmp/repo/modules/hello-world");
    const enriched = enrichManifestForUiArtifacts({
      manifest: {
        ui: {
          entry: "@engenty/hello-world/ui/plugin",
          export: "helloWorldUiPlugin",
          load: "workspace",
          tailwindSources: ["./ui"],
        },
        capabilities: { ui: true },
        provides: ["module.hello-world"],
      },
      pkgDir,
    });

    expect(enriched.id).toBe("hello-world");

    const entry = normalizeManifestUiEntry({
      pkgDir,
      manifestPath: path.join(pkgDir, "engenty.plugin.json"),
      manifest: enriched,
    });

    expect(entry?.id).toBe("hello-world");
  });

  it("infers conventional UI plugin metadata from ui/plugin.ts", () => {
    const tmpRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "engenty-ui-plugin-")
    );
    try {
      const pkgDir = path.join(tmpRoot, "modules", "contacts");
      fs.mkdirSync(path.join(pkgDir, "ui"), { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({ name: "@engenty/contacts" })
      );
      fs.writeFileSync(
        path.join(pkgDir, "ui", "plugin.ts"),
        "export default function plugin() {}"
      );

      const entry = normalizeManifestUiEntry({
        pkgDir,
        manifestPath: path.join(pkgDir, "engenty.plugin.json"),
        manifest: {
          optional: ["module.projects"],
          ui: {},
        },
      });

      expect(entry).toMatchObject({
        id: "contacts",
        importPath: "@engenty/contacts/ui/plugin",
        load: "workspace",
        exportName: "default",
        optionalPluginIds: ["projects"],
      });
      expect(entry?.tailwindSources).toEqual([path.join(pkgDir, "ui")]);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("normalizes UI catalog metadata from engenty.plugin.json", () => {
    const pkgDir = path.resolve("/tmp/repo/modules/contacts");
    const entry = normalizeManifestUiEntry({
      pkgDir,
      manifestPath: path.join(pkgDir, "engenty.plugin.json"),
      manifest: {
        id: "contacts",
        optional: ["module.projects", "team"],
        ui: {
          entry: "@engenty/contacts/ui/plugin",
          export: "default",
          load: "workspace",
          tailwindSources: ["./ui"],
        },
      },
    });

    expect(entry).toEqual({
      id: "contacts",
      importPath: "@engenty/contacts/ui/plugin",
      load: "workspace",
      exportName: "default",
      optionalPluginIds: ["projects", "team"],
      tailwindSources: [path.resolve(pkgDir, "ui")],
    });
  });

  it("normalizes runtime UI catalog metadata", () => {
    const pkgDir = path.resolve("/tmp/repo/node_modules/runtime-plugin");
    const entry = normalizeManifestUiEntry({
      pkgDir,
      manifestPath: path.join(pkgDir, "engenty.plugin.json"),
      manifest: {
        id: "runtime-plugin",
        ui: {
          entry: "./dist/ui/plugin.js",
          export: "default",
          load: "runtime",
        },
      },
    });

    expect(entry).toMatchObject({
      id: "runtime-plugin",
      importPath: "./dist/ui/plugin.js",
      load: "runtime",
      exportName: "default",
    });
  });

  it("defaults tailwindSources to ./src for conventional packages/* without ./ui", () => {
    const tmpRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "engenty-pkg-tailwind-")
    );
    try {
      const pkgDir = path.join(tmpRoot, "packages", "pkg-tw");
      fs.mkdirSync(path.join(pkgDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({ name: "@engenty/pkg-tw" })
      );
      const entry = normalizeManifestUiEntry({
        pkgDir,
        manifestPath: path.join(pkgDir, "engenty.plugin.json"),
        manifest: {
          id: "pkg-tw",
          ui: {
            entry: "@engenty/pkg-tw/plugin",
            load: "workspace",
          },
        },
      });
      expect(entry?.tailwindSources).toEqual([path.join(pkgDir, "src")]);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
