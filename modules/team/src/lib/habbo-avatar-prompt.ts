/**
 * Shared Habbo avatar option labels + Gemini prompt builder (server + tests).
 */

export interface HabboAvatarGenOptions {
  glasses?: boolean;
  hairColor?: "dark" | "blonde" | "auburn" | "silver" | "ember";
  hairStyle?: "short" | "wavy" | "spiky" | "bob" | "afro";
  outfitColor?: "ember" | "cobalt" | "moss" | "rose" | "amber" | "dark";
  outfitStyle?: "casual" | "suit" | "hoodie" | "engenty";
  skinTone?: "fair" | "medium" | "tan" | "deep";
}

const SKIN_LABEL: Record<
  NonNullable<HabboAvatarGenOptions["skinTone"]>,
  string
> = {
  fair: "fair / light peach skin",
  medium: "medium tan skin",
  tan: "warm tan skin",
  deep: "deep brown skin",
};

const HAIR_COLOR_LABEL: Record<
  NonNullable<HabboAvatarGenOptions["hairColor"]>,
  string
> = {
  dark: "dark espresso brown/black hair",
  blonde: "golden blonde hair",
  auburn: "auburn / reddish-brown hair",
  silver: "silver-grey hair",
  ember: "ember red hair",
};

const HAIR_STYLE_LABEL: Record<
  NonNullable<HabboAvatarGenOptions["hairStyle"]>,
  string
> = {
  short: "short neat Habbo hair with fringe",
  wavy: "shoulder-length wavy hair",
  spiky: "spiky short hair",
  bob: "chin-length bob",
  afro: "rounded curly afro",
};

const OUTFIT_COLOR_LABEL: Record<
  NonNullable<HabboAvatarGenOptions["outfitColor"]>,
  string
> = {
  ember: "ember orange (#f05a28)",
  cobalt: "cobalt blue",
  moss: "moss green",
  rose: "rose pink",
  amber: "amber gold / mustard",
  dark: "charcoal / near-black",
};

const OUTFIT_STYLE_LABEL: Record<
  NonNullable<HabboAvatarGenOptions["outfitStyle"]>,
  string
> = {
  casual: "casual long-sleeve sweatshirt",
  suit: "simple suit jacket with white shirt and dark tie",
  hoodie: "hoodie with front pocket and drawstrings",
  engenty: "casual top with a tiny orange square badge on the chest",
};

/**
 * Prompt for Gemini Habbo-style isometric avatars.
 * Solid white background so clients can strip light edge artefacts cleanly.
 */
export function buildHabboAvatarPrompt(
  options: HabboAvatarGenOptions = {},
  opts?: { memberName?: string; variationHint?: string }
): string {
  const skin = SKIN_LABEL[options.skinTone ?? "medium"];
  const hairColor = HAIR_COLOR_LABEL[options.hairColor ?? "dark"];
  const hairStyle = HAIR_STYLE_LABEL[options.hairStyle ?? "short"];
  const outfitColor = OUTFIT_COLOR_LABEL[options.outfitColor ?? "ember"];
  const outfitStyle = OUTFIT_STYLE_LABEL[options.outfitStyle ?? "casual"];
  const glasses = options.glasses
    ? "Simple black rectangular pixel glasses."
    : "No glasses.";
  const nameBit = opts?.memberName?.trim()
    ? ` Character vibe inspired by "${opts.memberName.trim()}" (do not render any text or name).`
    : "";
  const variation = opts?.variationHint?.trim()
    ? ` Variation: ${opts.variationHint.trim()}.`
    : "";

  return [
    "Habbo Hotel style isometric 8-bit pixel art avatar, single full-body character,",
    "classic Habbo proportions (slightly oversized head), 3/4 isometric view facing bottom-right,",
    "thick solid 1px black outlines, flat solid color fills, minimal block shading, no gradients,",
    "no anti-aliasing, perfectly crisp aliased pixels, no photo realism, no smooth illustration.",
    `Skin: ${skin}. Hair: ${hairStyle}, ${hairColor}.`,
    `Outfit: ${outfitStyle} in ${outfitColor}, dark charcoal or navy pants, simple sneakers.`,
    glasses,
    "Habbo face: small vertical pixel eyes, tiny L-nose, short line mouth.",
    "Background must be a flat solid pure white (#FFFFFF) with no checkerboard, no shadows, no floor,",
    "no props, no text, no watermark — character only, centered.",
    nameBit,
    variation,
  ]
    .filter(Boolean)
    .join(" ");
}

export const HABBO_AVATAR_VARIATIONS: Array<{
  hint: string;
  id: number;
  label: string;
  patch: HabboAvatarGenOptions;
}> = [
  {
    id: 1,
    label: "Casual Habbo",
    patch: { hairStyle: "short", outfitStyle: "casual", glasses: false },
    hint: "everyday casual look",
  },
  {
    id: 2,
    label: "Executive Suit",
    patch: { hairStyle: "wavy", outfitStyle: "suit", glasses: false },
    hint: "slightly more formal posture",
  },
  {
    id: 3,
    label: "Cyber Copilot",
    patch: { hairStyle: "spiky", outfitStyle: "engenty", glasses: true },
    hint: "playful techy vibe with glasses",
  },
];
