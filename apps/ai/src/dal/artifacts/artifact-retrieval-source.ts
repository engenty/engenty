// Artifact search indexing — same pattern as dal/chat-search: apps/ai runs
// out-of-process from apps/core, so it registers its retrieval source on its
// own `createRetrievalService` instance over the shared database (the
// `search.*` schema is shared; per-process service instances are not).

import {
  createRetrievalService,
  type RetrievalSourceRegistration,
} from "@engenty/retrieval";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArtifactStore } from "./artifact-store.js";
import type { ArtifactRow, ArtifactVersionRow } from "./types.js";

export const AI_ARTIFACT_SOURCE_TYPE = "ai.artifact";
const AI_SCHEMA = "ai";
// Inline artifact content caps at 256KB; paragraph chunks keep sections
// together inside an embeddable window (mirrors the chat-search choice).
const CHUNK_MAX_LENGTH = 1200;

/** Searchable text for one artifact version; HTML is indexed tag-stripped. */
export function buildArtifactSearchText(
  artifact: Pick<ArtifactRow, "title" | "type">,
  content: string | null
): string {
  const body =
    artifact.type === "html"
      ? (content ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
      : (content ?? "");
  return [artifact.title, body]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n");
}

function createArtifactRetrievalSource(options: {
  supabase: SupabaseClient;
}): RetrievalSourceRegistration {
  const db = () => options.supabase.schema(AI_SCHEMA);

  return {
    buildDocument: async ({ doc_id, tenant_id }) => {
      const { data, error } = await db()
        .from("artifact")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("id", doc_id)
        .maybeSingle();
      if (error) {
        throw new Error(`artifact load failed: ${error.message}`);
      }
      const artifact = data as ArtifactRow | null;
      if (artifact?.status !== "active") {
        // Missing or archived — ingest treats null as delete-from-index.
        return null;
      }
      const { data: versionData, error: versionError } = await db()
        .from("artifact_version")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("artifact_id", doc_id)
        .eq("version", artifact.current_version)
        .maybeSingle();
      if (versionError) {
        throw new Error(
          `artifact version load failed: ${versionError.message}`
        );
      }
      const version = versionData as ArtifactVersionRow | null;
      const text = buildArtifactSearchText(artifact, version?.content ?? null);
      if (!text) {
        return null;
      }
      return {
        doc_id,
        filter_metadata: {
          scope_id: artifact.scope_id,
          scope_type: artifact.scope_type,
          type: artifact.type,
        },
        occurred_at: artifact.updated_at,
        // Artifacts are tenant-visible (matches the API authz today)…
        owner_user_id: null,
        scope_id: null,
        // …EXCEPT a space-scoped one (D9: pin-to-space, app_build publishing
        // to the run's space): its space can be private, and a NULL space_id
        // is "visible from every space" to search.query_chunks. Re-scoping
        // re-indexes via withArtifactIndexing, so this tracks the pin.
        space_id:
          artifact.scope_type === "space" ? (artifact.scope_id ?? null) : null,
        source_id: doc_id,
        source_type: AI_ARTIFACT_SOURCE_TYPE,
        source_updated_at: artifact.updated_at,
        tenant_id,
        text,
        title: artifact.title,
      };
    },
    listDocuments: async ({ limit, tenant_id }) => {
      const { data, error } = await db()
        .from("artifact")
        .select("id, updated_at")
        .eq("tenant_id", tenant_id)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (error) {
        throw new Error(`artifact list failed: ${error.message}`);
      }
      return ((data ?? []) as { id: string; updated_at: string }[]).map(
        (row) => ({
          doc_id: String(row.id),
          updated_at: String(row.updated_at),
        })
      );
    },
    module_id: "ai",
    // No declarative onEvents: indexing is driven synchronously-adjacent to
    // the DAL writes via `withArtifactIndexing` (fire-and-forget).
    operation: {
      entityName: "artifact",
      overrides: {
        idempotent: true,
        riskLevel: "low",
        summary:
          "Search artifacts (AI-created documents) by title or content (hybrid lexical + semantic)",
      },
    },
    source_type: AI_ARTIFACT_SOURCE_TYPE,
    splitter: { max_chunk_length: CHUNK_MAX_LENGTH, mode: "paragraph" },
    visibility: "tenant",
  };
}

export interface ArtifactSearchRetrieval {
  refreshArtifact(input: {
    artifact_id: string;
    tenant_id: string;
  }): Promise<void>;
  removeArtifact(input: {
    artifact_id: string;
    tenant_id: string;
  }): Promise<void>;
}

export function createArtifactSearchRetrieval(options: {
  /** Serves the source's own ai.* reads (service lane where noted inline). */
  supabase: SupabaseClient;
  /** Phase A seam: when provided, the retrieval service runs document/chunk
   * work and query_chunks tenant-locked (search.source_visibility got a
   * read-only engenty_server policy in 20260809240000). */
  retrievalDb?: {
    getDb: (auth: { tenantId: string }) => SupabaseClient;
    serviceDb: SupabaseClient;
  };
}): ArtifactSearchRetrieval {
  const service = createRetrievalService({
    supabase: options.retrievalDb ?? options.supabase,
  });
  service.registerSource(createArtifactRetrievalSource(options));
  return {
    refreshArtifact: async ({ artifact_id, tenant_id }) => {
      await service.ingest({
        doc_id: artifact_id,
        source_type: AI_ARTIFACT_SOURCE_TYPE,
        tenant_id,
      });
    },
    removeArtifact: async ({ artifact_id, tenant_id }) => {
      await service.remove({
        doc_id: artifact_id,
        source_type: AI_ARTIFACT_SOURCE_TYPE,
        tenant_id,
      });
    },
  };
}

/**
 * Decorate the artifact store so every content/scope/status write refreshes
 * the search index. Fire-and-forget: indexing lag or failure never fails the
 * write (the searchable copy is derived data).
 */
export function withArtifactIndexing(
  store: ArtifactStore,
  retrieval: ArtifactSearchRetrieval,
  log?: (message: string, data?: Record<string, unknown>) => void
): ArtifactStore {
  const fire = (work: Promise<void>) => {
    work.catch((err) => {
      log?.("artifact search index update failed", { error: String(err) });
    });
  };
  return {
    ...store,
    async create(input) {
      const result = await store.create(input);
      fire(
        retrieval.refreshArtifact({
          artifact_id: result.artifact.id,
          tenant_id: input.tenantId,
        })
      );
      return result;
    },
    async addVersion(input) {
      const result = await store.addVersion(input);
      fire(
        retrieval.refreshArtifact({
          artifact_id: input.artifactId,
          tenant_id: input.tenantId,
        })
      );
      return result;
    },
    async updateScope(params) {
      const row = await store.updateScope(params);
      if (row) {
        fire(
          retrieval.refreshArtifact({
            artifact_id: row.id,
            tenant_id: params.tenantId,
          })
        );
      }
      return row;
    },
    async setStatus(params) {
      const row = await store.setStatus(params);
      if (row) {
        fire(
          row.status === "archived"
            ? retrieval.removeArtifact({
                artifact_id: row.id,
                tenant_id: params.tenantId,
              })
            : retrieval.refreshArtifact({
                artifact_id: row.id,
                tenant_id: params.tenantId,
              })
        );
      }
      return row;
    },
  };
}
