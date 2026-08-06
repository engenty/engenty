import type { ObjectRef } from "@engenty/ai-core/browser";
import {
  AppWindow,
  BookOpen,
  Box,
  Building2,
  CheckSquare,
  FileCode2,
  FileText,
  FolderKanban,
  Globe,
  type LucideIcon,
  Table2,
  User,
  Users,
} from "lucide-react";

/** Per-artifact-type icon; unknown types fall back to a generic doc icon. */
export function iconForArtifactType(type: string): LucideIcon {
  switch (type.trim().toLowerCase()) {
    case "markdown":
      return FileText;
    case "html":
      return FileCode2;
    case "table":
      return Table2;
    case "app":
      return AppWindow;
    default:
      return FileText;
  }
}

/**
 * Best-effort icon from module/entity. Widgets do not register icons yet, so
 * this is a small heuristic map — unknown types use {@link Box}.
 */
export function iconForObjectRef(ref: ObjectRef): LucideIcon {
  const entity = ref.entity.trim().toLowerCase();
  const module = ref.module.trim().toLowerCase();
  const key = `${module}:${entity}`;

  switch (key) {
    case "tasks:task":
      return CheckSquare;
    case "projects:project":
      return FolderKanban;
    case "contacts:contact":
    case "contacts:person":
      return User;
    case "contacts:company":
    case "company-profile:company":
      return Building2;
    case "team:member":
    case "team:user":
      return Users;
    default:
      break;
  }

  switch (entity) {
    case "task":
      return CheckSquare;
    case "project":
      return FolderKanban;
    case "contact":
    case "person":
    case "user":
    case "member":
      return User;
    case "company":
    case "organization":
      return Building2;
    default:
      return Box;
  }
}

/** KB / internal docs → book; external web → globe. */
export function iconForSourceUrl(url: string): LucideIcon {
  if (
    url.startsWith("/") ||
    url.includes("/kb/") ||
    url.includes("/mdl/knowledge-base/")
  ) {
    return BookOpen;
  }
  return Globe;
}
