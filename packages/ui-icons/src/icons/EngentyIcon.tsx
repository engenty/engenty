import type { SVGProps } from "react";
import { dockBrandFill } from "../lib/dock-brand-fills";

export function DockEngentyIcon(props: SVGProps<SVGSVGElement>) {
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
      <title>Engenty</title>
      <rect
        fill={dockBrandFill.ember}
        fillOpacity={0.42}
        height="10"
        rx="2"
        width="18"
        x="3"
        y="11"
      />
      <circle
        cx="12"
        cy="5"
        fill={dockBrandFill.emberStrong}
        fillOpacity={0.61}
        r="2"
      />
      <path d="M12 7v4" />
      <path d="M8 16h.01" />
      <path d="M16 16h.01" />
    </svg>
  );
}
