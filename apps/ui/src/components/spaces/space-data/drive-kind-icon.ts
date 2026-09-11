import { iconForArtifactType } from "@engenty/ai-ui";
import type { DriveNodeKind } from "@engenty/file-storage";
import {
  FileText,
  Folder,
  FolderKanban,
  FolderOpen,
  FolderSync,
  Package,
  Receipt,
  UserRound,
} from "lucide-react";
import type { ComponentType } from "react";

/** One icon per drive-node kind — dashboard, folder lists, and recent. */
export const DRIVE_KIND_ICON: Record<
  DriveNodeKind,
  ComponentType<{ className?: string }>
> = {
  artifact: Package,
  bundle: Receipt,
  file: FileText,
  folder: Folder,
  mount: FolderSync,
  project: FolderKanban,
  record: UserRound,
};

/** Pages are records, but they are not people — do not use the contact silhouette. */
export function driveNodeIcon(input: {
  kind: DriveNodeKind;
  moduleId?: string;
  nodeType?: string;
  open?: boolean;
}): ComponentType<{ className?: string }> {
  if (input.kind === "mount" || input.nodeType === "files.mount") {
    return FolderSync;
  }
  if (input.nodeType === "files.file") {
    return FileText;
  }
  if (input.kind === "folder" && input.open) {
    return FolderOpen;
  }
  if (input.kind === "artifact") {
    return iconForArtifactType(input.nodeType ?? "markdown");
  }
  if (input.kind === "folder" && input.nodeType === "folder") {
    return Folder;
  }
  if (
    input.kind === "record" &&
    (input.moduleId === "knowledge-base" || input.nodeType === "kb.article")
  ) {
    return FileText;
  }
  return DRIVE_KIND_ICON[input.kind];
}
