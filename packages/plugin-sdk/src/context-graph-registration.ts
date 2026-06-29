// Plugin SDK contract for declarative context-graph schema and source registration.
//
// Modules that want to participate in the shared typed graph
// (`@engenty/context-graph`) register entity/edge types — and optional
// lifecycle event bindings — through
// `engenty.server.registerContextGraphSchema(...)`. The host translates the
// registration into:
//
//   1. A merge into the in-memory ontology registry (entity + edge type
//      specs). Duplicate ids fail at boot.
//
//   2. Optional auto-subscriptions to module events via
//      `engenty.events.modules.on(...)` that call
//      `engenty.server.contextGraph.upsertEntity` / `deleteEntity` /
//      `upsertEdge` so the graph stays in sync with the canonical module
//      rows without each module re-implementing the same plumbing.
//
// Modules that can bulk-backfill data into the graph (e.g. contacts, team)
// additionally register a `ContextGraphSourceRegistration` via
// `engenty.server.registerContextGraphSource(...)`. This exposes dynamic
// status and sync HTTP routes without the context-graph package needing to
// know about individual modules.
//
// The matching server API surface and registry implementation live in
// `@engenty/context-graph`.

import type { ZodType } from "zod";
import type { PluginEventPayload } from "./plugin-events.js";

// Minimal shape of the context-graph server API that modules call into.
// Defined here so module code can stay free of a hard `@engenty/context-graph`
// import while still being fully type-safe.
export interface PluginContextGraphServerApi {
  deleteEdge(input: {
    objectId: string;
    subjectId: string;
    tenantId: string;
    type: string;
  }): Promise<void>;
  deleteEntity(
    input:
      | { externalRef: ExternalRef; tenantId: string }
      | { id: string; tenantId: string }
  ): Promise<void>;
  getEntity(
    input:
      | { externalRef: ExternalRef; tenantId: string }
      | { id: string; tenantId: string }
  ): Promise<unknown | null>;
  getOntology(): {
    edgeTypes: Record<string, unknown>;
    entityTypes: Record<string, unknown>;
  };
  listEdges(input: {
    fromEntityId?: string;
    tenantId: string;
    toEntityId?: string;
    type?: string;
  }): Promise<unknown[]>;
  listEntities(input: {
    entity?: string;
    externalId?: string;
    module?: string;
    tenantId: string;
    type?: string;
  }): Promise<unknown[]>;
  upsertEdge(input: {
    attributes?: Record<string, unknown>;
    objectId: string;
    subjectId: string;
    tenantId: string;
    type: string;
  }): Promise<unknown>;
  upsertEntity(input: {
    attributes?: Record<string, unknown>;
    externalRef?: ExternalRef;
    name?: string | null;
    tenantId: string;
    type: string;
  }): Promise<unknown>;
}

// Source registration: a module that can bulk-backfill entities/edges provides
// this contract. The context-graph package exposes the registered sources as
// dynamic HTTP routes without knowing about individual modules.
export interface ContextGraphSourceStatus {
  inGraph: number;
  inSource: number;
}

export interface ContextGraphSyncResult {
  edges: number;
  entities: number;
}

export interface ContextGraphSourceRegistration {
  description?: string;
  displayName: string;
  entityTypeIds?: string[];
  getStatus(
    api: PluginContextGraphServerApi,
    tenantId: string
  ): Promise<ContextGraphSourceStatus>;
  id: string;
  sync(
    api: PluginContextGraphServerApi,
    tenantId: string
  ): Promise<ContextGraphSyncResult>;
}

// `ExternalRef` is how modules point at a canonical row they already own
// (e.g. `{ module: "contacts", entity: "contact", id }`). Persisted as JSONB
// on `context_graph.entities.external_ref`.
export interface ExternalRef {
  entity: string;
  id: string;
  module: string;
}

export interface EntityTypeSpec {
  attributesSchema: ZodType;
  displayName: string;
  // Dotted lowercase id, e.g. "contacts.person". First segment is the
  // owning module id; second segment is the local type name.
  id: string;
}

export interface EdgeTypeSpec {
  attributesSchema?: ZodType;
  displayName: string;
  // Dotted lowercase id, e.g. "contacts_works_at".
  id: string;
  // Allowed entity type ids for the object endpoint. Must be non-empty.
  objectTypes: readonly string[];
  // Allowed entity type ids for the subject endpoint. Must be non-empty.
  subjectTypes: readonly string[];
}

// Optional declarative input for an `upsert` binding. The helper resolves the
// `entity` first (creating or updating the row) and then upserts each listed
// edge against the resolved entity, looking up the `other` side by external
// reference.
export interface ContextGraphUpsertInput {
  edges?: Array<{
    attributes?: Record<string, unknown>;
    direction: "in" | "out";
    other: ExternalRef;
    type: string;
  }>;
  entity: {
    attributes?: Record<string, unknown>;
    externalRef?: ExternalRef;
    name?: string;
    type: string;
  };
}

// One declarative trigger for `upsertEntity` / `deleteEntity`. Mirrors the
// `SearchIndexEventBinding` mental model.
export interface ContextGraphEventBinding<
  TPayload extends PluginEventPayload = PluginEventPayload,
> {
  action: "delete" | "upsert";
  // For `action: "delete"`: resolve which entity to remove. Required when
  // the binding's action is `delete`.
  externalRef?: (payload: TPayload) => ExternalRef | null | undefined;
  // For `action: "upsert"`: build the entity (and optional edges) to write.
  // Returning `null` is a no-op.
  load?: (
    payload: TPayload
  ) => Promise<ContextGraphUpsertInput | null> | ContextGraphUpsertInput | null;
  // Conventional `<module>.<entity>.<verb>` event name, e.g.
  // "contacts.contact.updated".
  name: string;
  // When true, the listener is only invoked when the emit context has a
  // tenantId. Defaults to true.
  tenantScoped?: boolean;
}

export interface ContextGraphSchemaRegistration {
  edgeTypes?: EdgeTypeSpec[];
  entityTypes?: EntityTypeSpec[];
  // Owning module id. Used for diagnostics and ownership tracking.
  moduleId: string;
  // Optional declarative bindings; omit to wire `engenty.events.modules.on`
  // by hand.
  onEvents?: ContextGraphEventBinding[];
}
