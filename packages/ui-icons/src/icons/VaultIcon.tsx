import type { SVGProps } from "react";
import { dockBrandFill } from "../lib/dock-brand-fills";

export function DockVaultIcon(props: SVGProps<SVGSVGElement>) {
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
      <title>Vault</title>
      <rect
        fill={dockBrandFill.cobalt}
        fillOpacity={0.22}
        height="18"
        rx="2.5"
        width="18"
        x="3"
        y="3"
      />
      <circle
        cx="12"
        cy="12"
        fill={dockBrandFill.cobalt}
        fillOpacity={0.34}
        r="4"
      />
      <path d="M12 9.5v3" />
      <path d="M12 12.5l2.5 1.5" />
    </svg>
  );
}
