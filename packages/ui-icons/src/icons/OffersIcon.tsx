import type { SVGProps } from "react";
import { dockBrandFill } from "../lib/dock-brand-fills";

/** Angebote — a proposal/quote document (folded-corner page) with a
 *  highlighted total line. Distinct from the invoices receipt icon. */
export function DockOffersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      {...props}
    >
      <title>Offers</title>
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        fill={dockBrandFill.moss}
        fillOpacity={0.16}
      />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <rect
        fill={dockBrandFill.emberStrong}
        fillOpacity={0.42}
        height="1.7"
        rx="0.85"
        stroke="none"
        width="6"
        x="8"
        y="16.15"
      />
    </svg>
  );
}
