import type { UiPluginRegistrar } from "@engenty/ui-plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import {
  createDeferredRuntimeUiPluginLoader,
  createGeneratedUiPluginLoader,
  createRuntimeUiPluginLoader,
  UiPluginRuntimeLoadError,
} from "./runtime-ui-loader";

const uiPlugin: UiPluginRegistrar = () => undefined;

describe("runtime UI loader", () => {
  it("caches generated catalog imports by plugin generation", async () => {
    const loadStatic = vi.fn(async () => uiPlugin);
    const loadUiPlugin = createGeneratedUiPluginLoader({
      importPath: "@engenty/contacts/ui/plugin",
      loadStatic,
      pluginId: "contacts",
      exportName: "default",
    });

    await loadUiPlugin({ generationId: 1 });
    await loadUiPlugin({ generationId: 1 });
    await loadUiPlugin({ generationId: 2 });

    expect(loadStatic).toHaveBeenCalledTimes(2);
  });

  it("rejects stale generation loads without caching them", async () => {
    let activeGenerationId = 2;
    const loadStatic = vi.fn(async () => uiPlugin);
    const loadUiPlugin = createGeneratedUiPluginLoader({
      importPath: "@engenty/contacts/ui/plugin",
      loadStatic,
      pluginId: "contacts",
      exportName: "default",
    });
    const context = {
      generationId: 1,
      isGenerationCurrent: (generationId: number | undefined) =>
        generationId === activeGenerationId,
    };

    await expect(loadUiPlugin(context)).rejects.toMatchObject({
      code: "plugin.ui.stale_generation",
      pluginId: "contacts",
    });
    expect(loadStatic).not.toHaveBeenCalled();

    activeGenerationId = 1;
    await expect(loadUiPlugin(context)).resolves.toBe(uiPlugin);
    expect(loadStatic).toHaveBeenCalledTimes(1);
  });

  it("rejects loads that become stale while the generated import resolves", async () => {
    let activeGenerationId = 1;
    const loadUiPlugin = createGeneratedUiPluginLoader({
      importPath: "@engenty/contacts/ui/plugin",
      loadStatic: async () => {
        activeGenerationId = 2;
        return uiPlugin;
      },
      pluginId: "contacts",
      exportName: "default",
    });

    await expect(
      loadUiPlugin({
        generationId: 1,
        isGenerationCurrent: (generationId) =>
          generationId === activeGenerationId,
      })
    ).rejects.toBeInstanceOf(UiPluginRuntimeLoadError);
  });

  it("keeps runtime bundle loading behind an explicit deferred boundary", async () => {
    const loadUiPlugin = createDeferredRuntimeUiPluginLoader({
      importPath: "./dist/ui/plugin.js",
      pluginId: "third-party",
    });

    await expect(loadUiPlugin()).rejects.toMatchObject({
      code: "plugin.ui.runtime_bundle_deferred",
      pluginId: "third-party",
    });
  });

  it("imports runtime UI bundles through the same-origin plugin endpoint", async () => {
    const importRuntimeModule = vi.fn(async () => ({
      helloWorldUiPlugin: uiPlugin,
    }));
    const loadUiPlugin = createRuntimeUiPluginLoader({
      importRuntimeModule,
      importUrl: "/api/plugins/hello-world/ui/plugin.js",
      pluginId: "hello-world",
      exportName: "helloWorldUiPlugin",
      staticAssetUrls: ["/api/plugins/hello-world/ui/assets/0/hello-world.css"],
    });

    await expect(loadUiPlugin({ generationId: 4 })).resolves.toBe(uiPlugin);
    await loadUiPlugin({ generationId: 4 });
    await loadUiPlugin({ generationId: 5 });

    expect(importRuntimeModule).toHaveBeenCalledTimes(2);
    expect(importRuntimeModule).toHaveBeenNthCalledWith(
      1,
      "/api/plugins/hello-world/ui/plugin.js?generationId=4"
    );
    expect(importRuntimeModule).toHaveBeenNthCalledWith(
      2,
      "/api/plugins/hello-world/ui/plugin.js?generationId=5"
    );
  });
});
