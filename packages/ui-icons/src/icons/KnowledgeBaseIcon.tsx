import type { SVGProps } from "react";
import { dockBrandFill } from "../lib/dock-brand-fills";

export function DockKnowledgeBaseIcon(props: SVGProps<SVGSVGElement>) {
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
      <title>Knowledge Base</title>
      <path
        d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"
        fill={dockBrandFill.ember}
        fillOpacity={0.46}
      />
      <path d="M8 7h6" />
      <path d="M8 11h8" />
    </svg>
  );
}
