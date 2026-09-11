import type { UiPluginRegistrar } from "@engenty/ui-plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import {
  deriveUiPluginCatalogFromSummaries,
  type UiPluginCatalogEntry,
} from "./catalog";
import { uiPluginCatalog as generatedUiPluginCatalog } from "./generated-catalog";
import { resolveUiPlugins } from "./resolver";
import { createGeneratedUiPluginCatalogEntry } from "./runtime-ui-loader";

const Page = () => null;

function createGeneratedEntry(
  params: {
    loadModule?: () => Promise<Record<string, unknown>>;
    exportName?: string;
  } = {}
): UiPluginCatalogEntry {
  const uiPlugin: UiPluginRegistrar = (engenty) => {
    engenty.UI.registerRoute({
      id: "contacts_old",
      path: "/mdl/contacts/old",
      component: Page,
    });
  };
  return createGeneratedUiPluginCatalogEntry({
    pluginId: "contacts",
    importPath: "@engenty/contacts/ui/plugin",
    exportName: params.exportName ?? "default",
    loadModule: params.loadModule,
    loadStatic: async () => uiPlugin,
    optionalPluginIds: [],
    sourceInfo: {
      pluginId: "contacts",
      packageName: "@engenty/contacts",
      version: "0.0.1",
      sourceType: "module",
      rootDir: "modules/contacts",
      source: "@engenty/contacts/ui/plugin",
      manifestPath: "modules/contacts/engenty.plugin.json",
      manifestId: "contacts",
      registrationKind: "ui.plugin",
    },
  });
}

