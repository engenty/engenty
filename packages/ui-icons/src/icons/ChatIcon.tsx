import type { SVGProps } from "react";
import { dockBrandFill } from "../lib/dock-brand-fills";

export function DockChatIcon(props: SVGProps<SVGSVGElement>) {
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
      <title>Chat</title>
      <path
        d="M6.5 4.25h11a2.5 2.5 0 0 1 2.5 2.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.5v-3.5h-.5a2.5 2.5 0 0 1-2.5-2.5v-8a2.5 2.5 0 0 1 2.5-2.5z"
        fill={dockBrandFill.moss}
        fillOpacity={0.22}
      />
      <circle cx="9" cy="10.5" fill="currentColor" r="1.1" stroke="none" />
      <circle cx="12" cy="10.5" fill="currentColor" r="1.1" stroke="none" />
      <circle cx="15" cy="10.5" fill="currentColor" r="1.1" stroke="none" />
    </svg>
  );
}
