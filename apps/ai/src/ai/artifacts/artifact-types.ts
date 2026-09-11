// Artifact type registry (server). Each descriptor validates content shape on
// write and declares its MIME type. New content types register here; the DAL
// looks up the descriptor by `type` and calls `validate` before persisting.
// Client-side rendering/editing is a separate registry in packages/ai-ui.

import { DATA_TABLE_MIME_TYPE, dataTableHandleSchema } from "@engenty/ai-core";

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

/**
 * The registered built-in types, for deriving input schemas (tool + route
 * zod enums) from one source. Extend here when adding a type.
 */
export const ARTIFACT_TYPE_IDS = [
  "markdown",
  "html",
  "table",
  "database",
  "app",
  "file",
  "folder",
] as const;

/**
 * Types whose content is a HANDLE to something stored elsewhere, not the thing
 * itself. They must never be mirrored as a document: the bytes already live in
 * their own store, and writing the handle JSON out as a file would produce a
 * useless artifact at the mirror target.
 */
export const ARTIFACT_HANDLE_TYPES: ReadonlySet<string> = new Set([
  "app",
  "database",
  "file",
  "folder",
]);

function assertNonEmpty(content: string, label: string): void {
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new ArtifactInvalidContentError(`${label} content must be non-empty`);
  }
}

registerArtifactType({
  type: "markdown",
  mimeType: "text/markdown",
  validate: (content) => {
    if (typeof content !== "string") {
      throw new ArtifactInvalidContentError(
        "markdown content must be a string"
      );
    }
  },
});

registerArtifactType({
  type: "folder",
  mimeType: "application/vnd.engenty.folder+json",
  validate: (content) => {
    if (typeof content !== "string") {
      throw new ArtifactInvalidContentError("folder content must be a string");
    }
  },
});

registerArtifactType({
  type: "html",
  mimeType: "text/html",
  validate: (content) => assertNonEmpty(content, "html"),
});

/**
 * An engenty App instance. The content is a handle, not the app: the App's
 * source, manifest and versions live in `module_apps`, and its working state
 * lives in its own store. Keeping the artifact tiny is what lets an App of any
 * size be scoped to a thread/task/project through the ordinary artifact
 * machinery — see PLAN-engenty-apps.md §5.
 */
registerArtifactType({
  mimeType: "application/vnd.engenty.app+json",
  type: "app",
  validate: (content) => {
    assertNonEmpty(content, "app");
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new ArtifactInvalidContentError(
        "app content must be a JSON handle: {app_id, session_id}"
      );
    }
    const handle = parsed as { app_id?: unknown; session_id?: unknown };
    if (typeof handle?.app_id !== "string" || handle.app_id.length === 0) {
      throw new ArtifactInvalidContentError("app handle needs an app_id");
    }
    if (
      typeof handle?.session_id !== "string" ||
      handle.session_id.length === 0
    ) {
      throw new ArtifactInvalidContentError("app handle needs a session_id");
    }
  },
});

/**
 * A file in tenant storage. Same shape of idea as `app`: the content is a
 * handle, and the bytes stay where they were written (agent workspace, a
 * connector folder, an upload). That is what lets a spreadsheet, a PDF or a
 * generated image be an ordinary artifact — previewed in the pane, downloaded,
 * promoted to a task/project — instead of a chat-only download offer that
 * nothing can reopen.
 */
registerArtifactType({
  mimeType: "application/vnd.engenty.file+json",
  type: "file",
  validate: (content) => {
    assertNonEmpty(content, "file");
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new ArtifactInvalidContentError(
        "file content must be a JSON handle: {key, name?, mime_type?}"
      );
    }
    const handle = parsed as { key?: unknown };
    if (typeof handle?.key !== "string" || handle.key.length === 0) {
      throw new ArtifactInvalidContentError("file handle needs a storage key");
    }
  },
});

registerArtifactType({
  mimeType: DATA_TABLE_MIME_TYPE,
  type: "database",
  validate: (content) => {
    assertNonEmpty(content, "database");
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new ArtifactInvalidContentError(
        "database content must be a JSON handle: {table_id}"
      );
    }
    const handle = dataTableHandleSchema.safeParse(parsed);
    if (!handle.success) {
      throw new ArtifactInvalidContentError(
        "database handle needs a table_id UUID"
      );
    }
  },
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
