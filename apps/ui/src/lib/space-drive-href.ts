/**
 * Where a Data-tree row opens — one function so the sidebar, the dashboard and
 * Recent links cannot disagree about the URL.
 */
import {
  type DriveNode,
  type DriveNodeKind,
  fileSpaceOwnerKey,
} from "@engenty/file-storage";
import type { SpaceDataLibraryItemInput } from "@engenty/user-settings";
// Relative, not the `@/` alias: this module is unit-tested, and vitest runs
// with the repo root as its root, where that alias does not resolve — the
// suite fails to import before a single test runs.
import { isArtifactFolder } from "./space-data-root-sections";
import {
  spaceDataArtifactPath,
  spaceDataFilePath,
  spaceDataFolderInSpacePath,
  spaceDataFolderPath,
  spaceDataPath,
} from "./space-routes";

export interface DriveListRow {
  dataPath?: string;
  href: string;
  id: string;
  kind: DriveNodeKind;
  name: string;
  nodeType?: string;
  sourceId: string;
  updatedAt?: string;
}

export function driveNodeHref(
  spaceKey: string,
  node: DriveNode
): string | null {
  if (node.isReference) {
    // A shortcut has to resolve first; the JSON file is not the destination.
    return null;
  }
  if (node.dataPath) {
    return node.kind === "folder"
      ? spaceDataFolderPath(spaceKey, node.dataPath)
      : spaceDataPath(spaceKey, node.dataPath);
  }
  if ((node.kind === "folder" || node.kind === "mount") && node.owner) {
    return spaceDataFolderInSpacePath(spaceKey, {
      fileSpaceKey: fileSpaceOwnerKey(node.owner),
      id: node.sourceId,
    });
  }
  if (node.kind === "file" && node.owner) {
    return spaceDataFilePath(spaceKey, {
      fileSpaceKey: fileSpaceOwnerKey(node.owner),
      folderId: node.folderId ?? null,
      id: node.sourceId,
    });
  }
  if (node.kind === "artifact" || isArtifactFolder(node)) {
    return spaceDataArtifactPath(spaceKey, node.sourceId);
  }
  return node.href ?? null;
}

export function driveNodeLibraryItem(
  spaceId: string,
  spaceKey: string,
  node: DriveNode
): SpaceDataLibraryItemInput | null {
  const href = driveNodeHref(spaceKey, node);
  if (!href) {
    return null;
  }
  return {
    href,
    kind: node.kind,
    space_id: spaceId,
    title: node.name,
  };
}

/** A Drive node as an admin-list row, or null when it has nowhere to open. */
export function driveNodeToListRow(
  spaceKey: string,
  node: DriveNode
): DriveListRow | null {
  const href = driveNodeHref(spaceKey, node);
  if (!href) {
    return null;
  }
  return {
    href,
    id: node.id,
    kind: node.kind,
    name: node.name,
    sourceId: node.sourceId,
    ...(node.dataPath ? { dataPath: node.dataPath } : {}),
    ...(node.nodeType ? { nodeType: node.nodeType } : {}),
    ...(node.updatedAt ? { updatedAt: node.updatedAt } : {}),
  };
}
