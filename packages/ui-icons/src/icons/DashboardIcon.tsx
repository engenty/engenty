import type { SVGProps } from "react";
import { dockBrandFill } from "../lib/dock-brand-fills";

export function DockDashboardIcon(props: SVGProps<SVGSVGElement>) {
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
      <title>Dashboard</title>
      <rect
        fill={dockBrandFill.ember}
        fillOpacity={soft}
        height="7"
        rx="1.5"
        width="7"
        x="3"
        y="3"
      />
      <rect
        fill={dockBrandFill.cobalt}
        fillOpacity={soft}
        height="11"
        rx="1.5"
        width="7"
        x="14"
        y="3"
      />
      <rect
        fill={dockBrandFill.moss}
        fillOpacity={soft}
        height="7"
        rx="1.5"
        width="7"
        x="3"
        y="14"
      />
      <rect
        fill={dockBrandFill.amber}
        fillOpacity={soft}
        height="3"
        rx="1.5"
        width="7"
        x="14"
        y="18"
      />
    </svg>
  );
}
