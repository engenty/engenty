import type { SVGProps } from "react";
import { dockBrandFill } from "../lib/dock-brand-fills";

export function DockTimeTrackingIcon(props: SVGProps<SVGSVGElement>) {
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
      <title>Time Tracking</title>
      <circle
        cx="12"
        cy="12"
        fill={dockBrandFill.amber}
        fillOpacity={0.24}
        r="9"
      />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}
