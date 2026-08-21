import type { SVGProps } from "react";
import { dockBrandFill } from "../lib/dock-brand-fills";

/** Rechnungen — a receipt/bill (torn bottom edge) with line items and a
 *  highlighted amount coin. Distinct from the offers proposal document. */
export function DockInvoicesIcon(props: SVGProps<SVGSVGElement>) {
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
      <title>Invoices</title>
      <path
        d="M5 2h14v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z"
        fill={dockBrandFill.moss}
        fillOpacity={0.3}
      />
      <path d="M8 7h8" />
      <path d="M8 11h5" />
      <circle
        cx="15.5"
        cy="12"
        fill={dockBrandFill.emberStrong}
        fillOpacity={0.8}
        r="1.6"
        stroke="none"
      />
    </svg>
  );
}
