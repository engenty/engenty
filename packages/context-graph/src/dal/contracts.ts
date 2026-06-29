// DAL contract — typed upsert/delete/get/list against the two tables.
// Inputs are already validated by the server API; the repo just does I/O.

import type { EdgeRow, EntityRow, ExternalRef } from "../contracts.js";

export interface UpsertEntityInput {
  attributes?: Record<string, unknown>;
  externalRef?: ExternalRef;
  name?: string | null;
  tenantId: string;
  type: string;
}

export type DeleteEntityInput =
  | { tenantId: string; id: string }
  | { tenantId: string; externalRef: ExternalRef };

export type GetEntityInput = DeleteEntityInput;

export interface ListEntitiesInput {
  entity?: string;
  externalId?: string;
  module?: string;
  tenantId: string;
  type?: string;
}

export interface UpsertEdgeInput {
  attributes?: Record<string, unknown>;
  objectId: string;
  subjectId: string;
  tenantId: string;
  type: string;
}

export interface DeleteEdgeInput {
  objectId: string;
  subjectId: string;
  tenantId: string;
  type: string;
}

export interface ListEdgesInput {
  fromEntityId?: string;
  tenantId: string;
  toEntityId?: string;
  type?: string;
}

export interface UpdateEntityInput {
  attributes?: Record<string, unknown>;
  id: string;
  name?: string | null;
  tenantId: string;
}

export interface ContextGraphRepo {
  deleteEdge(input: DeleteEdgeInput): Promise<void>;
  deleteEdgeById(input: { id: string; tenantId: string }): Promise<void>;
  deleteEntity(input: DeleteEntityInput): Promise<void>;
  getEntity(input: GetEntityInput): Promise<EntityRow | null>;
  listEdges(input: ListEdgesInput): Promise<EdgeRow[]>;
  listEntities(input: ListEntitiesInput): Promise<EntityRow[]>;
  updateEntity(input: UpdateEntityInput): Promise<EntityRow>;
  upsertEdge(input: UpsertEdgeInput): Promise<EdgeRow>;
  upsertEntity(input: UpsertEntityInput): Promise<EntityRow>;
}
