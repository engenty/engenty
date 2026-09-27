/**
 * A row in one of the home's right-column cards (Module, Erweiterungen,
 * Skills), drawn like the sidebar's SpaceNavRow: one radius, one hover, full
 * contrast, a plain icon that grows a little on hover.
 */
export const SPACE_HOME_ROW_CLASSNAME =
  "group/item flex w-full items-center gap-2 rounded-[8px] px-2 py-0.5 text-left text-foreground text-sm transition hover:bg-muted/60";

export const SPACE_HOME_ROW_ICON_CLASSNAME =
  "grid size-7 shrink-0 place-items-center text-foreground";

/** A lucide glyph in the icon slot. */
export const SPACE_HOME_ROW_GLYPH_CLASSNAME =
  "size-4 transition-transform duration-200 ease-out group-hover/item:scale-110";

/** A module's dock icon in the icon slot — the sidebar's size. */
export const SPACE_HOME_ROW_DOCK_ICON_CLASSNAME =
  "size-5 transition-transform duration-200 ease-out group-hover/item:scale-110";
