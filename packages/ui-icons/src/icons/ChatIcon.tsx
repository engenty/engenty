import type { SVGProps } from "react";
import { dockBrandFill } from "../lib/dock-brand-fills";

export function DockChatIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <title>Chat</title>
      <path
        d="M5 6.5a2 2 0 012-2h10a2 2 0 012 2v7a2 2 0 01-2 2h-5.5L7 19.5V15.5H7a2 2 0 01-2-2v-7z"
        fill={dockBrandFill.moss}
        fillOpacity={0.22}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <circle cx="9" cy="9.5" fill="currentColor" r="0.75" />
      <circle cx="12" cy="9.5" fill="currentColor" r="0.75" />
      <circle cx="15" cy="9.5" fill="currentColor" r="0.75" />
    </svg>
  );
}
