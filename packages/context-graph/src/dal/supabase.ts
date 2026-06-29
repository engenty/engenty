// Supabase implementation of `ContextGraphRepo`. Service-role client;
// every query filters on tenant_id explicitly so the DAL is safe even
// without RLS.

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { EdgeRow, EntityRow, ExternalRef } from "../contracts.js";
import type {
  ContextGraphRepo,
  DeleteEntityInput,
  GetEntityInput,
} from "./contracts.js";

const SCHEMA = "context_graph";

function byExternal(
  input: DeleteEntityInput
): input is { externalRef: ExternalRef; tenantId: string } {
  return "externalRef" in input;
}

function check<T>(label: string, data: T, error: PostgrestError | null): T {
  if (error) {
    throw new Error(`context-graph: ${label}: ${error.message}`);
  }
  return data;
}

export function createContextGraphRepoSupabase(
  adapter: unknown
): ContextGraphRepo {
  const supabase = adapter as SupabaseClient;
  const entities = () => supabase.schema(SCHEMA).from("entities");
  const edges = () => supabase.schema(SCHEMA).from("edges");

  const repo: ContextGraphRepo = {
    async upsertEntity(input) {
      const attributes = input.attributes ?? {};
      if (input.externalRef) {
        const existing = await repo.getEntity({
          tenantId: input.tenantId,
          externalRef: input.externalRef,
        });
        if (existing) {
          const { data, error } = await entities()
            .update({
              type: input.type,
              name: input.name ?? existing.name,
              attributes: { ...existing.attributes, ...attributes },
              updated_at: new Date().toISOString(),
            })
            .eq("tenant_id", input.tenantId)
            .eq("id", existing.id)
            .select("*")
            .single();
          return check("upsertEntity update", data, error) as EntityRow;
        }
      }
      const { data, error } = await entities()
        .insert({
          tenant_id: input.tenantId,
          type: input.type,
          external_ref: input.externalRef ?? null,
          name: input.name ?? null,
          attributes,
        })
        .select("*")
        .single();
      return check("upsertEntity insert", data, error) as EntityRow;
    },

    async deleteEntity(input) {
      let q = entities().delete().eq("tenant_id", input.tenantId);
      if (byExternal(input)) {
        const existing = await repo.getEntity(input);
        if (!existing) {
          return;
        }
        q = q.eq("id", existing.id);
      } else {
        q = q.eq("id", input.id);
      }
      check("deleteEntity", null, (await q).error);
    },

    async getEntity(input: GetEntityInput) {
      let q = entities().select("*").eq("tenant_id", input.tenantId);
      if (byExternal(input)) {
        q = q
          .eq("external_ref->>module", input.externalRef.module)
          .eq("external_ref->>entity", input.externalRef.entity)
          .eq("external_ref->>id", input.externalRef.id);
      } else {
        q = q.eq("id", input.id);
      }
      const { data, error } = await q.maybeSingle();
      return (check("getEntity", data, error) as EntityRow | null) ?? null;
    },

    async listEntities(input) {
      let q = entities().select("*").eq("tenant_id", input.tenantId);
      if (input.type) {
        q = q.eq("type", input.type);
      }
      if (input.module) {
        q = q.eq("external_ref->>module", input.module);
      }
      if (input.entity) {
        q = q.eq("external_ref->>entity", input.entity);
      }
      if (input.externalId) {
        q = q.eq("external_ref->>id", input.externalId);
      }
      const { data, error } = await q;
      return (check("listEntities", data, error) as EntityRow[] | null) ?? [];
    },

    async upsertEdge(input) {
      const { data, error } = await edges()
        .upsert(
          {
            tenant_id: input.tenantId,
            type: input.type,
            subject_id: input.subjectId,
            object_id: input.objectId,
            attributes: input.attributes ?? {},
            updated_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id,type,subject_id,object_id" }
        )
        .select("*")
        .single();
      return check("upsertEdge", data, error) as EdgeRow;
    },

    async updateEntity(input) {
      const existing = await repo.getEntity({
        tenantId: input.tenantId,
        id: input.id,
      });
      if (!existing) {
        throw new Error(`context-graph: entity "${input.id}" not found`);
      }
      const { data, error } = await entities()
        .update({
          name: input.name === undefined ? existing.name : input.name,
          attributes:
            input.attributes === undefined
              ? existing.attributes
              : { ...(existing.attributes as object), ...input.attributes },
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", input.tenantId)
        .eq("id", input.id)
        .select("*")
        .single();
      return check("updateEntity", data, error) as EntityRow;
    },

    async deleteEdge(input) {
      const { error } = await edges()
        .delete()
        .eq("tenant_id", input.tenantId)
        .eq("type", input.type)
        .eq("subject_id", input.subjectId)
        .eq("object_id", input.objectId);
      check("deleteEdge", null, error);
    },

    async deleteEdgeById(input) {
      const { error } = await edges()
        .delete()
        .eq("id", input.id)
        .eq("tenant_id", input.tenantId);
      check("deleteEdgeById", null, error);
    },

    async listEdges(input) {
      let q = edges().select("*").eq("tenant_id", input.tenantId);
      if (input.type) {
        q = q.eq("type", input.type);
      }
      if (input.fromEntityId) {
        q = q.eq("subject_id", input.fromEntityId);
      }
      if (input.toEntityId) {
        q = q.eq("object_id", input.toEntityId);
      }
      const { data, error } = await q;
      return (check("listEdges", data, error) as EdgeRow[] | null) ?? [];
    },
  };

  return repo;
}
