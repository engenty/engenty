import type { SVGProps } from "react";
import { dockBrandFill } from "../lib/dock-brand-fills";

export function DockContactsIcon(props: SVGProps<SVGSVGElement>) {
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
      <title>Contacts</title>
      <rect
        fill={dockBrandFill.moss}
        fillOpacity={0.42}
        height="16"
        rx="2"
        width="20"
        x="2"
        y="4"
      />
      <circle
        cx="8"
        cy="12"
        fill={dockBrandFill.moss}
        fillOpacity={0.65}
        r="3"
      />
      <path d="M14 10h4" />
      <path d="M14 14h4" />
    </svg>
  );
}
