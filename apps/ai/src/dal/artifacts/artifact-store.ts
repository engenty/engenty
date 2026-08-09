import { createLogger } from "@engenty/telemetry";
import { getArtifactType } from "../../ai/artifacts/artifact-types.js";
import {
  createDbSourceFromEnv,
  type DbSource,
  normalizeDbSource,
} from "../../infra/tenant-db.js";
import {
  createArtifactSearchRetrieval,
  withArtifactIndexing,
} from "./artifact-retrieval-source.js";
import type {
  ArtifactCreatorKind,
  ArtifactRow,
  ArtifactScopeType,
  ArtifactStorageBindingRow,
  ArtifactVersionRow,
} from "./types.js";

const AI_SCHEMA = "ai";

const indexingLogger = createLogger({ name: "ai-artifact-indexing" });

/** Inline content ceiling (256KB). Larger content needs blob storage (later phase). */
export const ARTIFACT_INLINE_CONTENT_MAX_BYTES = 262_144;

export class ArtifactVersionConflictError extends Error {
  readonly code = "version_conflict";
  readonly currentVersion: number;
  constructor(currentVersion: number) {
    super(`Artifact version conflict; current version is ${currentVersion}`);
    this.name = "ArtifactVersionConflictError";
    this.currentVersion = currentVersion;
  }
}

export class ArtifactContentTooLargeError extends Error {
  readonly code = "content_too_large";
  constructor() {
    super(
      `Artifact content exceeds the inline limit of ${ARTIFACT_INLINE_CONTENT_MAX_BYTES} bytes`
    );
    this.name = "ArtifactContentTooLargeError";
  }
}

function assertInlineSize(content: string): void {
  if (Buffer.byteLength(content, "utf8") > ARTIFACT_INLINE_CONTENT_MAX_BYTES) {
    throw new ArtifactContentTooLargeError();
  }
}

export interface CreateArtifactInput {
  content: string;
  createdBy?: string | null;
  createdByKind: ArtifactCreatorKind;
  scopeId: string;
  scopeType: ArtifactScopeType;
  tenantId: string;
  threadId?: string | null;
  title: string;
  type: string;
}

export interface AddArtifactVersionInput {
  artifactId: string;
  content: string;
  createdBy?: string | null;
  createdByKind: ArtifactCreatorKind;
  expectedVersion: number;
  summary?: string | null;
  tenantId: string;
}

