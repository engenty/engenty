// Plugin factory and public surface for `@engenty/context-graph`.
//
// The factory mirrors `@engenty/tenant-settings`: no-op when no database
// adapter is available so non-DB build/test contexts still boot.
//
// The graph package owns three singletons that need to outlive any single
// plugin: the in-memory `OntologyRegistry`, the Supabase-backed
// `ContextGraphRepo`, and the merged `ContextGraphServerApi`. Plugin hosts
// (apps/core) create them once via `createContextGraphHost` and install
// `registerContextGraphSchema` / `contextGraph` onto every plugin's
// `engenty.server`.

import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import { registerContextGraphApi } from "./src/api/index.js";
import type { ContextGraphServerApi } from "./src/server-api.js";
import type { ContextGraphSourceRegistry } from "./src/source-registry.js";

export { registerContextGraphApi } from "./src/api/index.js";

export type {
  ContextGraphEventBinding,
  ContextGraphSchemaRegistration,
  ContextGraphUpsertInput,
  EdgeRow,
  EdgeTypeSpec,
  EntityRow,
  EntityTypeSpec,
  ExternalRef,
} from "./src/contracts.js";
export type {
  ContextGraphRepo,
  DeleteEdgeInput,
  DeleteEntityInput,
  GetEntityInput,
  ListEdgesInput,
  ListEntitiesInput,
  UpdateEntityInput,
  UpsertEdgeInput,
  UpsertEntityInput,
} from "./src/dal/contracts.js";
export { createContextGraphRepoSupabase } from "./src/dal/supabase.js";
export { attachContextGraphEventBindings } from "./src/event-binding.js";
export {
  type CreateContextGraphHostInput,
  createContextGraphHost,
  type RegisterContextGraphSchema,
} from "./src/host.js";
export {
  createOntologyRegistry,
  type OntologyEdgeType,
  type OntologyEntityType,
  type OntologyRegistry,
  type OntologySnapshot,
} from "./src/registry.js";
export {
  type ContextGraphServerApi,
  createContextGraphServerApi,
  type DeleteEdgeArgs,
  type DeleteEntityArgs,
  type GetEntityArgs,
  type ListEdgesArgs,
  type UpdateEntityArgs,
  type UpsertEdgeArgs,
  type UpsertEntityArgs,
} from "./src/server-api.js";
export {
  type ContextGraphSourceRegistry,
  createContextGraphSourceRegistry,
} from "./src/source-registry.js";

// The plugin factory mounts the HTTP routes. Shared singletons (registry, repo,
// server API, source registry) are created once by the plugin host
// (`apps/core/src/plugins/loader.ts`) and injected via `engenty.server`.
// No DB adapter ⇒ no API surface ⇒ no routes (boot-without-DB stays clean).
const registerContextGraphPlugin: EngentyPluginFactory = (engenty) => {
  const api = engenty.server.contextGraph;
  if (!api) {
    return;
  }
  // SDK uses `unknown` returns to avoid pulling row types into plugin-sdk;
  // the concrete singleton wired by `apps/core` is `ContextGraphServerApi`.
  registerContextGraphApi({
    api: api as unknown as ContextGraphServerApi,
    server: engenty.server,
    sourceRegistry: engenty.server.contextGraphSources as
      | ContextGraphSourceRegistry
      | undefined,
  });
};

export default registerContextGraphPlugin;
