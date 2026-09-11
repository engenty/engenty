import type { DriveNode } from "@engenty/file-storage";
import {
  isArtifactFolder,
  isArtifactTreeNode,
} from "@/lib/space-data-root-sections";

export const DRIVE_NODE_DRAG_MIME = "application/x-engenty-drive-node";

export interface DriveNodeDragPayload {
  dataPath?: string;
  id: string;
  moduleId?: string;
  sourceId: string;
}

export function canDragDriveNode(node: DriveNode): boolean {
  if (isArtifactTreeNode(node)) {
    return true;
  }
  if (node.kind === "file") {
    return true;
  }
  return Boolean(node.dataPath?.includes("/"));
}

export function nodeContainsId(node: DriveNode, id: string): boolean {
  if (node.id === id) {
    return true;
  }
  return Boolean(node.children?.some((child) => nodeContainsId(child, id)));
}

export function canDropDriveNode(
  source: DriveNode,
  target: DriveNode
): boolean {
  if (source.id === target.id) {
    return false;
  }
  if (nodeContainsId(source, target.id)) {
    return false;
  }
  if (isArtifactTreeNode(source)) {
    return isArtifactFolder(target);
  }
  if (
    source.dataPath &&
    target.dataPath &&
    source.moduleId &&
    source.moduleId === target.moduleId &&
    (target.kind === "folder" || target.kind === "bundle")
  ) {
    return source.dataPath !== target.dataPath;
  }
  return false;
}

export function parseDriveNodeDrag(
  dataTransfer: DataTransfer
): DriveNodeDragPayload | null {
  const raw = dataTransfer.getData(DRIVE_NODE_DRAG_MIME);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as DriveNodeDragPayload;
    if (typeof parsed.id !== "string" || typeof parsed.sourceId !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeDriveNodeDrag(
  dataTransfer: DataTransfer,
  node: DriveNode
): void {
  const payload: DriveNodeDragPayload = {
    id: node.id,
    sourceId: node.sourceId,
    ...(node.dataPath ? { dataPath: node.dataPath } : {}),
    ...(node.moduleId ? { moduleId: node.moduleId } : {}),
  };
  dataTransfer.setData(DRIVE_NODE_DRAG_MIME, JSON.stringify(payload));
  dataTransfer.setData("text/plain", node.name);
  dataTransfer.effectAllowed = "move";
}