export function createArtifactStore(source: DbSource) {
  // Phase A seam (PLAN-tenant-isolation-a-rls-seam.md): every method here is
  // tenant-keyed (ai.artifact / ai.artifact_version / ai.artifact_storage_binding
  // all carry tenant_id) and resolves a tenant-locked handle per call.
  const { forTenant } = normalizeDbSource(source);
  const dbFor = (tenantId: string) => forTenant(tenantId).schema(AI_SCHEMA);

  async function getArtifactRow(params: {
    tenantId: string;
    artifactId: string;
  }): Promise<ArtifactRow | null> {
    const { data, error } = await dbFor(params.tenantId)
      .from("artifact")
      .select()
      .eq("tenant_id", params.tenantId)
      .eq("id", params.artifactId)
      .maybeSingle();
    if (error) {
      throw new Error(`artifact select: ${error.message}`);
    }
    return (data as ArtifactRow | null) ?? null;
  }

  return {
    async create(
      input: CreateArtifactInput
    ): Promise<{ artifact: ArtifactRow; version: ArtifactVersionRow }> {
      // Validate type + content shape before writing anything.
      getArtifactType(input.type).validate(input.content);
      assertInlineSize(input.content);

      const db = dbFor(input.tenantId);
      const { data: artifact, error: aError } = await db
        .from("artifact")
        .insert({
          tenant_id: input.tenantId,
          type: input.type,
          title: input.title,
          scope_type: input.scopeType,
          scope_id: input.scopeId,
          thread_id: input.threadId ?? null,
          created_by_kind: input.createdByKind,
          created_by: input.createdBy ?? null,
          current_version: 1,
          storage: "inline",
        })
        .select()
        .single();
      if (aError) {
        throw new Error(`artifact insert: ${aError.message}`);
      }
      const artifactRow = artifact as ArtifactRow;

      const { data: version, error: vError } = await db
        .from("artifact_version")
        .insert({
          artifact_id: artifactRow.id,
          tenant_id: input.tenantId,
          version: 1,
          content: input.content,
          created_by_kind: input.createdByKind,
          created_by: input.createdBy ?? null,
        })
        .select()
        .single();
      if (vError) {
        // No transaction spans the two inserts — roll back the artifact row so
        // a failed version insert can't leave an unopenable orphan in listings.
        await db
          .from("artifact")
          .delete()
          .eq("tenant_id", input.tenantId)
          .eq("id", artifactRow.id);
        throw new Error(`artifact_version insert: ${vError.message}`);
      }
      return { artifact: artifactRow, version: version as ArtifactVersionRow };
    },

    async get(params: {
      tenantId: string;
      artifactId: string;
      version?: number;
    }): Promise<{
      artifact: ArtifactRow;
      version: ArtifactVersionRow;
    } | null> {
      const artifact = await getArtifactRow(params);
      if (!artifact) {
        return null;
      }
      const targetVersion = params.version ?? artifact.current_version;
      const { data: version, error } = await dbFor(params.tenantId)
        .from("artifact_version")
        .select()
        .eq("tenant_id", params.tenantId)
        .eq("artifact_id", artifact.id)
        .eq("version", targetVersion)
        .maybeSingle();
      if (error) {
        throw new Error(`artifact_version select: ${error.message}`);
      }
      if (!version) {
        return null;
      }
      return { artifact, version: version as ArtifactVersionRow };
    },

    async listByScope(params: {
      tenantId: string;
      scopeType: ArtifactScopeType;
      scopeId: string;
      includeArchived?: boolean;
    }): Promise<ArtifactRow[]> {
      let query = dbFor(params.tenantId)
        .from("artifact")
        .select()
        .eq("tenant_id", params.tenantId)
        .eq("scope_type", params.scopeType)
        .eq("scope_id", params.scopeId);
      if (!params.includeArchived) {
        query = query.eq("status", "active");
      }
      const { data, error } = await query
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) {
        throw new Error(`artifact list: ${error.message}`);
      }
      return (data as ArtifactRow[] | null) ?? [];
    },

    /**
     * List artifacts across several scopes at once (the container resolver's
     * `artifactScopes`), deduped by artifact id. Sequential listByScope per
     * scope — clearer than a compound PostgREST `.or()` and each scope is
     * already capped. Overall unique result is limited to ~200.
     */
    async listByScopes(params: {
      tenantId: string;
      scopes: Array<{ scopeType: ArtifactScopeType; scopeId: string }>;
      includeArchived?: boolean;
    }): Promise<ArtifactRow[]> {
      const OVERALL_LIMIT = 200;
      const seen = new Set<string>();
      const out: ArtifactRow[] = [];
      for (const scope of params.scopes) {
        if (out.length >= OVERALL_LIMIT) {
          break;
        }
        const rows = await this.listByScope({
          tenantId: params.tenantId,
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
          ...(params.includeArchived
            ? { includeArchived: params.includeArchived }
            : {}),
        });
        for (const row of rows) {
          if (!seen.has(row.id)) {
            seen.add(row.id);
            out.push(row);
            if (out.length >= OVERALL_LIMIT) {
              break;
            }
          }
        }
      }
      return out;
    },

    /**
     * Tenant-wide listing across every scope — powers the admin console, which
     * surfaces where each artifact physically lives. Unlike listByScope this
     * drops the scope filters entirely; kept separate so scope-bound callers
     * can't accidentally leak cross-scope rows.
     */
    async listAllByTenant(params: {
      tenantId: string;
      includeArchived?: boolean;
      limit?: number;
    }): Promise<ArtifactRow[]> {
      let query = dbFor(params.tenantId)
        .from("artifact")
        .select()
        .eq("tenant_id", params.tenantId);
      if (!params.includeArchived) {
        query = query.eq("status", "active");
      }
      const { data, error } = await query
        .order("updated_at", { ascending: false })
        .limit(params.limit ?? 500);
      if (error) {
        throw new Error(`artifact list all: ${error.message}`);
      }
      return (data as ArtifactRow[] | null) ?? [];
    },

    async addVersion(
      input: AddArtifactVersionInput
    ): Promise<{ artifact: ArtifactRow; version: ArtifactVersionRow }> {
      const db = dbFor(input.tenantId);
      const artifact = await getArtifactRow(input);
      if (!artifact) {
        throw new Error("artifact not found");
      }
      if (artifact.current_version !== input.expectedVersion) {
        throw new ArtifactVersionConflictError(artifact.current_version);
      }
      getArtifactType(artifact.type).validate(input.content);
      assertInlineSize(input.content);

      const nextVersion = input.expectedVersion + 1;
      // The unique (artifact_id, version) constraint is the concurrency gate:
      // of two writers racing past the pre-check above, the loser fails here
      // and gets the version_conflict retry signal, not a generic error.
      const { data: version, error: vError } = await db
        .from("artifact_version")
        .insert({
          artifact_id: artifact.id,
          tenant_id: input.tenantId,
          version: nextVersion,
          content: input.content,
          summary: input.summary ?? null,
          created_by_kind: input.createdByKind,
          created_by: input.createdBy ?? null,
        })
        .select()
        .single();
      if (vError) {
        if (vError.code === "23505") {
          const current = await getArtifactRow(input);
          throw new ArtifactVersionConflictError(
            current?.current_version ?? nextVersion
          );
        }
        throw new Error(`artifact_version insert: ${vError.message}`);
      }
      // Monotonic pointer bump: `< nextVersion` keeps a slow writer from
      // regressing current_version below a later writer's already-landed bump.
      const { data: updated, error: uError } = await db
        .from("artifact")
        .update({
          current_version: nextVersion,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", input.tenantId)
        .eq("id", artifact.id)
        .lt("current_version", nextVersion)
        .select()
        .maybeSingle();
      if (uError) {
        throw new Error(`artifact update: ${uError.message}`);
      }
      const artifactRow =
        (updated as ArtifactRow | null) ?? (await getArtifactRow(input));
      if (!artifactRow) {
        throw new Error("artifact update: row missing");
      }
      return {
        artifact: artifactRow,
        version: version as ArtifactVersionRow,
      };
    },

    async updateScope(params: {
      tenantId: string;
      artifactId: string;
      scopeType: ArtifactScopeType;
      scopeId: string;
    }): Promise<ArtifactRow | null> {
      const { data, error } = await dbFor(params.tenantId)
        .from("artifact")
        .update({
          scope_type: params.scopeType,
          scope_id: params.scopeId,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", params.tenantId)
        .eq("id", params.artifactId)
        .select()
        .maybeSingle();
      if (error) {
        throw new Error(`artifact scope update: ${error.message}`);
      }
      return (data as ArtifactRow | null) ?? null;
    },

    /** Shallow-merge into artifact.metadata (read-modify-write; last writer wins). */
    async mergeMetadata(params: {
      tenantId: string;
      artifactId: string;
      patch: Record<string, unknown>;
    }): Promise<ArtifactRow | null> {
      const row = await getArtifactRow(params);
      if (!row) {
        return null;
      }
      const { data, error } = await dbFor(params.tenantId)
        .from("artifact")
        .update({
          metadata: { ...row.metadata, ...params.patch },
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", params.tenantId)
        .eq("id", params.artifactId)
        .select()
        .maybeSingle();
      if (error) {
        throw new Error(`artifact metadata update: ${error.message}`);
      }
      return (data as ArtifactRow | null) ?? null;
    },

    async getStorageBinding(params: {
      tenantId: string;
      scopeType: ArtifactScopeType;
      scopeId: string;
    }): Promise<ArtifactStorageBindingRow | null> {
      const { data, error } = await dbFor(params.tenantId)
        .from("artifact_storage_binding")
        .select()
        .eq("tenant_id", params.tenantId)
        .eq("scope_type", params.scopeType)
        .eq("scope_id", params.scopeId)
        .maybeSingle();
      if (error) {
        throw new Error(`artifact storage binding select: ${error.message}`);
      }
      return (data as ArtifactStorageBindingRow | null) ?? null;
    },

    /** Upsert the scope's storage binding; a null connectionId clears it. */
    async setStorageBinding(params: {
      tenantId: string;
      scopeType: ArtifactScopeType;
      scopeId: string;
      connectionId: string | null;
      folderRef?: string | null;
      createdBy?: string | null;
    }): Promise<ArtifactStorageBindingRow | null> {
      const db = dbFor(params.tenantId);
      if (!params.connectionId) {
        const { error } = await db
          .from("artifact_storage_binding")
          .delete()
          .eq("tenant_id", params.tenantId)
          .eq("scope_type", params.scopeType)
          .eq("scope_id", params.scopeId);
        if (error) {
          throw new Error(`artifact storage binding delete: ${error.message}`);
        }
        return null;
      }
      const { data, error } = await db
        .from("artifact_storage_binding")
        .upsert(
          {
            tenant_id: params.tenantId,
            scope_type: params.scopeType,
            scope_id: params.scopeId,
            connection_id: params.connectionId,
            folder_ref: params.folderRef ?? null,
            created_by: params.createdBy ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id,scope_type,scope_id" }
        )
        .select()
        .single();
      if (error) {
        throw new Error(`artifact storage binding upsert: ${error.message}`);
      }
      return data as ArtifactStorageBindingRow;
    },

    async setStatus(params: {
      tenantId: string;
      artifactId: string;
      status: "active" | "archived";
    }): Promise<ArtifactRow | null> {
      const { data, error } = await dbFor(params.tenantId)
        .from("artifact")
        .update({
          status: params.status,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", params.tenantId)
        .eq("id", params.artifactId)
        .select()
        .maybeSingle();
      if (error) {
        throw new Error(`artifact status update: ${error.message}`);
      }
      return (data as ArtifactRow | null) ?? null;
    },
  };
}

export type ArtifactStore = ReturnType<typeof createArtifactStore>;

let envStore: ArtifactStore | null | undefined;

/**
 * Store built (once) from SUPABASE_* env; null when unconfigured. Lives in the
 * DAL (not the ai/index barrel) so agent tools can share it without a
 * barrel → copilot-agent → tools import cycle. Wrapped with search indexing
 * so every consumer (routes AND agent tools) keeps the index fresh.
 */
export function createArtifactStoreFromEnv(): ArtifactStore | null {
  if (envStore === undefined) {
    const source = createDbSourceFromEnv();
    if (source) {
      const base = createArtifactStore(source);
      try {
        // Phase A: indexing + queries run tenant-locked (the visibility
        // registry gained a read-only engenty_server policy, 20260809240000);
        // the source's own ai.* reads keep the handles they already resolve.
        envStore = withArtifactIndexing(
          base,
          createArtifactSearchRetrieval({
            supabase: source.serviceDb,
            retrievalDb: {
              getDb: (auth: { tenantId: string }) => source.getTenantDb(auth),
              serviceDb: source.serviceDb,
            },
          }),
          (message, data) => indexingLogger.warn(message, data ?? {})
        );
      } catch {
        // Retrieval unavailable (e.g. search schema absent) — plain store.
        envStore = base;
      }
    } else {
      envStore = null;
    }
  }
  return envStore;
}
