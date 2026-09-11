/**
 * A space's colour and icon (PLAN-spaces.md Phase 5a ②).
 *
 * The rail is a column of small tiles, and colour is how a place is recognised
 * there before any label is read — the tile treatment already depends on it
 * (`SidebarSpacesZone`: "a place must not look like a tool"). Until now the
 * columns existed and nothing could set them, so every space was the same grey.
 *
 * **A fixed palette, not a colour input.** Any hex would let someone pick a
 * tile that cannot carry white text, and the rail's whole readability rests on
 * that contrast; ten deliberate values with a checked foreground beat a picker
 * that can produce an unreadable tile. Clearing the colour is offered too — the
 * neutral tile is a valid choice, not a missing one.
 *
 * The icon is initials, one emoji, or a small JPEG data URL (Upload). Object
 * storage for larger art is still Phase 6b; the tile compressor keeps the
 * picture inside `spaces.icon` so the rail can render it today.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";

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

export interface SpaceAppearanceValue {
  color: string | null;
  icon: string | null;
}

export function SpaceColorSwatches({
  onChange,
  value,
}: {
  onChange: (color: string | null) => void;
  value: string | null;
}) {
  const { t } = useTranslation("common");
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {SPACE_COLORS.map((color) => (
        <button
          aria-label={color}
          aria-pressed={value === color}
          className={cn(
            "size-6 rounded-full transition",
            value === color
              ? "ring-2 ring-ring ring-offset-2 ring-offset-background"
              : "hover:scale-110"
          )}
          key={color}
          onClick={() => onChange(color)}
          style={{ backgroundColor: color }}
          type="button"
        />
      ))}
      <button
        aria-label={t("spaces.setup.colorNone")}
        aria-pressed={value == null}
        className={cn(
          "size-6 rounded-full border border-border bg-muted text-[10px] text-muted-foreground transition",
          value == null
            ? "ring-2 ring-ring ring-offset-2 ring-offset-background"
            : "hover:scale-110"
        )}
        onClick={() => onChange(null)}
        type="button"
      >
        ✕
      </button>
    </div>
  );
}
