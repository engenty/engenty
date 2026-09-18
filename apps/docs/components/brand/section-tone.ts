import type { EngentyKind } from "@engenty/ui-core/components/engenty";

/**
 * Every docs section has a colour and a mascot. The colours are the www
 * landing's deep band fills (`apps/www/src/components/color-band.tsx`), so the
 * docs read as rooms of the same house; the mascot is the flat engenty that
 * stands on the section's title and sidebar banner.
 */
export type DocsTone =
  | "ember"
  | "cobalt"
  | "moss"
  | "amber"
  | "plum"
  | "slate"
  | "night";

export interface SectionBrand {
  tone: DocsTone;
  kind: EngentyKind;
}

const SECTIONS: Record<string, SectionBrand> = {
  dev: { tone: "ember", kind: "flame" },
  user: { tone: "cobalt", kind: "round" },
  setup: { tone: "moss", kind: "dome" },
  roadmap: { tone: "amber", kind: "drop" },
  wip: { tone: "plum", kind: "tower" },
  internal: { tone: "slate", kind: "pebble" },
};

const HUB: SectionBrand = { tone: "ember", kind: "oval" };

/** `/docs/dev/plugins` → the Developer section's brand; hubs get the ember oval. */
export function sectionBrand(pathname: string): SectionBrand {
  const [, docs, first] = pathname.split("/");
  if (docs !== "docs" || !first) {
    return HUB;
  }
  return SECTIONS[first] ?? HUB;
}
