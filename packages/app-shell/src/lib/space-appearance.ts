// A space's tile colours and icon presets, shared by the space dialogs and the
// tenant setup wizard. A fixed palette, not a colour input: each value is
// checked to carry white text in both themes, so no pick makes the rail
// unreadable.

/** Tile colours, each checked to carry white text in both themes. */
export const SPACE_COLORS = [
  "#64748b",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0d9488",
  "#2563eb",
  "#4f46e5",
  "#7c3aed",
  "#db2777",
] as const;

export function pickRandomSpaceColor(): (typeof SPACE_COLORS)[number] {
  const index = Math.floor(Math.random() * SPACE_COLORS.length);
  return SPACE_COLORS[index] ?? SPACE_COLORS[0];
}

/** A starting set, not a limit — the emoji tab also searches the full set. */
export const SPACE_ICONS = [
  "🏢",
  "🚀",
  "💼",
  "📣",
  "🎨",
  "🧪",
  "🛠️",
  "📊",
  "💰",
  "🤝",
  "📦",
  "🌱",
  "⚙️",
  "🔒",
  "🎯",
  "☕",
] as const;
