import type { DriveNode } from "@engenty/file-storage";
import { spaceDataNodeRecordId } from "@engenty/plugin-sdk";

/** Adapter node type for a folder whose bytes live in a connected account. */
export const FILES_MOUNT_NODE_TYPE = "files.mount";

/** The files adapter's root segment in the Data tree. */
export const FILES_DATA_ROOT = "Files";

export function isConnectedFolder(node: DriveNode): boolean {
  return node.kind === "mount" || node.nodeType === FILES_MOUNT_NODE_TYPE;
}

export function isFilesTreeNode(node: DriveNode): boolean {
  return (
    node.moduleId === "files" || Boolean(node.nodeType?.startsWith("files."))
  );
}

export function isFilesTreeFile(node: DriveNode): boolean {
  return (
    isFilesTreeNode(node) &&
    (node.kind === "file" ||
      node.kind === "record" ||
      node.nodeType === "files.file")
  );
}

/** The extension a filename carries, `.tar.gz` counted as `.gz`. */
function extensionOf(filename: string): string {
  const index = filename.lastIndexOf(".");
  return index > 0 ? filename.slice(index) : "";
}

/**
 * The file-space id a Data-tree path names, or null when it is not a Files
 * file. Used so the pane can open the signed-URL preview without reading the
 * whole document through `/data/read` first — that path used to walk every
 * connected folder, which made every click in Files wait.
 */
export function filesSpaceFileIdFromPath(path: string): string | null {
  const segments = path.split("/").filter(Boolean);
  if (segments[0] !== FILES_DATA_ROOT || segments.length < 2) {
    return null;
  }
  const name = segments.at(-1) ?? "";
  return spaceDataNodeRecordId(name, extensionOf(name));
}
