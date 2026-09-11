/**
 * Per-artifact-type icon. Shared by Space Data, the chat pane, and Work lists.
 */
import {
  AppWindow,
  File,
  FileCode2,
  FileText,
  Folder,
  type LucideIcon,
  Table2,
} from "lucide-react";

/** `page` is the UI name for a markdown artifact. */
export function iconForArtifactType(type: string): LucideIcon {
  switch (type.trim().toLowerCase()) {
    case "markdown":
    case "page":
      return FileText;
    case "html":
      return FileCode2;
    case "table":
    case "database":
      return Table2;
    case "app":
      return AppWindow;
    case "file":
      return File;
    case "folder":
      return Folder;
    default:
      return FileText;
  }
}
