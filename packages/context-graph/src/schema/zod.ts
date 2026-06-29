// Request/response shapes for `/api/context-graph/*` inspection routes.

import { z } from "@hono/zod-openapi";

const ATTRS = z.record(z.string(), z.unknown());
const externalRefSchema = z.object({
  entity: z.string(),
  id: z.string(),
  module: z.string(),
});
export const entityRowSchema = z.object({
  attributes: ATTRS,
  created_at: z.string(),
  external_ref: externalRefSchema.nullable(),
  id: z.string(),
  name: z.string().nullable(),
  tenant_id: z.string(),
  type: z.string(),
  updated_at: z.string(),
});
export const edgeRowSchema = z.object({
  attributes: ATTRS,
  created_at: z.string(),
  id: z.string(),
  object_id: z.string(),
  subject_id: z.string(),
  tenant_id: z.string(),
  type: z.string(),
  updated_at: z.string(),
});
const ontologyEntityTypeSchema = z.object({
  displayName: z.string(),
  id: z.string(),
  moduleId: z.string(),
});
const ontologyEdgeTypeSchema = z.object({
  displayName: z.string(),
  id: z.string(),
  moduleId: z.string(),
  objectTypes: z.array(z.string()),
  subjectTypes: z.array(z.string()),
});

export const ontologyResponseSchema = z.object({
  edgeTypes: z.array(ontologyEdgeTypeSchema),
  entityTypes: z.array(ontologyEntityTypeSchema),
});
export const entitiesListResponseSchema = z.object({
  items: z.array(entityRowSchema),
});
export const entityDetailResponseSchema = z.object({
  // Map of connected entity id → display name, so the UI can render the
  // other end of each edge by name instead of a raw id.
  connectedNames: z.record(z.string(), z.string().nullable()),
  entity: entityRowSchema,
  incoming: z.array(edgeRowSchema),
  outgoing: z.array(edgeRowSchema),
});
export const edgesListResponseSchema = z.object({
  items: z.array(edgeRowSchema),
});
export const entitiesListQuerySchema = z.object({
  entity: z.string().optional(),
  id: z.string().optional(),
  module: z.string().optional(),
  type: z.string().optional(),
});
export const edgesListQuerySchema = z.object({
  object_id: z.string().optional(),
  subject_id: z.string().optional(),
  type: z.string().optional(),
});

export const createEntityBodySchema = z.object({
  attributes: ATTRS.optional(),
  externalRef: externalRefSchema.optional(),
  name: z.string().nullable().optional(),
  type: z.string().min(1),
});
export const updateEntityBodySchema = z.object({
  attributes: ATTRS.optional(),
  name: z.string().nullable().optional(),
});
export const createEdgeBodySchema = z.object({
  attributes: ATTRS.optional(),
  objectId: z.string().uuid(),
  subjectId: z.string().uuid(),
  type: z.string().min(1),
});
