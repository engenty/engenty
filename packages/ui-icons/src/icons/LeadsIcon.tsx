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
        fillOpacity={0.12}
        r="9"
      />
      <circle
        cx="12"
        cy="12"
        fill={dockBrandFill.amber}
        fillOpacity={0.24}
        r="5"
      />
      <circle
        cx="12"
        cy="12"
        fill={dockBrandFill.amber}
        fillOpacity={0.88}
        r="1"
      />
    </svg>
  );
}
