import type { SVGProps } from "react";

/**
 * The list-pane toggle, as a pair. Lucide has no icon in this arrangement:
 * mirroring `ListIndentDecrease` moves the lines to the left but flips the
 * chevron with them, and `ListChevrons*` points the chevrons up and down.
 * These keep the lines left and the chevron on the right, pointing the way the
 * pane actually moves.
 *
 * Drawn on lucide's grid — 24 units, 2-unit round strokes — so they sit level
 * with the lucide icons beside them in the same strip.
 */
function ListPaneIcon({
  chevron,
  ...props
}: SVGProps<SVGSVGElement> & { chevron: string }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      {...props}
    >
      <path d="M3 5h10" />
      <path d="M3 12h10" />
      <path d="M3 19h10" />
      <path d={chevron} />
    </svg>
  );
}

/** Shown while the list is open: the chevron points at where it will go. */
export function ListPaneCloseIcon(props: SVGProps<SVGSVGElement>) {
  return <ListPaneIcon chevron="m21 8-4 4 4 4" {...props} />;
}

/** Shown while the list is hidden: the chevron points at where it will return. */
export function ListPaneOpenIcon(props: SVGProps<SVGSVGElement>) {
  return <ListPaneIcon chevron="m17 8 4 4-4 4" {...props} />;
}
