import type { SupabaseClient } from "@supabase/supabase-js";
import { getArtifactType } from "../../ai/artifacts/artifact-types.js";
import type {
  ArtifactCreatorKind,
  ArtifactRow,
  ArtifactScopeType,
  ArtifactVersionRow,
} from "./types.js";

const AI_SCHEMA = "ai";

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

export function createArtifactStore(client: SupabaseClient) {
  const db = client.schema(AI_SCHEMA);

  async function getArtifactRow(params: {
    tenantId: string;
    artifactId: string;
  }): Promise<ArtifactRow | null> {
    const { data, error } = await db
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
      const { data: version, error } = await db
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
      let query = db
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

    async addVersion(
      input: AddArtifactVersionInput
    ): Promise<{ artifact: ArtifactRow; version: ArtifactVersionRow }> {
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
        throw new Error(`artifact_version insert: ${vError.message}`);
      }
      const { data: updated, error: uError } = await db
        .from("artifact")
        .update({
          current_version: nextVersion,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", input.tenantId)
        .eq("id", artifact.id)
        .select()
        .single();
      if (uError) {
        throw new Error(`artifact update: ${uError.message}`);
      }
      return {
        artifact: updated as ArtifactRow,
        version: version as ArtifactVersionRow,
      };
    },

    async updateScope(params: {
      tenantId: string;
      artifactId: string;
      scopeType: ArtifactScopeType;
      scopeId: string;
    }): Promise<ArtifactRow | null> {
      const { data, error } = await db
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

    async setStatus(params: {
      tenantId: string;
      artifactId: string;
      status: "active" | "archived";
    }): Promise<ArtifactRow | null> {
      const { data, error } = await db
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
