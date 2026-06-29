import type { SVGProps } from "react";
import { dockBrandFill } from "../lib/dock-brand-fills";

export function DockAuditLogsIcon(props: SVGProps<SVGSVGElement>) {
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
      <title>Audit Logs</title>
      <path
        d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"
        fill={dockBrandFill.cobalt}
        fillOpacity={0.22}
      />
      <rect
        fill={dockBrandFill.emberStrong}
        fillOpacity={0.32}
        height="4"
        rx="1"
        width="6"
        x="9"
        y="3"
      />
      <path d="M9 14l2 2 4-4" />
    </svg>
  );
}
