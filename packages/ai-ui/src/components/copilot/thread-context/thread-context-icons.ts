import type { ObjectRef } from "@engenty/ai-core/browser";
import {
  BookOpen,
  Bot,
  Box,
  Building2,
  CheckSquare,
  FileText,
  FolderKanban,
  Globe,
  ImageIcon,
  type LucideIcon,
  Paperclip,
  User,
  Users,
} from "lucide-react";
import {
  isImageMimeType,
  isPdfMimeType,
} from "../../../lib/chat-attachment-part.js";

export { iconForArtifactType } from "../../../artifacts/artifact-icons.js";

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
    url.startsWith("/data/") ||
    url.includes("/data?") ||
    url.startsWith("/") ||
    url.includes("/kb/") ||
    url.includes("/mdl/knowledge-base/")
  ) {
    return url.startsWith("/data/") || url.includes("/data?")
      ? FileText
      : BookOpen;
  }
  return Globe;
}

/** Image / PDF / generic file icons for chat attachments in the context card. */
export function iconForAttachment(
  mimeType: string,
  filename?: string
): LucideIcon {
  if (isImageMimeType(mimeType)) {
    return ImageIcon;
  }
  if (isPdfMimeType(mimeType, filename)) {
    return FileText;
  }
  return Paperclip;
}

export function iconForSubAgent(): LucideIcon {
  return Bot;
}
