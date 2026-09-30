// Public types. `EntityRow` / `EdgeRow` are the wire shapes returned by the
// DAL and HTTP routes (1:1 with the DB columns). Registration shapes
// (`EntityTypeSpec`, `EdgeTypeSpec`, `ContextGraphSchemaRegistration`,
// `ExternalRef`) live in `@engenty/plugin-sdk` to avoid a circular dep.

export type {
  ContextGraphEventBinding,
  ContextGraphSchemaRegistration,
  ContextGraphUpsertInput,
  EdgeTypeSpec,
  EntityTypeSpec,
  ExternalRef,
} from "@engenty/plugin-sdk";

import type { ExternalRef } from "@engenty/plugin-sdk";

export interface EntityRow {
  attributes: Record<string, unknown>;
  created_at: string;
  external_ref: ExternalRef | null;
  id: string;
  name: string | null;
  tenant_id: string;
  type: string;
  updated_at: string;
}

export interface EdgeRow {
  attributes: Record<string, unknown>;
  created_at: string;
  id: string;
  object_id: string;
  subject_id: string;
  tenant_id: string;
  type: string;
  updated_at: string;
}
