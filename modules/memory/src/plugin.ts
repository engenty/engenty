import type {
  EngentyPluginFactory,
  EntityEventPayload,
  PluginAuthContext,
} from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registerMemoryGatewayMethods } from "./api/index.js";
import type { EmitMemoryEvent } from "./dal/contracts.js";
import {
  createMemoryRepoSupabase,
  createMemoryRetrievalSource,
  MEMORY_RECORD_SOURCE_TYPE,
} from "./dal/index.js";
import { memoryRecordSearchFiltersSchema } from "./schema/zod.js";
import { createEntityRefValidator } from "./services/entity-ref.js";

type MemoryEntityEventPayload = EntityEventPayload<"record_id">;

/**
 * Memory module — the agent learning layer. Free-form markdown records at
 * four scopes (user / project / org / entity), written deliberately by agents
 * (memory_save tool or the post-task reflection step) and recalled through
 * the central retrieval service (synthesized `memory_record_search` op).
 *
 * Governance: org-scoped agent writes always land as status='proposed' and
 * need a human `memory_record_approve`. Records are never hard-deleted —
 * archive is a status flip and drops the row from the retrieval index.
 */
const registerMemoryPlugin: EngentyPluginFactory = (engenty) => {
  engenty.server.registerRoleProfiles([
    {
      id: "memory.viewer",
      title: "Memory viewer",
      capabilities: ["module.memory.read"],
    },
    {
      id: "memory.editor",
      title: "Memory editor",
      capabilities: ["module.memory.read", "module.memory.write"],
    },
    {
      id: "memory.approver",
      title: "Memory approver",
      capabilities: [
        "module.memory.read",
        "module.memory.write",
        "module.memory.approve",
      ],
    },
  ]);

  const { events, server } = engenty;
  const supabaseRaw = server.getDatabaseAdapter?.() ?? null;
  if (!supabaseRaw) {
    throw new Error(
      "Memory module requires Supabase (supabaseUrl and supabaseServiceRoleKey)"
    );
  }
  const supabase = supabaseRaw as SupabaseClient;

  // `memory.record` is a managed retrieval source: the central service owns
  // embeddings/fusion/status/backfill; this module supplies the document
  // builder (title + body_md, active records only), scope filters as chunk
  // metadata, and hydration. The host synthesizes `memory_record_search` and
  // binds the memory.record.{created,updated,archived} events.
  if (!(server.registerRetrievalSource && server.getRetrievalService)) {
    throw new Error(
      "Memory module requires a host with the central retrieval service"
    );
  }
  const retrievalSource = createMemoryRetrievalSource({ supabase });
  retrievalSource.operation.filtersSchema = memoryRecordSearchFiltersSchema;
  server.registerRetrievalSource(retrievalSource);
  const searchProvider = server
    .getRetrievalService()
    ?.getProvider(MEMORY_RECORD_SOURCE_TYPE);
  if (!searchProvider) {
    throw new Error("memory.record retrieval source produced no provider");
  }

  const emitMemoryEvent: EmitMemoryEvent = async (verb, payload) => {
    const eventName = `memory.record.${verb}` as const;
    await events.modules.emit<MemoryEntityEventPayload>(
      eventName,
      payload satisfies MemoryEntityEventPayload,
      { tenantId: payload.tenant_id }
    );
  };

  const repoFactory = (auth: PluginAuthContext) =>
    createMemoryRepoSupabase(supabase, auth.tenantId, auth.scopeId, {
      emitMemoryEvent,
    });

  registerMemoryGatewayMethods(server, repoFactory, {
    // Fail-soft: without a graph host, refs validate on format alone.
    validateEntityRef: createEntityRefValidator(server.contextGraph ?? null),
  });

  // A deleted contact takes its entity memories with it (soft-archive, so
  // nothing dangles in recall). The payload carries only the contact id —
  // the type segment differs per row — so match both possible refs.
  events.modules.on(
    "contacts.contact.deleted",
    async (payload, context) => {
      const contactId = (payload as { contact_id?: unknown }).contact_id;
      const tenantId =
        context.tenantId ?? (payload as { tenant_id?: unknown }).tenant_id;
      if (typeof contactId !== "string" || typeof tenantId !== "string") {
        return;
      }
      const refs = [
        `contacts.person:${contactId}`,
        `contacts.organisation:${contactId}`,
      ];
      const { data, error } = await supabase
        .schema("module_memory")
        .from("records")
        .update({ status: "archived", updated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("scope_kind", "entity")
        .in("scope_ref", refs)
        .neq("status", "archived")
        .select("id, scope_id");
      if (error) {
        throw new Error(
          `memory: archive on contact delete failed: ${error.message}`
        );
      }
      for (const row of (data ?? []) as { id: string; scope_id: string }[]) {
        await emitMemoryEvent("archived", {
          record_id: row.id,
          scope_id: row.scope_id,
          tenant_id: tenantId,
        });
      }
    },
    { tenantScoped: true }
  );
};

export default registerMemoryPlugin;
