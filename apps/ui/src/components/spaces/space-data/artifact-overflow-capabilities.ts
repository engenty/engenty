/**
 * What the Artifacts ⋯ menu offers, by `ai.artifact.type`.
 *
 * Documents (markdown/html/table) can be duplicated; handle types (folder,
 * app, file, database) cannot — their content is a pointer, not a document.
 * Edit is in-pane for markdown, Copilot for generated types, and rename for
 * folders (there is nothing to "edit" in a folder).
 */
export type ArtifactEditKind = "copilot" | "page" | "rename" | null;

export interface ArtifactOverflowCapabilities {
  copyLink: boolean;
  delete: boolean;
  duplicate: boolean;
  edit: ArtifactEditKind;
  move: boolean;
  open: boolean;
  versions: boolean;
}

const HANDLE_TYPES = new Set(["app", "database", "file", "folder"]);

export function artifactOverflowForType(
  type: string
): ArtifactOverflowCapabilities {
  const edit: ArtifactEditKind =
    type === "markdown"
      ? "page"
      : type === "html" ||
          type === "table" ||
          type === "app" ||
          type === "database"
        ? "copilot"
        : type === "folder"
          ? "rename"
          : null;
  return {
    copyLink: true,
    delete: true,
    duplicate: !HANDLE_TYPES.has(type),
    edit,
    move: true,
    open: true,
    versions: type !== "folder",
  };
}
