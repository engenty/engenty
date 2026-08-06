/**
 * Which artifact the agent last presented on a thread, persisted so every
 * window attached to the thread shows the same one (multi-window sync for
 * `show_artifact` — the tool itself stays single-owner/single-execution; only
 * this "what to display" fact is shared state).
 */
export const ACTIVE_ARTIFACT_METADATA_KEY = "active_artifact";

export interface ActiveArtifactMetadata {
  artifact_id: string;
  /** ISO timestamp — lets a window distinguish "same artifact, shown again"
   * from stale metadata already applied, without a version counter. */
  shown_at: string;
}

function isActiveArtifactMetadata(
  value: unknown
): value is ActiveArtifactMetadata {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { artifact_id?: unknown }).artifact_id === "string" &&
    (value as { artifact_id: string }).artifact_id.length > 0 &&
    typeof (value as { shown_at?: unknown }).shown_at === "string"
  );
}

export function readActiveArtifactMetadata(
  metadata: Record<string, unknown> | null | undefined
): ActiveArtifactMetadata | null {
  const raw = metadata?.[ACTIVE_ARTIFACT_METADATA_KEY];
  return isActiveArtifactMetadata(raw) ? raw : null;
}

/** Merge (or clear, when `artifactId` is null) the active-artifact key into
 * an existing metadata object without touching any other key. */
export function mergeActiveArtifactMetadata(
  metadata: Record<string, unknown>,
  input: { artifactId: string | null; shownAt: string }
): Record<string, unknown> {
  if (input.artifactId === null) {
    const { [ACTIVE_ARTIFACT_METADATA_KEY]: _removed, ...rest } = metadata;
    return rest;
  }
  return {
    ...metadata,
    [ACTIVE_ARTIFACT_METADATA_KEY]: {
      artifact_id: input.artifactId,
      shown_at: input.shownAt,
    } satisfies ActiveArtifactMetadata,
  };
}
