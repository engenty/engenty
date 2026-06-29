import { extractTextContent } from "@/features/pdf/engine/htmlToRichText";
import { isPhaseHeadlineBlock } from "../constants/blockDefaults";
import type { CommercialBlock } from "../types/blocks";
import type {
  CommercialTemplateDataBlock,
  CommercialTemplateDataBundle,
  CommercialTemplateDataGroup,
  CommercialTemplateDataItem,
  CommercialTemplateDataLineItemsEntry,
  CommercialTemplateDataPhase,
  CommercialTemplateDataSection,
} from "../types/templateData";
import {
  blockToContentBlock,
  blockToItemBase,
  calculateItemsSubtotal,
} from "./transform/blocks";

type DraftItem = Omit<
  CommercialTemplateDataItem,
  "position" | "block_position" | "entry_position"
> & {
  _sourcePosition?: string | null;
};

interface DraftBundle {
  _sourcePosition?: string | null;
  content: string | null;
  items: DraftItem[];
  title: string | null;
}

interface DraftLineItemsBlock {
  content: string | null;
  entries: Array<
    { type: "item"; item: DraftItem } | { type: "bundle"; bundle: DraftBundle }
  >;
  title: string | null;
}

const sumItemTotals = (items: CommercialTemplateDataItem[]) =>
  calculateItemsSubtotal(items);

const ensureSection = (
  section: CommercialTemplateDataSection | null,
  index: number,
  title: string | null
): CommercialTemplateDataSection => {
  if (section) {
    return section;
  }
  return {
    index,
    title,
    content: [],
    blocks: [],
    subtotal: 0,
    subtotal_formatted: "",
  };
};

const finalizeLineItemsBlock = (
  section: CommercialTemplateDataSection,
  lineItems: DraftLineItemsBlock,
  formatter: Intl.NumberFormat
) => {
  const blockIndex = section.blocks.length + 1;
  const blockPosition = `${section.index}.${blockIndex}`;
  const entries: CommercialTemplateDataLineItemsEntry[] = [];
  let blockSubtotal = 0;

  lineItems.entries.forEach((entry, entryIndex) => {
    const entryPosition = `${blockPosition}.${entryIndex + 1}`;
    if (entry.type === "item") {
      const { _sourcePosition, ...itemData } = entry.item;
      const item: CommercialTemplateDataItem = {
        ...itemData,
        block_position: blockPosition,
        entry_position: entryPosition,
        position: _sourcePosition ?? "",
      };
      blockSubtotal += item.total;
      entries.push({ type: "item", item });
      return;
    }

    const bundleItems: CommercialTemplateDataItem[] = entry.bundle.items.map(
      (item) => {
        const { _sourcePosition, ...itemData } = item;
        return {
          ...itemData,
          block_position: blockPosition,
          entry_position: entryPosition,
          position: _sourcePosition ?? "",
        };
      }
    );
    const bundleSubtotal = sumItemTotals(bundleItems);
    blockSubtotal += bundleSubtotal;

    const bundle: CommercialTemplateDataBundle = {
      position: entry.bundle._sourcePosition ?? "",
      title: entry.bundle.title,
      content: entry.bundle.content,
      items: bundleItems,
      subtotal: bundleSubtotal,
      subtotal_formatted: formatter.format(bundleSubtotal),
    };
    entries.push({ type: "bundle", bundle });
  });

  const block: CommercialTemplateDataBlock = {
    position: blockPosition,
    type: "line_items",
    title: lineItems.title,
    content: lineItems.content,
    entries,
    subtotal: blockSubtotal,
    subtotal_formatted: formatter.format(blockSubtotal),
  };

  section.blocks.push(block);
};

const finalizeSection = (
  section: CommercialTemplateDataSection | null,
  formatter: Intl.NumberFormat
) => {
  if (!section) {
    return null;
  }
  const subtotal = section.blocks.reduce(
    (sum, block) => sum + block.subtotal,
    0
  );
  const hasContent =
    section.content.length > 0 ||
    section.blocks.length > 0 ||
    section.title !== null;
  if (!hasContent) {
    return null;
  }
  return {
    ...section,
    subtotal,
    subtotal_formatted: formatter.format(subtotal),
  };
};

const finalizeGroup = (
  group: CommercialTemplateDataGroup | null,
  formatter: Intl.NumberFormat
) => {
  if (!group) {
    return null;
  }
  const subtotal = group.sections.reduce(
    (sum, section) => sum + section.subtotal,
    0
  );
  return {
    ...group,
    subtotal,
    subtotal_formatted: formatter.format(subtotal),
  };
};

function isLineItem(block: CommercialBlock): boolean {
  return block.type === "line_item";
}

