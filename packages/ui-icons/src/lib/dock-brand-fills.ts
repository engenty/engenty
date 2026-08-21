/**
 * `fill` values for primary-rail (dock) icons. Resolves against the Ember
 * tokens from `packages/design-tokens/src/ember-primitives.css`.
 *
 * Chroma is lifted off the token rather than a colour being hardcoded: hue and
 * lightness still come from the theme, so the icons keep tracking the tenant's
 * primary, the light/dark flip and the contrast scalar — they just carry more
 * of it. The semantic tokens are tuned to be legible as *text and borders*; at
 * the wash opacity an icon fill is drawn at, that much chroma reads as grey.
 */
const vivid = (token: string) => `oklch(from var(${token}) l calc(c * 1.5) h)`;

export const dockBrandFill = {
  amber: vivid("--amber"),
  cobalt: vivid("--cobalt"),
  ember: vivid("--ember"),
  emberStrong: vivid("--ember-strong"),
  inkMuted: "var(--ink-3)",
  moss: vivid("--moss"),
  rose: vivid("--rose"),
} as const;

/**
 * Default wash opacity for an icon fill. Individual icons scale around this
 * where a shape needs to sit forward or drop back; keep those relative, not
 * absolute, so the whole set moves together.
 */
export const DOCK_FILL_OPACITY = 0.42;
