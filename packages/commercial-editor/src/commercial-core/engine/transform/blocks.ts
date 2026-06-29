import { extractTextContent } from "@/features/pdf/engine/htmlToRichText";
import { getLineItemSubtype } from "../../constants/blockDefaults";
import type { Unit } from "../../types";
import { getUnitDisplayLabel } from "../../types";
import type { CommercialBlock } from "../../types/blocks";
import type {
  CommercialTemplateDataContentBlock,
  CommercialTemplateDataItem,
} from "../../types/templateData";
import { formatCurrencyPrice } from "./formatters";

function isBillableItem(item: CommercialTemplateDataItem): boolean {
  const subtype = item.line_item_subtype;
  if (
    subtype === "headline" ||
    subtype === "text" ||
    subtype === "page_break"
  ) {
    return false;
  }
  return true;
}

export function calculateItemsSubtotal(
  items: CommercialTemplateDataItem[]
): number {
  return items
    .filter(isBillableItem)
    .reduce((sum, item) => sum + (item.total || 0), 0);
}

export function blockToItemBase(
  block: CommercialBlock,
  _formatter: Intl.NumberFormat,
  units?: Unit[],
  locale?: string,
  currency?: string,
  effectiveDefaultTaxRate?: number
): Omit<
  CommercialTemplateDataItem,
  "position" | "block_position" | "entry_position"
> {
  const subtype = getLineItemSubtype(block.content as Record<string, unknown>);
  const amount =
    (block.content as any)?.amount || (subtype === "position" ? 1 : 0);
  const costPerItem = (block.content as any)?.cost_per_item || 0;
  const total = subtype === "position" ? amount * costPerItem : 0;
  const tax =
    effectiveDefaultTaxRate === undefined
      ? (block.content as any)?.tax || 0
      : effectiveDefaultTaxRate;
  const unitKey = (block.content as any)?.unit || "h";
  const unitDisplay = units?.length
    ? getUnitDisplayLabel(units, unitKey, amount)
    : unitKey;
  const loc = locale || "de-DE";
  const curr = currency || "EUR";
  return {
    amount,
    unit: unitKey,
    unit_display: unitDisplay,
    title: (block.content as any)?.title || "",
    content: extractTextContent((block.content as any)?.content) || null,
    tax,
    tax_formatted: `${tax}%`,
    cost_per_item: costPerItem,
    total,
    cost_per_item_formatted: formatCurrencyPrice(costPerItem, loc, curr),
    total_formatted: formatCurrencyPrice(total, loc, curr),
    line_item_subtype: subtype,
  };
}

export function blockToContentBlock(
  block: CommercialBlock
): CommercialTemplateDataContentBlock {
  return {
    type: "text",
    content: extractTextContent((block.content as any)?.content) || null,
  };
}
