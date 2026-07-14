import type { SVGProps } from "react";
import { dockBrandFill } from "../lib/dock-brand-fills";

export function DockInboxIcon(props: SVGProps<SVGSVGElement>) {
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
      <title>Inbox</title>
      <path
        d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7"
        fill={dockBrandFill.amber}
        fillOpacity={0.18}
        stroke="none"
      />
      <path
        d="M22 13h-4.5l-1.5 3h-8l-1.5-3H2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z"
        fill={dockBrandFill.amber}
        fillOpacity={0.26}
        stroke="none"
      />
      <path
        d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7"
        fill="none"
      />
      <path
        d="M22 13h-4.5l-1.5 3h-8l-1.5-3H2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z"
        fill="none"
      />
      <path d="M10 10h4" />
    </svg>
  );
}
