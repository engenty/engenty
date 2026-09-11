/**
 * Folder containment for `ai.artifact.parent_id`.
 *
 * A page may sit at the Artifacts root (`parent_id` null) or inside a folder
 * in the same scope. Nesting under another page, or under a descendant of
 * itself, is rejected so the tree cannot loop.
 */

export class ArtifactInvalidParentError extends Error {
  readonly code = "invalid_parent";
  constructor(message = "Invalid artifact parent") {
    super(message);
    this.name = "ArtifactInvalidParentError";
  }
}

export interface ArtifactParentCandidate {
  id: string;
  parent_id: string | null;
  scope_id: string;
  scope_type: string;
  type: string;
}

/**
 * Walk `parent_id` from the proposed parent toward the root. True when the
 * moving artifact would become an ancestor of itself.
 */
export function parentWouldCycle(
  artifactId: string,
  proposedParentId: string | null,
  parentOf: (id: string) => string | null | undefined
): boolean {
  let cursor = proposedParentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === artifactId) {
      return true;
    }
    if (seen.has(cursor)) {
      return true;
    }
    seen.add(cursor);
    cursor = parentOf(cursor) ?? null;
  }
  return false;
}

export function assertArtifactParentAllowed(input: {
  artifact: Pick<ArtifactParentCandidate, "id" | "scope_id" | "scope_type">;
  parent: ArtifactParentCandidate | null;
  parentId: string | null;
  parentOf: (id: string) => string | null | undefined;
}): void {
  const { artifact, parent, parentId, parentOf } = input;
  if (parentId == null) {
    return;
  }
  if (parentId === artifact.id) {
    throw new ArtifactInvalidParentError(
      "An artifact cannot be its own parent"
    );
  }
  if (!parent) {
    throw new ArtifactInvalidParentError("Parent artifact was not found");
  }
  if (
    parent.scope_id !== artifact.scope_id ||
    parent.scope_type !== artifact.scope_type
  ) {
    throw new ArtifactInvalidParentError(
      "Parent must be in the same artifact scope"
    );
  }
  if (parent.type !== "folder") {
    throw new ArtifactInvalidParentError("Parent must be a folder");
  }
  if (parentWouldCycle(artifact.id, parentId, parentOf)) {
    throw new ArtifactInvalidParentError(
      "Parent cannot be a descendant of the artifact"
    );
  }
}
