// In-memory registry of `SearchIndexProvider`s keyed by stable id.
//
// Used by the host plugin loader to track every provider a module registers,
// route auto-tool calls, drive declarative re-index, and back the unified
// `/api/search-index/*` operator surface. Each registration carries the
// metadata needed by the admin surface (owning module, entity name, system
// flag, capabilities snapshot) so the list route can answer without poking
// each provider for `id`/`capabilities`.

import type {
  SearchIndexProvider,
  SearchIndexProviderConfig,
  SearchProviderCapabilities,
} from "./contracts.js";

// Operator-facing snapshot of a provider registration. The host fills this in
// from `PluginSearchIndexRegistrationOptions` at register time; the registry
// caches it so list/status/backfill routes do not need to walk plugin manifests.
export interface SearchIndexRegistrationMetadata {
  capabilities: SearchProviderCapabilities;
  // Effective retrieval config snapshot (managed sources); undefined for
  // hand-rolled providers that do not report one.
  config?: SearchIndexProviderConfig;
  // Singular noun the synthesized op uses (`contact`, `article`, `chat_thread`).
  entityName: string;
  // True for tenant-less / cross-tenant providers (e.g. core api-catalog).
  // Admin UI gates these behind the superadmin scope.
  isSystem: boolean;
  // Stable owning module id (`contacts`, `knowledge-base`, `core`, `ai`).
  moduleId: string;
  // Synthesized operation id, or undefined when registered with `skipAutoTool`.
  operationId?: string;
  // ISO timestamp of registration; updated on re-register after a plugin reload.
  registeredAt: string;
  // Provider's reported version; defaults to `"1"` when the provider does not set one.
  version: string;
}

export interface SearchIndexRegistration {
  metadata: SearchIndexRegistrationMetadata;
  provider: SearchIndexProvider;
}

export interface SearchIndexRegistry {
  get(id: string): SearchIndexProvider | undefined;
  getRegistration(id: string): SearchIndexRegistration | undefined;
  has(id: string): boolean;
  list(): SearchIndexProvider[];
  listRegistrations(): SearchIndexRegistration[];
  register(
    provider: SearchIndexProvider,
    metadata?: Partial<SearchIndexRegistrationMetadata>
  ): SearchIndexRegistration;
  unregister(id: string): boolean;
}

export function createSearchIndexRegistry(): SearchIndexRegistry {
  const entries = new Map<string, SearchIndexRegistration>();
  return {
    get(id) {
      return entries.get(id)?.provider;
    },
    getRegistration(id) {
      return entries.get(id);
    },
    has(id) {
      return entries.has(id);
    },
    list() {
      return [...entries.values()].map((entry) => entry.provider);
    },
    listRegistrations() {
      return [...entries.values()];
    },
    register(provider, metadata) {
      const id = provider.id?.trim();
      if (!id) {
        throw new Error("SearchIndexProvider.id is required");
      }
      if (entries.has(id)) {
        throw new Error(`SearchIndexProvider already registered: ${id}`);
      }
      const resolved: SearchIndexRegistrationMetadata = {
        capabilities: metadata?.capabilities ?? provider.capabilities ?? {},
        config: metadata?.config ?? provider.config,
        entityName: metadata?.entityName ?? id,
        isSystem: metadata?.isSystem ?? false,
        moduleId: metadata?.moduleId ?? id.split(".")[0] ?? id,
        operationId: metadata?.operationId,
        registeredAt: metadata?.registeredAt ?? new Date().toISOString(),
        version: metadata?.version ?? provider.version ?? "1",
      };
      const registration: SearchIndexRegistration = {
        metadata: resolved,
        provider,
      };
      entries.set(id, registration);
      return registration;
    },
    unregister(id) {
      return entries.delete(id);
    },
  };
}
