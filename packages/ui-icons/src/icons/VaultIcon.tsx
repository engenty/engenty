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
        height="14"
        rx="2"
        width="16"
        x="4"
        y="5"
      />
      <circle
        cx="12"
        cy="12"
        fill={dockBrandFill.cobalt}
        fillOpacity={0.34}
        r="3"
      />
      <path d="M12 10v2" />
      <path d="M12 12l2 1" />
    </svg>
  );
}
