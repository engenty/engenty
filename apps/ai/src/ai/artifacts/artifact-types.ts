// Artifact type registry (server). Each descriptor validates content shape on
// write and declares its MIME type. New content types register here; the DAL
// looks up the descriptor by `type` and calls `validate` before persisting.
// Client-side rendering/editing is a separate registry in packages/ai-ui.

export interface ArtifactTypeDescriptor {
  mimeType: string;
  type: string;
  /** Throw ArtifactInvalidContentError when `content` is not valid for this type. */
  validate(content: string): void;
}

export class ArtifactUnknownTypeError extends Error {
  readonly code = "unknown_artifact_type";
  constructor(type: string) {
    super(`Unknown artifact type: ${type}`);
    this.name = "ArtifactUnknownTypeError";
  }
}

export class ArtifactInvalidContentError extends Error {
  readonly code = "invalid_artifact_content";
  constructor(message: string) {
    super(message);
    this.name = "ArtifactInvalidContentError";
  }
}

const TYPES = new Map<string, ArtifactTypeDescriptor>();

export function registerArtifactType(descriptor: ArtifactTypeDescriptor): void {
  TYPES.set(descriptor.type, descriptor);
}

export function getArtifactType(type: string): ArtifactTypeDescriptor {
  const descriptor = TYPES.get(type);
  if (!descriptor) {
    throw new ArtifactUnknownTypeError(type);
  }
  return descriptor;
}

export function listArtifactTypes(): string[] {
  return [...TYPES.keys()];
}

function assertNonEmpty(content: string, label: string): void {
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new ArtifactInvalidContentError(`${label} content must be non-empty`);
  }
}

registerArtifactType({
  type: "markdown",
  mimeType: "text/markdown",
  validate: (content) => assertNonEmpty(content, "markdown"),
});

registerArtifactType({
  type: "html",
  mimeType: "text/html",
  validate: (content) => assertNonEmpty(content, "html"),
});

registerArtifactType({
  type: "table",
  mimeType: "text/csv",
  validate: (content) => {
    assertNonEmpty(content, "table");
    // Accept either a JSON array of objects or CSV with at least one row.
    const trimmed = content.trim();
    if (trimmed.startsWith("[")) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        throw new ArtifactInvalidContentError(
          "table content is not valid JSON"
        );
      }
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new ArtifactInvalidContentError(
          "table JSON must be a non-empty array"
        );
      }
      return;
    }
    const rows = trimmed.split(/\r?\n/).filter((line) => line.length > 0);
    if (rows.length < 1) {
      throw new ArtifactInvalidContentError(
        "table CSV must have at least one row"
      );
    }
  },
});
