/** Curated preset emoji icons for icon pickers (Notion-style grid). */
export const EMOJI_ICON_PRESETS = [
  "📚",
  "💡",
  "🎯",
  "🚀",
  "⚙️",
  "🗂️",
  "📝",
  "🔍",
  "✅",
  "🌐",
  "💼",
  "🏗️",
  "🤝",
  "💬",
  "📊",
  "🧩",
  "🌟",
  "🔐",
  "📦",
  "🎨",
] as const;

export type EmojiIconPreset = (typeof EMOJI_ICON_PRESETS)[number];

export function countEmojiGraphemes(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, {
      granularity: "grapheme",
    });
    let count = 0;
    for (const _ of segmenter.segment(trimmed)) {
      count += 1;
    }
    return count;
  }

  return [...trimmed].length;
}

export function isSingleEmoji(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  return countEmojiGraphemes(trimmed) === 1;
}

export function normalizeEmojiInput(value: string): string | null {
  const trimmed = value.trim();
  return isSingleEmoji(trimmed) ? trimmed : null;
}
