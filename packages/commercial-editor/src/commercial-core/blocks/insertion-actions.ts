import type { LucideIcon } from "lucide-react";
import {
  FileText,
  FolderPlus,
  Heading1,
  Heading2,
  List,
  Pilcrow,
  Plus,
  SeparatorHorizontal,
  TextQuote,
} from "lucide-react";

export type InsertionDocumentType = "offer" | "invoice";

export type InsertionActionId =
  | "phase_start"
  | "headline"
  | "text"
  | "group_position"
  | "line_item"
  | "line_item_headline"
  | "line_item_text"
  | "line_item_page_break"
  | "sub_item";

export interface InsertionActionDefinition {
  blockKind: "content" | "line_item";
  icon: LucideIcon;
  id: InsertionActionId;
  labelKey: (documentType: InsertionDocumentType) => string;
}

interface InsertionCapabilities {
  allowGroup?: boolean;
  allowLineItemSubtype?: boolean;
  allowPhase?: boolean;
  allowSubItem?: boolean;
}

export interface InsertionHandlers {
  addBlockAbove: (index: number, type: string) => unknown;
  addGroup?: (index: number) => unknown;
  addLineItemAbove?: (
    index: number,
    subtype: "position" | "headline" | "text" | "page_break"
  ) => unknown;
  addSubItem?: (parentId: string) => unknown;
}

export interface ExecuteInsertionActionArgs {
  actionId: InsertionActionId;
  atIndex: number;
  handlers: InsertionHandlers;
  parentId?: string | null;
}

const actionCatalog: Record<InsertionActionId, InsertionActionDefinition> = {
  phase_start: {
    blockKind: "content",
    id: "phase_start",
    icon: Plus,
    labelKey: (documentType) => `${documentType}s.phase`,
  },
  headline: {
    blockKind: "content",
    id: "headline",
    icon: Heading1,
    labelKey: (documentType) => `${documentType}s.headline`,
  },
  text: {
    blockKind: "content",
    id: "text",
    icon: FileText,
    labelKey: (documentType) => `${documentType}s.textParagraph`,
  },
  group_position: {
    blockKind: "line_item",
    id: "group_position",
    icon: FolderPlus,
    labelKey: (documentType) => `${documentType}s.groupPosition`,
  },
  line_item: {
    blockKind: "line_item",
    id: "line_item",
    icon: List,
    labelKey: (documentType) => `${documentType}s.lineItem`,
  },
  line_item_headline: {
    blockKind: "line_item",
    id: "line_item_headline",
    icon: Heading2,
    labelKey: (documentType) => `${documentType}s.headlineLineItem`,
  },
  line_item_text: {
    blockKind: "line_item",
    id: "line_item_text",
    icon: Pilcrow,
    labelKey: (documentType) => `${documentType}s.textLineItem`,
  },
  line_item_page_break: {
    blockKind: "line_item",
    id: "line_item_page_break",
    icon: SeparatorHorizontal,
    labelKey: (documentType) => `${documentType}s.pageBreakLineItem`,
  },
  sub_item: {
    blockKind: "line_item",
    id: "sub_item",
    icon: TextQuote,
    labelKey: (documentType) => `${documentType}s.subItem`,
  },
};

export interface InsertionActionSection {
  actions: InsertionActionDefinition[];
  id: "content" | "line_item";
  titleKey: (documentType: InsertionDocumentType) => string;
}

const sectionTitleKeyByKind: Record<
  InsertionActionSection["id"],
  (documentType: InsertionDocumentType) => string
> = {
  content: (documentType) => `${documentType}s.menuGroups.contentBlocks`,
  line_item: (documentType) => `${documentType}s.menuGroups.lineItemBlocks`,
};

const actionGroups = {
  blockMenu: [
    "phase_start",
    "headline",
    "text",
    "group_position",
    "line_item",
    "line_item_headline",
    "line_item_text",
    "line_item_page_break",
  ] as InsertionActionId[],
  tableFooter: [
    "line_item",
    "group_position",
    "line_item_headline",
    "line_item_text",
    "line_item_page_break",
  ] as InsertionActionId[],
  rowTopLevel: [
    "line_item",
    "group_position",
    "sub_item",
    "line_item_headline",
    "line_item_text",
    "line_item_page_break",
  ] as InsertionActionId[],
  rowChild: ["sub_item"] as InsertionActionId[],
  rootAdd: [
    "phase_start",
    "headline",
    "text",
    "group_position",
    "line_item",
    "line_item_headline",
    "line_item_text",
    "line_item_page_break",
  ] as InsertionActionId[],
};

function isActionAllowed(
  actionId: InsertionActionId,
  caps: InsertionCapabilities
): boolean {
  if (actionId === "phase_start" && !caps.allowPhase) {
    return false;
  }
  if (actionId === "group_position" && !caps.allowGroup) {
    return false;
  }
  if (
    (actionId === "line_item_headline" ||
      actionId === "line_item_text" ||
      actionId === "line_item_page_break") &&
    !caps.allowLineItemSubtype
  ) {
    return false;
  }
  if (actionId === "sub_item" && !caps.allowSubItem) {
    return false;
  }
  return true;
}

export function getInsertionActionsForGroup(
  group: keyof typeof actionGroups,
  capabilities: InsertionCapabilities
): InsertionActionDefinition[] {
  return actionGroups[group]
    .filter((actionId) => isActionAllowed(actionId, capabilities))
    .map((actionId) => actionCatalog[actionId]);
}

export function groupInsertionActionsByKind(
  actions: InsertionActionDefinition[]
): InsertionActionSection[] {
  const order: InsertionActionSection["id"][] = ["content", "line_item"];
  return order
    .map((id) => ({
      id,
      titleKey: sectionTitleKeyByKind[id],
      actions: actions.filter((action) => action.blockKind === id),
    }))
    .filter((section) => section.actions.length > 0);
}

export function executeInsertionAction({
  actionId,
  atIndex,
  parentId,
  handlers,
}: ExecuteInsertionActionArgs): boolean {
  switch (actionId) {
    case "phase_start":
      handlers.addBlockAbove(atIndex, "phase_start");
      return true;
    case "headline":
      handlers.addBlockAbove(atIndex, "headline");
      return true;
    case "text":
      handlers.addBlockAbove(atIndex, "text");
      return true;
    case "line_item":
      handlers.addBlockAbove(atIndex, "line_item");
      return true;
    case "group_position":
      if (!handlers.addGroup) {
        return false;
      }
      handlers.addGroup(atIndex);
      return true;
    case "line_item_headline":
      if (!handlers.addLineItemAbove) {
        return false;
      }
      handlers.addLineItemAbove(atIndex, "headline");
      return true;
    case "line_item_text":
      if (!handlers.addLineItemAbove) {
        return false;
      }
      handlers.addLineItemAbove(atIndex, "text");
      return true;
    case "line_item_page_break":
      if (!handlers.addLineItemAbove) {
        return false;
      }
      handlers.addLineItemAbove(atIndex, "page_break");
      return true;
    case "sub_item":
      if (!(handlers.addSubItem && parentId)) {
        return false;
      }
      handlers.addSubItem(parentId);
      return true;
    default: {
      const exhaustive: never = actionId;
      return exhaustive;
    }
  }
}
