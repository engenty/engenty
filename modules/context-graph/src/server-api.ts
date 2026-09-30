// `engenty.server.contextGraph` server API. Writes validate against the
// `OntologyRegistry` before hitting the DAL — bad types or attribute shapes
// throw before any database write. `upsertEdge` reads both endpoints so the
// registry can enforce subject/object constraints with the stored types.
// `listEntities` / `getOntology` are inspection-only.

import type { EdgeRow, EntityRow } from "./contracts.js";
import type {
  ContextGraphRepo,
  DeleteEdgeInput,
  DeleteEntityInput,
  GetEntityInput,
  ListEdgesInput,
  ListEntitiesInput,
  UpdateEntityInput,
  UpsertEdgeInput,
  UpsertEntityInput,
} from "./dal/contracts.js";
import type { OntologyRegistry, OntologySnapshot } from "./registry.js";

export type { ExternalRef } from "@engenty/plugin-sdk";
export type {
  DeleteEdgeInput as DeleteEdgeArgs,
  DeleteEntityInput as DeleteEntityArgs,
  GetEntityInput as GetEntityArgs,
  ListEdgesInput as ListEdgesArgs,
  ListEntitiesInput as ListEntitiesArgs,
  UpdateEntityInput as UpdateEntityArgs,
  UpsertEdgeInput as UpsertEdgeArgs,
  UpsertEntityInput as UpsertEntityArgs,
} from "./dal/contracts.js";

export interface ContextGraphServerApi {
  deleteEdge(input: DeleteEdgeInput): Promise<void>;
  deleteEdgeById(input: { id: string; tenantId: string }): Promise<void>;
  deleteEntity(input: DeleteEntityInput): Promise<void>;
  getEntity(input: GetEntityInput): Promise<EntityRow | null>;
  getOntology(): OntologySnapshot;
  listEdges(input: ListEdgesInput): Promise<EdgeRow[]>;
  listEntities(input: ListEntitiesInput): Promise<EntityRow[]>;
  updateEntity(input: UpdateEntityInput): Promise<EntityRow>;
  upsertEdge(input: UpsertEdgeInput): Promise<EdgeRow>;
  upsertEntity(input: UpsertEntityInput): Promise<EntityRow>;
}

export function createContextGraphServerApi(input: {
  registry: OntologyRegistry;
  repo: ContextGraphRepo;
}): ContextGraphServerApi {
  const { registry, repo } = input;

  async function resolveType(tenantId: string, id: string): Promise<string> {
    const row = await repo.getEntity({ tenantId, id });
    if (!row) {
      throw new Error(
        `context-graph: entity "${id}" not found in tenant "${tenantId}"`
      );
    }
    return row.type;
  }

  return {
    upsertEntity: async (args) => {
      const { attributes } = registry.validateEntity({
        type: args.type,
        attributes: args.attributes ?? {},
      });
      return repo.upsertEntity({ ...args, attributes });
    },
    deleteEntity: (args) => repo.deleteEntity(args),
    getEntity: (args) => repo.getEntity(args),
    listEntities: (args) => repo.listEntities(args),
    getOntology: () => registry.getOntology(),
    upsertEdge: async (args) => {
      const [subjectType, objectType] = await Promise.all([
        resolveType(args.tenantId, args.subjectId),
        resolveType(args.tenantId, args.objectId),
      ]);
      const { attributes } = registry.validateEdge({
        type: args.type,
        subjectType,
        objectType,
        attributes: args.attributes ?? {},
      });
      return repo.upsertEdge({ ...args, attributes });
    },
    updateEntity: (args) => repo.updateEntity(args),
    deleteEdge: (args) => repo.deleteEdge(args),
    deleteEdgeById: (args) => repo.deleteEdgeById(args),
    listEdges: (args) => repo.listEdges(args),
  };
}
