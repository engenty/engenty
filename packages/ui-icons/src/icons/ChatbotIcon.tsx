import type { SVGProps } from "react";
import { dockBrandFill } from "../lib/dock-brand-fills";

export function DockChatbotIcon(props: SVGProps<SVGSVGElement>) {
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
      <title>Chatbot</title>
      <path d="M12 2.75v1.5" />
      <circle cx="12" cy="2" fill="currentColor" r="0.9" stroke="none" />
      <path
        d="M6.5 4.25h11a2.5 2.5 0 0 1 2.5 2.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.5v-3.5h-.5a2.5 2.5 0 0 1-2.5-2.5v-8a2.5 2.5 0 0 1 2.5-2.5z"
        fill={dockBrandFill.rose}
        fillOpacity={0.24}
      />
      <circle cx="9.5" cy="10.5" fill="currentColor" r="1.1" stroke="none" />
      <circle cx="14.5" cy="10.5" fill="currentColor" r="1.1" stroke="none" />
      <path d="M10 13.5q2 1.25 4 0" />
    </svg>
  );
}
