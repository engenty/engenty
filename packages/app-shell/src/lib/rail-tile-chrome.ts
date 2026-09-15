/**
 * App-bar tile chrome: filled spaces and line-glyph apps (chat, tasks,
 * notifications).
 *
 * Rest / hover are real shadows (blur, no spread) so they do not read as a
 * stroke. Active keeps the existing 2px ring.
 */
export const RAIL_TILE_REST_SHADOW_CLASSNAME =
  "shadow-[0_0_2px_color-mix(in_oklch,var(--sidebar-foreground)_42%,transparent)]";

export const RAIL_TILE_ACTIVE_RING_CLASSNAME =
  "shadow-[0_2px_8px_rgb(0_0_0/0.35)] ring-2 ring-sidebar-foreground/90";

/** Quiet space tile: soft halo at rest, a fuller shadow on hover. */
export const RAIL_TILE_SPACE_REST_CLASSNAME = `${RAIL_TILE_REST_SHADOW_CLASSNAME} group-hover/space:shadow-[0_0_4px_color-mix(in_oklch,var(--sidebar-foreground)_58%,transparent),0_1px_3px_rgb(0_0_0/0.22)] group-focus-within/space:shadow-[0_0_4px_color-mix(in_oklch,var(--sidebar-foreground)_58%,transparent),0_1px_3px_rgb(0_0_0/0.22)]`;

/** Line-glyph apps: no rest chrome, the same hover shadow as quiet spaces. */
export const RAIL_TILE_GLYPH_HOVER_CLASSNAME =
  "hover:shadow-[0_0_4px_color-mix(in_oklch,var(--sidebar-foreground)_58%,transparent),0_1px_3px_rgb(0_0_0/0.22)] focus-visible:shadow-[0_0_4px_color-mix(in_oklch,var(--sidebar-foreground)_58%,transparent),0_1px_3px_rgb(0_0_0/0.22)]";
