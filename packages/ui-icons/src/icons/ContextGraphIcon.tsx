import type { SVGProps } from "react";
import { dockBrandFill } from "../lib/dock-brand-fills";

export function DockContextGraphIcon(props: SVGProps<SVGSVGElement>) {
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
      <title>Context Graph</title>
      <path
        d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"
        fill={dockBrandFill.cobalt}
        fillOpacity={0.42}
      />
      <path d="M9 13a4.5 4.5 0 0 0 3-4" />
      <path d="M12 8h8" />
      <path d="M16 8V5a2 2 0 0 1 2-2" />
      <path d="M12 13h4" />
      <path d="M12 18h6a2 2 0 0 1 2 2v1" />
      <circle cx="20" cy="8" fill="currentColor" r="1" stroke="none" />
      <circle cx="18" cy="3" fill="currentColor" r="1" stroke="none" />
      <circle cx="16" cy="13" fill="currentColor" r="1" stroke="none" />
      <circle cx="20" cy="21" fill="currentColor" r="1" stroke="none" />
    </svg>
  );
}