describe("deriveUiPluginCatalogFromSummaries", () => {
  it("includes bundled workspace module UI entries in the generated catalog", () => {
    const generatedIds = generatedUiPluginCatalog.map((entry) => entry.id);
    expect(generatedIds).toEqual(
      expect.arrayContaining([
        "auth-ui",
        "ai-ui",
        "engenty-copilot",
        "context-graph",
      ])
    );
    expect(generatedIds).not.toContain("engenty-remote");
    expect(generatedIds).not.toContain("team-chat-slack-bridge");
    expect(generatedIds).not.toContain("team-hr");
    expect(generatedIds).not.toContain("time-tracking");
  });

  it("falls back to the generated copilot entry when the server summary omits ui metadata", () => {
    const copilotEntry = generatedUiPluginCatalog.find(
      (entry) => entry.id === "engenty-copilot"
    );
    expect(copilotEntry).toBeDefined();

    const catalog = deriveUiPluginCatalogFromSummaries({
      generatedCatalog: copilotEntry ? [copilotEntry] : [],
      plugins: [
        {
          id: "engenty-copilot",
          enabled: true,
          loaded: true,
          manifestPath: "modules/engenty-copilot/engenty.plugin.json",
          capabilities: { ui: true },
        },
      ],
    });

    expect(catalog.map((entry) => entry.id)).toEqual(["engenty-copilot"]);
  });

  it("keeps copilot in the catalog for a conventional workspace UI manifest", () => {
    const copilotEntry = generatedUiPluginCatalog.find(
      (entry) => entry.id === "engenty-copilot"
    );
    expect(copilotEntry).toBeDefined();

    const catalog = deriveUiPluginCatalogFromSummaries({
      generatedCatalog: copilotEntry ? [copilotEntry] : [],
      plugins: [
        {
          id: "engenty-copilot",
          enabled: true,
          loaded: true,
          manifestPath: "modules/engenty-copilot/engenty.plugin.json",
          packageName: "@engenty/engenty-copilot",
          rootDir: "modules/engenty-copilot",
          sourceType: "module",
          capabilities: { ui: true },
          ui: {
            entry: "@engenty/engenty-copilot/ui/plugin",
            export: "default",
            load: "workspace",
          },
        },
      ],
    });

    expect(catalog.map((entry) => entry.id)).toEqual(["engenty-copilot"]);
  });

  it("refreshes manifest-derived metadata for a generated entry", async () => {
    const refreshedPlugin: UiPluginRegistrar = (engenty) => {
      engenty.UI.registerRoute({
        id: "contacts_refreshed",
        path: "/mdl/contacts/refreshed",
        component: Page,
      });
    };
    const loadModule = vi.fn(async () => ({
      contactsReloadedUiPlugin: refreshedPlugin,
    }));

    const catalog = deriveUiPluginCatalogFromSummaries({
      generatedCatalog: [createGeneratedEntry({ loadModule })],
      plugins: [
        {
          id: "contacts",
          enabled: true,
          loaded: true,
          generationId: 2,
          capabilities: { ui: true },
          optional: ["projects"],
          packageName: "@engenty/contacts",
          rootDir: "modules/contacts",
          sourceType: "module",
          manifestPath: "modules/contacts/engenty.plugin.json",
          ui: {
            entry: "@engenty/contacts/ui/plugin",
            export: "contactsReloadedUiPlugin",
            load: "workspace",
          },
          version: "0.0.2",
        },
      ],
    });

    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({
      optionalPluginIds: ["projects"],
      sourceInfo: {
        pluginId: "contacts",
        source: "@engenty/contacts/ui/plugin",
        version: "0.0.2",
      },
    });

    const resolved = await resolveUiPlugins({
      catalog,
      plugins: [
        { id: "contacts", enabled: true, loaded: true, generationId: 2 },
      ],
    });

    expect(loadModule).toHaveBeenCalledTimes(1);
    expect(resolved.contributions.routes[0]?.path).toBe(
      "/mdl/contacts/refreshed"
    );
    expect(resolved.contributions.routes[0]?.sourceInfo).toMatchObject({
      generationId: 2,
      pluginId: "contacts",
      registrationKind: "ui.route",
    });
  });

  it("removes a stale generated entry when the active manifest no longer declares UI", () => {
    const catalog = deriveUiPluginCatalogFromSummaries({
      generatedCatalog: [createGeneratedEntry()],
      plugins: [
        {
          id: "contacts",
          enabled: true,
          loaded: true,
          manifestPath: "modules/contacts/engenty.plugin.json",
        },
      ],
    });

    expect(catalog.map((entry) => entry.id)).toEqual([]);
  });

  it("keeps generated UI-only entries that are injected without backend manifest metadata", () => {
    const catalog = deriveUiPluginCatalogFromSummaries({
      generatedCatalog: [createGeneratedEntry()],
      plugins: [{ id: "contacts", enabled: true, loaded: true }],
    });

    expect(catalog.map((entry) => entry.id)).toEqual(["contacts"]);
  });

  it("does not use a stale generated import when manifest UI entry changes", async () => {
    const catalog = deriveUiPluginCatalogFromSummaries({
      generatedCatalog: [createGeneratedEntry({ loadModule: vi.fn() })],
      plugins: [
        {
          id: "contacts",
          enabled: true,
          loaded: true,
          generationId: 3,
          capabilities: { ui: true },
          ui: {
            entry: "@engenty/contacts/ui/alternate-uiPlugin",
            export: "default",
            load: "workspace",
          },
        },
      ],
    });

    const resolved = await resolveUiPlugins({
      catalog,
      plugins: [
        { id: "contacts", enabled: true, loaded: true, generationId: 3 },
      ],
    });

    expect(resolved.contributions.routes).toHaveLength(0);
    expect(resolved.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "plugin.ui.workspace_import_missing",
        pluginId: "contacts",
      })
    );
  });

  it("derives runtime UI entries without using generated static imports", async () => {
    const loadModule = vi.fn(async () => ({
      default: (() => undefined) satisfies UiPluginRegistrar,
    }));
    const catalog = deriveUiPluginCatalogFromSummaries({
      generatedCatalog: [createGeneratedEntry({ loadModule })],
      plugins: [
        {
          id: "contacts",
          enabled: true,
          loaded: true,
          generationId: 7,
          capabilities: { ui: true },
          ui: {
            entry: "./dist/ui/plugin.js",
            export: "default",
            load: "runtime",
          },
        },
      ],
    });

    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.id).toBe("contacts");
    expect(catalog[0]?.sourceInfo).toMatchObject({
      pluginId: "contacts",
      source: "./dist/ui/plugin.js",
    });
    expect(loadModule).not.toHaveBeenCalled();
  });

  it("derives runtime UI entries with packaged local CSS assets", async () => {
    const loadModule = vi.fn(async () => ({
      default: (() => undefined) satisfies UiPluginRegistrar,
    }));
    const catalog = deriveUiPluginCatalogFromSummaries({
      generatedCatalog: [createGeneratedEntry({ loadModule })],
      plugins: [
        {
          id: "contacts",
          enabled: true,
          loaded: true,
          generationId: 7,
          capabilities: { ui: true },
          ui: {
            entry: "./dist/ui/plugin.js",
            export: "default",
            load: "runtime",
            staticAssets: ["./dist/ui/contacts.css"],
            assetOrigins: ["self"],
          },
        },
      ],
    });

    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.id).toBe("contacts");
    expect(catalog[0]?.sourceInfo).toMatchObject({
      pluginId: "contacts",
      source: "./dist/ui/plugin.js",
    });
    expect(loadModule).not.toHaveBeenCalled();
  });

  it("blocks runtime UI entries that are not compiled local artifacts", async () => {
    const catalog = deriveUiPluginCatalogFromSummaries({
      generatedCatalog: [createGeneratedEntry()],
      plugins: [
        {
          id: "contacts",
          enabled: true,
          loaded: true,
          generationId: 8,
          capabilities: { ui: true },
          ui: {
            entry: "@engenty/contacts/ui/plugin",
            export: "default",
            load: "runtime",
          },
        },
      ],
    });

    const resolved = await resolveUiPlugins({
      catalog,
      plugins: [
        { id: "contacts", enabled: true, loaded: true, generationId: 8 },
      ],
    });

    expect(resolved.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "plugin.ui.runtime_entry_invalid",
        pluginId: "contacts",
      })
    );
  });

  it("blocks generated package imports that are not trusted for browser execution", async () => {
    const loadModule = vi.fn(async () => ({
      default: (() => undefined) satisfies UiPluginRegistrar,
    }));
    const catalog = deriveUiPluginCatalogFromSummaries({
      generatedCatalog: [
        {
          ...createGeneratedEntry({ loadModule }),
          sourceInfo: {
            pluginId: "contacts",
            packageName: "third-party-contacts",
            version: "0.0.1",
            sourceType: "package",
            rootDir: "node_modules/third-party-contacts",
            source: "third-party-contacts/ui",
            manifestPath:
              "node_modules/third-party-contacts/engenty.plugin.json",
            manifestId: "contacts",
            registrationKind: "ui.plugin",
          },
        },
      ],
      plugins: [
        {
          id: "contacts",
          enabled: true,
          loaded: true,
          generationId: 4,
          capabilities: { ui: true },
          packageName: "third-party-contacts",
          rootDir: "node_modules/third-party-contacts",
          sourceType: "package",
          ui: {
            entry: "@engenty/contacts/ui/plugin",
            export: "default",
            load: "workspace",
          },
        },
      ],
    });

    const resolved = await resolveUiPlugins({
      catalog,
      plugins: [
        { id: "contacts", enabled: true, loaded: true, generationId: 4 },
      ],
    });

    expect(loadModule).not.toHaveBeenCalled();
    expect(resolved.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "plugin.ui.trust_blocked",
        pluginId: "contacts",
      })
    );
  });

  it("blocks manifest UI entries that do not declare the UI capability", async () => {
    const loadModule = vi.fn(async () => ({
      default: (() => undefined) satisfies UiPluginRegistrar,
    }));
    const catalog = deriveUiPluginCatalogFromSummaries({
      generatedCatalog: [createGeneratedEntry({ loadModule })],
      plugins: [
        {
          id: "contacts",
          enabled: true,
          loaded: true,
          generationId: 5,
          packageName: "@engenty/contacts",
          rootDir: "modules/contacts",
          sourceType: "module",
          ui: {
            entry: "@engenty/contacts/ui/plugin",
            export: "default",
          },
        },
      ],
    });

    const resolved = await resolveUiPlugins({
      catalog,
      plugins: [
        { id: "contacts", enabled: true, loaded: true, generationId: 5 },
      ],
    });

    expect(loadModule).not.toHaveBeenCalled();
    expect(resolved.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "plugin.ui.capability_blocked",
        pluginId: "contacts",
      })
    );
  });

  it("blocks generated UI entries with unsupported static asset origins", async () => {
    const loadModule = vi.fn(async () => ({
      default: (() => undefined) satisfies UiPluginRegistrar,
    }));
    const catalog = deriveUiPluginCatalogFromSummaries({
      generatedCatalog: [createGeneratedEntry({ loadModule })],
      plugins: [
        {
          id: "contacts",
          enabled: true,
          loaded: true,
          generationId: 6,
          capabilities: { ui: true },
          packageName: "@engenty/contacts",
          rootDir: "modules/contacts",
          sourceType: "module",
          ui: {
            entry: "@engenty/contacts/ui/plugin",
            export: "default",
            staticAssets: ["https://cdn.example.test/contacts.css"],
            assetOrigins: ["https://cdn.example.test"],
          },
        },
      ],
    });

    const resolved = await resolveUiPlugins({
      catalog,
      plugins: [
        { id: "contacts", enabled: true, loaded: true, generationId: 6 },
      ],
    });

    expect(loadModule).not.toHaveBeenCalled();
    expect(resolved.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "plugin.ui.static_asset_origin_blocked",
        pluginId: "contacts",
      })
    );
  });
});
