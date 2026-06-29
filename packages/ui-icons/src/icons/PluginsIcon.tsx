import type { SVGProps } from "react";
import { dockBrandFill } from "../lib/dock-brand-fills";

export function DockPluginsIcon(props: SVGProps<SVGSVGElement>) {
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
      <title>Plugins</title>
      <path
        d="M19 11v-2a2 2 0 0 0-2-2h-2V5a3 3 0 0 0-6 0v2H7a2 2 0 0 0-2 2v2"
        fill={dockBrandFill.cobalt}
        fillOpacity={0.2}
      />
      <path
        d="M5 15v2a2 2 0 0 0 2 2h2v2a3 3 0 0 0 6 0v-2h2a2 2 0 0 0 2-2v-2"
        fill={dockBrandFill.cobalt}
        fillOpacity={0.3}
      />
      <path d="M11 5v2" />
      <path d="M15 11h2" />
      <path d="M9 15H7" />
      <path d="M13 19v2" />
    </svg>
  );
}
