import type { CommercialBlock, CommercialBlockType } from "./types.js";

export function createEmptyBlock(
  type: CommercialBlockType
): Omit<CommercialBlock, "id" | "order_index"> {
  if (type === "line_item") {
    return {
      type,
      content: {
        title: "",
        quantity: 1,
        unit: "h",
        unit_price: 0,
        tax_rate: 20,
      },
    };
  }
  if (type === "phase") {
    return {
      type,
      content: { text: "Neue Phase" },
    };
  }
  return {
    type,
    content: { text: "" },
  };
}

export function normalizeBlockOrder(
  blocks: CommercialBlock[]
): CommercialBlock[] {
  return blocks.map((block, index) => ({ ...block, order_index: index }));
}

export function moveBlock(
  blocks: CommercialBlock[],
  from: number,
  to: number
): CommercialBlock[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= blocks.length ||
    to >= blocks.length
  ) {
    return blocks;
  }
  const next = [...blocks];
  const [picked] = next.splice(from, 1);
  next.splice(to, 0, picked);
  return normalizeBlockOrder(next);
}
