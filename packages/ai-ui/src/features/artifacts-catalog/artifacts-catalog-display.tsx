// Shared presentation helpers for the artifacts catalog — group-header
// icon/label/audience and per-cell labels, so cards and table stay in sync.

import {
  Bot,
  Boxes,
  Circle,
  CircleCheck,
  CircleSlash,
  Database,
  FileStack,
  HardDrive,
  ListChecks,
  MessagesSquare,
  Target,
  User,
} from "lucide-react";
import type { ComponentType } from "react";
import type { ArtifactGroupBy } from "./artifacts-catalog-state";

export type IconType = ComponentType<{
  "aria-hidden"?: boolean;
  className?: string;
}>;

type Translate = (key: string) => string;

const SCOPE_ICON: Record<string, IconType> = {
  goal: Target,
  project: Boxes,
  task: ListChecks,
  thread: MessagesSquare,
};

/** Resolve a translation, falling back to the raw key's value when missing. */
function translate(t: Translate, key: string, fallback: string): string {
  const value = t(key);
  return value === key ? fallback : value;
}

export function scopeLabel(t: Translate, scopeType: string): string {
  return translate(t, `artifactsCatalog.scope.${scopeType}`, scopeType);
}

export function scopeAudience(t: Translate, scopeType: string): string {
  return translate(t, `artifactsCatalog.audience.${scopeType}`, "");
}

export function statusLabel(t: Translate, status: string): string {
  return translate(t, `artifactsCatalog.statusValue.${status}`, status);
}

export function creatorLabel(t: Translate, kind: string): string {
  return translate(
    t,
    kind === "agent" ? "artifactsCatalog.by.agent" : "artifactsCatalog.by.user",
    kind
  );
}

export interface StorageDescriptor {
  Icon: IconType;
  label: string;
}

export function describeStorage(
  t: Translate,
  storageId: string
): StorageDescriptor {
  if (storageId === "inline") {
    return {
      Icon: Database,
      label: t("artifactsCatalog.storage.inline.label"),
    };
  }
  if (storageId === "blob") {
    return { Icon: HardDrive, label: t("artifactsCatalog.storage.blob.label") };
  }
  return { Icon: HardDrive, label: storageId };
}

export interface GroupHeader {
  Icon: IconType;
  label: string;
  /** Secondary hint — only scope groups carry an audience ("who can see it"). */
  sub: string;
}

/** Icon + label (+ audience for scope) for a group header, keyed by grouping. */
export function resolveGroupHeader(
  t: Translate,
  groupBy: ArtifactGroupBy,
  id: string
): GroupHeader {
  switch (groupBy) {
    case "scope":
      return {
        Icon: SCOPE_ICON[id] ?? FileStack,
        label: scopeLabel(t, id),
        sub: scopeAudience(t, id),
      };
    case "storage": {
      const storage = describeStorage(t, id);
      return { Icon: storage.Icon, label: storage.label, sub: "" };
    }
    case "status":
      return {
        Icon:
          id === "archived"
            ? CircleSlash
            : id === "active"
              ? CircleCheck
              : Circle,
        label: statusLabel(t, id),
        sub: "",
      };
    case "creator":
      return {
        Icon: id === "agent" ? Bot : User,
        label: creatorLabel(t, id),
        sub: "",
      };
    default:
      // type (or "all" for none) — the raw type is already human-readable.
      return { Icon: FileStack, label: id, sub: "" };
  }
}
