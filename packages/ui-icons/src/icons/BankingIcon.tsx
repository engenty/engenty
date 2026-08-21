import type { SVGProps } from "react";
import { dockBrandFill } from "../lib/dock-brand-fills";

export function DockBankingIcon(props: SVGProps<SVGSVGElement>) {
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
      <title>Banking</title>
      <path d="M3 21h18" />
      <path d="M4 21v-4" />
      <path d="M20 21v-4" />
      <path d="M8 21v-4" />
      <path d="M12 21v-4" />
      <path d="M16 21v-4" />
      <path d="M2 11h20" fill={dockBrandFill.amber} fillOpacity={0.42} />
      <path d="M12 3l10 6H2z" fill={dockBrandFill.amber} fillOpacity={0.61} />
    </svg>
  );
}
