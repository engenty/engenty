import type { ArtifactRow, ArtifactStore } from "../../dal/artifacts/index.js";
import { getArtifactType } from "./artifact-types.js";

const EXTENSION_BY_TYPE: Record<string, string> = {
  html: "html",
  markdown: "md",
  table: "csv",
};

function mirrorFileName(artifact: ArtifactRow): string {
  const slug =
    artifact.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 64) || "artifact";
  const ext = EXTENSION_BY_TYPE[artifact.type] ?? "txt";
  // The id suffix keeps re-promoted artifacts from colliding on title.
  return `${slug}-${artifact.id.slice(0, 8)}.${ext}`;
}

export interface MirrorArtifactResult {
  error?: string;
  mirrored: boolean;
  ref?: string;
}

/**
 * Mirror an artifact's current version to the storage connection bound to its
 * (post-promotion) scope, via core's `connections_files_write` operation.
 * Best-effort by contract: platform storage stays the source of truth for
 * rendering, so a failed mirror only logs and records nothing. On success the
 * mirror target is noted in the artifact's metadata.
 */
export async function mirrorArtifactToBoundStorage(params: {
  artifact: ArtifactRow;
  invokeTool: (toolId: string, input: unknown) => Promise<unknown>;
  log?: (message: string, data?: Record<string, unknown>) => void;
  store: ArtifactStore;
  tenantId: string;
}): Promise<MirrorArtifactResult> {
  const { artifact, invokeTool, log, store, tenantId } = params;
  if (artifact.scope_type === "thread") {
    return { mirrored: false };
  }
  try {
    const binding = await store.getStorageBinding({
      tenantId,
      scopeType: artifact.scope_type,
      scopeId: artifact.scope_id,
    });
    if (!binding) {
      return { mirrored: false };
    }
    const current = await store.get({ tenantId, artifactId: artifact.id });
    const content = current?.version.content;
    if (typeof content !== "string") {
      return { mirrored: false, error: "artifact has no inline content" };
    }
    let mimeType: string | null = null;
    try {
      mimeType = getArtifactType(artifact.type).mimeType;
    } catch {
      mimeType = "text/plain";
    }
    const name = mirrorFileName(artifact);
    const entry = (await invokeTool("connections_files_write", {
      connection_id: binding.connection_id,
      content_text: content,
      folder_ref: binding.folder_ref,
      mime_type: mimeType,
      name,
    })) as { ref?: string } | null;
    const ref = entry?.ref ?? name;
    await store.mergeMetadata({
      tenantId,
      artifactId: artifact.id,
      patch: {
        external_mirror: {
          connection_id: binding.connection_id,
          mirrored_at: new Date().toISOString(),
          ref,
          version: artifact.current_version,
        },
      },
    });
    return { mirrored: true, ref };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log?.("artifact mirror failed; platform copy remains authoritative", {
      artifactId: artifact.id,
      error: message,
    });
    return { mirrored: false, error: message };
  }
}
