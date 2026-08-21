import type { SVGProps } from "react";
import { dockBrandFill } from "../lib/dock-brand-fills";

export function DockLeadsIcon(props: SVGProps<SVGSVGElement>) {
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
      <title>Leads</title>
      <circle
        cx="12"
        cy="12"
        fill={dockBrandFill.amber}
        fillOpacity={0.23}
        r="9"
      />
      <circle
        cx="12"
        cy="12"
        fill={dockBrandFill.amber}
        fillOpacity={0.46}
        r="5"
      />
      <circle
        cx="12"
        cy="12"
        fill={dockBrandFill.amber}
        fillOpacity={0.9}
        r="1"
      />
    </svg>
  );
}