export function groupCommercialBlocks(
  blocks: CommercialBlock[],
  formatter: Intl.NumberFormat,
  locale: string,
  currency: string,
  phasesEnabled: boolean,
  timeframeFrom: string | null,
  timeframeUntil: string | null,
  effectiveDefaultTaxRate?: number
): CommercialTemplateDataGroup[] {
  const groups: CommercialTemplateDataGroup[] = [];
  let currentGroup: CommercialTemplateDataGroup | null = null;
  let currentSection: CommercialTemplateDataSection | null = null;
  let currentLineItems: DraftLineItemsBlock | null = null;
  let sectionIndex = 0;

  const childrenMap = new Map<string, CommercialBlock[]>();
  for (const block of blocks) {
    if (isLineItem(block) && block.content?.parent_id) {
      const parentId = block.content.parent_id as string;
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)?.push(block);
    }
  }

  const childIds = new Set<string>();
  for (const children of childrenMap.values()) {
    for (const child of children) {
      childIds.add(child.id);
    }
  }

  const ensureGroup = (
    type: "general" | "phase",
    phase: CommercialTemplateDataPhase | null
  ) => {
    if (currentGroup) {
      return;
    }
    currentGroup = {
      type,
      phase,
      sections: [],
      subtotal: 0,
      subtotal_formatted: "",
    };
    sectionIndex = 0;
    currentSection = null;
  };

  const flushLineItems = () => {
    if (!(currentSection && currentLineItems)) {
      return;
    }
    finalizeLineItemsBlock(currentSection, currentLineItems, formatter);
    currentLineItems = null;
  };

  const flushSection = () => {
    if (!currentGroup) {
      return;
    }
    flushLineItems();
    const finalized = finalizeSection(currentSection, formatter);
    if (finalized) {
      currentGroup.sections.push(finalized);
    }
    currentSection = null;
  };

  const flushGroup = () => {
    flushSection();
    const finalized = finalizeGroup(currentGroup, formatter);
    if (finalized) {
      groups.push(finalized);
    }
    currentGroup = null;
    currentSection = null;
    currentLineItems = null;
    sectionIndex = 0;
  };

  const ensureSectionWithTitle = (title: string | null) => {
    sectionIndex += 1;
    currentSection = ensureSection(currentSection, sectionIndex, title);
  };

  for (const block of blocks) {
    if (childIds.has(block.id)) {
      continue;
    }

    if (isPhaseHeadlineBlock(block)) {
      if (!phasesEnabled) {
        ensureGroup("general", null);
        flushSection();
        ensureSectionWithTitle((block.content as any)?.title || null);
        const headlineContent =
          extractTextContent((block.content as any)?.content) || null;
        if (headlineContent && currentSection) {
          currentSection.content.push({
            type: "text",
            content: headlineContent,
          });
        }
        continue;
      }

      flushGroup();
      const phase: CommercialTemplateDataPhase = {
        title: (block.content as any)?.title || null,
        content: extractTextContent((block.content as any)?.content) || null,
        billing_type: (block.content as any)?.billing_type ?? null,
        timeframe_from: (block.content as any)?.timeframe_from ?? timeframeFrom,
        timeframe_until:
          (block.content as any)?.timeframe_until ?? timeframeUntil,
      };
      ensureGroup("phase", phase);
      continue;
    }

    if (block.type === "headline" || block.type === "subheading") {
      ensureGroup("general", null);
      flushSection();
      ensureSectionWithTitle((block.content as any)?.title || null);
      if (block.type === "headline" && (block.content as any)?.content) {
        currentSection.content.push(blockToContentBlock(block));
      }
      continue;
    }

    if (block.type === "text") {
      ensureGroup("general", null);
      if (!currentSection) {
        ensureSectionWithTitle(null);
      }
      currentSection.content.push(blockToContentBlock(block));
      continue;
    }

    if (block.type === "line_item") {
      ensureGroup("general", null);
      if (!currentSection) {
        ensureSectionWithTitle(null);
      }

      if (!currentLineItems) {
        currentLineItems = {
          title: null,
          content: null,
          entries: [],
        };
      }

      const baseItem = blockToItemBase(
        block,
        formatter,
        undefined,
        locale,
        currency,
        effectiveDefaultTaxRate
      );
      const draftItem: DraftItem = {
        ...baseItem,
        _sourcePosition: (block.content as any)?.position ?? null,
      };

      const children = childrenMap.get(block.id) || [];
      if (children.length > 0) {
        const bundleItems = children.map((child) => {
          const childItem = blockToItemBase(
            child,
            formatter,
            undefined,
            locale,
            currency,
            effectiveDefaultTaxRate
          );
          return {
            ...childItem,
            _sourcePosition: (child.content as any)?.position ?? null,
          };
        });
        currentLineItems.entries.push({
          type: "bundle",
          bundle: {
            title: draftItem.title,
            content: draftItem.content,
            items: bundleItems,
            _sourcePosition: draftItem._sourcePosition ?? null,
          },
        });
      } else {
        currentLineItems.entries.push({ type: "item", item: draftItem });
      }
    }
  }

  flushGroup();
  return groups;
}
