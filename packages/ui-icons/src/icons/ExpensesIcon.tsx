import type { SVGProps } from "react";
import { dockBrandFill } from "../lib/dock-brand-fills";

export function DockExpensesIcon(props: SVGProps<SVGSVGElement>) {
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
      <title>Expenses</title>
      <rect
        fill={dockBrandFill.rose}
        fillOpacity={0.22}
        height="12"
        rx="2"
        width="16"
        x="4"
        y="6"
      />
      <path d="M8 12h8" />
      <path d="M12 10v4" />
      <path d="M4 10h16" />
    </svg>
  );
}
