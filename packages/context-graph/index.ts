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
import { createContextGraphRepoSupabase } from "./src/dal/supabase.js";
import { createContextGraphHost } from "./src/host.js";
import { createOntologyRegistry } from "./src/registry.js";
import {
  type ContextGraphServerApi,
  createContextGraphServerApi,
} from "./src/server-api.js";
import { createContextGraphSourceRegistry } from "./src/source-registry.js";

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

// This plugin OWNS the shared context-graph singletons (ontology registry,
// Supabase-backed server API, source registry) and installs them on the host
// via `engenty.server.registerContextGraphHost(...)`. Core then delegates the
// `contextGraph` / `registerContextGraphSchema` / `registerContextGraphSource`
// surfaces here, so core carries no concrete `@engenty/context-graph` import.
//
// No DB adapter ⇒ no server API ⇒ host installed without a serverApi and no
// HTTP routes (boot-without-DB stays clean).
const registerContextGraphPlugin: EngentyPluginFactory = (engenty) => {
  const supabase = engenty.server.getDatabaseAdapter?.() ?? null;

  const registry = createOntologyRegistry();
  const sources = createContextGraphSourceRegistry();
  const serverApi: ContextGraphServerApi | undefined = supabase
    ? createContextGraphServerApi({
        registry,
        repo: createContextGraphRepoSupabase(supabase),
      })
    : undefined;

  // Install the host so core can expose the context-graph surfaces to every
  // plugin. `createSchemaRegistrar` binds the merge to the calling plugin's
  // events/module id for ownership and declarative `onEvents` subscriptions.
  engenty.server.registerContextGraphHost?.({
    serverApi,
    sources,
    createSchemaRegistrar: (events, moduleId) =>
      createContextGraphHost({ events, moduleId, registry, serverApi }),
  });

  if (!serverApi) {
    return;
  }
  registerContextGraphApi({
    api: serverApi,
    server: engenty.server,
    sourceRegistry: sources,
  });
};

export default registerContextGraphPlugin;
