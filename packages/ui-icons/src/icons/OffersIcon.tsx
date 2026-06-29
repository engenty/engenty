import type { SVGProps } from "react";
import { dockBrandFill } from "../lib/dock-brand-fills";

export function DockOffersIcon(props: SVGProps<SVGSVGElement>) {
  const soft = 0.22;
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
      <path d="M2 12h20" />
      <path d="M12 2v20" />
      <rect
        fill={dockBrandFill.moss}
        fillOpacity={soft}
        height="6"
        rx="1"
        width="6"
        x="4"
        y="4"
      />
      <rect
        fill={dockBrandFill.moss}
        fillOpacity={soft}
        height="6"
        rx="1"
        width="6"
        x="14"
        y="4"
      />
      <rect
        fill={dockBrandFill.moss}
        fillOpacity={soft}
        height="6"
        rx="1"
        width="6"
        x="4"
        y="14"
      />
      <rect
        fill={dockBrandFill.moss}
        fillOpacity={soft}
        height="6"
        rx="1"
        width="6"
        x="14"
        y="14"
      />
      <circle
        cx="12"
        cy="12"
        fill={dockBrandFill.emberStrong}
        fillOpacity={0.42}
        r="3"
      />
    </svg>
  );
}
