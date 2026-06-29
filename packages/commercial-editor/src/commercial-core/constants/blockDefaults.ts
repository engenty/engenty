export type LineItemSubtype = "position" | "headline" | "text" | "page_break";

export function getLineItemSubtype(
  content: Record<string, unknown> | null | undefined
): LineItemSubtype {
  const subtype = content?.line_item_subtype as string | undefined;
  if (
    subtype === "headline" ||
    subtype === "text" ||
    subtype === "page_break"
  ) {
    return subtype;
  }
  return "position";
}

export function isSpecialLineItem(
  content: Record<string, unknown> | null | undefined
): boolean {
  const subtype = getLineItemSubtype(content);
  return (
    subtype === "headline" || subtype === "text" || subtype === "page_break"
  );
}

export const FALLBACK_TAX_RATE = 20;

export function createLineItemDefaults(
  subtype: LineItemSubtype,
  defaultTax?: number
): Record<string, unknown> {
  return {
    title: "",
    content: "",
    amount: subtype === "position" ? 1 : 0,
    unit: subtype === "position" ? "h" : "text",
    cost_per_item: 0,
    tax: defaultTax ?? FALLBACK_TAX_RATE,
    item_total: 0,
    parent_id: null,
    position: null,
    line_item_subtype: subtype,
  };
}

export function getPhaseHeadlineDefaults(): Record<string, unknown> {
  return {
    title: "",
    content: "",
    is_phase: true,
    timeframe_from: null,
    timeframe_until: null,
    billing_type: null,
  };
}

export function isPhaseHeadlineBlock(
  block:
    | { type: string; content?: Record<string, unknown> | null }
    | null
    | undefined
): boolean {
  if (!block) {
    return false;
  }
  return block.type === "headline" && block.content?.is_phase === true;
}

export function isContentHeadlineBlock(
  block:
    | { type: string; content?: Record<string, unknown> | null }
    | null
    | undefined
): boolean {
  if (!block) {
    return false;
  }
  return block.type === "headline" && block.content?.is_phase !== true;
}

export const getDefaultContent = (type: string, defaultTax?: number) => {
  switch (type) {
    case "headline":
    case "subheading":
      return {
        title: "",
        content: "",
      };
    case "phase_headline":
      return getPhaseHeadlineDefaults();
    case "text":
      return {
        content: "",
      };
    case "line_item":
      return createLineItemDefaults("position", defaultTax);
    default:
      return {};
  }
};

export const createGroupDefaults = (parentId: string, defaultTax?: number) => {
  const tax = defaultTax ?? FALLBACK_TAX_RATE;
  return {
    parent: {
      ...createLineItemDefaults("headline", tax),
    },
    child: {
      title: "",
      content: "",
      amount: 1,
      unit: "h",
      cost_per_item: 0,
      tax,
      item_total: 0,
      parent_id: parentId,
      position: null,
      line_item_subtype: "position",
    },
  };
};
