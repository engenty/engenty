// Boot-time registration for the `core_api_catalog` SearchIndexProvider.
//
// Wires the provider into the shared `SearchIndexRegistry` (creating the
// registry if discovery has not done so yet) so the unified
// `/api/search-index/*` admin surface and any in-process consumer can see
// it. Subscribes to `plugin.reload` so the operator-facing
// `last_indexed_at` timestamp advances after dev/HMR/admin reloads.
//
// `plugin.loaded` and friends are declared in the SDK but not actually
// emitted by the core loader today (only `plugin.shutdown` and
// `plugin.reload` are produced). We compensate with a one-shot
// `markRebuilt()` at registration time so a fresh boot has a sensible
// timestamp without waiting for the first reload.

import type { EngentyApiCatalogInput } from "@engenty/ai-core";
import {
  createSearchIndexRegistry,
  type SearchIndexRegistry,
} from "@engenty/search-index";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { PluginRegistry } from "../plugins/registry.js";
import { buildApiCatalog } from "./api-catalog.js";
import {
  CORE_API_CATALOG_PROVIDER_ID,
  createCoreApiCatalogSearchIndexProvider,
} from "./api-catalog-provider.js";

export interface RegisterCoreApiCatalogProviderParams {
  app: OpenAPIHono;
  registry: PluginRegistry;
  resolveTenantPluginOverrides: (
    tenantId: string | null
  ) => Promise<Record<string, boolean>>;
}

export interface CoreApiCatalogRegistrationHandle {
  dispose: () => void;
  markRebuilt: () => void;
  searchIndexRegistry: SearchIndexRegistry;
}

export function registerCoreApiCatalogProvider(
  params: RegisterCoreApiCatalogProviderParams
): CoreApiCatalogRegistrationHandle {
  const searchIndexRegistry =
    params.registry.searchIndexRegistry ?? createSearchIndexRegistry();
  params.registry.searchIndexRegistry = searchIndexRegistry;

  // Build the catalog inside a closure so OpenAPI doc + tenant overrides
  // are resolved per-call. The OpenAPI doc is built lazily because the
  // Hono app accumulates routes during boot and we want the latest set.
  const handle = createCoreApiCatalogSearchIndexProvider({
    buildApiCatalog: async ({
      input,
      tenantId,
    }: {
      input: EngentyApiCatalogInput;
      tenantId?: string | null;
    }) =>
      buildApiCatalog({
        input,
        openApiDocument: params.app.getOpenAPIDocument({
          openapi: "3.0.0",
          info: {
            title: "Engenty API",
            version: "0.0.1",
            description:
              "Core API with plugin-registered routes and gateway methods.",
          },
        }) as Parameters<typeof buildApiCatalog>[0]["openApiDocument"],
        registry: params.registry,
        tenantId: tenantId ?? null,
        tenantPluginOverrides: tenantId
          ? await params.resolveTenantPluginOverrides(tenantId)
          : {},
      }),
  });

  // Skip auto-tool synthesis: `core_api_catalog_search` already exists as a
  // gateway method (registered in `registerCoreMethods`) and the agent tool
  // catalog must not show two operations for the same surface.
  if (!searchIndexRegistry.has(CORE_API_CATALOG_PROVIDER_ID)) {
    searchIndexRegistry.register(handle.provider, {
      entityName: "api_catalog",
      isSystem: false,
      moduleId: "core",
      // Explicitly clear operationId so the listing surface shows
      // "skipAutoTool" rather than a fake op id.
    });
  }

  // Initial stamp so operators see a fresh `last_indexed_at` on boot;
  // `plugin.reload` subscribers will keep it current after that.
  handle.markRebuilt();

  const reloadSub = params.registry.eventsRuntime?.api.core.on(
    "plugin.reload",
    () => {
      handle.markRebuilt();
    },
    { tenantScoped: false }
  );

  return {
    dispose: () => {
      reloadSub?.dispose();
      searchIndexRegistry.unregister(CORE_API_CATALOG_PROVIDER_ID);
    },
    markRebuilt: handle.markRebuilt,
    searchIndexRegistry,
  };
}
