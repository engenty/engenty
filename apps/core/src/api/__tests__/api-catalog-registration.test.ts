// Coverage for `registerCoreApiCatalogProvider`:
// - registers `core_api_catalog` against the plugin registry's
//   `searchIndexRegistry` (creating it if missing)
// - subscribes to `plugin.reload` and stamps `last_indexed_at`
// - dispose() unregisters the provider and removes the listener
// - tenant-admin/superadmin gating still hides system providers (covered
//   in `search-index-routes.test.ts`); here we just pin the metadata so
//   the registration-side defaults don't drift.

import { createPluginEventsRuntime } from "@engenty/plugin-sdk";
import {
  createSearchIndexRegistry,
  type SearchIndexRegistry,
} from "@engenty/search-index";
import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it, vi } from "vitest";
import type { PluginRegistry } from "../../plugins/registry.js";
import { CORE_API_CATALOG_PROVIDER_ID } from "../api-catalog-provider.js";
import { registerCoreApiCatalogProvider } from "../api-catalog-registration.js";

interface RegistryStub {
  eventsRuntime?: ReturnType<typeof createPluginEventsRuntime>;
  searchIndexRegistry?: SearchIndexRegistry;
}

function makeRegistry(opts: { withRegistry?: boolean } = {}): RegistryStub {
  return {
    searchIndexRegistry: opts.withRegistry
      ? createSearchIndexRegistry()
      : undefined,
    eventsRuntime: createPluginEventsRuntime(),
  };
}

describe("registerCoreApiCatalogProvider", () => {
  it("creates the search-index registry on demand and registers core.api_catalog with the expected metadata", async () => {
    const registry = makeRegistry();
    const handle = registerCoreApiCatalogProvider({
      app: new OpenAPIHono(),
      registry: registry as unknown as PluginRegistry,
      resolveTenantPluginOverrides: async () => ({}),
    });

    expect(registry.searchIndexRegistry).toBeTruthy();
    expect(handle.searchIndexRegistry).toBe(registry.searchIndexRegistry);
    const reg = registry.searchIndexRegistry?.getRegistration(
      CORE_API_CATALOG_PROVIDER_ID
    );
    expect(reg?.metadata).toMatchObject({
      entityName: "api_catalog",
      isSystem: false,
      moduleId: "core",
    });
    // No auto-tool synthesis: there must be no operationId because the
    // gateway method `core_api_catalog_search` already exists.
    expect(reg?.metadata.operationId).toBeUndefined();
  });

  it("stamps last_indexed_at on registration and again on plugin.reload", async () => {
    const registry = makeRegistry({ withRegistry: true });
    const handle = registerCoreApiCatalogProvider({
      app: new OpenAPIHono(),
      registry: registry as unknown as PluginRegistry,
      resolveTenantPluginOverrides: async () => ({}),
    });

    const provider = handle.searchIndexRegistry.get(
      CORE_API_CATALOG_PROVIDER_ID
    );
    expect(provider).toBeTruthy();
    const initial = await provider!.getStatus?.({});
    expect(initial?.last_indexed_at).toBeTruthy();
    const initialStamp = initial?.last_indexed_at;

    // Wait a tick so timestamps differ.
    await new Promise((resolve) => setTimeout(resolve, 5));

    await registry.eventsRuntime!.api.core.emit(
      "plugin.reload",
      {
        generation_id: 2,
        plugin_id: "contacts",
        status: "succeeded",
      },
      { sourceModuleId: "engenty-core" }
    );

    const after = await provider!.getStatus?.({});
    expect(after?.last_indexed_at).toBeTruthy();
    expect(after?.last_indexed_at).not.toBe(initialStamp);
  });

  it("dispose() unregisters the provider and removes the reload listener", async () => {
    const registry = makeRegistry({ withRegistry: true });
    const handle = registerCoreApiCatalogProvider({
      app: new OpenAPIHono(),
      registry: registry as unknown as PluginRegistry,
      resolveTenantPluginOverrides: async () => ({}),
    });

    expect(handle.searchIndexRegistry.has(CORE_API_CATALOG_PROVIDER_ID)).toBe(
      true
    );

    const stampSpy = vi.spyOn(handle, "markRebuilt");

    handle.dispose();

    expect(handle.searchIndexRegistry.has(CORE_API_CATALOG_PROVIDER_ID)).toBe(
      false
    );

    // Subsequent reloads must not call markRebuilt anymore.
    await registry.eventsRuntime!.api.core.emit(
      "plugin.reload",
      {
        generation_id: 3,
        plugin_id: "contacts",
        status: "succeeded",
      },
      { sourceModuleId: "engenty-core" }
    );
    expect(stampSpy).not.toHaveBeenCalled();
  });
});
