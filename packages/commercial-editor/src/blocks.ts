import type { CommercialBlock } from "./types.js";

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
