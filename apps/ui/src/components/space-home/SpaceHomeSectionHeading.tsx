/**
 * The one heading shape on the Space home.
 *
 * Both columns use it, which is what lines their first card up with each
 * other: the left column's Favoriten and the right column's Artefakte start
 * at the same y because they are the same element.
 */
import type { ReactNode } from "react";

export function SpaceHomeSectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="px-1 pt-5 pb-2 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider first:pt-0">
      {children}
    </h2>
  );
}
